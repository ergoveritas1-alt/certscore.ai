import assert from "node:assert/strict";
import test from "node:test";
import { reportTechnicalEvidenceFixture } from "./report-appendix-evidence.fixture";
import type { ScanDetailResponse } from "./get-scan-by-id";
import type { PersistedCanonicalReportProjection } from "./persisted-canonical-report-projection";
import { buildReportAppendixEvidence } from "./report-export-evidence";

const canonical = () => ({ checklistRows: [], ownerUnifiedFindings: [], normalizedConcerns: [] }) as unknown as PersistedCanonicalReportProjection;

test("appendix evidence preserves verified CMS and form destinations without creating findings", () => {
  const { cms, forms } = reportTechnicalEvidenceFixture("scan-1");
  const scan = { scan: { id: "scan-1" }, runtimeArtifacts: { cmsSecurity: cms, formDestinations: forms } } as unknown as ScanDetailResponse;
  const projection = canonical();
  const before = structuredClone(projection);
  const details = buildReportAppendixEvidence(scan, projection, null);
  assert.deepEqual(details.cmsSecurity, cms);
  assert.deepEqual(details.formDestinations, forms);
  assert.deepEqual(projection, before);
  for (const mutation of ["scan", "unverified", "malformed"]) {
    const changed = structuredClone(scan);
    if (mutation === "scan") changed.scan.id = "another-scan";
    else if (mutation === "unverified") changed.runtimeArtifacts = { cmsSecurity: { ...cms, verificationStatus: "unverified" }, formDestinations: { ...forms, verificationStatus: "unverified" } };
    else changed.runtimeArtifacts = { cmsSecurity: { ...cms, assessment: {} }, formDestinations: { ...forms, trace: { ...forms.trace, events: [] } } };
    const failed = buildReportAppendixEvidence(changed, projection, null);
    assert.equal(failed.cmsSecurity, null, mutation);
    assert.equal(failed.formDestinations, null, mutation);
  }
});

test("appendix evidence selects canonical certificate and policy facts, subchecks and correction guidance", () => {
  const projection = canonical();
  projection.checklistRows = [{ id: "transport_security_tls_certificate", label: "TLS certificate", status: "Gap observed", assessmentStatus: "gap_observed", evidenceState: "observed", explanation: "Retained certificate validation failed.", note: "Origin certificate", evidenceRefs: ["transport:tls:1"], subchecks: [{ id: "chain", label: "Certificate chain", status: "Gap observed", note: "Chain verification failed", evidenceRefs: ["transport:tls:1"] }], criticalEvidence: { retainedEvidence: { tlsProbeAttempted: true, validTlsCertificate: false, tlsCertificateObservations: [{ inputUrl: "https://example.test/", issuer: "Example CA", subject: "CN=example.test", validTo: "2026-10-19", chainCertificateCount: 2 }], scoreEffect: "deduction", deductionPoints: 15, arbitraryRawDebug: "must-not-export" } } }, { id: "controller_contact_disclosure", label: "Controller contact", status: "Observed", explanation: "Retained policy passage.", evidenceRefs: ["policy:1"], criticalEvidence: { retainedEvidence: { article13Signal: { evidenceText: "Contact the controller at privacy@example.test", selectedPolicySectionUrl: "https://example.test/privacy" } } } }] as unknown as PersistedCanonicalReportProjection["checklistRows"];
  const scan = { scan: { id: "scan-1" } } as ScanDetailResponse;
  const details = buildReportAppendixEvidence(scan, projection, null).checklistDetails;
  assert.equal(details[0]!.topic, "tls");
  assert.ok(details[0]!.facts.some(fact => fact.value === "Example CA"));
  assert.ok(details[0]!.facts.some(fact => fact.value === "2026-10-19"));
  assert.equal(details[0]!.subchecks[0]!.note, "Chain verification failed");
  assert.ok(details[0]!.correctionSteps.length > 0);
  assert.equal(details[1]!.topic, "policy");
  assert.ok(details[1]!.facts.some(fact => fact.value.includes("privacy@example.test")));
  assert.doesNotMatch(JSON.stringify(details), /deduction|scoreEffect|must-not-export/);
});
