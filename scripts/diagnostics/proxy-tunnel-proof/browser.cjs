const http=require('node:http');const {randomUUID}=require('node:crypto');const fs=require('node:fs');
const {chromium}=require(require('node:path').resolve('node_modules/playwright'));
(async()=>{
 const attempts=[],responses=[],sockets=new Set(),bridges=[];
 const browser=await chromium.launch({headless:true,args:['--log-net-log=/tmp/certscore-proxy-proof/netlog.json','--net-log-max-size-mb=16']});
 try {await Promise.all(['lane-a','lane-b'].map(async lane=>{
  const bridge=http.createServer((q,s)=>s.writeHead(403).end());bridges.push(bridge);
  bridge.on('connect',(req,client,head)=>{
   if(req.url!=='ergoveritas.com:443'){client.end('HTTP/1.1 403 Forbidden\r\n\r\n');return;}
   const attempt={id:randomUUID(),authority:req.url,connected:false,lane,clientPort:client.remotePort,bridgePort:client.localPort};attempts.push(attempt);
   const upstream=http.request({host:'127.0.0.1',port:43128,method:'CONNECT',path:req.url,headers:{'X-CertScore-Tunnel':attempt.id},timeout:10000});
   upstream.on('connect',(response,socket,proxyHead)=>{
    sockets.add(socket);sockets.add(client);attempt.connected=response.statusCode===200;
    if(!attempt.connected){socket.destroy();client.destroy();return;}
    client.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)socket.write(head);if(proxyHead.length)client.write(proxyHead);
    client.pipe(socket);socket.pipe(client);client.on('close',()=>socket.destroy());socket.on('close',()=>client.destroy());socket.on('error',()=>client.destroy());client.on('error',()=>socket.destroy());
   });upstream.on('error',()=>client.destroy());upstream.on('timeout',()=>upstream.destroy());upstream.end();
  });await new Promise(r=>bridge.listen(0,'127.0.0.1',r));
  const context=await browser.newContext({proxy:{server:`http://127.0.0.1:${bridge.address().port}`},serviceWorkers:'block'});
  const page=await context.newPage();
  const response=await page.goto('https://ergoveritas.com/',{waitUntil:'commit',timeout:20000});
  const address=await response.serverAddr();
  responses.push({lane,connectionId:address?.certscoreConnectionId,url:response.url(),status:response.status(),fromServiceWorker:response.fromServiceWorker()});
  console.log(JSON.stringify({lane,status:response.status(),browserAddress:address}));await context.close();
 }));}finally{await browser.close();for(const s of sockets)s.destroy();for(const b of bridges)b.close();fs.writeFileSync('/tmp/certscore-proxy-proof/responses.json',JSON.stringify(responses));fs.writeFileSync('/tmp/certscore-proxy-proof/attempts.json',JSON.stringify(attempts));}
})().catch(e=>{console.error(e);process.exitCode=1});
