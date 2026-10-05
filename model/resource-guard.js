const fs=require("fs");
const path=require("path");

function createRuntimeGuard({maxRuntimeMs=180000,maxOutputFiles=200}={}){
  const started=Date.now();
  function assertTime(){
    if(Date.now()-started>maxRuntimeMs) throw new Error("BRAG runtime limit exceeded.");
  }
  function assertOutput(root="output"){
    if(!fs.existsSync(root)) return;
    let count=0;
    const walk=dir=>{
      for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
        if(++count>maxOutputFiles) throw new Error("BRAG output file limit exceeded.");
        if(entry.isDirectory()) walk(path.join(dir,entry.name));
      }
    };
    walk(root);
  }
  return {assertTime,assertOutput,elapsed:()=>Date.now()-started};
}

module.exports={createRuntimeGuard};
