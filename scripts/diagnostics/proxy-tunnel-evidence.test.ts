import assert from 'node:assert/strict';
import test from 'node:test';
import { verifiedTunnelEndpoints } from './proxy-tunnel-evidence.js';
const attempt={id:'lane-a-opaque',authority:'example.com:443',connected:true};
const log=(id=attempt.id,ip='1.1.1.1',status='200')=>`123.000 ${id} CONNECT example.com:443 ${status} ${ip} TCP_TUNNEL`;
test('exact tunnel IDs separate concurrent same-host lanes and retain different endpoints',()=>{
 const results=verifiedTunnelEndpoints([attempt,{...attempt,id:'lane-b'}],[log('lane-b','8.8.8.8'),log()]);
 assert.deepEqual(results.map(r=>'ip' in r?r.ip:null),['1.1.1.1','8.8.8.8']);
});
test('missing, duplicate, mismatched, failed, private and unconfirmed evidence stays unavailable',()=>{
 for(const lines of [[],[log('other')],[log(),log()],[log().replace('example.com','redirect.example')],[log(attempt.id,'1.1.1.1','503')],[log(attempt.id,'127.0.0.1')]])assert.equal(verifiedTunnelEndpoints([attempt],lines)[0]?.status,'unavailable');
 assert.equal(verifiedTunnelEndpoints([{...attempt,connected:false}],[log()])[0]?.status,'unavailable');
 assert.ok(verifiedTunnelEndpoints([attempt,attempt],[log()]).every(r=>r.status==='unavailable'));
});

test('request binding requires exact browser socket and unique tunnel, never hostname alone',async()=>{
 const {bindRequestEndpoint}=await import('./proxy-tunnel-evidence.js');
 const sockets=[{connectionId:42,clientPort:3001,bridgePort:4001}];
 const attempts=[{...attempt,clientPort:3001,bridgePort:4001}];
 assert.equal(bindRequestEndpoint(42,sockets,attempts,[log()])?.ip,'1.1.1.1');
 assert.equal(bindRequestEndpoint(43,sockets,attempts,[log()]),undefined);
 assert.equal(bindRequestEndpoint(42,sockets,[{...attempts[0]!,bridgePort:4002}],[log()]),undefined);
 assert.equal(bindRequestEndpoint(42,sockets,[...attempts,...attempts],[log()]),undefined);
 assert.equal(bindRequestEndpoint(42,[...sockets,...sockets],attempts,[log()]),undefined);
});

test('response eligibility rejects cache, worker, cross-authority and missing connection proof',async()=>{
 const {bindObservedResponseEndpoint}=await import('./proxy-tunnel-evidence.js');
 const sockets=[{connectionId:42,clientPort:3001,bridgePort:4001}];
 const attempts=[{...attempt,clientPort:3001,bridgePort:4001}];
 const response={connectionId:42,url:'https://example.com/path',status:200};
 assert.equal(bindObservedResponseEndpoint(response,sockets,attempts,[log()])?.ip,'1.1.1.1');
 for(const patch of [{fromDiskCache:true},{fromServiceWorker:true},{fromPrefetchCache:true},{connectionId:0},{status:0},{url:'https://other.example/path'},{url:'http://example.com/'},{url:'bad-url'}]) {
  assert.equal(bindObservedResponseEndpoint({...response,...patch},sockets,attempts,[log()]),undefined);
 }
});
