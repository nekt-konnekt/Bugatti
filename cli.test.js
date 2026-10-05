const assert=require("assert");
const path=require("path");
const {parseArgs}=require("./model/cli");

const expectedEnv=process.env.BRAG_MAX_REVISIONS;
assert.deepStrictEqual(parseArgs(["https://example.com","5","A product"]),{help:false,check:false,url:"https://example.com",steps:5,description:"A product",maxRevisions:expectedEnv,override:process.env.BRAG_OVERRIDE||null});
assert.deepStrictEqual(parseArgs(["--url","https://example.com","--steps","3","--description","A product","--max-revisions","2","--override","output/demo/override.json"]),{help:false,check:false,url:"https://example.com",steps:3,description:"A product",maxRevisions:"2",override:path.resolve("output/demo/override.json")});
assert.throws(()=>parseArgs(["--steps","0","https://example.com"]),/--steps/);
assert.throws(()=>parseArgs(["--unknown","x"]),/Unknown option/);
assert.throws(()=>parseArgs([]),/product URL/);
console.log("CLI tests passed.");
