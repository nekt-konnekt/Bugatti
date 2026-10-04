const dns=require("dns").promises;
const net=require("net");

const MAX_URL_LENGTH=2048;
const BLOCKED_HOSTS=new Set(["localhost","localhost.localdomain"]);
const PRIVATE_IPV4=[
  [/^10\./,"private"],
  [/^127\./,"loopback"],
  [/^169\.254\./,"link-local"],
  [/^172\.(1[6-9]|2\d|3[01])\./,"private"],
  [/^192\.168\./,"private"],
  [/^0\./,"unspecified"]
];

function isPrivateIp(ip){
  if(net.isIPv4(ip)) return PRIVATE_IPV4.some(([re])=>re.test(ip)) || ip==="255.255.255.255";
  if(net.isIPv6(ip)){
    const v=ip.toLowerCase();
    return v==="::1" || v==="::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80:");
  }
  return false;
}

async function validateTarget(raw,{resolve=true}={}){
  if(typeof raw!=="string"||raw.length>MAX_URL_LENGTH) throw new Error("Target URL is invalid or too long.");
  let u;
  try{u=new URL(raw);}catch{throw new Error("Target URL must be a valid URL.");}
  if(!["http:","https:"].includes(u.protocol)) throw new Error("Only http(s) targets are allowed.");
  if(u.username||u.password) throw new Error("URLs containing embedded credentials are not allowed.");
  const host=u.hostname.toLowerCase();
  if(BLOCKED_HOSTS.has(host)||host.endsWith(".localhost")||host.endsWith(".local")) throw new Error("Local host targets are blocked.");
  if(isPrivateIp(host)) throw new Error("Private or local network targets are blocked.");
  if(resolve && net.isIP(host)===0){
    let addresses=[];
    try{addresses=await dns.lookup(host,{all:true});}catch{throw new Error("Target hostname could not be resolved.");}
    if(addresses.some(a=>isPrivateIp(a.address))) throw new Error("Target resolves to a private or local network address.");
  }
  return u;
}

function clampSteps(value, fallback=4){
  const n=Number(value);
  return Number.isInteger(n)?Math.min(Math.max(n,1),6):fallback;
}

function resourceConfig(env=process.env){
  const number=(key,fallback,min,max)=>{const n=Number(env[key]);return Number.isFinite(n)?Math.min(Math.max(n,min),max):fallback;};
  return {
    maxSteps:clampSteps(env.BRAG_MAX_STEPS||4),
    navigationTimeoutMs:number("BRAG_NAV_TIMEOUT_MS",30000,5000,60000),
    actionTimeoutMs:number("BRAG_ACTION_TIMEOUT_MS",8000,2000,30000),
    maxRuntimeMs:number("BRAG_MAX_RUNTIME_MS",180000,30000,600000),
    maxRequestFailures:number("BRAG_MAX_REQUEST_FAILURES",50,1,500),
    maxOutputFiles:number("BRAG_MAX_OUTPUT_FILES",200,20,1000)
  };
}

module.exports={validateTarget,isPrivateIp,clampSteps,resourceConfig,MAX_URL_LENGTH};
