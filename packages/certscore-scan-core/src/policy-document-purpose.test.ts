import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { type PolicySurfaceObservation } from "@certscore/contracts";
import { createArtifactWriter } from "./artifact-writer";
import { nonGoverningPolicyDocumentReason } from "./policy-document-purpose";
import { assessPolicyDocumentSubstance, applyGoverningPolicySelection, policySurfaceScanner } from "./scanners/policy-surface-scanner";
import { policyIndexRecoveryFixtureOptions } from "./test-fixtures/policy-index-recovery";
import retained from "./fixtures/policy-document-purpose/manifest.json";

const documents = retained.documents.map(row => {
  const bytes = readFileSync(new URL(`./fixtures/policy-document-purpose/${row.file}`, import.meta.url));
  assert.equal(bytes.length, row.sizeBytes);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), row.sha256);
  return { ...row, text: bytes.toString("utf8") };
});

test("original hashed article and product bodies are excluded before privacy/cookie disclosure extraction", () => {
  for (const row of documents) {
    assert.equal(nonGoverningPolicyDocumentReason(row) ?? null, row.expectedReason, row.title);
    if (!row.expectedReason) continue;
    for (const surfaceType of ["privacy_policy", "cookie_policy", "california_notice", "notice_at_collection"] as const) {
      const assessment = assessPolicyDocumentSubstance({ ...row, surfaceType, finalUrl: row.url });
      assert.equal(assessment.matchesExpectedSurface, false);
      assert.equal(assessment.reasonCode, row.expectedReason);
    }
  }
});

test("genuine notices, indexes and multilingual documents keep existing substance eligibility", () => {
  const body = "We collect personal data to deliver our services. We retain account data for two years. We use cookies for security. Contact our data controller to exercise your right to access or delete data. ".repeat(20);
  for (const title of ["Privacy Policy | Policy Generator", "Cookie Policy - GDPR Checker", "GDPR Checker Privacy Policy", "Privacy Policy Generator Privacy Notice", "Terms & Privacy", "Privacy Policy", "Datenschutzerklärung", "Polityka prywatności", "Politique de confidentialité"]) {
    const text = body + " Published by Example 4 min read. In this guide we explain our privacy rights. Get a demo. Privacy Policy Generator.";
    assert.equal(nonGoverningPolicyDocumentReason({ title, text }), undefined, title);
    assert.equal(assessPolicyDocumentSubstance({ surfaceType: "privacy_policy", title, text }).matchesExpectedSurface, true);
  }
  assert.equal(nonGoverningPolicyDocumentReason({title:"Privacy Center",text:"Choose your regional Privacy Policy. Products: Privacy Policy Generator. Get a demo."}), undefined);
  assert.equal(nonGoverningPolicyDocumentReason({title:"Privacy Policy",text:documents[0]!.text}), undefined, "navigation marketing does not veto a notice shell");
});

test("positive editorial/product role needs corroboration rather than a generic keyword", () => {
  assert.equal(nonGoverningPolicyDocumentReason({title:"Understanding cookies",text:"We collect personal data to deliver this website."}), undefined);
  assert.equal(nonGoverningPolicyDocumentReason({title:"GDPR Checker",text:"Privacy Policy. We collect your email to provide the service."}), undefined);
  assert.equal(nonGoverningPolicyDocumentReason({title:"How to write a privacy policy",text:"In this article we explain what privacy policies disclose."}), "policy_document_purpose.v1-article");
  assert.equal(nonGoverningPolicyDocumentReason({title:"Cookies explained",text:"Learn how to configure optional cookies."}), "policy_document_purpose.v1-article");
  assert.equal(nonGoverningPolicyDocumentReason({title:"Privacy research",text:"Published by Example · 5 min read. This article explains privacy notices."}), "policy_document_purpose.v1-article");
  assert.equal(nonGoverningPolicyDocumentReason({title:"Privacy research",text:"Published by Example · 5 min read. "+"x".repeat(6000)+" This article explains privacy notices."}), undefined, "bounded lead cannot scan arbitrary full document tails");
});

test("historical governing selection is not reclassified during projection", () => {
  // Relevant original persisted fields, not a new scanner capture. This captures
  // the historical error deliberately: projection must not rewrite old packets.
  const observations = documents.map(row => ({ ...row.original, normalizedUrl:row.url,
    observationId:row.file, surfaceType:row.surfaceType, status:"fetched", documentFetchState:"fetched",
    documentEvaluationState:"usable", targetRelationship:"target_controller",
    contentCoverage:{status:"truncated"}, documentTextCoverage:{status:"complete"},
    gdprTransparencyTopicCoverageDiagnostics:Array.from({length:row.original.governingPolicyBodyAssessment.evidenceBoundObservedTopicCount},(_,i)=>({topic:String(i),evaluationState:"observed"})),
  })) as unknown as PolicySurfaceObservation[];
  const original = structuredClone(observations);
  const projected = applyGoverningPolicySelection(observations);
  assert.equal(projected.find(row=>row.normalizedUrl?.endsWith("/tracking/"))?.governingPolicySelection?.state,"primary");
  assert.equal(projected.find(row=>row.normalizedUrl?.endsWith("/generator/"))?.governingPolicySelection?.state,"supporting");
  assert.deepEqual(observations, original);
});

for (const usableNotice of [true, false]) test(`new capture retains rejected candidates without disclosures (${usableNotice ? "genuine notice" : "thin notice shell"})`, async () => {
  const negatives = documents.filter(row=>row.expectedReason);
  const html = (title:string,text:string) => `<html><head><title>${title.replaceAll("&","&amp;").replaceAll("<","&lt;")}</title></head><body><main>${text.replaceAll("&","&amp;").replaceAll("<","&lt;")}</main></body></html>`;
  const notice = "We collect personal information to provide our service. Our legal basis is contractual necessity. We retain account information for two years. You have the right to access or delete your personal data. Contact our data controller at privacy@example.test. ".repeat(15);
  const server = createServer((req,res)=>{
    res.setHeader("content-type","text/html");
    if(req.url==="/") {res.end(`<footer><a href="/privacy-policy">Privacy Policy</a>${negatives.map((_,i)=>`<a href="/privacy-candidate-${i}">Privacy Policy</a>`).join("")}</footer>`);return;}
    if(req.url==="/privacy-policy") {res.end(html("Privacy Policy",usableNotice ? notice : documents[0]!.text));return;}
    const index=/^\/privacy-candidate-(\d)$/.exec(req.url??"")?.[1];
    const row=index===undefined?undefined:negatives[Number(index)];
    if(row) {res.end(html(row.title,row.text));return;}
    res.statusCode=404;res.end("Not found");
  });
  server.listen(0,"127.0.0.1");await once(server,"listening");
  const address=server.address();assert.ok(address&&typeof address!=="string");
  const base=`http://127.0.0.1:${address.port}`;
  const root=await mkdtemp(path.join(tmpdir(),"policy-document-purpose-"));
  try {
    const start=Date.now();
    const result=await policySurfaceScanner({url:base+"/",normalizedUrl:base+"/",scanStartedAtMs:start,
      internalBudgetMs:6000,artifactWriter:await createArtifactWriter(root),discoveryMode:"fast",
      ...policyIndexRecoveryFixtureOptions(base,start,false)});
    const policy=result.policySurfaceObservations.find(row=>row.normalizedUrl===base+"/privacy-policy");
    if (usableNotice) {
      assert.equal(policy?.documentEvaluationState,"usable");
      assert.equal(policy?.governingPolicySelection?.state,"primary");
    } else {
      assert.ok(policy,"retain the observed privacy statement even when its body is insufficient");
      assert.notEqual(policy.governingPolicyBodyAssessment?.state,"substantive");
    }
    for(const [i,source] of negatives.entries()) {
      const row=result.policySurfaceObservations.find(row=>row.normalizedUrl===base+`/privacy-candidate-${i}`);
      assert.ok(row,source.title);
      assert.equal(row.documentFetchState,"fetched");
      assert.equal(row.documentEvaluationState,"insufficient");
      assert.equal(row.documentRole,"unknown");
      assert.deepEqual(row.documentRoleReasonCodes,[source.expectedReason]);
      assert.equal(row.governingPolicySelection?.state,"ineligible");
      assert.equal(row.article13DisclosureSignals.length,0);
      assert.equal(row.retainedPolicySections.length,0);
      assert.equal(row.policyCookieDisclosures.length,0);
      assert.ok(row.textExcerpt,"retain bounded source evidence");
    }
    assert.equal(result.negativeSearchEvidence,undefined,"an unusable observed candidate does not prove absence");
  } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(root,{recursive:true,force:true});}
});
