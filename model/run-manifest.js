const fs=require("fs");
const path=require("path");
const crypto=require("crypto");

const root=process.cwd();
const output=path.join(root,"output");
const manifestPath=path.join(output,"run-manifest.json");
const tracked=[
"inspection.json","ai-intelligence.json","visual-intelligence.json","speech-intelligence.json","storyboard.json",
"shot-plan.json","evidence-report.json","evidence-graph.json","recording/manifest.json","demo/package.json",
"demo/edit-plan.json","demo/narration-quality.json","qa/video-quality.json","qa/report.json",
"self-evaluation.json","revision-plan.json","revisions/history.json"
];

function hash(file){return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");}
function stat(rel){const file=path.join(output,rel);if(!fs.existsSync(file))return null;const s=fs.statSync(file);return{path:rel,size:s.size,sha256:hash(file)};}

const files=tracked.map(stat).filter(Boolean);
const args=process.argv.slice(2);
const record={
  version:"1.0",
  generatedAt:new Date().toISOString(),
  runId:crypto.randomUUID(),
  command:process.argv.slice(0,2).concat(args).join(" "),
  node:process.version,
  platform:process.platform,
  arch:process.arch,
  env:{
    ollamaModel:process.env.OLLAMA_MODEL||null,
    piperConfigured:Boolean(process.env.PIPER_MODEL),
    whisperModel:process.env.WHISPER_MODEL||null,
    maxRevisions:process.env.BRAG_MAX_REVISIONS||null,
    override:process.env.BRAG_OVERRIDE||null
  },
  source:files.find(x=>x.path==="inspection.json")?.path||null,
  artifacts:files,
  reproducibility:"Artifact hashes and execution settings are recorded. Browser/network state and external model weights remain environmental inputs."
};
fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(manifestPath,JSON.stringify(record,null,2));
console.log(JSON.stringify(record,null,2));
