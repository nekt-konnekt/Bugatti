const fs=require("fs");
const path=require("path");
const crypto=require("crypto");

function sha256(file){return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");}

function packageOutput({sourceDir="output/final",packageName="brag-production"}={}){
  if(!fs.existsSync(sourceDir)) throw new Error("Final output directory does not exist: "+sourceDir);
  const files=fs.readdirSync(sourceDir,{withFileTypes:true})
    .filter(entry=>entry.isFile()&&entry.name!=="brag-package.json"&&entry.name!=="README.txt")
    .map(entry=>entry.name)
    .map(name=>{const file=path.join(sourceDir,name);const stat=fs.statSync(file);return{path:name,size:stat.size,sha256:sha256(file)};});
  const manifest={version:"1.0",packageName,generatedAt:new Date().toISOString(),source:"BRAG production pipeline",files,formats:files.filter(f=>f.path.endsWith(".mp4")).map(f=>f.path),rule:"The final package contains only completed handoff artifacts. Checksums make the package auditable after transfer."};
  fs.writeFileSync(path.join(sourceDir,"brag-package.json"),JSON.stringify(manifest,null,2));
  fs.writeFileSync(path.join(sourceDir,"README.txt"),["BRAG PRODUCTION PACKAGE","","This folder is the final handoff from BRAG.","","Videos:",...manifest.formats.map(x=>"  "+x),"","Metadata and QA artifacts are included alongside the videos.","See brag-package.json for SHA-256 checksums."].join("\n"));
  return manifest;
}

if(require.main===module){console.log(JSON.stringify(packageOutput({sourceDir:process.argv[2]||"output/final"}),null,2));}
module.exports={packageOutput};
