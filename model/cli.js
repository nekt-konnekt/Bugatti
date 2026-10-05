const path=require("path");

function usage(){
  return [
    "BRAG Product-to-Video Demo Engine",
    "",
    "Usage:",
    "  npm run brag -- <url> [steps] [description]",
    "  npm run brag -- --url <url> [options]",
    "",
    "Options:",
    "  --url <url>              Product URL",
    "  --steps <n>              Maximum browser steps (default: 4)",
    "  --description <text>     Product description supplied by the founder",
    "  --max-revisions <n>      Automatic revision attempts, capped at 2",
    "  --override <file>        Human edit override JSON",
    "  --check                  Validate the local BRAG environment only",
    "  --help                   Show this help",
    "",
    "Environment:",
    "  BRAG_MAX_REVISIONS       Default for --max-revisions",
    "  BRAG_OVERRIDE            Default override file",
    "  PIPER_MODEL              Enables local narration",
    "  OLLAMA_MODEL             Local AI Director model",
    "",
    "Outputs:",
    "  output/final/             Finished videos and production package",
    "  output/                   Evidence, QA, story and run artifacts"
  ].join("\n");
}

function value(args,i,flag){
  const value=args[i+1];
  if(!value || value.startsWith("--")) throw new Error(flag+" requires a value.");
  return value;
}

function parseArgs(argv){
  const args=[...argv];
  if(args.includes("--help")||args.includes("-h")) return {help:true};
  const options={help:false,check:false,url:null,steps:"4",description:"",maxRevisions:process.env.BRAG_MAX_REVISIONS,override:process.env.BRAG_OVERRIDE||null};
  const positional=[];
  for(let i=0;i<args.length;i++){
    const a=args[i];
    if(a==="--check"){options.check=true;continue;}
    if(a==="--url"){options.url=value(args,++i,a);continue;}
    if(a==="--steps"){options.steps=value(args,++i,a);continue;}
    if(a==="--description"){options.description=value(args,++i,a);continue;}
    if(a==="--max-revisions"){options.maxRevisions=value(args,++i,a);continue;}
    if(a==="--override"){options.override=path.resolve(value(args,++i,a));continue;}
    if(a.startsWith("--")) throw new Error("Unknown option: "+a);
    positional.push(a);
  }
  if(!options.url){
    const found=positional.find(x=>/^https?:\/\//i.test(x));
    if(found){
      options.url=found;
      const index=positional.indexOf(found);
      const rest=positional.slice(index+1);
      if(rest[0]&&!/^\d+$/.test(rest[0])) options.description=rest.join(" ");
      else { if(rest[0]) options.steps=rest[0]; options.description=rest.slice(1).join(" "); }
    }
  }
  if(!options.url&&!options.check) throw new Error("A product URL is required. Use --help for usage.");
  const steps=Number(options.steps);
  if(!Number.isInteger(steps)||steps<1||steps>20) throw new Error("--steps must be an integer from 1 to 20.");
  if(options.maxRevisions!=null){const n=Number(options.maxRevisions);if(!Number.isInteger(n)||n<0||n>2) throw new Error("--max-revisions must be an integer from 0 to 2.");}
  return {...options,steps};
}

module.exports={parseArgs,usage};
