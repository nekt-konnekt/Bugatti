const fs = require("fs");
const path = require("path");
const { buildClaims } = require("./verify");

function load(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

function normalize(v) {
  return String(v || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function scoreClaim(claim, state) {
  const terms = [...new Set(normalize(claim).split(" ").filter(x => x.length > 2))];
  const corpus = normalize([
    state.title,
    ...(state.headings || []),
    state.url,
    state.shot?.goal,
    state.evaluation?.reason
  ].join(" "));
  const matched = terms.filter(t => corpus.includes(t));
  return terms.length ? matched.length / terms.length : 0;
}

function buildGraph() {
  const intelligence = load("output/ai-intelligence.json");
  const manifest = load("output/recording/manifest.json") || load("output/manifest.json");
  const report = load("output/evidence-report.json");
  if (!intelligence || !manifest) return null;

  const claims = buildClaims(intelligence);
  const states = (manifest.steps || []).filter(s => s.type === "state-captured");
  const actionEvents = (manifest.steps || []).filter(s => s.type === "action-selected");
  const graphClaims = claims.map(([field, claim]) => {
    const candidates = states.map(state => ({
      claimBinding: state.claim?.field === field ? "explicit" : "inferred",
      step: state.step,
      screenshot: state.screenshot || null,
      footage: manifest.realFootage?.file || null,
      score: Number(scoreClaim(claim, state).toFixed(3)),
      proof: Boolean(state.evaluation?.proof),
      reason: state.evaluation?.reason || null,
      claim: state.claim || null
    })).sort((a,b) => (b.proof - a.proof) || (b.score - a.score));

    const reportClaim = report?.claims?.find(x => x.field === field);
    const reportEvidence = report?.claimEvidence?.[field]?.evidence || [];
    const selected = candidates
      .filter(x => x.claimBinding === "explicit" || x.score >= 0.25 || x.proof)
      .sort((a,b) => (a.claimBinding === "explicit" ? -1 : 1) - (b.claimBinding === "explicit" ? -1 : 1) || (b.proof - a.proof) || (b.score - a.score))
      .slice(0, 3);
    const boundActions = actionEvents.filter(x => x.claim?.field === field).map(x => ({
      step: x.step,
      action: x.action || null,
      score: x.director?.score || 0,
      claim: x.claim
    }));
    return {
      id: `claim-${field}`,
      field,
      text: claim,
      status: reportClaim?.modelStatus || (reportClaim?.supported ? "supported" : "review"),
      evidence: selected,
      boundActions,
      verifiedEvidence: reportEvidence
    };
  });

  const shots = [
    ["hook", ["problem", "promise"]],
    ["product", ["product", "strongestAction"]],
    ["workflow-1", ["workflow-1"]],
    ["workflow-2", ["workflow-2"]],
    ["workflow-3", ["workflow-3"]],
    ["result", ["proof"]],
    ["close", ["strongestAction"]]
  ].map(([shotId, fields]) => ({
    shotId,
    claimIds: fields.map(f => `claim-${f}`).filter(id => graphClaims.some(c => c.id === id)),
    evidence: fields.flatMap(f => graphClaims.find(c => c.field === f)?.evidence || [])
  }));

  const required = graphClaims.filter(c => ["promise", "strongestAction", "proof"].includes(c.field));
  const unsupportedRequired = required.filter(c => c.status === "unsupported" || !c.evidence.length);

  return {
    version: "1.0",
    generatedAt: new Date().toISOString(),
    status: unsupportedRequired.length ? "review" : "pass",
    binding: {
      explicitClaimStateCount: states.filter(s => s.claim?.field).length,
      explicitClaimActionCount: actionEvents.filter(s => s.claim?.field).length
    },
    claims: graphClaims,
    shots,
    realFootage: manifest.realFootage || null,
    rule: "Every important claim should resolve to a captured browser state before rendering."
  };
}

function run(outputPath = "output/evidence-graph.json") {
  const graph = buildGraph();
  if (!graph) {
    console.log("Evidence graph skipped: intelligence or recording manifest missing.");
    return null;
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(graph, null, 2));
  console.log("Evidence graph:", outputPath);
  console.log("Graph status:", graph.status);
  return graph;
}

if (require.main === module) {
  run();
}

module.exports = { buildGraph, run };
