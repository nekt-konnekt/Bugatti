const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { buildIntelligence, buildShotPlan, evaluateCapturedState } = require("./director");
const {validateTarget,resourceConfig}=require("./model/security");
const {createRuntimeGuard}=require("./model/resource-guard");

const SAFE = /^(start|get started|try|try it|demo|explore|learn more|discover|play|begin|launch|view demo|see demo|continue|next|open|view|details|dashboard|features|how it works)$/i;
const BLOCKED = /(delete|remove|cancel|logout|log out|pay|purchase|buy|subscribe|checkout|transfer|withdraw|send money|confirm payment|publish|post|deploy|password|reset password|verify|sign in|signin|login|log in|upload|download)/i;
const MAX_NAV_RETRIES = 3;
const MAX_ACTION_RETRIES = 3;

function clean(v) { return (v || "").replace(/\s+/g, " ").trim().slice(0, 140); }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function classifyFailure(error) {
  const message = clean(error?.message || error);
  if (/timeout/i.test(message)) return "timeout";
  if (/Target page, context or browser has been closed|crash/i.test(message)) return "browser-crash";
  if (/net::ERR_|network|socket|ECONN|DNS/i.test(message)) return "network";
  if (/detached|not attached|intercepted|not receive pointer|element is not/i.test(message)) return "dom-stale";
  return "unknown";
}

async function waitForStability(page) {
  await page.waitForLoadState("domcontentloaded", { timeout: 12000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(350);
}

async function gotoWithRecovery(page, url) {
  const failures = [];
  for (let attempt = 1; attempt <= MAX_NAV_RETRIES; attempt++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await waitForStability(page);
      return { ok: true, attempts: attempt, failures };
    } catch (error) {
      failures.push({ attempt, type: classifyFailure(error), message: clean(error.message) });
      if (attempt < MAX_NAV_RETRIES) await sleep(500 * attempt);
    }
  }
  return { ok: false, attempts: MAX_NAV_RETRIES, failures };
}

function isSafeHref(href, origin) {
  if (!href) return false;
  try {
    const u = new URL(href, origin);
    return u.origin === origin && !["mailto:", "tel:", "javascript:"].includes(u.protocol);
  } catch { return false; }
}

async function visibleActions(page) {
  return page.locator("a,button,[role=button],input[type=submit]").evaluateAll(els =>
    els.slice(0, 100).map((el, index) => {
      const r = el.getBoundingClientRect();
      const text = clean(el.innerText || el.value || el.getAttribute("aria-label") || el.getAttribute("title") || el.href);
      return { index, tag: el.tagName.toLowerCase(), text, href: el.tagName === "A" ? el.href : null, type: el.getAttribute("type"),
        visible: r.width > 0 && r.height > 0, x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
    }).filter(x => x.visible && x.text)
  );
}
function claimTerms(claim) { return [...new Set(String(claim || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(x => x.length > 2))]; }
function actionClaimScore(action, claim) {
  const terms = claimTerms(claim), text = String(action.text || "").toLowerCase();
  return terms.length ? terms.filter(term => text.includes(term)).length / terms.length : 0;
}
function directorScore(action, intelligence, targetClaim = "") {
  if (BLOCKED.test(action.text)) return -1000;
  if (action.type === "submit") return -800;
  let score = SAFE.test(action.text) ? 50 : 0;
  if (/get started|try|demo|start|launch|play|continue|next|explore|discover|create|order|book/i.test(action.text)) score += 30;
  if (intelligence?.strongestAction && action.text.toLowerCase() === intelligence.strongestAction.toLowerCase()) score += 100;
  if (targetClaim) score += Math.round(actionClaimScore(action, targetClaim) * 80);
  if (intelligence?.archetype === "game" && /play|start/i.test(action.text)) score += 35;
  if (intelligence?.archetype === "commerce" && /order|explore|start/i.test(action.text)) score += 25;
  if (action.tag === "a" && !isSafeHref(action.href, intelligence.origin)) return -900;
  return score;
}
async function inspectForDirector(page, url) {
  return {
    url, title: await page.title(),
    description: await page.locator('meta[name="description"]').getAttribute("content").catch(() => null),
    headings: await page.locator("h1,h2,h3").allTextContents(),
    buttons: await page.locator("button,[role=button],input[type=submit]").evaluateAll(els => els.slice(0,30).map(el => ({text: clean(el.innerText || el.value || el.getAttribute("aria-label") || "")})).filter(x=>x.text)),
    links: await page.locator("a").evaluateAll(as => as.slice(0,40).map(a=>({text:clean(a.innerText),href:a.href})).filter(x=>x.text || x.href))
  };
}

async function clickWithRecovery(page, locator, target, origin) {
  let lastError = null;
  const failures = [];
  for (let attempt = 1; attempt <= MAX_ACTION_RETRIES; attempt++) {
    try {
      if (target.tag === "a" && !isSafeHref(target.href, origin)) throw new Error("Destination is outside approved origin or unsafe.");
      await locator.scrollIntoViewIfNeeded({ timeout: 5000 });
      await locator.click({ timeout: 8000 });
      return { ok: true, attempts: attempt, failures };
    } catch (error) {
      lastError = error;
      failures.push({ attempt, type: classifyFailure(error), message: clean(error.message) });
      if (attempt < MAX_ACTION_RETRIES) {
        await page.waitForTimeout(250 * attempt);
        await page.reload({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
        await waitForStability(page);
      }
    }
  }
  return { ok: false, attempts: MAX_ACTION_RETRIES, failures, error: clean(lastError?.message || "Action failed") };
}

async function runWorkflow(url, options = {}) {
  const CONFIG=resourceConfig();
  const maxSteps = Math.min(Math.max(Number(options.maxSteps) || CONFIG.maxSteps, 1), 6);
  await validateTarget(url);
  const guard=createRuntimeGuard(CONFIG);
  const outputDir = options.outputDir || path.join(process.cwd(), "output", "recording");
  fs.mkdirSync(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: path.join(outputDir, "video") } });
  const page = await context.newPage();
  const origin = new URL(url).origin;
  const errors = [], requestFailures = [], recovery = [];
  let pageCrashed = false;
  const startedAt = Date.now(), steps = [], visited = new Set();
  let preferredActionKey = null;

  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(e.message));
  page.on("requestfailed", r => requestFailures.push({ url: r.url(), failure: r.failure()?.errorText || "request failed" }));
  page.on("crash", () => { pageCrashed = true; errors.push("Page crashed during capture."); });

  try {
    const navigation = await gotoWithRecovery(page, url);
    recovery.push({ stage: "navigation", ...navigation });
    if (!navigation.ok) throw new Error("Initial navigation failed after " + MAX_NAV_RETRIES + " attempts.");

    const inspection = await inspectForDirector(page, url);
    const intelligence = buildIntelligence(inspection);
    intelligence.origin = origin;
    const shotPlan = buildShotPlan(intelligence);
    const claimTargets = {
      establish: ["promise", intelligence.promise],
      "primary-action": ["workflow-1", intelligence.workflow?.[0] || intelligence.strongestAction],
      "core-action": ["workflow-2", intelligence.workflow?.[1]],
      proof: ["proof", intelligence.proof],
      hold: ["proof", intelligence.proof],
      close: ["strongestAction", intelligence.strongestAction]
    };

    for (let step = 1; step <= maxSteps; step++) {
      guard.assertTime(); guard.assertOutput(outputDir);\n      const shot = shotPlan.shots[Math.min(step - 1, shotPlan.shots.length - 1)];
      const targetClaim = claimTargets[shot?.id] || null;
      const actionStartedAt = Date.now(), beforeUrl = page.url();
      const screenshot = "step-" + String(step).padStart(2, "0") + "-before.png";
      await page.screenshot({ path: path.join(outputDir, screenshot), fullPage: false });
      const actions = await visibleActions(page);
      const candidates = actions.map(a => ({ ...a, score: directorScore(a, intelligence, targetClaim?.[1]) }))
        .filter(a => a.score > 0).sort((a,b) => b.score - a.score || a.y - b.y);
      const target = (preferredActionKey ? candidates.find(a => `${page.url()}|${a.text}|${a.href || ""}` === preferredActionKey) : null)
        || candidates.find(a => !visited.has(`${page.url()}|${a.text}|${a.href || ""}`));
      preferredActionKey = null;
      if (!target) {
        steps.push({ step, type: "stop", timestamp: new Date().toISOString(), reason: "No new director-approved safe action found", url: page.url(), screenshot });
        break;
      }
      visited.add(`${page.url()}|${target.text}|${target.href || ""}`);
      const locator = page.locator("a,button,[role=button],input[type=submit]").filter({ hasText: target.text }).first();
      steps.push({ step, type: "action-selected", timestamp: new Date().toISOString(),
        action: { text: target.text, tag: target.tag, href: target.href || null },
        director: { archetype: intelligence.archetype, promise: intelligence.promise, strongestAction: intelligence.strongestAction,
          targetClaim: targetClaim ? { field: targetClaim[0], text: targetClaim[1] } : null, score: target.score },
        claim: targetClaim ? { field: targetClaim[0], text: targetClaim[1] } : null,
        shot: shot ? { id: shot.id, type: shot.type, goal: shot.goal, plannedDuration: shot.duration } : null, url: page.url(), screenshot });

      const action = await clickWithRecovery(page, locator, target, origin);
      recovery.push({ stage: "action", step, ...action });
      if (!action.ok) {
        steps.push({ step, type: "action-failed", timestamp: new Date().toISOString(), action: { text: target.text, tag: target.tag }, reason: action.error, recovery: action.failures });
        continue;
      }
      await waitForStability(page);
      const afterUrl = page.url();
      if (!afterUrl.startsWith(origin)) { steps.push({ step, type:"blocked", reason:"Navigation left approved origin.", url:afterUrl }); break; }
      const afterScreenshot = "step-" + String(step).padStart(2, "0") + "-after.png";
      await page.screenshot({ path:path.join(outputDir, afterScreenshot), fullPage:false });
      const headings = await page.locator("h1,h2,h3").allTextContents();
      const state = {
        step, type:"state-captured", timestamp:new Date().toISOString(), url:afterUrl, urlChanged:beforeUrl !== afterUrl,
        claim:targetClaim ? {field:targetClaim[0],text:targetClaim[1]} : null, shot:shot ? {id:shot.id,type:shot.type,goal:shot.goal}:null,
        title:await page.title(), headings:headings.map(clean).filter(Boolean).slice(0,8),
        screenshot:afterScreenshot, cursor:{x:target.x+target.width/2,y:target.y+target.height/2}, elapsedMs:Date.now()-actionStartedAt
      };
      state.evaluation = evaluateCapturedState(state, intelligence);
      steps.push(state);
      if (state.evaluation?.decision === "hold-result") {
        state.evidence = { claim: targetClaim ? {field:targetClaim[0],text:targetClaim[1]}:null, captured:Boolean(state.evaluation?.proof), source:state.screenshot||null };
        steps.push({step,type:"director-hold",reason:state.evaluation.reason}); break;
      }
      if (state.evaluation?.decision === "replan") {
        const fresh = await visibleActions(page);
        const alternatives = fresh.map(a=>({...a,score:directorScore(a,intelligence,targetClaim?.[1])})).filter(a=>a.score>0).sort((a,b)=>b.score-a.score||a.y-b.y);
        const alternative = alternatives.find(a=>!visited.has(`${page.url()}|${a.text}|${a.href || ""}`));
        if (alternative) {
          steps.push({step,type:"replan",timestamp:new Date().toISOString(),from:target.text,to:alternative.text,claim:targetClaim?{field:targetClaim[0],text:targetClaim[1]}:null,reason:state.evaluation.reason,actionScore:alternative.score});
          preferredActionKey = `${page.url()}|${alternative.text}|${alternative.href || ""}`;
        } else { steps.push({step,type:"replan-stop",reason:"No alternate safe action available."}); break; }
      }
    }

    const manifest = {
      version:"2.1", source:url, capturedAt:new Date().toISOString(), maxSteps, director:intelligence, claimTargets, shotPlan, steps,
      elapsedMs:Date.now()-startedAt, consoleErrors:errors, requestFailures,
      captureHealth:{
        pageCrashed, requestFailureCount:requestFailures.length,
        actionFailures:steps.filter(s=>s.type==="action-failed").length,
        recoveryAttempts:recovery.reduce((n,x)=>n+(x.attempts||0),0),
        recoveryFailures:recovery.filter(x=>x.ok===false).length,
        recordingValid:false
      },
      recovery,
      policy:{sameOriginOnly:true,directorGuided:true,safeActionAllowlist:SAFE.source,blockedActionPattern:BLOCKED.source,maxSteps,maxNavigationRetries:MAX_NAV_RETRIES,maxActionRetries:MAX_ACTION_RETRIES}
    };
    const recordedVideo = page.video();
    await context.close();
    if (recordedVideo) {
      try {
        const videoPath = await recordedVideo.path(), target = path.join(outputDir,"real-product-footage.webm");
        fs.copyFileSync(videoPath,target);
        manifest.captureHealth.recordingValid=fs.existsSync(target)&&fs.statSync(target).size>0;
        manifest.realFootage={file:"real-product-footage.webm",format:"webm",source:"playwright-browser-recording",path:target};
      } catch(error) { manifest.realFootage={file:null,error:error.message}; }
    }
    fs.writeFileSync(path.join(outputDir,"manifest.json"),JSON.stringify(manifest,null,2));
    await browser.close();
    return manifest;
  } finally { await browser.close().catch(()=>{}); }
}
if(require.main===module){
  const url=process.argv[2];
  if(!url){console.error("Usage: node runner.js https://example.com [maxSteps]");process.exit(1);}
  runWorkflow(url,{maxSteps:process.argv[3]}).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.stack||e);process.exit(1);});
}
module.exports={runWorkflow,classifyFailure,gotoWithRecovery,clickWithRecovery};
