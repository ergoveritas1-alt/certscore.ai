import assert from "node:assert/strict";
import test from "node:test";
import {extractRuntimeScriptFacts,classifyDeclaredCookiePurpose} from "./runtime-script-facts";
const input={scanId:"scan",scenario:"pre_consent" as const,documentUrl:"https://site.test/",scriptUrl:"https://site.test/app.js",documentId:"loader",frameId:"frame",sourceKind:"loaded_script" as const};
test("AST source facts retain referrer origin without storing values, comments or unrelated strings",()=>{
  const source=`/* localStorage.setItem('fake',document.referrer) */ const privateValue='secret-do-not-retain'; let value=document.referrer.replace(window.location.origin,''); localStorage.setItem('referrer',value);`;
  const packet=extractRuntimeScriptFacts(source,input)!;
  assert.deepEqual(packet.facts.map(fact=>[fact.kind,fact.name]),[["storage_referrer_flow","referrer"]]);
  assert.ok(!JSON.stringify(packet).includes("secret-do-not-retain"));assert.ok(!JSON.stringify(packet).includes("fake"));
});
test("key names, reassigned values, multiple writes, malformed and over-bound scripts cannot prove source flow",()=>{
  for(const source of [`localStorage.setItem('referrer','document.referrer')`,`let v=document.referrer;v='other';localStorage.setItem('referrer',v)`,`localStorage.setItem('r',document.referrer);localStorage.setItem('r','other')`,`localStorage.setItem(`," ".repeat(1_048_577)])assert.equal(extractRuntimeScriptFacts(source,input),undefined);
});
test("cookie preferences require a structural checked-state flow, not names",()=>{
  const helper=extractRuntimeScriptFacts(`function writeCookie(name,value,days){document.cookie=name+'='+encodeURIComponent(value)+'; path=/';}`,input)!;
  assert.equal(helper.facts[0]!.kind,"cookie_parameter_setter");
  const source=`var name='custom',save=(a,b)=>{let value='y';value+=a==='y'?'y':'n';value+=b==='y'?'y':'n';writeCookie(name,value,30)},submit=()=>{save(one.prop('checked')?'y':'n',two.prop('checked')?'y':'n')};`;
  assert.equal(extractRuntimeScriptFacts(source,input)!.facts[0]!.kind,"checkbox_preference_cookie_call");
  assert.equal(extractRuntimeScriptFacts(source.replaceAll("'checked'","'value'"),input),undefined);
  assert.equal(extractRuntimeScriptFacts(`function writeCookie(name,value){fetch('/collect')}`,input),undefined);
});

test("read context is structural source evidence; cleanup and network arguments remain distinct",()=>{
  const source=`let a='';if(a!==localStorage.getItem('referrer'))localStorage.removeItem('other');fetch('/collect',{body:sessionStorage.getItem('referral')});`;
  const facts=extractRuntimeScriptFacts(source,input)!.facts;
  assert.equal(facts.find(fact=>fact.name === "referrer")!.useContext,"storage_cleanup_check");
  assert.equal(facts.find(fact=>fact.name === "referral")!.useContext,"network_argument");
  assert.ok(facts.every(fact=>fact.callsite?.line===1));
});
test("declared functional/preference wording is classified without trusting the essential label",()=>{
  assert.equal(classifyDeclaredCookiePurpose("This cookie is crucial for delivering the services offered on our website and enabling specific features."),"functional");
  assert.equal(classifyDeclaredCookiePurpose("This cookie stores your consent preferences."),"preferences");
  assert.equal(classifyDeclaredCookiePurpose("Essential. This cookie does not provide functional services."),"unknown");
});

test("enumerated keys are bound by the observed callsite, never guessed from a key name",()=>{
  const packet=extractRuntimeScriptFacts(`for(let i=0;i<localStorage.length;i++){let value=localStorage.getItem(localStorage.key(i));if(value!==localStorage.getItem('referrer'))localStorage.removeItem(value);}`,input)!;
  const enumerated=packet.facts.find(fact=>fact.keySource === "enumerated_storage_key")!;
  assert.equal(enumerated.useContext,"storage_enumeration");assert.equal(enumerated.name,"[enumerated key]");
  assert.equal(enumerated.excerpts[0]!.text,"localStorage.getItem(localStorage.key(i))");
});
