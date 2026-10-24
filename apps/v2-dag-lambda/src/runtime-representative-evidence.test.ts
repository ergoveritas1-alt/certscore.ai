import assert from "node:assert/strict";
import test from "node:test";
import type { CanonicalEvidenceBundle } from "@certscore/contracts";
import { hasRepresentativeRuntimeEvidence } from "./runtime-representative-evidence.js";

export function representativeSnapshot() {
  return {artifactId:"runtime-dom", path:"/tmp/runtime-dom.txt", url:"https://example.com/?page=1",
    documentIdentity:{source:"cdp_loader_id" as const,token:"runtime-loader"},capturedAtMs:100,
    textExcerpt:"This is retained content from the original starting page. Visitors can read information about our products and services, learn about the organization and explore its useful resources and public documentation.",
    pagePhase:"network_idle" as const,consentStateAtTime:"pre_consent" as const};
}
function fixture(): CanonicalEvidenceBundle {
  return {startedAt:"2026-10-23T00:00:00.000Z",completedAt:"2026-10-23T00:00:01.000Z",
    domSnapshots:[representativeSnapshot()],screenshots:[]} as unknown as CanonicalEvidenceBundle;
}
test("runtime representative proof requires original bound content, not HTTP or a label", () => {
  assert.equal(hasRepresentativeRuntimeEvidence(fixture()),true);
  for (const mutate of [
    (b:CanonicalEvidenceBundle)=>{b.domSnapshots=[];},
    (b:CanonicalEvidenceBundle)=>{b.domSnapshots[0]!.textExcerpt="";},
    (b:CanonicalEvidenceBundle)=>{b.domSnapshots[0]!.textExcerpt="Loading...";},
    (b:CanonicalEvidenceBundle)=>{b.domSnapshots[0]!.documentIdentity=undefined;},
    (b:CanonicalEvidenceBundle)=>{b.domSnapshots[0]!.capturedAtMs=1001;},
    (b:CanonicalEvidenceBundle)=>{b.domSnapshots[0]!.capturedAtMs=-1;},
    (b:CanonicalEvidenceBundle)=>{b.domSnapshots[0]!.path="";},
    (b:CanonicalEvidenceBundle)=>{b.domSnapshots.push({...representativeSnapshot(),capturedAtMs:200,textExcerpt:"",documentIdentity:{source:"cdp_loader_id",token:"new-loader"}});},
  ]) {const b=fixture();mutate(b);const before=JSON.stringify(b);assert.equal(hasRepresentativeRuntimeEvidence(b),false);assert.equal(JSON.stringify(b),before);}
});
test("later document URL or loader mismatch cannot borrow earlier text", () => {
  for (const [documentUrl,documentToken] of [["https://example.com/?page=2","runtime-loader"],["https://example.com/?page=1","other-loader"]]) {
    const b=fixture();b.accessibilityAudit={completedAt:b.completedAt,documentUrl,documentToken} as CanonicalEvidenceBundle["accessibilityAudit"];
    assert.equal(hasRepresentativeRuntimeEvidence(b),false);
  }
});
test("short titled pages and non-whitespace-delimited languages retain positive content", () => {
  for (const text of ["CDN Package Provider for the JSPM Project", "欢迎阅读我们的公开资料和服务说明"]) {
    const b=fixture();b.domSnapshots[0]!.textExcerpt=text;
    b.domSnapshots[0]!.siteMetadata={title:"Public page"} as NonNullable<CanonicalEvidenceBundle["domSnapshots"][number]["siteMetadata"]>;
    assert.equal(hasRepresentativeRuntimeEvidence(b),true);
    b.domSnapshots[0]!.textExcerpt="";assert.equal(hasRepresentativeRuntimeEvidence(b),false);
    b.domSnapshots[0]!.textExcerpt="Loading...";assert.equal(hasRepresentativeRuntimeEvidence(b),false);
  }
});
test("sparse canvas/media pages remain unknown without proof, or representative with same-document positive visual proof", () => {
  const b=fixture();b.domSnapshots[0]!.textExcerpt="";
  assert.equal(hasRepresentativeRuntimeEvidence(b),false);
  assert.equal(b.scanNoGoAssessment,undefined,"unknown must not manufacture a no-go");
  b.scanNoGoAssessment={decision:"continue_with_diagnostics",supportingSignals:{visuallySubstantiveScreenshotObserved:true,visualNoGo:false,visualHardNoGoPageState:false}} as CanonicalEvidenceBundle["scanNoGoAssessment"];
  b.screenshots=[{...representativeSnapshot(),capturedAtMs:200,retentionStatus:"available",captureMethod:"primary_full_page"}];
  assert.equal(hasRepresentativeRuntimeEvidence(b),true);
  b.screenshots[0]!.documentIdentity={source:"cdp_loader_id",token:"other-loader"};
  assert.equal(hasRepresentativeRuntimeEvidence(b),false);
});
