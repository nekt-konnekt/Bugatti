const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = __dirname;

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
  } catch {
    return null;
  }
}

function commandAvailable(command, args = ["-version"]) {
  const result = spawnSync(command, args, { stdio: "ignore" });
  return !result.error && result.status === 0;
}

function checkFile(file) {
  return fs.existsSync(path.join(root, file));
}

function artifactStatus(file) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) return "missing";
  try {
    return fs.statSync(full).size > 0 ? "present" : "empty";
  } catch {
    return "unreadable";
  }
}

const requiredFiles = [
  "brag.js",
  "capture.js",
  "runner.js",
  "director.js",
  "demo.js",
  "edit-plan.js",
  "render.js",
  "qa.js",
  "model/verify.js",
  "model/evidence-graph.js",
  "model/self-evaluate.js",
  "model/revision-plan.js",
  "model/revision-loop.js",
  "model/security.js",
  "model/resource-guard.js",
  "model/cli.js",
  "model/package-output.js",
  "model/run-manifest.js",
  "model/narration-quality.js",
  "model/video-quality.js",
  "regression.js",
  "product-suite.js"
];

const dependencies = {
 node: commandAvailable(process.execPath, ["--version"]),
 playwright: checkFile("node_modules/playwright/package.json"),
 next: checkFile("node_modules/next/package.json"),
 ffmpeg: commandAvailable("ffmpeg"),
 ffprobe: commandAvailable("ffprobe")
};

const regression = readJson("output/regression/report.json");
const suite = readJson("output/test-suite/report.json");
const qa = readJson("output/qa/report.json");
const videoQuality = readJson("output/qa/video-quality.json");
const narrationQuality = readJson("output/demo/narration-quality.json");
const selfEvaluation = readJson("output/self-evaluation.json");
const revisionPlan = readJson("output/revision-plan.json");
const runManifest = readJson("output/run-manifest.json");
const production = readJson("output/final/production.json");
const packageManifest = readJson("output/final/brag-package.json");

const checks = [];

function add(name, status, detail) {
  checks.push({ name, status, detail });
}

const missing = requiredFiles.filter(file => !checkFile(file));
add(
  "required-source",
  missing.length ? "fail" : "pass",
  missing.length ? `Missing: ${missing.join(", ")}` : "All required production modules are present."
);

add(
  "runtime-dependencies",
  Object.values(dependencies).every(Boolean) ? "pass" : "review",
  dependencies
);

if (regression) {
  add(
    "regression",
    regression.status === "pass" ? "pass" : "fail",
    regression.summary || regression.status
  );
} else {
  add("regression", "review", "No regression report found. Run npm test.");
}

if (suite) {
  const passes = Number(suite.summary?.passes || 0);
  const matrixSize = Number(suite.threshold?.matrixSize || 10);
  const requiredPasses = Math.min(8, matrixSize);
  add(
    "product-matrix",
    passes >= requiredPasses ? "pass" : "review",
    { passes, requiredPasses, matrixSize, mode: suite.mode }
  );
} else {
  add("product-matrix", "review", "No product-suite report found. Run the ten-product matrix.");
}

if (qa) {
  add(
    "production-qa",
    qa.status === "pass" ? "pass" : qa.status === "warning" ? "review" : "fail",
    { status: qa.status, score: qa.score }
  );
} else {
  add("production-qa", "review", "No QA report found.");
}

if (videoQuality) {
  add(
    "video-quality",
    videoQuality.status === "pass" ? "pass" : "fail",
    { status: videoQuality.status, score: videoQuality.score }
  );
} else {
  add("video-quality", "review", "No rendered video quality report found.");
}

if (narrationQuality) {
  add(
    "narration-quality",
    narrationQuality.status === "pass" ? "pass" : narrationQuality.status === "review" ? "review" : "fail",
    { status: narrationQuality.status, score: narrationQuality.score }
  );
} else {
  add("narration-quality", "review", "No narration quality report found. This is optional when Piper is not configured.");
}

if (selfEvaluation) {
  add(
    "self-evaluation",
    selfEvaluation.status === "pass" ? "pass" : selfEvaluation.status === "review" ? "review" : "fail",
    { status: selfEvaluation.status, score: selfEvaluation.score, decision: selfEvaluation.decision }
  );
} else {
  add("self-evaluation", "review", "No self-evaluation report found.");
}

if (revisionPlan) {
  const automatic = revisionPlan.automaticRepair;
  add(
    "revision-safety",
    automatic === false ? "pass" : "review",
    { automaticRepair: automatic, maxAutomaticAttempts: revisionPlan.maxAutomaticAttempts }
  );
} else {
  add("revision-safety", "review", "No revision plan found.");
}

add(
  "reproducibility",
  runManifest && runManifest.runId && runManifest.artifacts ? "pass" : "review",
  runManifest ? "Run manifest contains execution identity and artifact hashes." : "No run manifest found."
);

if (production) {
  add(
    "final-handoff",
    production.status === "success" ? "pass" : "review",
    { status: production.status, version: production.version }
  );
} else {
  add("final-handoff", "review", "No final production manifest found.");
}

if (packageManifest) {
  add(
    "package-integrity",
    packageManifest.files && packageManifest.checksums ? "pass" : "review",
    { fileCount: packageManifest.files?.length || 0 }
  );
} else {
  add("package-integrity", "review", "No final package manifest found.");
}

const hardFailures = checks.filter(x => x.status === "fail");
const reviews = checks.filter(x => x.status === "review");
const blockers = [
  "required-source",
  "regression",
  "production-qa",
  "video-quality"
].filter(name => checks.some(x => x.name === name && x.status === "fail"));

let status = "ready";
if (hardFailures.length || blockers.length) status = "fail";
else if (reviews.length) status = "review";

const report = {
  version: "1.0",
  generatedAt: new Date().toISOString(),
  status,
  release: {
    product: "BRAG",
    rule: "Ready means deterministic regression passes, required production source exists, the ten-product matrix meets the 8/10 target, and no production QA or video-quality blocker fails.",
    requiredMatrixPasses: 8,
    automaticRevisionLimit: 2,
    deployment: "not performed by this gate"
  },
  summary: {
    checks: checks.length,
    passes: checks.filter(x => x.status === "pass").length,
    reviews: reviews.length,
    failures: hardFailures.length
  },
  checks,
  blockers,
  artifacts: {
    regression: artifactStatus("output/regression/report.json"),
    productSuite: artifactStatus("output/test-suite/report.json"),
    qa: artifactStatus("output/qa/report.json"),
    videoQuality: artifactStatus("output/qa/video-quality.json"),
    narrationQuality: artifactStatus("output/demo/narration-quality.json"),
    selfEvaluation: artifactStatus("output/self-evaluation.json"),
    revisionPlan: artifactStatus("output/revision-plan.json"),
    runManifest: artifactStatus("output/run-manifest.json"),
    production: artifactStatus("output/final/production.json"),
    packageManifest: artifactStatus("output/final/brag-package.json")
  },
  rule: "This gate evaluates available evidence. Missing reports produce review status rather than being treated as passing. It never claims that an unexecuted external product matrix or deployment succeeded."
};

fs.mkdirSync(path.join(root, "output", "release-gate"), { recursive: true });
fs.writeFileSync(
  path.join(root, "output", "release-gate", "report.json"),
  JSON.stringify(report, null, 2)
);
fs.writeFileSync(
  path.join(root, "output", "release-gate", "README.txt"),
  [
    "BRAG RELEASE GATE",
    "",
    `Status: ${status.toUpperCase()}`,
    `Generated: ${report.generatedAt}`,
    "",
    "A READY result requires the deterministic regression suite to pass, the 8/10 product matrix target to be met, and no production QA or video-quality blocker to fail.",
    "REVIEW means required evidence is missing or optional/human review remains.",
    "FAIL means a release blocker was detected.",
    "",
    "Run: npm run release-gate"
  ].join("\n")
);

console.log(JSON.stringify(report, null, 2));
process.exitCode = status === "fail" ? 1 : 0;
