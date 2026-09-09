// Local-only fixture benchmark. See benchmark-results.md for limitations.
const fs=require('node:fs'),http=require('node:http'),https=require('node:https');
const {performance}=require('node:perf_hooks');const {randomUUID,createHash}=require('node:crypto');
const {spawn}=require('node:child_process');const path=require('node:path');
const dir='/tmp/certscore-proxy-bench',url='https://host.docker.internal:44553/';
async function worker(mode,index){
 const captureDir=fs.mkdtempSync(path.join(dir,'capture-'));
 try {
 const {chromium}=require(path.resolve('node_modules/playwright'));
 const sockets=new Set(),attempts=[];let bridge;
 const started=performance.now();let server='http://127.0.0.1:43128';
 if(mode==='instrumented'){
 bridge=http.createServer((q,s)=>s.writeHead(403).end());
 bridge.on('connect',(q,client,head)=>{
 if(q.url!=='host.docker.internal:44553'){client.destroy();return;}
 const attempt={id:randomUUID(),authority:q.url,clientPort:client.remotePort,bridgePort:client.localPort};attempts.push(attempt);
 const request=http.request({host:'127.0.0.1',port:43128,method:'CONNECT',path:q.url,headers:{'X-CertScore-Tunnel':attempt.id},timeout:5000});
 request.on('connect',(r,s,h)=>{sockets.add(s);sockets.add(client);if(r.statusCode!==200){s.destroy();client.destroy();return;}
 client.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)s.write(head);if(h.length)client.write(h);s.pipe(client);client.pipe(s);
 s.on('error',()=>client.destroy());client.on('error',()=>s.destroy());s.on('close',()=>client.destroy());client.on('close',()=>s.destroy());});request.on('error',()=>client.destroy());request.on('timeout',()=>request.destroy());request.end();
 });await new Promise(r=>bridge.listen(0,'127.0.0.1',r));server=`http://127.0.0.1:${bridge.address().port}`;
 }
 const log=path.join(captureDir,'netlog.json');
 const browser=await chromium.launch({headless:true,args:mode==='instrumented'?[`--log-net-log=${log}`,'--net-log-max-size-mb=16']:[]});
 let result;
 try{
 // Self-signed certificate exemption applies only to this isolated fixture, in BOTH modes.
 const context=await browser.newContext({proxy:{server},ignoreHTTPSErrors:true,serviceWorkers:'block'});
 const page=await context.newPage(),responses=[];const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');
 cdp.on('Network.responseReceived',e=>responses.push({url:e.response.url,status:e.response.status,type:e.type,connectionId:e.response.connectionId}));
 const captureStart=performance.now();await page.goto(url,{waitUntil:'load'});await page.waitForFunction(()=>window.fixtureDone===true);
 const captureMs=performance.now()-captureStart;
 const facts=await page.evaluate(()=>({storage:localStorage.getItem('fixture'),forms:document.forms.length,frames:document.querySelectorAll('iframe').length,result:window.fixtureResult}));
 const cookies=(await context.cookies()).map(({name,value,domain,path,secure,httpOnly,sameSite})=>({name,value,domain,path,secure,httpOnly,sameSite}));
 const network=responses.map(({connectionId,...r})=>r).sort((a,b)=>a.url.localeCompare(b.url));
 const evidence={facts,cookies,network};
 result={mode,index,captureMs,evidenceHash:createHash('sha256').update(JSON.stringify(evidence)).digest('hex'),evidence,responses,attempts};await context.close();
 }finally{await browser.close();for(const s of sockets)s.destroy();if(bridge)await new Promise(r=>bridge.close(r));}
 result.wallMs=performance.now()-started;
 const parseStart=performance.now();
 if(mode==='instrumented'){
 result.netlogBytes=fs.statSync(log).size;
 try {
 const extracted=await require('../bounded-netlog-sockets.cjs').extractNetlogSockets(log);
 result.extractionStatus=extracted.status;
 const socketRows=extracted.sockets;
 result.boundResponses=result.responses.filter(r=>{const matches=socketRows.filter(s=>s.connectionId===r.connectionId);return matches.length===1&&attempts.filter(a=>a.clientPort===matches[0].clientPort&&a.bridgePort===matches[0].bridgePort).length===1;}).length;
 result.socketMetadataBytes=Buffer.byteLength(JSON.stringify(socketRows));
 } finally {fs.rmSync(log,{force:true});}

 }
 result.parseMs=performance.now()-parseStart;
 console.log(JSON.stringify(result));
 } finally {fs.rmSync(captureDir,{recursive:true,force:true});}
}
async function main(){
 const server=https.createServer({key:fs.readFileSync(`${dir}/key.pem`),cert:fs.readFileSync(`${dir}/cert.pem`)},(q,s)=>{
 s.setHeader('cache-control','no-store');
 if(q.url==='/'){s.setHeader('content-type','text/html');s.setHeader('set-cookie','fixture_cookie=retained; Secure; SameSite=Lax; Path=/');s.end(`<form><input name="email"></form><iframe src="/frame"></iframe><script>localStorage.setItem('fixture','retained');Promise.all(Array.from({length:${Number(process.env.FIXTURE_REQUEST_COUNT)||24}},(_,i)=>fetch('/data/'+i).then(r=>r.text()))).then(x=>{window.fixtureResult=x.join(',');window.fixtureDone=true;});</script>`);}
 else if(q.url==='/frame'){s.setHeader('content-type','text/html');s.end('<p>Frame evidence</p>');}
 else{s.setHeader('content-type','text/plain');s.end('retained:'+q.url);}
 });await new Promise(r=>server.listen(44553,'0.0.0.0',r));
 const results=[];
 try{for(let i=0;i<14;i++){const mode=(Math.floor(i/2)%2===0?i%2===0:i%2!==0)?'baseline':'instrumented';
 const result=await new Promise((resolve,reject)=>{const child=spawn('/usr/bin/time',['-l',process.execPath,__filename,mode,String(i)]);let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);child.on('close',code=>{if(code)return reject(Error(err));const r=JSON.parse(out);const cpu=err.match(/([\d.]+) user\s+([\d.]+) sys/);r.cpuSeconds=cpu?Number(cpu[1])+Number(cpu[2]):null;r.maxRssBytes=Number(err.match(/(\d+)\s+maximum resident set size/)?.[1]);resolve(r);});});results.push(result);console.error(mode,i,Math.round(result.wallMs));}}
 finally{server.close();fs.writeFileSync(`${dir}/results.json`,JSON.stringify(results,null,2));}
}
(process.argv[2]?worker(process.argv[2],process.argv[3]):main()).catch(e=>{console.error(e);process.exitCode=1;});
