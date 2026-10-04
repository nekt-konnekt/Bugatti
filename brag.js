const fs=require("fs");
const path=require("path");
const {execFileSync,spawnSync}=require("child_process");
const {maxAttempts,loadPlan,snapshotAttempt,buildDecision}=require("./model/revision-loop");

const url=process.argv.find(a=>/^https?:\/\//i.test(a))||null;
const checkOnly=process.argv.includes("--check");
function run(label,script,args=[],allowFailure=false){console.log("\n=== "+label+" ===");const r=spawnSync(process.execPath,[script,...args],{stdio:"inherit",env:process.env});if(r.status!==0&&!allowFailure)throw new Error(label+" failed with exit code "+r.status);return r.status||0;}
function json(file){try{return JSON.parse(fs.readFileSync(file,"utf8"));}catch{return null;}}
function has(command){try{execFileSync(command,["-version"],{stdio:"ignore"});return true;}catch{return false;}}
function checkEnvironment(){const checks=[["Node.js",Boolean(process.version)],["FFmpeg",has("ffmpeg")],["Playwright package",fs.existsSync(path.join(__dirname,"node_modules","playwright"))]];if(!checks.every(x=>x[1]))throw new Error("BRAG environment check failed: "+JSON.stringify(Object.fromEntries(checks)));console.log(JSON.stringify(Object.fromEntries(checks),null,2));}
function cleanOutput(){if(!fs.existsSync("output"))return;for(const e of fs.readdirSync("output"))if(e!=="revisions")fs.rmSync(path.join("output",e),{recursive:true,force:true});}
function production(url,steps,description){
  run("INSPECT","capture.js",[url]);run("VISUAL DIRECTOR","model/vision.js");run("SPEECH DIRECTOR","model/transcribe.js");run("AI DIRECTOR","model/director.js");run("DIRECT","director.js");run("CAPTURE","runner.js",[url,steps]);
  run("EVIDENCE CHECK","model/verify.js",[],true);run("EVIDENCE GRAPH","model/evidence-graph.js");run("BUILD DEMO PACKAGE","demo.js",[url,steps,description]);run("HUMAN EDIT PLAN","edit-plan.js",["output/demo/package.json"]);
  if(process.env.PIPER_MODEL)run("NARRATE","voice.js",["output/demo/package.json"]);else console.log("Skipping Piper TTS: PIPER_MODEL is not set.");
  run("NARRATION QUALITY","model/narration-quality.js",["output/demo/package.json"],true);
  run("RENDER","render.js",["output/demo/package.json"]);run("VIDEO QUALITY","model/video-quality.js",["output/render"],true);
  run("QA","qa.js",["output/demo/package.json"],true);run("SELF-EVALUATE","model/self-evaluate.js",["output/demo/package.json"],true);run("REVISION PLAN","model/revision-plan.js",[],true);
  return{qa:json("output/qa/report.json"),evaluation:json("output/self-evaluation.json"),plan:loadPlan(),narration:json("output/demo/narration-quality.json"),video:json("output/qa/video-quality.json")};
}
function finalOutputs(){return["16x9","9x16","1x1"].map(k=>path.join("output","render","brag-demo-"+k+".mp4"));}
function handoff(qa,history){const dir="output/final";fs.mkdirSync(dir,{recursive:true});for(const f of finalOutputs()){if(!fs.existsSync(f)||!fs.statSync(f).size)throw new Error("Missing final render: "+f);fs.copyFileSync(f,path.join(dir,path.basename(f).replace("brag-demo-","product-demo-")));}for(const [n,s] of Object.entries({"report.json":"output/qa/report.json","qa-report.json":"output/qa/report.json","video-quality.json":"output/qa/video-quality.json","narration-quality.json":"output/demo/narration-quality.json","storyboard.json":"output/storyboard.json","shot-plan.json":"output/shot-plan.json","evidence-report.json":"output/evidence-report.json","evidence-graph.json":"output/evidence-graph.json","self-evaluation.json":"output/self-evaluation.json","revision-plan.json":"output/revision-plan.json"}))if(fs.existsSync(s))fs.copyFileSync(s,path.join(dir,n));fs.writeFileSync(path.join(dir,"production.json"),JSON.stringify({version:"3.1",generatedAt:new Date().toISOString(),qa,revisions:history},null,2));}
function main(){checkEnvironment();if(checkOnly){run("HARDENING","harden.js");return;}if(!url)throw new Error("Usage: npm run brag -- https://example.com [maxSteps] [description] [--max-revisions N]");const i=process.argv.indexOf(url);const steps=process.argv[i+1]&&!process.argv[i+1].startsWith("--")?process.argv[i+1]:"4";const description=process.argv.slice(i+2).filter(x=>!x.startsWith("--")&&x!==steps).join(" ");const flag=process.argv.indexOf("--max-revisions");const max=maxAttempts(flag>=0?process.argv[flag+1]:process.env.BRAG_MAX_REVISIONS);fs.mkdirSync("output/revisions",{recursive:true});const history={version:"1.0",maxAttempts:max,attempts:[]};
for(let attempt=0;attempt<=max;attempt++){if(attempt)cleanOutput();const startedAt=new Date().toISOString();let result;try{result=production(url,steps,description);}catch(e){console.error(e.stack||e);process.exit(1);}
const decision=buildDecision({attempt,max,plan:result.plan,evaluation:result.evaluation});
const mediaFail=result.video?.status==="fail", narrationFail=result.narration?.status==="fail";
if(result.evaluation?.status==="pass"&&result.qa?.status!=="fail"&&!mediaFail&&!narrationFail){history.attempts.push({attempt,startedAt,completedAt:new Date().toISOString(),decision:"pass",evaluationScore:result.evaluation.score,qaStatus:result.qa?.status,videoStatus:result.video?.status,narrationStatus:result.narration?.status});fs.writeFileSync("output/revisions/history.json",JSON.stringify(history,null,2));handoff(result.qa,history);console.log("\nBRAG production complete.");return;}
if(decision.action==="revise"){const snapshot=snapshotAttempt(attempt,result.plan,result.evaluation,result.qa,{startedAt,decision:"revise"});history.attempts.push({attempt,startedAt,completedAt:new Date().toISOString(),decision:"revise",restartFrom:decision.restartFrom,snapshot});fs.writeFileSync("output/revisions/history.json",JSON.stringify(history,null,2));console.log("\n=== AUTONOMOUS REVISION "+(attempt+1)+"/"+max+" ===");console.log("Restarting from: "+decision.restartFrom);continue;}
history.attempts.push({attempt,startedAt,completedAt:new Date().toISOString(),decision:"stop",reason:decision.reason});fs.writeFileSync("output/revisions/history.json",JSON.stringify(history,null,2));throw new Error("BRAG stopped before final handoff: "+decision.reason);}}
main();
