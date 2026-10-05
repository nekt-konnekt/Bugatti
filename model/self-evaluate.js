const fs = require("fs");
const path = require("path");

const packagePath = process.argv[2] || "output/demo/package.json";
const root = path.join(path.dirname(packagePath), "..");
const outPath = path.join(root, "self-evaluation.json");

if (!fs.existsSync(packagePath)) {
  console.error("Demo package not found.");
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
const graphPath = path.join(root, "evidence-graph.json");
const qaPath = path.join(root, "qa", "report.json");
const graph = fs.existsSync(graphPath) ? JSON.parse(fs.readFileSync(graphPath, "utf8")) : null;
const qa = fs.existsSync(qaPath) ? JSON.parse(fs.readFileSync(qaPath, "utf8")) : null;
const scenes = Array.isArray(pkg.scenes) ? pkg.scenes : [];

const findings = [];
function finding(id, severity, message, detail = "") {
  findings.push({ id, severity, message, detail });
}

const evidenceScenes = scenes.filter(s => Array.isArray(s.evidence) && s.evidence.length);
const unsupported = scenes.filter(s => s.evidenceStatus === "unsupported");
const workflowScenes = scenes.filter(s => /^workflow-\d+$/.test(s.id));
const proofIndex = scenes.findIndex(s => s.id === "result");
const totalDuration = scenes.reduce((sum, s) => sum + Number(s.duration || 0), 0);

if (!scenes.length) finding("story-empty", "fail", "The demo contains no scenes.");
else finding("story-exists", "pass", "The demo contains a defined story.", scenes.length + " scenes.");

if (evidenceScenes.length < Math.max(1, Math.ceil(scenes.length * 0.6))) {
  finding("evidence-density", "warning", "Too much of the story is not directly evidence-bound.", evidenceScenes.length + "/" + scenes.length + " scenes have evidence.");
} else {
  finding("evidence-density", "pass", "Most scenes are evidence-bound.", evidenceScenes.length + "/" + scenes.length + " scenes.");
}

if (unsupported.length) finding("unsupported-claims", "fail", "The story contains unsupported claim bindings.", unsupported.map(s => s.id).join(", "));
else finding("unsupported-claims", "pass", "No scene is marked with unsupported evidence.");

if (workflowScenes.length < 2) finding("workflow-depth", "warning", "The demo may not show enough of the actual workflow.", workflowScenes.length + " workflow scene(s).");
else finding("workflow-depth", "pass", "The demo shows a multi-step workflow.", workflowScenes.length + " workflow scene(s).");

if (proofIndex >= 0 && proofIndex >= Math.max(0, scenes.length - 3)) {
  finding("proof-placement", "pass", "Proof appears late enough to function as the payoff.", "Result scene index " + (proofIndex + 1) + ".");
} else if (proofIndex >= 0) {
  finding("proof-placement", "warning", "Proof appears too early in the story.", "Result scene index " + (proofIndex + 1) + ".");
} else {
  finding("proof-placement", "fail", "The story has no explicit result scene.");
}

const narration = scenes.map(s => String(s.narration || "").toLowerCase().trim()).filter(Boolean);
const repeated = narration.filter((text, i) => narration.indexOf(text) !== i);
if (repeated.length) finding("narrative-repetition", "warning", "Narration repeats exact scene copy.", repeated.length + " repeated line(s).");
else finding("narrative-repetition", "pass", "Narration lines are distinct.");

if (totalDuration < 15) finding("story-length", "warning", "The demo may be too short to establish, demonstrate, and prove the product.", totalDuration.toFixed(1) + "s total.");
else if (totalDuration > 60) finding("story-length", "warning", "The demo may be too long for a concise product demonstration.", totalDuration.toFixed(1) + "s total.");
else finding("story-length", "pass", "Demo duration is within the production target range.", totalDuration.toFixed(1) + "s total.");

const explicitBindings = graph?.binding?.explicitClaimStateCount || 0;
if (explicitBindings) finding("claim-bindings", "pass", "The evidence graph contains explicit claim-to-state bindings.", String(explicitBindings) + " binding(s).");
else finding("claim-bindings", "warning", "The evidence graph has no explicit claim-to-state bindings.");

const qaStatus = qa?.status || "unknown";
if (qaStatus === "fail") finding("qa-alignment", "fail", "Self-evaluation agrees that production QA failed.");
else if (qaStatus === "warning") finding("qa-alignment", "warning", "Production QA has warnings.");
else if (qaStatus === "pass") finding("qa-alignment", "pass", "Production QA passed.");

const failures = findings.filter(x => x.severity === "fail").length;
const warnings = findings.filter(x => x.severity === "warning").length;
const passes = findings.filter(x => x.severity === "pass").length;
const score = Math.max(0, Math.round(100 - failures * 30 - warnings * 10));

const report = {
  version: "1.0",
  generatedAt: new Date().toISOString(),
  product: pkg.product || null,
  score,
  status: failures ? "fail" : warnings ? "review" : "pass",
  summary: { passes, warnings, failures },
  findings,
  decision: failures ? "revise" : warnings ? "review-before-publish" : "ready-for-human-watch-through",
  rule: "Self-evaluation judges story quality against evidence, workflow depth, proof placement, repetition, and QA state. It does not invent product facts."
};

fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (failures) process.exitCode = 1;
