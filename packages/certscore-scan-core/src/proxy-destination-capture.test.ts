import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer, request} from 'node:http';
import {createProxyDestinationCapture} from './proxy-destination-capture.js';

test('optional proxy capture preserves ordinary HTTP requests and cleans up', async () => {
 const keys=['CERTSCORE_PROXY_DESTINATION_ENABLED','CERTSCORE_PROXY_RECORDS_URL','CERTSCORE_PROXY_RECORDS_KEY'];
 const prior=keys.map(k=>process.env[k]);
 const upstream=createServer((q,s)=>{assert.equal(q.url,'http://example.com/plain');s.end('preserved');});
 await new Promise<void>(r=>upstream.listen(0,'127.0.0.1',r));
 const address=upstream.address();assert(address&&typeof address!=='string');
 process.env.CERTSCORE_PROXY_DESTINATION_ENABLED='1';
 process.env.CERTSCORE_PROXY_RECORDS_URL=`http://127.0.0.1:${address.port}/records`;
 process.env.CERTSCORE_PROXY_RECORDS_KEY='a'.repeat(64);
 const capture=await createProxyDestinationCapture({proxy:{server:`http://127.0.0.1:${address.port}`}});
 try{
  assert(capture);
  const result=await new Promise<string>((resolve,reject)=>{
   const q=request(capture.launch.proxy!.server,{path:'http://example.com/plain'},s=>{let b='';s.on('data',c=>b+=c);s.on('end',()=>resolve(b));});q.on('error',reject);q.end();
  });
  assert.equal(result,'preserved');
  assert.equal((await capture.resolve(Date.now()-1)).size,0);
 }finally{
  await capture?.close();await new Promise<void>(r=>upstream.close(()=>r()));
  keys.forEach((k,i)=>{if(prior[i]===undefined)delete process.env[k];else process.env[k]=prior[i];});
 }
});
