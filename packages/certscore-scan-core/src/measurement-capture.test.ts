import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { measurementCookieCandidates, measurementInspectionBudget } from "./measurement-capture";
import { postRefusalStorageIdentityHash } from "./post-refusal-observer";
import type { NormalizedActionCookie } from "./action-storage-snapshot";
const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const cookie = { name: "_ga", value: "GA1.1.12345.67890", domain: ".example.test", path: "/", expires: 2000 };
const identityHash = (c: NormalizedActionCookie) => postRefusalStorageIdentityHash({storageType:"cookie",name:c.name,hostname:c.domain,cookiePath:c.path,partitionKey:c.partitionKey});
const row = {storageType:"cookie" as const,name:"_ga",hostname:"example.test",identityHash:identityHash(cookie),valueHash:sha(cookie.value),nonEssential:true};
const input = {cookies:[cookie],retainedStorage:[row],normalizedDocumentUrl:"https://www.example.test/",nowEpochSeconds:1000,identityHash};
test("measurement matching reuses exact retained, scoped, persistent cookie identities without retaining values",()=>{
 const candidates=measurementCookieCandidates(input);
 assert.equal(candidates.length,1);assert.equal(candidates[0]?.identifierSha256,sha("12345.67890"));
 assert.equal(candidates[0]?.valueHash,row.valueHash);
 assert.doesNotMatch(JSON.stringify(candidates),/12345|67890|GA1/);
 for(const change of [{domain:"elsewhere.test"},{path:"/other"},{expires:-1},{expires:999},{partitionKey:"https://other.test"},
  {value:"GS2.1.unsupported"},{name:"_ga_other"}]) assert.deepEqual(measurementCookieCandidates({...input,cookies:[{...cookie,...change}]}),[]);
 assert.deepEqual(measurementCookieCandidates({...input,retainedStorage:[]}),[]);
 assert.deepEqual(measurementCookieCandidates({...input,cookies:[{...cookie,domain:"example.test"}]}),[],"host-only parent cookies do not belong to a child document");
 assert.deepEqual(measurementCookieCandidates({...input,retainedStorage:[{...row,valueHash:"0".repeat(64)}]}),[]);
});
test("pre-click measurement floods cannot spend the post-click reservation or increase the total",()=>{
 const budget=measurementInspectionBudget();let pre=0,post=0;
 for(let i=0;i<100;i++)if(budget.available(false)){budget.retained(false);pre++;}
 for(let i=0;i<100;i++)if(budget.available(true)){budget.retained(true);post++;}
 assert.equal(pre,16);assert.equal(post,32);assert.equal(budget.available(true),false);
 const unused=measurementInspectionBudget();let count=0;
 while(unused.available(true)){unused.retained(true);count++;}assert.equal(count,48);
});
