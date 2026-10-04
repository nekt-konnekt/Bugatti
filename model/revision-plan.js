const fs = require("fs");
const path = require("path");

const root = "output";
const evalPath = path.join(root, "self-evaluation.json");
const graphPath = path.join(root, "evidence-graph.json");
const planPath = path.join(root, "revision-plan.json");

if (!fs.existsSync(evalPath)) {
  console.error("Self-evaluation report not found.");
  process.exit(1);
}

const evaluation = JSON.parse(fs.readFileSync(evalPath, "utf8"));
const graph = fs.existsSync(graphPath) ? JSON.parse(fs.readFileSync(graphPath, "utf8")) : null;
const actions = [];

function add(priority, stage, action, reason) {
  actions.push({ priority, stage, action, reason });
}

for (const finding of evaluation.findings || []) {
  switch (finding.id) {
    case "unsupported-claims":
      add("blocker", "evidence", "Re-run evidence verification and remove or rebind unsupported narrative claims.", finding.message);
      break;
    case "workflow-depth":
      add("high", "capture", "Capture an additional safe product state that demonstrates the next meaningful workflow step.", finding.message);
      break;
    case "proof-placement":
      add("high", "story", "Move the proof/result scene toward the end of the narrative and preserve the evidence binding.", finding.message);
      break;
    case "evidence-density":
      add("medium", "story", "Replace weakly grounded scenes with evidence-backed product states.", finding.message);
      break;
    case "narrative-repetition":
      add("medium", "narrative", "Rewrite repeated narration so each scene explains a distinct observed change.", finding.message);
      break;
    case "story-length":
      add("medium", "edit", "Adjust scene durations or remove low-value beats while preserving problem, action, workflow, and proof.", finding.message);
      break;
    case "claim-bindings":
      add("high", "evidence", "Restore explicit claim-to-state bindings before attempting another render.", finding.message);
      break;
    case "qa-alignment":
      add("blocker", "qa", "Resolve production QA failures before attempting another final handoff.", finding.message);
      break;
    case "story-empty":
      add("blocker", "story", "Rebuild the demo package because no story scenes were produced.", finding.message);
      break;
    default:
      break;
  }
}

const hasCapture = actions.some(a => a.stage === "capture");
const hasStory = actions.some(a => ["story", "narrative"].includes(a.stage));
const hasEvidence = actions.some(a => a.stage === "evidence");

if (!actions.length && evaluation.status === "review") {
  add("medium", "human", "Perform a human watch-through before publishing.", "Self-evaluation found review-level weaknesses without an automatic repair.");
}

const stageOrder = { blocker: 0, high: 1, medium: 2 };
actions.sort((a, b) => stageOrder[a.priority] - stageOrder[b.priority]);

const plan = {
  version: "1.0",
  generatedAt: new Date().toISOString(),
  status: evaluation.status,
  score: evaluation.score,
  decision: evaluation.decision,
  automaticRepair: false,
  guardrail: "Revision planning never invents product behavior. Capture changes must remain deterministic and evidence-gated.",
  summary: {
    actions: actions.length,
    requiresRecapture: hasCapture,
    requiresStoryRevision: hasStory,
    requiresEvidenceRepair: hasEvidence
  },
  actions,
  nextRun: actions.length
    ? "Apply the listed stage changes, then rerun BRAG from the earliest affected stage."
    : "No automated revision required."
};

if (graph) plan.evidenceGraphVersion = graph.version || null;

fs.writeFileSync(planPath, JSON.stringify(plan, null, 2));
console.log(JSON.stringify(plan, null, 2));
