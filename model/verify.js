const fs = require("fs");
const path = require("path");
const { generate, isAvailable, DEFAULT_MODEL } = require("./ollama");

const STOPWORDS = new Set([
  "the","a","an","and","or","to","of","in","on","for","with","is","are","this","that",
  "from","show","your","you","user","product","real","visible","workflow","result"
]);

function normalize(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function terms(text) {
  return [...new Set(normalize(text).split(" ").filter(x => x.length > 2 && !STOPWORDS.has(x)))];
}

function loadJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

function buildEvidenceUnits() {
  const units = [];
  const inspection = loadJson("output/inspection.json");
  if (inspection) {
    units.push({ id: "inspection:homepage", kind: "dom", source: "output/inspection.json",
      text: JSON.stringify({
        title: inspection.title, description: inspection.description,
        headings: inspection.headings, buttons: inspection.buttons, links: inspection.links
      }) });
  }

  const visual = loadJson("output/visual-intelligence.json");
  if (visual) units.push({ id: "visual:homepage", kind: "visual", source: "output/visual-intelligence.json", text: JSON.stringify(visual) });

  const speech = loadJson("output/speech-intelligence.json");
  if (speech) units.push({ id: "speech:transcript", kind: "speech", source: "output/speech-intelligence.json", text: JSON.stringify(speech) });

  const manifest = loadJson("output/recording/manifest.json") || loadJson("output/manifest.json");
  if (manifest) {
    (manifest.steps || []).filter(s => s.type === "state-captured").forEach((state, i) => {
      units.push({
        id: `capture:step-${String(state.step || i + 1).padStart(2, "0")}`,
        kind: "browser-state",
        source: state.screenshot || "output/manifest.json",
        text: JSON.stringify({ url: state.url, title: state.title, headings: state.headings, evaluation: state.evaluation, shot: state.shot })
      });
    });
  }

  return units;
}

function deterministicClaimCheck(claim, units) {
  const wanted = terms(claim);
  if (!wanted.length) return { supported: false, score: 0, evidence: [] };

  const matches = units.map(unit => {
    const corpus = normalize(unit.text);
    const matched = wanted.filter(term => corpus.includes(term));
    return { unit, matched, score: matched.length / wanted.length };
  }).filter(x => x.matched.length).sort((a,b) => b.score - a.score);

  const best = matches[0];
  return {
    supported: Boolean(best && best.score >= 0.5),
    score: Number((best?.score || 0).toFixed(3)),
    evidence: matches.slice(0, 3).map(x => ({
      id: x.unit.id,
      kind: x.unit.kind,
      source: x.unit.source,
      matched: x.matched,
      score: Number(x.score.toFixed(3))
    }))
  };
}

async function verifyWithLocalModel(claims, units) {
  if (!(await isAvailable())) return null;
  const compactEvidence = units.map(u => ({ id: u.id, kind: u.kind, text: u.text.slice(0, 3500) }));
  return generate({
    model: DEFAULT_MODEL,
    system: `You are BRAG's evidence verifier.
Map every product-demo claim to observed evidence units.
A claim is supported only when an evidence unit directly supports it.
Return JSON only:
{"claims":[{"field":"...","claim":"...","status":"supported|partial|unsupported","evidence":["unit-id"],"reason":"..."}]}
Never invent evidence. If evidence is ambiguous, use partial.`,
    prompt: JSON.stringify({ claims, evidence: compactEvidence })
  });
}

function buildClaims(intelligence) {
  return [
    ["product", intelligence.product],
    ["problem", intelligence.problem],
    ["user", intelligence.user],
    ["promise", intelligence.promise],
    ["strongestAction", intelligence.strongestAction],
    ["proof", intelligence.proof],
    ...((intelligence.workflow || []).slice(0, 3).map((x, i) => [`workflow-${i + 1}`, x]))
  ].filter(([, value]) => value && String(value).trim());
}

async function run(inputPath = "output/ai-intelligence.json", outputPath = "output/evidence-report.json") {
  const intelligence = loadJson(inputPath);
  if (!intelligence) {
    console.log("No AI intelligence found. Evidence verification skipped.");
    return null;
  }

  const units = buildEvidenceUnits();
  const claims = buildClaims(intelligence);
  const deterministic = claims.map(([field, claim]) => ({
    field, claim, ...deterministicClaimCheck(claim, units)
  }));

  let model = null;
  try {
    model = await verifyWithLocalModel(claims.map(([field, claim]) => ({ field, claim })), units);
  } catch {
    console.log("Local evidence verifier unavailable. Using deterministic verification.");
  }

  const results = deterministic.map(item => {
    const modelItem = model?.claims?.find(x => x.field === item.field || x.claim === item.claim);
    const modelStatus = modelItem?.status || null;
    return {
      ...item,
      modelStatus,
      modelReason: modelItem?.reason || null,
      modelEvidence: Array.isArray(modelItem?.evidence) ? modelItem.evidence : []
    };
  });

  const unsupported = results.filter(x => x.modelStatus === "unsupported" || (!x.modelStatus && !x.supported));
  const partial = results.filter(x => x.modelStatus === "partial");
  const status = unsupported.length === 0
    ? (partial.length ? "review" : "pass")
    : supportedRatio(results, unsupported) >= 0.7 ? "review" : "fail";

  const claimEvidence = Object.fromEntries(results.map(x => [
    x.field,
    { claim: x.claim, status: x.modelStatus || (x.supported ? "supported" : "unsupported"),
      evidence: x.modelEvidence.length ? x.modelEvidence : x.evidence.map(e => e.id) }
  ]));

  const report = {
    version: "2.0",
    engine: model ? "deterministic+ollama" : "deterministic",
    model: model ? DEFAULT_MODEL : null,
    generatedAt: new Date().toISOString(),
    status,
    claimCount: results.length,
    supportedCount: results.length - unsupported.length - partial.length,
    partialCount: partial.length,
    unsupportedCount: unsupported.length,
    claims: results,
    claimEvidence,
    rule: "Every narration claim should have a provenance path to captured product evidence."
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log("Evidence report:", outputPath);
  console.log("Evidence status:", status);
  return report;
}

function supportedRatio(results, unsupported) {
  return results.length ? (results.length - unsupported.length) / results.length : 0;
}

if (require.main === module) {
  run().catch(error => {
    console.error("Evidence verification failed:", error.message);
    process.exit(1);
  });
}

module.exports = { run, deterministicClaimCheck, buildEvidenceUnits, buildClaims };
