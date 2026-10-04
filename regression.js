const {execFileSync}=require("child_process");
const fs=require("fs");
const path=require("path");

const tests=[
  ["revision-loop.test.js",[]],
  ["capture-recovery.test.js",[]],
  ["cli.test.js",[]],
  ["security.test.js",[]]
];
const results=[];
for(const [file,args] of tests){
  const started=Date.now();
  try {
    const r=execFileSync(process.execPath,[file,...args],{encoding:"utf8",stdio:["ignore","pipe","pipe"]});
    results.push({test:file,status:"pass",elapsedMs:Date.now()-started,output:r.trim().slice(-1000)});
  } catch(error) {
    results.push({test:file,status:"fail",elapsedMs:Date.now()-started,output:String(error.stdout||"").slice(-1000),error:String(error.stderr||error.message).slice(-1000)});
  }
}
const requiredFiles=[
  "brag.js","capture.js","runner.js","director.js","demo.js","edit-plan.js","render.js","qa.js",
  "model/verify.js","model/evidence-graph.js","model/self-evaluate.js","model/revision-plan.js",
  "model/revision-loop.js","model/security.js","model/resource-guard.js","model/cli.js","model/package-output.js"
];
const missing=requiredFiles.filter(file=>!fs.existsSync(path.join(__dirname,file)));
const report={
  version:"1.0",
  generatedAt:new Date().toISOString(),
  status:(missing.length||results.some(x=>x.status==="fail"))?"fail":"pass",
  summary:{tests:results.length,passed:results.filter(x=>x.status==="pass").length,failed:results.filter(x=>x.status==="fail").length,missingFiles:missing.length},
  tests:results,
  missingFiles:missing,
  rule:"Regression checks verify deterministic utility behavior and required production modules. External product availability is measured separately by product-suite.js."
};
fs.mkdirSync(path.join("output","regression"),{recursive:true});
fs.writeFileSync(path.join("output","regression","report.json"),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(missing.length||results.some(x=>x.status==="fail"))process.exitCode=1;
