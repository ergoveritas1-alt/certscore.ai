import assert from "node:assert/strict";
import test from "node:test";
import { estimateFullSiteProgress, fullSiteIsRunning, fullSiteProgressResponseSchema } from "./full-site-progress";
const progress = {completed:2,partial:1,failed:1,active:2,discovered:10,discoveryComplete:true,averageSeconds:20,concurrency:4,waitSeconds:5,elapsedSeconds:40};
test("partial and failed pages count as processed, not successful", () => {
 const result=estimateFullSiteProgress(progress,10,false);
 assert.equal(result.done,4); assert.equal(result.percent,40); assert.equal(progress.completed,2);
});
test("ETA respects scan lag and refuses to guess before measurements", () => {
 assert.equal(estimateFullSiteProgress({...progress,waitSeconds:30},10,false).seconds,200);
 assert.equal(estimateFullSiteProgress({...progress,averageSeconds:null},10,false).seconds,null);
});
test("discovery uses an upper bound and active scans never claim 100 percent", () => {
 assert.equal(estimateFullSiteProgress({...progress,discovered:4,discoveryComplete:false},10,false).total,10);
 assert.equal(estimateFullSiteProgress({...progress,discovered:4},10,false).percent,95);
 assert.equal(estimateFullSiteProgress({...progress,discovered:4},10,true).percent,100);
});
test("polling ends on terminal crawl or homepage failure", () => {
 assert.equal(fullSiteIsRunning({status:'running',homepageStatus:'completed'}),true);
 for (const status of ['completed','stopped','unknown']) assert.equal(fullSiteIsRunning({status,homepageStatus:'completed'}),false);
 assert.equal(fullSiteIsRunning({status:'waiting_homepage',homepageStatus:'failed'}),false);
});
test("malformed progress cannot replace confirmed counts", () => {
 assert.equal(fullSiteProgressResponseSchema.safeParse({scanId:'id',status:'running',homepageStatus:'completed',errorMessage:null,progress:{...progress,completed:-1}}).success,false);
});
