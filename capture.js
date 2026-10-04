const { chromium } = require("playwright");
const fs = require("fs");
const {validateTarget,resourceConfig}=require("./model/security");
const {createRuntimeGuard}=require("./model/resource-guard");

const url = process.argv[2];
const CONFIG=resourceConfig();
const MAX_RETRIES = 3;
const NAV_TIMEOUT = CONFIG.navigationTimeoutMs;
const STABILITY_TIMEOUT = 15000;

if (!url) {
  console.error("Usage: npm run capture -- https://example.com");
  process.exit(1);
}

function classify(error) {
  const message = String(error?.message || error);
  if (/timeout/i.test(message)) return "timeout";
  if (/net::ERR_|ECONN|DNS|network|socket/i.test(message)) return "network";
  return "unknown";
}

async function load(page, target) {
  const failures = [];
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await page.goto(target, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
      await page.waitForLoadState("networkidle", { timeout: STABILITY_TIMEOUT }).catch(() => {});
      return { ok: true, attempts: attempt, failures };
    } catch (error) {
      failures.push({ attempt, type: classify(error), message: String(error.message || error).slice(0, 300) });
      if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, attempt * 500));
    }
  }
  return { ok: false, attempts: MAX_RETRIES, failures };
}

(async () => {
  const started = Date.now();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const requests = [], consoleErrors = [], requestFailures = [];

  page.on("request", req => requests.push({ method:req.method(), url:req.url() }));
  page.on("requestfailed", req => requestFailures.push({ url:req.url(), failure:req.failure()?.errorText || "request failed" }));
  page.on("console", msg => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  page.on("pageerror", err => consoleErrors.push(err.message));

  try {
    const navigation = await load(page, url);
    if (!navigation.ok) throw new Error("Navigation failed after " + MAX_RETRIES + " attempts.");

    const title = await page.title();
    const description = await page.locator('meta[name="description"]').getAttribute("content").catch(() => null);
    const headings = await page.locator("h1,h2,h3").allTextContents();
    const links = await page.locator("a").evaluateAll(as => as.slice(0,40).map(a => ({
      text:(a.innerText||"").trim().replace(/\s+/g," ").slice(0,120), href:a.href
    })).filter(x=>x.text||x.href));
    const buttons = await page.locator("button,[role=button],input[type=submit]").evaluateAll(els => els.slice(0,30).map(el => ({
      text:(el.innerText||el.value||el.getAttribute("aria-label")||"").trim().replace(/\s+/g," ").slice(0,100)
    })).filter(x=>x.text));
    await page.screenshot({ path:"output/home.png", fullPage:true });

    guard.assertTime(); guard.assertOutput();\n    const result = {
      version:"1.1", url, title, description,
      headings:headings.map(x=>x.trim()).filter(Boolean).slice(0,30), links, buttons,
      requestCount:requests.length, requestFailures, consoleErrors,
      elapsedMs:Date.now()-started, capturedAt:new Date().toISOString(),
      captureHealth:{
        navigationAttempts:navigation.attempts,
        navigationFailures:navigation.failures,
        requestFailureCount:requestFailures.length,
        inspectionScreenshot:true
      }
    };

    fs.mkdirSync("output",{recursive:true});
    fs.writeFileSync("output/inspection.json",JSON.stringify(result,null,2));
    console.log(JSON.stringify(result,null,2));
  } finally {
    await browser.close();
  }
})().catch(err=>{console.error(err.stack||err);process.exit(1);});
