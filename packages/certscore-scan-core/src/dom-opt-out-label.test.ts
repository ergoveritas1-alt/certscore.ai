import assert from 'node:assert/strict';
import test from 'node:test';
import {retainDomOptOutLabel} from './dom-opt-out-label';
const text='A substantive website body. '.repeat(100)+'\nDo Not Sell or Share My Personal Information';
const capture={value:text,url:'https://example.test/',documentIdentity:{source:'cdp_loader_id' as const,token:'own-document'},capturedAtMs:1000};
test('full existing bound DOM read retains a label beyond the bundle excerpt without new browser work',()=>{
 const o=retainDomOptOutLabel(capture,'dom_text_pre_consent');assert.ok(o);assert.ok(o.passage.start>2000);
 assert.equal(o.documentToken,'own-document');assert.equal(o.passage.excerpt,text.slice(o.passage.start,o.passage.end));
 assert.ok(Buffer.byteLength(JSON.stringify(o))<=1024);
});
test('unbound capture, generic choices, inline discussion and examples do not create DOM observations',()=>{
 assert.equal(retainDomOptOutLabel({...capture,documentIdentity:undefined},'dom'),undefined);
 for(const value of ['Privacy Settings','Privacy choices is a data category.','For example:\nDo Not Sell or Share My Personal Information','We do not provide a Do Not Sell or Share My Personal Information link.'])
  assert.equal(retainDomOptOutLabel({...capture,value},'dom'),undefined,value);
});
test('v2 named variants retain page scope while legacy v1 remains readable',async()=>{
 const {domOptOutLabelSchema}=await import('@certscore/contracts');
 for(const value of ["Don't sell or share my personal information",'Do Not Sell or Share My Personal Info','Do Not Sell or Share']){
  const result=retainDomOptOutLabel({...capture,value},'dom');assert.ok(result);assert.equal(result.scope,'observed_page');assert.equal(result.version,'dom_opt_out_label.v2');
 }
 const result=retainDomOptOutLabel(capture,'dom')!;const {scope,scopeLabel,contextPassage,...legacy}=result;
 assert.ok(domOptOutLabelSchema.safeParse({...legacy,version:'dom_opt_out_label.v1'}).success);
});
test('advertising-cookie choices need local cookie purpose and keep evidence in the existing cap',()=>{
 const value='We use cookies. We use personalized advertising. Reject all';
 const result=retainDomOptOutLabel({...capture,value},'dom');assert.ok(result);assert.equal(result.scope,'personalized_advertising');assert.ok(result.contextPassage);
 assert.equal(result.contextPassage.excerpt,value.slice(result.contextPassage.start,result.contextPassage.end));assert.ok(Buffer.byteLength(JSON.stringify(result))<=1024);
 for(const value of ['Reject all','We use cookies for essential services. Reject all','We offer personalized advertising. Reject all'])assert.equal(retainDomOptOutLabel({...capture,value},'dom'),undefined);
});

test('scoped search retains the same body identity, bounded hash and capture limitations',async()=>{
 const {retainDomOptOutSearch}=await import('./dom-opt-out-label');
 const {createHash}=await import('node:crypto');
 const body='Ordinary public product page. Contact us.';
 const result=retainDomOptOutSearch({...capture,value:body},'dom');assert.ok(result);
 assert.equal(result.result,'no_qualifying_signal');assert.equal(result.textSha256,createHash('sha256').update(body).digest('hex'));assert.equal(result.documentToken,capture.documentIdentity.token);
 assert.ok(Buffer.byteLength(JSON.stringify(result))<=1024);
 assert.equal(retainDomOptOutSearch({...capture,value:'x'.repeat(100000)},'dom')?.truncated,true);
 assert.equal(retainDomOptOutSearch({...capture,documentIdentity:undefined},'dom'),undefined);
 assert.equal(retainDomOptOutSearch({...capture,value:'  '},'dom'),undefined);
 for(const value of ['Footer\nOpt-Out','Privacy\nPersonalised settings'])assert.equal(retainDomOptOutSearch({...capture,value},'dom')?.result,'ambiguous_hint');
 assert.equal(retainDomOptOutSearch(capture,'dom')?.result,'specific_signal');
});
test('short security shells stay unusable without reclassifying substantive security content',async()=>{
 const {retainDomOptOutSearch}=await import('./dom-opt-out-label');
 for(const value of ['celeb.test Performing security verification. This website verifies you are not a bot. Ray ID: example','TRAFFIC VERIFICATION. Please verify that you are a human being.'])
  assert.equal(retainDomOptOutSearch({...capture,value},'dom')?.result,'capture_unusable');
 assert.equal(retainDomOptOutSearch({...capture,value:'Our security product provides verification services for customer accounts.'},'dom')?.result,'no_qualifying_signal');
});

test('v2 body usability is separate from named-choice absence and excludes auth/empty/error views',async()=>{
 const {retainDomOptOutSearch}=await import('./dom-opt-out-label');
 const value='Public website information with research, products, news and contact details. '.repeat(8);
 const good=retainDomOptOutSearch({...capture,value},'dom');assert.ok(good?.version==='dom_opt_out_search.v2');assert.equal(good.bodyUsability,'substantive_public_page');
 for(const input of [{value:'Login',url:capture.url},{value,url:'https://example.test/Users/Login'},{value:'Performing security verification. This website verifies you are not a bot.',url:capture.url},{value:'Access denied. '.repeat(35),url:capture.url}]){
  const result=retainDomOptOutSearch({...capture,...input},'dom');assert.ok(result?.version==='dom_opt_out_search.v2');assert.equal(result.bodyUsability,'unusable_or_unverified');
 }
});
