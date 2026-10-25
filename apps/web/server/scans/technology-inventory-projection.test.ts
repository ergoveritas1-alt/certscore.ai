import assert from "node:assert/strict";
import test from "node:test";
import { cmsSecurityProjectionSchema, resolveCmsEvidence, type CanonicalEvidenceBundle } from "@certscore/contracts";
import { projectCmsSecurity } from "./cms-security-projection";
import { buildUnifiedFindingDisplayPackets } from "../../lib/scans/unified-findings";
const url = "https://fixture.example/", token = "loader-1";
const source = { verificationStatus: "verified", sha256: "a".repeat(64) };
function fixture(generators = ["Ghost 5.10.1"]): CanonicalEvidenceBundle {
  return {
    scanId: "tech-fixture", startedAt: "2026-10-24T12:00:00.000Z", completedAt: "2026-10-24T12:00:05.000Z",
    runtimeMetadataSnapshots: [{ artifactId: "runtime:dom", url, capturedAtMs: 3000, documentIdentity: { token }, consentStateAtTime: "pre_consent",
      siteMetadata: { contractVersion: "certscore.site-metadata.v1", title: "Fixture", language: "en", generators, wordpressAssetObserved: false,
        technology: { version: "certscore.technology-capture.v1", responseRequestId: "request-1", responseDocumentToken: token, truncated: false,
          observations: [{ kind: "header", value: "server: nginx/1.26.1" }, { kind: "asset", value: "/_next/static/app.js", sourceUrl: `${url}_next/static/app.js` }] } } }],
    networkEvents: [{ requestId: "request-1", requestUrl: url, isMainFrame: true, resourceType: "document", consentStateAtTime: "pre_consent", timestampMs: 100 }],
    networkResponseEvents: [{ eventId: "response-1", requestId: "request-1", responseUrl: url, status: 200, consentStateAtTime: "pre_consent", timestampMs: 200 }],
  } as unknown as CanonicalEvidenceBundle;
}
const project = (bundle = fixture()) => projectCmsSecurity(bundle, source, url)!;
const packets = (projection: unknown) => buildUnifiedFindingDisplayPackets({ runtimeArtifacts: { cmsSecurity: projection }, reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map() });

test("technology inventory is verified and produces no unified findings or score effects", () => {
  const projection = project();
  assert.deepEqual(projection.technologyInventory?.detections.map(row => row.id), ["ghost", "nextjs", "nginx"]);
  assert.equal(cmsSecurityProjectionSchema.safeParse(projection).success, true);
  assert.deepEqual(packets(projection), []);
  assert.deepEqual(projection.assessment.matches, []);
  for (const signal of projection.technologyInventory!.signals) assert.deepEqual(resolveCmsEvidence(projection, signal.evidenceRef), signal);
});

test("existing CMS, plugins and advisory assessment remain unchanged", () => {
  const bundle = fixture(["WordPress 4.5.33", "WP Rocket 3.20.2"]);
  const withTech = project(bundle);
  delete bundle.runtimeMetadataSnapshots![0]!.siteMetadata!.technology;
  const withoutTech = project(bundle);
  assert.deepEqual(withTech.assessment, withoutTech.assessment);
  assert.deepEqual(withTech.pluginInventory, withoutTech.pluginInventory);
  assert.deepEqual(withTech.signals, withoutTech.signals);
  assert.deepEqual(packets(withTech).map(row => [row.unifiedFindingId, row.severity]), packets(withoutTech).map(row => [row.unifiedFindingId, row.severity]));
});

test("header evidence must join the exact original document, request, response and time", () => {
  const mutations: Array<(bundle: CanonicalEvidenceBundle) => void> = [
    b => { b.networkEvents[0]!.isMainFrame = false; },
    b => { b.networkEvents[0]!.resourceType = "script"; },
    b => { b.networkEvents[0]!.requestUrl = "https://third.example/"; },
    b => { b.networkResponseEvents[0]!.requestId = "other"; },
    b => { b.networkResponseEvents[0]!.responseUrl = "https://third.example/"; },
    b => { b.networkResponseEvents[0]!.status = 302; },
    b => { b.networkResponseEvents[0]!.timestampMs = 4000; },
    b => { b.networkEvents.push(b.networkEvents[0]!); },
    b => { b.runtimeMetadataSnapshots![0]!.siteMetadata!.technology!.responseDocumentToken = "old-loader"; },
  ];
  for (const mutate of mutations) {
    const bundle = fixture(); mutate(bundle);
    const projection = project(bundle);
    assert.ok(projection.technologyInventory?.detections.some(row => row.id === "ghost"));
    assert.ok(!projection.technologyInventory?.detections.some(row => row.id === "nginx"));
  }
  const changed = fixture(); changed.runtimeMetadataSnapshots!.push({ ...changed.runtimeMetadataSnapshots![0]!, capturedAtMs: 4000, documentIdentity: { source: "cdp_loader_id", token: "new-loader" }, siteMetadata: undefined });
  assert.equal(projectCmsSecurity(changed, source, url), null);
  assert.equal(projectCmsSecurity(fixture(), { ...source, verificationStatus: "unverified" }, url), null);
});

test("legacy declarations work without new capture and historical projections stay readable", () => {
  const bundle = fixture(); delete bundle.runtimeMetadataSnapshots![0]!.siteMetadata!.technology;
  const projection = project(bundle);
  assert.deepEqual(projection.technologyInventory?.detections.map(row => row.id), ["ghost"]);
  delete projection.technologyInventory;
  assert.equal(cmsSecurityProjectionSchema.safeParse(projection).success, true);
});

test("exact query-bearing navigation is verified before its public URL is sanitized", () => {
  const bundle = fixture(), original = `${url}?private=value`;
  bundle.runtimeMetadataSnapshots![0]!.url = original;
  bundle.networkEvents[0]!.requestUrl = original;
  bundle.networkResponseEvents[0]!.responseUrl = original;
  const projection = projectCmsSecurity(bundle, source, original)!;
  assert.ok(projection.technologyInventory?.detections.some(row => row.id === "nginx"));
  assert.doesNotMatch(JSON.stringify(projection), /private=value/);
});
