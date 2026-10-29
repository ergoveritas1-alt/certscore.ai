import assert from "node:assert/strict";
import test from "node:test";
import {mkdtempSync,writeFileSync,existsSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {classifyCmpFailureStage,summarizeFailureRows,sweepRetainedCmp,type SweepRow} from "./cmp-retained-failure-sweep";
const base={confirmed:false,notification:false,navigation:false,click:true,observation:true,categoryExposure:false,receiptExposure:false};
test("the earliest unresolved stage wins without hiding later diagnostic exposures",()=>{
 assert.equal(classifyCmpFailureStage({...base,click:false,categoryExposure:true,receiptExposure:true}),"control_resolution");
 assert.equal(classifyCmpFailureStage({...base,observation:false,categoryExposure:true}),"capture_completion");
 assert.equal(classifyCmpFailureStage({...base,categoryExposure:true,receiptExposure:true}),"category_source_binding");
 assert.equal(classifyCmpFailureStage({...base,receiptExposure:true}),"receipt_protocol");
 assert.equal(classifyCmpFailureStage({...base,navigation:true,click:false}),"navigation_or_authorization");
 assert.equal(classifyCmpFailureStage({...base,confirmed:true,receiptExposure:true}),"confirmed");
 assert.equal(classifyCmpFailureStage({...base,confirmed:true,observation:false}),"capture_completion");
 assert.equal(classifyCmpFailureStage({...base,notification:true}),"notification_acknowledgment");
 assert.equal(classifyCmpFailureStage({...base,click:null,observation:null}),"execution_unknown");
});
test("rankings count unique scans/sites separately, retaining unknown providers and distinct cohorts",()=>{
 const row:SweepRow={cohort:"candidate",scanId:"one",site:"example.test",action:"accept",contacted:true,primary:"control_resolution",provider:null,confirmed:false,clickCompleted:false,observationCompleted:false,reasons:["missing"],resolverStates:[],categoryExposure:false,receiptExposure:false};
 const groups=summarizeFailureRows([row,{...row,action:"reject"},{...row,cohort:"reference"}]);
 assert.equal(groups.length,2);assert.deepEqual(groups[0],{cohort:"candidate",primary:"control_resolution",actions:2,scans:1,sites:1,providers:{"Unverified CMP":2},reasons:{missing:2},resolverStates:{}});
});
test("sweep fails closed on duplicate identities, missing source and hash drift before creating output",()=>{
 const dir=mkdtempSync(join(tmpdir(),"certscore-cmp-sweep-"));
 try{const manifest=join(dir,"input.json"),out=join(dir,"report"),row={cohort:"candidate",scanId:"one",site:"example.test",action:"accept",contacted:false};
  const run=(rows:unknown[])=>{writeFileSync(manifest,JSON.stringify({policyVersion:"cmp_retained_sweep_input.v1",rows}));return ()=>sweepRetainedCmp(manifest,out);};
  assert.throws(run([row,row]),/Duplicate/);assert.equal(existsSync(out),false);
  assert.throws(run([{...row,contacted:true}]),/original packet/);assert.equal(existsSync(out),false);
  const packet=join(dir,"packet.json");writeFileSync(packet,"{}");
  assert.throws(run([{...row,contacted:true,source:{file:packet,sha256:"a".repeat(64)}}]),/hash\/size/);assert.equal(existsSync(out),false);
  const result=run([row])();assert.equal(result.totals[0]?.contacted,0);assert.equal(result.totals[0]?.planned,1);
  assert.throws(()=>sweepRetainedCmp(manifest,out),/immutable/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
