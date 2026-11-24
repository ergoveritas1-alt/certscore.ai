import assert from "node:assert/strict";
import test from "node:test";
import {
  CALIFORNIA_TRANSPORT_FINDING_ID as ID, transportSecurityObservationSchema,
  type TransportSecurityObservation,
} from "@certscore/contracts";
import { deriveCaliforniaRegulatoryScore } from "../../lib/scans/california-regulatory-score";
import { CALIFORNIA_TRANSPORT_SCORE_VERSION, californiaTransportScoreEffect } from "../../lib/scans/california-transport-score-policy";
import { projectReportPriorityFindings } from "../../lib/scans/report-priority-projection";
import { selectRegulatoryReview } from "../../lib/scans/regulatory-review-catalog";
import { buildUnifiedFindingDisplayPackets } from "../../lib/scans/unified-findings";
import { projectCaliforniaPrivacyReview } from "./california-privacy-review-projection";
import { californiaCoverageFixture, CA_FIXTURE_SOURCE, CA_FIXTURE_URL } from "./california-review-coverage.fixture";
import { projectCaliforniaTransport } from "./california-transport-projection";

const https = CA_FIXTURE_URL;
const http = https.replace(/^https:/, "http:");
const host = new URL(https).host;
const failure = { attempted: true, validCertificate: false, inputUrl: https,
  errorCategory: "tls_or_certificate_failure", errorMessage: "CERT_HAS_EXPIRED" } as const;

function transport(patch: Partial<TransportSecurityObservation> = {}) {
  return transportSecurityObservationSchema.parse({ observationId: "transport_security_pre_consent", observedAtMs: 1000,
    sourceScanner: "pre_consent_runtime", scenario: "fresh_pre_consent", requestedUrl: https, normalizedUrl: https, requestedScheme: "https",
    finalUrl: https, finalScheme: "https", pageHttpsObserved: true, sampledPageUrls: [https],
    httpProbe: { attempted: false }, tlsProbe: failure, mixedContent: { observedCount: 0 },
    formTransports: [{ formId: "form_0", method: "post", pageUrl: https, pageScheme: "https", actionUrl: http + "signup?omit=private",
      actionPresent: true, actionScheme: "http", resolvesToHttps: false, insecureTransportObserved: true, personalDataFieldCategories: ["email"] }],
    summary: { mixedContentObserved: false, insecureFormTransportObserved: true },
    evidenceRefs: [{ refId: "ref_transport_security", artifactId: "transport_security_observation" }], confidence: 0.94, directVsInferred: "direct", ...patch });
}

test("one retained defect identity reaches the California score and top findings together", t => {
  t.mock.method(performance, "now", () => 0);
  const fixture = californiaCoverageFixture();
  const observation = transport();
  fixture.bundle.transportSecurityObservations = [observation, observation];
  const proof = projectCaliforniaTransport(fixture.bundle, CA_FIXTURE_SOURCE, https);
  assert.deepEqual(proof?.issues, [{ authority: host, defects: ["certificate_validation_failure", "plaintext_form_destination"], fieldCategories: ["email"] }]);
  assert.doesNotMatch(JSON.stringify(proof), /omit=|private/);
  const assessment = projectCaliforniaPrivacyReview(fixture.bundle, CA_FIXTURE_SOURCE, https, fixture.policyEvidence);
  assert.ok(assessment);
  const packets = (raw: unknown) => buildUnifiedFindingDisplayPackets({ runtimeArtifacts: { californiaTransportSecurity: raw },
    reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map() });
  const findings = packets(JSON.parse(JSON.stringify(proof)));
  assert.equal(findings.length, 1);
  const useScore = (unifiedFindings: typeof findings) => deriveCaliforniaRegulatoryScore({ assessment, checklistRows: [], unifiedFindings });
  assert.equal(useScore([]).score, 100);
  const score = useScore([...findings, ...findings]);
  assert.equal(score.policyVersion, CALIFORNIA_TRANSPORT_SCORE_VERSION);
  assert.equal(score.score, 88);
  assert.equal(score.deductions.filter(row => row.findingId === ID).length, 1);
  const priorities = projectReportPriorityFindings([], findings);
  assert.deepEqual(selectRegulatoryReview(priorities, "ccpa_cpra").topIssues.map(row => row.id), [ID]);
  assert.equal(selectRegulatoryReview(priorities, "gdpr_eprivacy").topIssues.length, 0);
  assert.equal(useScore(packets({ ...proof, scanId: "another-scan" })).score, 100);
  assert.equal(useScore(packets({ ...proof, documentUrl: https + "unrelated" })).score, 100);
  assert.equal(useScore(findings.map(finding => ({ ...finding, scoreEffects: [] }))).score, 100);
  assert.equal(packets(undefined).length, 0);
});

test("plaintext form pages and distinct plaintext destinations retain separate authority evidence", () => {
  const fixture = californiaCoverageFixture(undefined, http);
  const row = transport().formTransports[0]!;
  fixture.bundle.transportSecurityObservations = [transport({ finalUrl: http, finalScheme: "http", pageHttpsObserved: false,
    formTransports: [{ ...row, pageUrl: http, pageScheme: "http", actionUrl: "http://forms.example.test/submit", personalDataFieldCategories: ["name", "address"] }] })];
  const proof = projectCaliforniaTransport(fixture.bundle, CA_FIXTURE_SOURCE, http);
  assert.deepEqual(proof?.issues, [
    { authority: host, defects: ["plaintext_page"], fieldCategories: ["address", "name"] },
    { authority: "forms.example.test", defects: ["plaintext_form_destination"], fieldCategories: ["address", "name"] },
  ]);
  assert.equal(californiaTransportScoreEffect(proof)[0]?.deductionPoints, 20);
});

test("a retained strict probe for the redirected HTTPS form page can qualify", () => {
  const fixture = californiaCoverageFixture();
  const row = transport().formTransports[0]!;
  fixture.bundle.transportSecurityObservations = [transport({
    tlsProbe: { attempted: true, inputUrl: "https://initial.example.test/", validCertificate: true },
    tlsCertificateObservations: [{ inputUrl: https, validCertificate: false, validationError: "CERT_HAS_EXPIRED" }],
    formTransports: [{ ...row, actionUrl: https, actionScheme: "https", resolvesToHttps: true, insecureTransportObserved: false }],
  })];
  assert.deepEqual(projectCaliforniaTransport(fixture.bundle, CA_FIXTURE_SOURCE, https)?.issues,
    [{ authority: host, defects: ["certificate_validation_failure"], fieldCategories: ["email"] }]);
});

test("unknown, old, unrelated or contradictory transport evidence remains unscored", () => {
  const fixture = californiaCoverageFixture();
  const row = transport().formTransports[0]!;
  const secure = { ...row, actionScheme: "https" as const, resolvesToHttps: true, insecureTransportObserved: false, actionUrl: https + "signup" };
  for (const input of [
    transport({ formTransports: [] }),
    transport({ formTransports: [{ ...row, personalDataFieldCategories: undefined }] }),
    transport({ formTransports: [{ ...row, personalDataFieldCategories: [] }] }),
    transport({ formTransports: [{ ...row, formId: "collection_surface_0" }] }),
    transport({ formTransports: [{ ...row, pageUrl: https + "other" }] }),
    transport({ formTransports: [{ ...row, pageUrl: https + "?different=source" }] }),
    transport({ pageHttpsObserved: false }),
    transport({ observedAtMs: 9000 }),
    transport({ directVsInferred: "inferred" }),
    transport({ formTransports: [secure], tlsProbe: { ...failure, errorCategory: "timeout" } }),
    transport({ formTransports: [secure], tlsProbe: { ...failure, errorMessage: "UNABLE_TO_VERIFY_LEAF_SIGNATURE" } }),
    transport({ formTransports: [secure], tlsProbe: { ...failure, inputUrl: "https://other.example/" } }),
    transport({ formTransports: [secure], tlsCertificateObservations: [{ inputUrl: https, validCertificate: true }] }),
    transport({ formTransports: [secure], tlsProbe: { attempted: false },
      httpProbe: { attempted: true, outcome: "plaintext_response_served", finalScheme: "http", finalUrl: http, status: 200, redirectChain: [] } }),
  ]) {
    fixture.bundle.transportSecurityObservations = [input];
    assert.equal(projectCaliforniaTransport(fixture.bundle, CA_FIXTURE_SOURCE, https), null, JSON.stringify(input));
  }
  fixture.bundle.transportSecurityObservations = [transport()];
  assert.equal(projectCaliforniaTransport(fixture.bundle, { ...CA_FIXTURE_SOURCE, verificationStatus: "unverified" }, https), null);
});

test("loaded active HTTP resources on the verified HTTPS form document count once", t => {
  t.mock.method(performance, "now", () => 0);
  const fixture = californiaCoverageFixture();
  const row = transport().formTransports[0]!;
  const active = { documentUrl: https, resourceUrl: "http://assets.example.test/code.js", kind: "script" as const, requestId: "req_1" };
  const observation = transport({ tlsProbe: { attempted: false },
    formTransports: [{ ...row, actionUrl: https, actionScheme: "https", resolvesToHttps: true, insecureTransportObserved: false }],
    mixedContent: { observedCount: 2, blockedHttpSubresources: [], loadedHttpSubresources: [],
      activeFormResources: [active, { ...active, resourceUrl: "http://other.example.test/style.css", requestId: "req_2", kind: "stylesheet" }] } });
  fixture.bundle.transportSecurityObservations = [observation, observation];
  const project = () => projectCaliforniaTransport(fixture.bundle, CA_FIXTURE_SOURCE, https);
  const proof = project();
  assert.deepEqual(proof?.issues, [{ authority: host, defects: ["active_mixed_content"], fieldCategories: ["email"] }]);
  const findings = buildUnifiedFindingDisplayPackets({ runtimeArtifacts: { californiaTransportSecurity: proof },
    reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map() });
  const assessment = projectCaliforniaPrivacyReview(fixture.bundle, CA_FIXTURE_SOURCE, https, fixture.policyEvidence);
  assert.ok(assessment);
  const score = deriveCaliforniaRegulatoryScore({ assessment, checklistRows: [], unifiedFindings: [...findings, ...findings] });
  assert.equal(score.score, 92);
  assert.equal(score.policyVersion, "california-regulatory-posture.v29-active-mixed-content");
  assert.deepEqual(selectRegulatoryReview(projectReportPriorityFindings([], findings), "ccpa_cpra").topIssues.map(row => row.id), [ID]);
  fixture.bundle.transportSecurityObservations = [{ ...observation, formTransports: [{ ...observation.formTransports[0]!,
    actionUrl: undefined, actionScheme: "unknown" }] }];
  assert.deepEqual(project()?.issues, proof?.issues);
  for (const resources of [undefined, [], [{ ...active, documentUrl: https + "other" }],
    [{ ...active, resourceUrl: "https://assets.example.test/script" }], [{ ...active, resourceUrl: "http://localhost/x" }]]) {
    fixture.bundle.transportSecurityObservations = [{ ...observation, mixedContent: { ...observation.mixedContent, activeFormResources: resources } }];
    assert.equal(project(), null);
  }
  fixture.bundle.transportSecurityObservations = [{ ...observation, formTransports: [{ ...row, personalDataFieldCategories: [] }] }];
  assert.equal(project(), null);
});
