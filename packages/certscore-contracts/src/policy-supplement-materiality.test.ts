import assert from "node:assert/strict";
import test from "node:test";
import {privacySupplementExclusion} from "./policy-supplement-materiality";
test("only proven language alternates and unrelated documents leave governing notice scope",()=>{
 const base={surfaceType:"privacy_policy",traversalDepth:1,parentObservationId:"parent"};
 for(const [label,path,result]of [["Deutsch","/de/privacy-policy","language_alternate"],["Español Cambiar el idioma del sitio a español","/es/politica-de-privacidad","language_alternate"],["Modern Slavery Statement","/privacy-pages/uk/modern-slavery-statement","unrelated_document"],["UK Editorial Complaints Policy","/privacy-pages/uk/complaints/policy","unrelated_document"]])
  assert.equal(privacySupplementExclusion({...base,linkText:label,url:path!},"https://site.test/privacy"),result);
 for(const surface of [
  {...base,linkText:"California Privacy Supplement",url:"/es/california"},
  {...base,linkText:"Français",url:"/california-notice"},
  {...base,linkText:"Privacy complaints",url:"/complaints/policy"},
  {...base,linkText:"Additional Privacy Information",url:"/privacy/more"},
  {...base,linkText:"Deutsch",url:"https://other.test/de/privacy-policy"},
  {...base,surfaceType:"california_notice",linkText:"Deutsch",url:"/de/privacy-policy"},
 ])assert.equal(privacySupplementExclusion(surface,"https://site.test/privacy"),undefined);
});
