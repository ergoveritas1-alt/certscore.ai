import assert from 'node:assert/strict'; import test from 'node:test';
import * as fs from 'node:fs/promises'; import * as os from 'node:os'; import * as path from 'node:path';
import {extractNetlogSockets} from './proxy-netlog-sockets.js';
const header=JSON.stringify({constants:{logEventTypes:{TCP_CONNECT:48},logSourceType:{SOCKET:9},logEventPhase:{PHASE_END:2}}}).slice(0,-1)+',';
const event={type:48,phase:2,source:{id:42,type:9},params:{local_address:'127.0.0.1:1234',remote_address:'127.0.0.1:5678'}};
const log=(events:unknown[])=>`${header}\n"events": [\n${events.map(e=>JSON.stringify(e)).join(',\n')}],\n"polledData": []\n}\n`;
async function read(text:string,options?:Parameters<typeof extractNetlogSockets>[1]){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bounded-netlog-test-'));try{const file=path.join(dir,'log');await fs.writeFile(file,text);return await extractNetlogSockets(file,options);}finally{await fs.rm(dir,{recursive:true,force:true});}}
test('extracts only socket tuples across stream chunks without retaining sensitive metadata',async()=>{
 const result=await read(log([{type:1,params:{url:'private-value'.repeat(3000)}},event]));
 assert.equal(result.status,'extracted');assert.deepEqual(result.sockets,[{connectionId:42,clientPort:1234,bridgePort:5678}]);assert.ok(!JSON.stringify(result).includes('private-value'));
});
test('all budget failures discard partial results',async()=>{
 for(const options of [{maxBytes:100},{maxLineBytes:100},{maxSockets:1}]){
 const r=await read(log([event,{...event,source:{id:43,type:9}}]),options);assert.equal(r.status,'unavailable');assert.deepEqual(r.sockets,[]);}
});
test('duplicate, incomplete, malformed and aborted logs fail closed',async()=>{
 for(const value of [log([event,event]),log([event]).slice(0,-3),log([{...event,params:{local_address:'bad',remote_address:'127.0.0.1:1'}}]),'bad'])assert.equal((await read(value)).status,'unavailable');
 const abort=new AbortController();abort.abort();assert.equal((await read(log([event]),{signal:abort.signal})).status,'unavailable');
});
