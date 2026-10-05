const assert = require("assert");
const { maxAttempts, canAutoRepair, earliestStage, buildDecision } = require("./model/revision-loop");

assert.equal(maxAttempts(undefined), 2);
assert.equal(maxAttempts(9), 2);
assert.equal(maxAttempts(-1), 0);

const plan = {
  actions: [
    { priority: "high", stage: "capture" },
    { priority: "medium", stage: "story" }
  ]
};

assert.equal(canAutoRepair(plan), true);
assert.equal(earliestStage(plan), "capture");
assert.equal(buildDecision({ attempt: 0, max: 2, plan, evaluation: { status: "fail" } }).action, "revise");
assert.equal(buildDecision({ attempt: 2, max: 2, plan, evaluation: { status: "fail" } }).action, "stop");
assert.equal(canAutoRepair({ actions: [{ priority: "medium", stage: "human" }] }), false);

console.log("revision-loop tests passed");
