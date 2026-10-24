import assert from "node:assert/strict";
import test from "node:test";
import {saleSharingCanaryFixture} from "./sale-sharing-canary.fixture";
import {activeSaleSharingCanaryCampaign,assertSaleSharingCanary,consumeSaleSharingCanary,recordSaleSharingCanaryReview,saleSharingCanaryCampaignSchema,saleSharingCanaryLedger,selectSaleSharingCanary} from "./sale-sharing-canary";
import {saleSharingExactRouteAuthorization} from "./sale-sharing-redirect";

test("inactive campaign, strict two-target release and exact runtime bindings",()=>{
  const now=Date.now(),m=saleSharingCanaryFixture(now),a=m.slots[0];
  const input={authorization:a,scanId:a.scanId,targetUrl:a.targetUrl,region:a.region,functionName:a.functionName,policyVersion:"bounded_sale_sharing_opt_out.v3-exact-routes",route:saleSharingExactRouteAuthorization(a.targetUrl),runtime:{buildGitSha:a.buildGitSha,functionVersion:"42",region:a.region,memoryMb:3008}};
  assert.equal(activeSaleSharingCanaryCampaign(),null);assert.equal(selectSaleSharingCanary(a.scanId,a.targetUrl,a.region),undefined);
  assert.throws(()=>assertSaleSharingCanary(input));assert.deepEqual(assertSaleSharingCanary(input,m,now),a);
  for(const patch of [{scanId:"other"},{targetUrl:"https://infillion.com/"},{region:"eu-west-1"},{functionName:"fixture-lambda"},{policyVersion:"bounded_sale_sharing_opt_out.v2-apex-www"},{route:undefined},{authorization:{...a,releaseSha256:"c".repeat(64)}}])assert.throws(()=>assertSaleSharingCanary({...input,...patch},m,now));
  for(const patch of [{memoryMb:4096},{functionVersion:"$LATEST"},{buildGitSha:"c".repeat(40)},{region:"eu-west-1"}])assert.throws(()=>assertSaleSharingCanary({...input,runtime:{...input.runtime,...patch}},m,now));
  for(const time of [Date.parse(a.issuedAt)-1,Date.parse(a.expiresAt),Date.parse(a.expiresAt)+1])assert.throws(()=>assertSaleSharingCanary(input,m,time));
  for(const patch of [{slots:[a,a]},{slots:[...m.slots,a]},{budgetCapUsd:1},{budgetPreflightApproved:false},{slots:[{...a,expiresAt:new Date(now+86400000).toISOString()},m.slots[1]]}])assert.equal(saleSharingCanaryCampaignSchema.safeParse({...m,...patch}).success,false);
});

test("durable stage claims reject races/replays and require first-result review",async()=>{
  const m=saleSharingCanaryFixture(),[a,b]=m.slots,records=new Map<string,string>();
  const ledger=saleSharingCanaryLedger({async readText(k){return records.get(k)??null;},async createText(k,v){if(records.has(k))throw Error("precondition_failed");records.set(k,v);}});
  await assert.rejects(consumeSaleSharingCanary(a,"worker",ledger,"c".repeat(64)));
  await assert.rejects(consumeSaleSharingCanary(b,"dispatch",ledger));
  const claims=await Promise.allSettled([consumeSaleSharingCanary(a,"dispatch",ledger),consumeSaleSharingCanary(a,"dispatch",ledger)]);
  assert.equal(claims.filter(x=>x.status==="fulfilled").length,1);
  await consumeSaleSharingCanary(a,"coordinator",ledger,"c".repeat(64));
  await assert.rejects(consumeSaleSharingCanary(a,"coordinator",ledger,"c".repeat(64)));
  await assert.rejects(consumeSaleSharingCanary(a,"worker",ledger,"d".repeat(64)));
  await consumeSaleSharingCanary(a,"worker",ledger,"c".repeat(64));
  await assert.rejects(consumeSaleSharingCanary(a,"worker",ledger,"c".repeat(64)));
  await assert.rejects(recordSaleSharingCanaryReview(a,ledger,{terminalScanId:"other",canonicalResultSha256:"e".repeat(64),safeToContinue:true}));
  await recordSaleSharingCanaryReview(a,ledger,{terminalScanId:a.scanId,canonicalResultSha256:"e".repeat(64),safeToContinue:true});
  await assert.rejects(consumeSaleSharingCanary(b,"dispatch",{...ledger,async read(key){const value=await ledger.read(key);return key.endsWith("/review.json")?{...(value as object),terminalScanId:"wrong-scan"}:value;}}),/prior_review/);
  await consumeSaleSharingCanary(b,"dispatch",ledger);
  await ledger.create(`sale-sharing-canary/${a.campaignId}/revoked.json`,{reason:"operator_stop"});
  await assert.rejects(consumeSaleSharingCanary(b,"coordinator",ledger,"f".repeat(64)),/revoked/);
});

test("store errors, malformed records and uncertain claims fail closed without retry",async()=>{
  const a=saleSharingCanaryFixture().slots[0];let writes=0;
  const broken=saleSharingCanaryLedger({async readText(){throw Error("unavailable");},async createText(){writes++;}});
  await assert.rejects(consumeSaleSharingCanary(a,"dispatch",broken));assert.equal(writes,0);
  for(const raw of ['not-json','x'.repeat(8193),'null','false','[]','0'])await assert.rejects(saleSharingCanaryLedger({async readText(){return raw;},async createText(){}}).read("test"));
  await assert.rejects(consumeSaleSharingCanary(a,"dispatch",saleSharingCanaryLedger({async readText(){return null;},async createText(){writes++;throw Error("uncertain");}})));
  assert.equal(writes,1);
});
