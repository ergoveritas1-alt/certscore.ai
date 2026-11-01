import assert from 'node:assert/strict';
import test from 'node:test';
import { createFormDestinationCollector } from './form-destination-trace';

const page='https://forms.example/',token='loader-main',value='person@example.test';
function capture(body:string|null|undefined,url='https://recipient.example/collect') {
  const start=Date.now()-1000,c=createFormDestinationCollector(start);
  c.event({kind:'input',time:start+100,pageUrl:page,formIndex:0,actionUrl:page+'send',fields:[{name:'email',value,type:'email',label:'Email',autocomplete:'email'}]},token,page);
  c.request('request',url,'POST',200,body,token);c.status('request','response_observed');return c.finish();
}
test('form tracer enforces its UTF8 body byte cap before matching',()=>{
  const body=JSON.stringify({padding:'界'.repeat(12000),email:value});
  assert.ok(body.length<32768&&Buffer.byteLength(body)>32768);
  const result=capture(body);
  assert.equal(result.coverage.truncated,true);
  assert.equal(result.requests[0]!.matches.length,0);
  assert.equal(result.requests[0]!.relation,'temporal_only');
  assert.doesNotMatch(JSON.stringify(result),/person@example|padding|界/);
});
test('JSON candidate omission is explicit even when omitted values are not strings',()=>{
  for(const count of [100,101,105]) {
    const body=JSON.stringify(Object.fromEntries(Array.from({length:count},(_,i)=>['field'+i,i])));
    assert.equal(capture(body).coverage.truncated,count>100);
  }
});
test('query and JSON candidates share the existing100 inspection allowance',()=>{
  const body=JSON.stringify({email:value});
  for(const count of [99,100,101]) {
    const query=new URLSearchParams(Array.from({length:count},(_,i)=>['field'+i,'x'])).toString();
    const result=capture(body,'https://recipient.example/collect?'+query);
    assert.equal(result.coverage.truncated,count>=100);
    assert.equal(result.requests[0]!.matches.length,count<100?1:0);
  }
});
test('oversize bodies preserve independent complete query proof; missing bodies remain unavailable',()=>{
  const url='https://recipient.example/collect?email='+encodeURIComponent(value);
  const result=capture('x'.repeat(32769),url);
  assert.equal(result.coverage.truncated,true);assert.equal(result.requests[0]!.matches[0]?.location,'query');
  assert.equal(capture(undefined,url).coverage.unsupportedPayloads,1);
  assert.equal(capture(null,url).coverage.unsupportedPayloads,0);
  assert.equal(capture('',url).coverage.unsupportedPayloads,0);
});
test('exact32768 byte body remains eligible and100 candidates do not imply truncation',()=>{
  const template=JSON.stringify({padding:'',email:value});
  const body=JSON.stringify({padding:'x'.repeat(32768-Buffer.byteLength(template)),email:value});
  assert.equal(Buffer.byteLength(body),32768);
  const result=capture(body);assert.equal(result.coverage.truncated,false);assert.equal(result.requests[0]!.matches.length,1);
  const pairs=new URLSearchParams([['email',value],...Array.from({length:99},(_,i)=>['field'+i,'x'] as [string,string])]);
  const exact=capture(pairs.toString());assert.equal(exact.coverage.truncated,false);assert.equal(exact.requests[0]!.matches.length,1);
});
test('a URL cutoff cannot turn a partial query value into an exact match',()=>{
  const suffix='&email='+encodeURIComponent(value),prefix='https://recipient.example/collect?padding=';
  const url=prefix+'x'.repeat(8192-prefix.length-suffix.length)+suffix+'-not-the-same-value';
  assert.equal(url.slice(0,8192).endsWith(suffix),true);
  const result=capture(null,url);assert.equal(result.coverage.truncated,true);assert.equal(result.requests[0]!.matches.length,0);
});
test('stale document requests cannot join a same-URL replacement document event',()=>{
  const start=Date.now()-1000,c=createFormDestinationCollector(start);
  c.event({kind:'input',time:start+100,pageUrl:page,formIndex:0,actionUrl:page,fields:[{name:'email',value,type:'email',label:'Email',autocomplete:'email'}]},'new-loader',page);
  c.request('stale','https://recipient.example/collect','POST',200,'email='+encodeURIComponent(value),'old-loader');
  c.status('stale','response_observed');assert.equal(c.finish().requests.length,0);
});
