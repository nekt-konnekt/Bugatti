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
  return normalize(text).split(" ").filter(x => x.length > 2 && !STOPWORDS.has(x));
}

function corpusFromEvidence() {
  const parts = [];
  for (const file of ["output/inspection.json", "output/storyboard.json", "output/visual-intelligence.json", "output/speech-intelligence.json"]) {
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      parts.push(JSON.stringify(data));
    } catch {}
  }
  return normalize(parts.join(" "));
}

function deterministicClaimCheck(claim, evidence) {
  const wanted = [...new Set(terms(claim))];
  if (!wanted.length) return { supported: false, score: 0, matched: [] };
  const matched = wanted.filter(term => evidence.includes(term));
  const score = matched.length / wanted.length;
  return { supported: score >= 0.5, score: Number(score.toFixed(3)), matched };
}

async function verifyWithLocalModel(claims, evidence) {
  if (!(await isAvailable())) return null;
  return generate({
    model: DEFAULT_MODEL,
    system: `You are BRAG's evidence verifier.
You receive claims generated for a product demo and observed evidence from the product.
For every claim, decide whether the evidence directly supports it.
Do not reward plausible guesses. A claim is supported only when the evidence contains direct or clearly equivalent support.
Return JSON only:
{"claims":[{"claim":"...","supported":true,"reason":"...","evidence":["..."]}]}`,
    prompt: JSON.stringify({ claims, evidence: evidence.slice(0, 18000) })
  });
}

async function run(inputPath = "output/ai-intelligence.json", outputPath = "output/evidence-report.json") {
  if (!fs.existsSync(inputPath)) {
    console.log("No AI intelligence found. Evidence verification skipped.");
    return null;
  }

  const intelligence = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const claims = [
    ["product", intelligence.product],
    ["problem", intelligence.problem],
    ["user", intelligence.user],
    ["promise", intelligence.promise],
    ["strongestAction", intelligence.strongestAction],
    ["proof", intelligence.proof],
    ...((intelligence.workflow || []).slice(0, 3).map((x, i) => ["workflow-" + (i + 1), x]))
  ].filter(([, value]) => value && String(value).trim());

  const evidence = corpusFromEvidence();
  const deterministic = claims.map(([field, claim]) => ({
    field,
    claim,
    ...deterministicClaimCheck(claim, evidence)
  }));

  let model = null;
  try {
    model = await verifyWithLocalModel(claims.map(([field, claim]) => ({ field, claim })), evidence);
  } catch (error) {
    console.log("Local evidence verifier unavailable. Using deterministic verification.");
  }

  const results = deterministic.map(item => {
    const modelItem = model?.claims?.find(x => x.claim === item.claim);
    return {
      ...item,
      modelSupported: typeof modelItem?.supported === "boolean" ? modelItem.supported : null,
      modelReason: modelItem?.reason || null,
      modelEvidence: Array.isArray(modelItem?.evidence) ? modelItem.evidence.slice(0, 3) : []
    };
  });

  const supported = results.filter(x => x.supported);
  const unsupported = results.filter(x => !x.supported);
  const status = unsupported.length === 0 ? "pass" : supported.length >= Math.ceil(results.length * 0.7) ? "review" : "fail";

  const report = {
    version: "1.0",
    engine: model ? "deterministic+ollama" : "deterministic",
    model: model ? DEFAULT_MODEL : null,
    generatedAt: new Date().toISOString(),
    status,
    claimCount: results.length,
    supportedCount: supported.length,
    unsupportedCount: unsupported.length,
    claims: results,
    rule: "Unsupported product claims must not reach the final narration."
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log("Evidence report:", outputPath);
  console.log("Evidence status:", status);
  return report;
}

if (require.main === module) {
  run().catch(error => {
    console.error("Evidence verification failed:", error.message);
    process.exit(1);
  });
}

module.exports = { run, deterministicClaimCheck };
