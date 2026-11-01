import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {createRequire} from "node:module";
import {mkdir,writeFile,rm} from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const require=createRequire(import.meta.url);
const serverOnly=require.resolve("server-only");
require.cache[serverOnly]={exports:{}} as NodeModule;
const digest=(body:Uint8Array)=>createHash("sha256").update(body).digest("hex");

test("policy text map reuse must match the referenced artifact ID and filename", async()=>{
  const {dedupePolicySurfaces,summarizePolicySurfaces}=await import("./local-v2-dag-report");
  const id="policy_surface_text_original",fileName=id+".txt";
  const text="Privacy Notice. Example Test is the controller for personal information. We collect account information to provide and secure services. Hosting providers process request information to deliver the site. ".repeat(20).trim();
  const surface={observationId:"policy-original",surfaceType:"privacy_policy",url:"https://example.test/privacy",normalizedUrl:"https://example.test/privacy",confidence:0.99,
    status:"fetched",documentFetchState:"fetched",documentEvaluationState:"usable",documentRole:"policy_document",targetRelationship:"target_controller",textExcerpt:text.slice(0,1000),
    artifactRefs:[{artifactId:id,path:"/unavailable/"+fileName,label:"policy_surface_text"}],
    documentTextCoverage:{status:"complete",sourceTextChars:text.length,retainedTextChars:text.length,limitationKeys:[]},
    contentCoverage:{status:"complete",sourceTextChars:text.length,extractedSectionCount:1,retainedSectionCount:1,retainedTableRowCount:0,limitationKeys:[]}};
  const surfaces=dedupePolicySurfaces([surface] as never,"https://example.test/");
  const artifact={artifactId:id,fileName,text,sha256:digest(Buffer.from(text)),sizeBytes:Buffer.byteLength(text),verificationStatus:"verified" as const};
  const summarize=(retained:typeof artifact)=>summarizePolicySurfaces(surfaces,"example.test",{primaryLanguage:"en",policyTextEvidenceContext:{scanId:"source-binding",generatedAt:"2026-10-31T12:00:00Z",sourceBundle:{verificationStatus:"verified",schemaVersion:"certscore.v2.canonical-evidence-bundle.v1",sha256:"a".repeat(64)},artifactsById:new Map([[id,retained]])}});
  const original=summarize(artifact);
  assert.equal(original.policyTextEvidenceProjection.documents[0]?.artifactVerificationStatus,"verified");
  assert.equal(original.policyTextEvidenceProjection.documents[0]?.extractionStatus,"complete");
  for(const patch of [{artifactId:"policy_surface_text_foreign"},{fileName:"policy_surface_text_foreign.txt"}]){
    const before=JSON.stringify(artifact),result=summarize({...artifact,...patch});
    const document=result.policyTextEvidenceProjection.documents[0]!;
    assert.equal(document.artifactVerificationStatus,"verification_failed");
    assert.equal(document.failureReason,"policy_text_artifact_reference_mismatch");
    assert.equal(document.retainedTextChars,0,"Equal text lengths or hashes cannot repair a reference mismatch");
    assert.equal(document.extractionStatus,"unavailable");
    assert.notEqual(result.policyTextEvidenceProjection.projectionStatus,"verified_complete");
    assert.equal(JSON.stringify(artifact),before);
  }
  assert.equal(summarize(artifact).policyTextEvidenceProjection.documents[0]?.extractionStatus,"complete","A failed join must not poison correct reuse");
});

test("projected local policy readers require valid UTF-8 after exact byte verification",async()=>{
  const {readProjectedPolicyTextArtifact}=await import("./local-v2-dag-report");
  const scanId=randomUUID(),directory=path.resolve("artifacts/local-v2-dag-scans",scanId),fileName="policy_surface_text_projection.txt";
  await mkdir(directory,{recursive:true});
  try{
    const valid=Buffer.from("Protection des données – 個人情報\nPolicy");
    const read=async(body:Buffer)=>{
      await writeFile(path.join(directory,fileName),body);
      return readProjectedPolicyTextArtifact({uri:`s3://test-policy-artifacts/local-parity/${scanId}/auxiliary/${fileName}`,sha256:digest(body),sizeBytes:body.byteLength,verificationRequired:true},scanId);
    };
    assert.equal((await read(valid)).text,"Protection des données – 個人情報 Policy");
    await assert.rejects(read(Buffer.concat([Buffer.from("Policy: "),Buffer.from([0x80])])),/not valid bounded UTF-8 text/);
    await assert.rejects(read(Buffer.from("Policy\0private")),/not valid bounded UTF-8 text/);
    assert.equal((await read(valid)).sha256,digest(valid));
  }finally{await rm(directory,{recursive:true,force:true});}
});
