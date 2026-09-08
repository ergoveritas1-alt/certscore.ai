import test from "node:test";
import assert from "node:assert/strict";
import { serviceEvidencePageIds } from "./service-evidence-pages";
const input={pages:[{id:"a",observation:{runtimeGraph:{}}},{id:"b",observation:{runtimeGraph:{}}},{id:"missing",observation:null}],displayedPageIds:["a"],detailId:"a"};
test("local audit includes retained graphs beyond first displayed pages",()=>{
 assert.deepEqual(serviceEvidencePageIds({...input,localAudit:true}),["a","b"]);
});
test("production read budget remains unchanged and detail page stays included",()=>{
 assert.deepEqual(serviceEvidencePageIds({...input,localAudit:false,detailId:"detail"}),["a","detail"]);
});
