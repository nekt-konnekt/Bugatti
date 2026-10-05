const http=require("http");
const fs=require("fs");
const path=require("path");
const {spawn}=require("child_process");
const {chromium}=require("playwright");
const {buildStoryboard}=require("./director");
const {runWorkflow}=require("./runner");
const {validateTarget,resourceConfig}=require("./model/security");

const PORT=process.env.PORT||4173;
const root=__dirname;
const CONFIG=resourceConfig();
const MAX_BODY=12*1024*1024;
const mime={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".png":"image/png"};

function send(res,status,payload){
  res.writeHead(status,{"Content-Type":"application/json","Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type"});
  res.end(JSON.stringify(payload));
}
function readBody(req){
  return new Promise((resolve,reject)=>{
    let body="",tooLarge=false;
    req.on("data",chunk=>{body+=chunk.toString();if(body.length>MAX_BODY)tooLarge=true;});
    req.on("end",()=>tooLarge?reject(new Error("Request body is too large.")):resolve(body));
    req.on("error",reject);
  });
}
async function saveScreenshots(screenshots=[]){
  if (!Array.isArray(screenshots)) return [];
  if (screenshots.length > 6) throw new Error("Maximum 6 screenshots allowed.");
  const dir=path.join(root,"output","input-screenshots");
  fs.mkdirSync(dir,{recursive:true});
  const saved=[];
  for(let i=0;i<screenshots.length;i++){
    const item=screenshots[i]||{};
    if(typeof item.data!=="string"||!/^data:image\/(png|jpeg);base64,/i.test(item.data)) throw new Error("Screenshots must be PNG or JPG images.");
    const raw=item.data.split(",")[1]||"";
    const bytes=Buffer.from(raw,"base64");
    if(bytes.length>5*1024*1024) throw new Error("Each screenshot must be 5 MB or smaller.");
    const ext=/^data:image\/png/i.test(item.data)?".png":".jpg";
    const file=`screenshot-${i+1}${ext}`;
    fs.writeFileSync(path.join(dir,file),bytes);
    saved.push({name:String(item.name||file).slice(0,120),path:path.join("output","input-screenshots",file),bytes:bytes.length});
  }
  return saved;
}

async function inspect(url, screenshots=[]){
  await validateTarget(url);
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];
  page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
  page.on("pageerror",e=>errors.push(e.message));
  try{
    await page.goto(url,{waitUntil:"domcontentloaded",timeout:CONFIG.navigationTimeoutMs});
    await page.waitForLoadState("networkidle",{timeout:12000}).catch(()=>{});
    return {
      url,title:await page.title(),
      description:await page.locator('meta[name="description"]').getAttribute("content").catch(()=>null),
      headings:await page.locator("h1,h2,h3").allTextContents(),
      buttons:await page.locator("button,[role=button],input[type=submit]").evaluateAll(els=>els.slice(0,30).map(el=>({text:(el.innerText||el.value||el.getAttribute("aria-label")||"").trim()})).filter(x=>x.text)),
      links:await page.locator("a").evaluateAll(as=>as.slice(0,40).map(a=>({text:(a.innerText||"").trim(),href:a.href})).filter(x=>x.text||x.href)),
      consoleErrors:errors,
      screenshots
    };
  }finally{await browser.close();}
}

const server=http.createServer(async(req,res)=>{
  if(req.method==="OPTIONS"){res.writeHead(204,{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type"});return res.end();}
  try{
    if(req.method==="POST"&&req.url==="/api/record"){
      const body=JSON.parse(await readBody(req)||"{}");
      await validateTarget(body.url);
      const result=await runWorkflow(body.url,{maxSteps:body.maxSteps});
      return send(res,200,result);
    }
    if(req.method==="POST"&&req.url==="/api/inspect"){
      const body=JSON.parse(await readBody(req)||"{}");
      const screenshots=await saveScreenshots(body.screenshots);
      const inspection=await inspect(body.url,screenshots);
      return send(res,200,{inspection,storyboard:buildStoryboard(inspection)});
    }
    if(req.method==="POST"&&req.url==="/api/produce"){
      const body=JSON.parse(await readBody(req)||"{}");
      await validateTarget(body.url);
      const args=["brag.js","--url",body.url,"--steps",String(body.maxSteps||CONFIG.maxSteps)];
      if(body.description)args.push("--description",String(body.description));
      const child=spawn(process.execPath,args,{cwd:root,env:{...process.env,BRAG_MAX_STEPS:String(CONFIG.maxSteps)}});
      let stdout="",stderr="",timedOut=false;
      const timer=setTimeout(()=>{timedOut=true;child.kill("SIGTERM");},CONFIG.maxRuntimeMs);
      child.stdout.on("data",d=>stdout+=d.toString());
      child.stderr.on("data",d=>stderr+=d.toString());
      child.on("close",code=>{
        clearTimeout(timer);
        const qaPath=path.join(root,"output","qa","report.json");
        const qa=fs.existsSync(qaPath)?JSON.parse(fs.readFileSync(qaPath,"utf8")):null;
        const result={ok:code===0&&!timedOut,exitCode:timedOut?124:code,qa,final:["output/final/product-demo-16x9.mp4","output/final/product-demo-9x16.mp4","output/final/product-demo-1x1.mp4"].filter(file=>fs.existsSync(path.join(root,file))),log:(stdout+"\n"+stderr).slice(-12000)};
        send(res,result.ok?200:500,result);
      });
      return;
    }
    let file=req.url==="/"?"/index.html":req.url;
    file=path.normalize(file).replace(/^\.{2}/,"");
    const target=path.join(root,file);
    if(!target.startsWith(root)){res.writeHead(403);return res.end("Forbidden");}
    if(!fs.existsSync(target)||fs.statSync(target).isDirectory()){res.writeHead(404);return res.end("Not found");}
    res.writeHead(200,{"Content-Type":mime[path.extname(target)]||"application/octet-stream"});
    fs.createReadStream(target).pipe(res);
  }catch(e){send(res,400,{error:e.message});}
});
server.listen(PORT,()=>console.log("BRAG running at http://localhost:"+PORT));
