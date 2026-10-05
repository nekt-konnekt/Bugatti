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
      add("blocker", "evidence", "Re-run evidence verification and rebuild the evidence graph before rendering again.", finding.message);
      break;
    case "workflow-depth":
      add("high", "capture", "Re-run deterministic capture so BRAG can seek another safe workflow state.", finding.message);
      break;
    case "proof-placement":
      add("high", "story", "Rebuild the story package so proof remains late and evidence-bound.", finding.message);
      break;
    case "evidence-density":
      add("medium", "story", "Rebuild the story package from the strongest captured evidence.", finding.message);
      break;
    case "narrative-repetition":
      add("medium", "narrative", "Regenerate the evidence-aware narrative.", finding.message);
      break;
    case "story-length":
      add("medium", "edit", "Regenerate the edit plan with bounded scene durations.", finding.message);
      break;
    case "claim-bindings":
      add("high", "evidence", "Rebuild explicit claim-to-state bindings before rendering again.", finding.message);
      break;
    case "qa-alignment":
      add("blocker", "qa", "Re-run the downstream production pipeline and re-check QA.", finding.message);
      break;
    case "story-empty":
      add("blocker", "story", "Rebuild the demo package from the captured product evidence.", finding.message);
      break;
    default:
      break;
  }
}

if (!actions.length && evaluation.status === "review") {
  add("medium", "human", "Perform a human watch-through before publishing.", "Self-evaluation found review-level weaknesses without a bounded automatic repair.");
}

const stageOrder = { blocker: 0, high: 1, medium: 2 };
actions.sort((a, b) => stageOrder[a.priority] - stageOrder[b.priority]);

const automaticStages = new Set(["capture", "evidence", "story", "narrative", "edit", "qa"]);
const automaticRepair = actions.length > 0
  && actions.every(action => automaticStages.has(action.stage))
  && !actions.some(action => action.stage === "human");

const plan = {
  version: "2.0",
  generatedAt: new Date().toISOString(),
  status: evaluation.status,
  score: evaluation.score,
  decision: evaluation.decision,
  automaticRepair,
  maxAutomaticAttempts: 2,
  guardrail: "Automatic revision is bounded to two attempts and never invents product behavior. Browser changes remain deterministic and evidence-gated.",
  summary: {
    actions: actions.length,
    requiresRecapture: actions.some(a => a.stage === "capture"),
    requiresStoryRevision: actions.some(a => ["story", "narrative"].includes(a.stage)),
    requiresEvidenceRepair: actions.some(a => a.stage === "evidence")
  },
  actions,
  nextRun: automaticRepair
    ? "Run the bounded revision loop from the earliest affected stage, then re-run evidence, render, QA, and self-evaluation."
    : actions.length
      ? "Human review is required before another production run."
      : "No revision required."
};

if (graph) plan.evidenceGraphVersion = graph.version || null;

fs.writeFileSync(planPath, JSON.stringify(plan, null, 2));
console.log(JSON.stringify(plan, null, 2));
