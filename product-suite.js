const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const suite = JSON.parse(fs.readFileSync(path.join(__dirname, "test", "products.json"), "utf8"));
const limit = Math.min(Math.max(Number(process.env.BRAG_TEST_LIMIT) || suite.products.length, 1), suite.products.length);
const mode = process.argv.includes("--full") ? "full" : "inspect";
const offset = Math.max(Number(process.env.BRAG_TEST_OFFSET) || 0, 0);
const selected = suite.products.slice(offset, offset + limit);

function runProduct(product) {
  const args = mode === "full"
    ? ["brag.js", product.url, process.env.BRAG_TEST_MAX_STEPS || "3"]
    : ["capture.js", product.url];
  const result = spawnSync(process.execPath, args, { stdio: "inherit", env: process.env });
  return { name: product.name, url: product.url, status: result.status === 0 ? "pass" : "fail", exitCode: result.status };
}

const results = selected.map(runProduct);
const passes = results.filter(x => x.status === "pass").length;
const report = {
  version: "1.0",
  generatedAt: new Date().toISOString(),
  mode,
  summary: { passes, failures: results.length - passes },
  results,
  releaseTarget: "At least 8/10 unrelated real products should pass the selected production mode before BRAG is product-ready.",
  threshold: {requiredPasses: Math.min(8, results.length), matrixSize: suite.products.length},
  selection: {offset, limit}
};

fs.mkdirSync(path.join("output", "test-suite"), { recursive: true });
fs.writeFileSync(path.join("output", "test-suite", "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exitCode = results.some(x => x.status === "fail") ? 1 : 0;
