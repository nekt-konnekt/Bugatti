const fs = require("fs");
const path = require("path");

const root = path.resolve("output");
const revisionsDir = path.join(root, "revisions");

function maxAttempts(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.floor(parsed), 0), 2) : 2;
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return null; }
}

function loadPlan() {
  return readJson(path.join(root, "revision-plan.json")) || {
    status: "unknown",
    actions: [],
    automaticRepair: false
  };
}

function isAutomaticAction(action) {
  return ["capture", "evidence", "story", "narrative", "edit", "qa"].includes(action.stage)
    && action.priority !== "human";
}

function canAutoRepair(plan) {
  if (!plan || !Array.isArray(plan.actions) || !plan.actions.length) return false;
  if (plan.actions.some(action => action.stage === "human")) return false;
  return plan.actions.every(isAutomaticAction);
}

function earliestStage(plan) {
  const order = { evidence: 1, capture: 2, story: 3, narrative: 3, edit: 4, qa: 5 };
  return (plan.actions || [])
    .filter(isAutomaticAction)
    .sort((a, b) => (order[a.stage] || 99) - (order[b.stage] || 99))[0]?.stage || null;
}

function snapshotAttempt(attempt) {
  const destination = path.join(revisionsDir, "attempt-" + attempt);
  fs.mkdirSync(destination, { recursive: true });

  const files = [
    "evidence-report.json",
    "evidence-graph.json",
    "self-evaluation.json",
    "revision-plan.json",
    "storyboard.json",
    "shot-plan.json",
    "qa/report.json",
    "demo/package.json",
    "demo/edit-plan.json"
  ];

  for (const relative of files) {
    const source = path.join(root, relative);
    if (!fs.existsSync(source)) continue;
    const target = path.join(destination, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }

  return destination;
}

function loadHistory() {
  const file = path.join(revisionsDir, "history.json");
  return readJson(file) || { version: "1.0", attempts: [] };
}

function saveHistory(history) {
  fs.mkdirSync(revisionsDir, { recursive: true });
  fs.writeFileSync(path.join(revisionsDir, "history.json"), JSON.stringify(history, null, 2));
}

function recordAttempt(attempt, plan, evaluation, qa, result) {
  const history = loadHistory();
  history.attempts.push({
    attempt,
    startedAt: result.startedAt,
    completedAt: new Date().toISOString(),
    decision: result.decision,
    restartFrom: earliestStage(plan),
    planStatus: plan?.status || null,
    planScore: plan?.score ?? null,
    evaluationStatus: evaluation?.status || null,
    evaluationScore: evaluation?.score ?? null,
    qaStatus: qa?.status || null,
    snapshot: "output/revisions/attempt-" + attempt
  });
  saveHistory(history);
}

function buildDecision({ attempt, max, plan, evaluation }) {
  if (evaluation?.status === "pass") return { action: "stop", reason: "Self-evaluation passed." };
  if (!canAutoRepair(plan)) return { action: "stop", reason: "Revision plan contains work that requires human review." };
  if (attempt >= max) return { action: "stop", reason: "Maximum automatic revision attempts reached." };
  return {
    action: "revise",
    reason: "Bounded automatic revision is permitted.",
    restartFrom: earliestStage(plan)
  };
}

module.exports = {
  maxAttempts,
  loadPlan,
  loadHistory,
  saveHistory,
  snapshotAttempt,
  recordAttempt,
  buildDecision,
  canAutoRepair,
  earliestStage,
  revisionsDir
};
