import assert from "node:assert/strict";
import test from "node:test";
import { captureExactCookieWrite } from "./exact-cookie-write-capture";
import { classifyStorageWrite, postRefusalStorageIdentityHash } from "./post-refusal-observer";
import { createHash } from "node:crypto";
const input={assignment:"_ga=private-cookie; Domain=.example.test; Path=/; Secure; Max-Age=86400",url:"https://www.example.test/path/page",observedAtMs:20,source:"main_document_setter" as const};
test("exact cookie assignment identity/value hashes preserve scope without inferring browser acceptance",()=>{
 const e=captureExactCookieWrite(input)!;assert.equal(e.acceptance,"not_independently_verified");
 assert.equal(e.identityHash,postRefusalStorageIdentityHash({storageType:"cookie",name:"_ga",hostname:"example.test",cookiePath:"/"}));
 assert.equal(e.valueHash,createHash("sha256").update("private-cookie").digest("hex"));assert.doesNotMatch(JSON.stringify(e),/private-cookie/);
 assert.notEqual(captureExactCookieWrite({...input,assignment:"_ga=private-cookie"})!.identityHash,e.identityHash);
 for(const assignment of [input.assignment+"; Partitioned",input.assignment+"; Domain=other.test",input.assignment+"; Path=/other",
  "_ga=x; Domain=other.test","_ga=x; Max-Age=0","_ga=x; Path=invalid","_ga="+"x".repeat(4096)])
  assert.equal(captureExactCookieWrite({...input,assignment}),undefined);
 const row=classifyStorageWrite({storageType:"cookie",name:"_ga",cookieAssignment:input.assignment,documentUrl:input.url,value:"private-cookie",
  observedAtEpochMs:120,sequence:1},100,110,input.url,[{storageType:"cookie",name:"_ga",hostname:e.hostname,identityHash:e.identityHash,
   identityBasis:"cookie_name_domain_path_partition",valueHash:e.valueHash,purpose:"analytics",nonEssential:true}]);
 assert.equal(row?.storageIdentityHash,e.identityHash);assert.equal(row?.exactCookieWrite?.valueHash,e.valueHash);
});
