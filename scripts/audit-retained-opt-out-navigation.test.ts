import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,mkdir,writeFile,rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {createHash} from "node:crypto";
import {auditRetainedOptOutNavigation} from "./audit-retained-opt-out-navigation";
const hash=(s:string)=>createHash("sha256").update(s).digest("hex");

test("navigation audit preserves uncertainty, joins only passive document responses and checks original hashes",async()=>{
  const root=await mkdtemp(join(tmpdir(),"certscore-opt-out-navigation-"));
  try{
    const dir=join(root,"scans","one","original");await mkdir(dir,{recursive:true});
    const bundlePath=join(dir,"CanonicalEvidenceBundle.json"),receiptPath=join(root,"receipts.json");
    await writeFile(join(root,"inventory.json"),JSON.stringify([{id:"one"}]));
    const target="https://example.test/";
    const evidence={contractVersion:"certscore.sale-sharing-opt-out-evidence.v1",policyVersion:"bounded_sale_sharing_opt_out.v1",scanId:"one",parentDispatchSha256:"a".repeat(64),targetUrl:target,documentToken:null,startedAt:"2026-10-23T00:00:00Z",completedAt:"2026-10-23T00:00:03Z",status:"limited",recipeVersion:null,provider:null,actionCount:0,submitted:false,registration:"not_attempted",confirmedAt:null,before:null,after:null,observationWindowMs:0,captureComplete:false,truncated:false,requests:[],limitations:["navigation_budget_exhausted"]};
    const text=JSON.stringify(evidence);
    const bundle={scanId:"one",saleSharingOptOut:{evidence,sha256:hash(text),sizeBytes:Buffer.byteLength(text),verificationStatus:"verified"},transportSecurityObservations:[{sourceScanner:"pre_consent_runtime",requestedUrl:target,finalUrl:target}],networkEvents:[{sourceScanner:"pre_consent_runtime",isMainFrame:true,resourceType:"document",requestId:"doc"}],networkResponseEvents:[{sourceScanner:"pre_consent_runtime",requestId:"doc",responseUrl:target,status:200,timestampMs:800},{sourceScanner:"pre_consent_runtime",requestId:"image",responseUrl:target,status:403,timestampMs:900}]};
    const save=async()=>{
      const bytes=JSON.stringify(bundle);await writeFile(bundlePath,bytes);
      await writeFile(receiptPath,JSON.stringify([{output:bundlePath,expected:{sha256:hash(bytes),sizeBytes:Buffer.byteLength(bytes)}}]));
    };
    await save();
    const result=await auditRetainedOptOutNavigation(root,receiptPath);
    assert.equal(result.rows[0]?.category,"same_target_success_context");assert.equal(result.rows[0]?.recoveryProven,false);
    assert.equal(result.rows[0]?.passiveContext.responses.length,1);assert.equal(result.rows[0]?.passiveContext.httpErrorObserved,false);
    bundle.transportSecurityObservations[0]!.requestedUrl="https://different.test/";
    await save();assert.equal((await auditRetainedOptOutNavigation(root,receiptPath)).rows[0]?.category,"unresolved_context");
    bundle.transportSecurityObservations[0]!.requestedUrl=target;bundle.transportSecurityObservations[0]!.finalUrl="https://www.example.test/";
    await save();assert.equal((await auditRetainedOptOutNavigation(root,receiptPath)).rows[0]?.category,"different_target_context");
    await writeFile(bundlePath,"{}");await assert.rejects(auditRetainedOptOutNavigation(root,receiptPath),/Original bundle integrity/);
    bundle.saleSharingOptOut.sha256="0".repeat(64);await save();await assert.rejects(auditRetainedOptOutNavigation(root,receiptPath),/Embedded packet integrity/);
  }finally{await rm(root,{recursive:true,force:true});}
});
