const {chromium}=require('playwright');
const http=require('node:http');
const fs=require('node:fs');
(async()=>{
 const seen=[];
 const server=http.createServer((req,res)=>{seen.push({path:req.url,secGpc:req.headers['sec-gpc']??null,ua:req.headers['user-agent']});res.setHeader('Content-Type','text/html');res.end('<h1>Local GPC probe</h1>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const output={browserVersion:null,playwrightVersion:require('playwright/package.json').version,platform:process.platform,arch:process.arch,conditions:[]};
 for(const mode of ['absent','false','enabled']){
 const b=await chromium.launch({headless:true,executablePath:process.env.CERTSCORE_CHROMIUM_EXECUTABLE_PATH||undefined,args:process.platform==='linux'?['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-setuid-sandbox','--disable-software-rasterizer','--no-zygote','--single-process']:['--no-sandbox']});

 output.browserVersion=b.version();
  const c=await b.newContext({extraHTTPHeaders:mode==='enabled'?{'Sec-GPC':'1'}:{}});
  if(mode!=='absent')await c.addInitScript({content:`Object.defineProperty(Navigator.prototype,'globalPrivacyControl',{configurable:false,get:()=>${mode==='enabled'}})`});
  const p=await c.newPage();await p.goto(`http://127.0.0.1:${server.address().port}/${mode}`);
  const read=await p.evaluate(async()=>({present:'globalPrivacyControl' in navigator,type:typeof navigator.globalPrivacyControl,value:navigator.globalPrivacyControl??null,ua:navigator.userAgent,worker:await new Promise(resolve=>{const w=new Worker(URL.createObjectURL(new Blob(['postMessage({present:"globalPrivacyControl" in navigator,type:typeof navigator.globalPrivacyControl,value:navigator.globalPrivacyControl??null})'],{type:'text/javascript'})));w.onmessage=e=>{resolve(e.data);w.terminate()}})}));
  output.conditions.push({mode,...read,serverObserved:seen.find(x=>x.path==='/'+mode)});await b.close();
 }
 await new Promise(r=>server.close(r));
 const text=JSON.stringify(output,null,2)+'\n';if(process.argv[2])fs.writeFileSync(process.argv[2],text);console.log(text);
})().catch(e=>{console.error(e);process.exit(1)});
