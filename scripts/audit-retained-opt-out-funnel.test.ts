import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,mkdir,writeFile,rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {createHash} from "node:crypto";
import {auditRetainedOptOutCohort} from "./audit-retained-opt-out-funnel";
const hash=(s:string)=>createHash("sha256").update(s).digest("hex");
test("retained audit verifies originals, separates unavailable exports and rejects tampered packets",async()=>{
  const root=await mkdtemp(join(tmpdir(),"certscore-opt-out-"));
  try{
    const dir=join(root,"scans","one","original");await mkdir(dir,{recursive:true});
    const bundlePath=join(dir,"CanonicalEvidenceBundle.json"),receiptPath=join(root,"receipts.json");
    await writeFile(join(root,"inventory.json"),JSON.stringify([{id:"one"}]));
    const writeBundle=async(bundle:unknown)=>{
      const text=JSON.stringify({scanId:"one",...bundle as object});await writeFile(bundlePath,text);
      await writeFile(receiptPath,JSON.stringify([{output:bundlePath,expected:{sha256:hash(text),sizeBytes:Buffer.byteLength(text)}}]));
    };
    await writeBundle({saleSharingOptOutLaneOutcome:{status:"limited",startedAt:"2026-10-23T00:00:00Z",completedAt:"2026-10-23T00:00:05Z",limitationCode:"opt_out_budget_exhausted"}});
    const reportPath=join(root,"scans","one","report.json");
    await writeFile(reportPath,JSON.stringify({error:"unavailable"}));
    const absent=await auditRetainedOptOutCohort(root,receiptPath);
    assert.equal(absent.stages.finding_persisted.unknown,1);assert.equal(absent.retainedReports[0]?.bindingStatus,"unavailable");
    await writeFile(reportPath,JSON.stringify({artifactType:"certscore_canonical_report_export",scan:{id:"one"},projection:{unifiedFindings:[{unifiedFindingId:"california_sale_sharing_opt_out_activity"}]}}));
    const retained=await auditRetainedOptOutCohort(root,receiptPath);
    assert.equal(retained.stages.finding_persisted.observed,1);assert.equal(retained.stages.confirmed.unknown,1,"report cannot fill missing action proof");
    await writeFile(bundlePath,"{}");await assert.rejects(auditRetainedOptOutCohort(root,receiptPath),/Original bundle integrity/);
    await writeBundle({saleSharingOptOut:{evidence:{},sha256:"0".repeat(64),sizeBytes:2,verificationStatus:"verified"}});
    await assert.rejects(auditRetainedOptOutCohort(root,receiptPath),/Embedded packet integrity/);
  }finally{await rm(root,{recursive:true,force:true});}
});
