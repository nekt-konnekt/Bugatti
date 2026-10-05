const assert = require("assert");
const { classifyFailure } = require("./runner");

assert.equal(classifyFailure(new Error("Timeout 30000ms exceeded")), "timeout");
assert.equal(classifyFailure(new Error("net::ERR_CONNECTION_RESET")), "network");
assert.equal(classifyFailure(new Error("Target page, context or browser has been closed")), "browser-crash");
assert.equal(classifyFailure(new Error("element is not attached to the DOM")), "dom-stale");
console.log("capture recovery tests passed");
