import { buildSitePriorityReview } from "../../lib/scans/full-site-priority-review";
import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
(require.cache as Record<string, unknown>)[require.resolve("server-only")] = { exports: {}, loaded: true };
const { isFullSiteScoringCaptureComplete, mergeSiteChecklistRows, projectFullSiteScoringEvidence } = require("./full-site-score") as typeof import("./full-site-score");
import { deriveGdprEprivacyCoverageChecklist } from "../../lib/scans/gdpr-eprivacy-coverage-checklist";
import { deriveCanonicalOverallScoreForReport } from "./canonical-overall-score";

const baseline = () => deriveGdprEprivacyCoverageChecklist({ scanCompleted: false, coverageLimited: true, unifiedFindings: [] });
function storage(names: string[]) {
  return baseline().map(row => row.id !== "pre_consent_cookies_storage" ? row : {
    ...row, assessmentStatus: "gap_observed" as const, evidenceState: "observed" as const, status: "Gap observed" as const,
    criticalEvidence: { ...row.criticalEvidence, missingOrIncompleteSourceSignals: [], retainedEvidence: {
      eligiblePreconsentCookieStorageRows: names.map(name => ({ storageType: "cookie", name, domain: "example.test", path: "/", partitionKey: null })),
    } },
  });
}
const score = (rows: ReturnType<typeof baseline>) => deriveCanonicalOverallScoreForReport({ scanRecord: { runtimeArtifacts: null }, checklistRows: rows, unifiedFindings: [] });

test("partial HTTP error inventory is excluded before retained evidence enters scoring", () => {
  const observation = { status: "completed" as const, httpStatus: 200, failureKind: null };
  assert.equal(isFullSiteScoringCaptureComplete({ status: "completed", observation }), true);
  assert.equal(isFullSiteScoringCaptureComplete({ status: "completed" }), false);
  assert.equal(isFullSiteScoringCaptureComplete({ status: "partial", observation: { ...observation, status: "partial", httpStatus: 500, failureKind: "http_error" } }), false);
  // Even inconsistent persisted status cannot turn an HTTP error into scoring evidence.
  assert.equal(isFullSiteScoringCaptureComplete({ status: "completed", observation: { ...observation, httpStatus: 500 } }), false);
  assert.equal(isFullSiteScoringCaptureComplete({ status: "completed", observation: { ...observation, failureKind: "collection_failure" } }), false);
});

test("typed retained cookie evidence passes through concern policy; other scenarios stay neutral", () => {
  const event = { eventId: "cookie-1", eventType: "cookie", timestampMs: 1000, sourceScanner: "preConsentRuntimeScanner", scenario: "fresh_pre_consent", consentStateAtTime: "pre_consent", pagePhase: "network_idle", confidence: 1, directVsInferred: "direct", operation: "set_cookie_header", cookieName: "_ga", cookieDomain: "example.test", cookiePath: "/", cookiePurpose: "analytics", cookieEssentiality: "non_essential" };
  const projected = projectFullSiteScoringEvidence({cookieEvents: [event], networkEvents: []}, "page-2", "a".repeat(64))!;
  assert.equal(projected.find(row => row.id === "pre_consent_cookies_storage")?.assessmentStatus, "gap_observed");
  const excluded = projectFullSiteScoringEvidence({cookieEvents: [{...event, scenario: "accept_observation"}], networkEvents: []}, "page-2", "a".repeat(64))!;
  assert.deepEqual(mergeSiteChecklistRows(storage(["existing"]), excluded), storage(["existing"]));
});

test("a repeated site finding does not multiply deductions across pages", () => {
  const home = storage(["_ga"]), page = storage(["_ga", "_clck"]);
  assert.equal(score(mergeSiteChecklistRows(home, page)), 88);
  assert.equal(score(mergeSiteChecklistRows(home, [...page, ...page, ...page])), 88);
  assert.equal(score(mergeSiteChecklistRows(home, storage(["_ga"]))), score(home));
});
test("distinct retained identities add deductions using existing caps", () => {
  assert.equal(score(mergeSiteChecklistRows(storage(["_ga"]), storage(["_ga", "_clck", "_clsk"]))), 86);
  assert.equal(score(mergeSiteChecklistRows(storage(["_ga"]), storage(Array.from({length: 100}, (_, i) => `cookie-${i}`)))), 60);
});
test("tracking vendors merge once across canonical rows and legacy vendor arrays", () => {
  const tracking = (vendors: string[], legacy = false) => baseline().map(row => row.id !== "pre_consent_third_party_tracking" ? row : {
    ...row, assessmentStatus: "gap_observed" as const, evidenceState: "observed" as const, status: "Gap observed" as const,
    criticalEvidence: { ...row.criticalEvidence, missingOrIncompleteSourceSignals: [], retainedEvidence: legacy ? { selectedPreconsentThirdPartyTrackingVendors: vendors } : { preconsentThirdPartyTrackerGroups: vendors.map(vendor => ({vendor})) } },
  });
  const home = tracking(["Google"], true), page = tracking(["Google", "Microsoft"]);
  assert.equal(score(mergeSiteChecklistRows(home, [...page, ...page])), 88);
  assert.equal(score(mergeSiteChecklistRows(home, tracking(["Google"]))), 92);
});
test("additional unassessed and limited checks cannot create deductions", () => {
  const home = storage(["_ga"]);
  assert.deepEqual(mergeSiteChecklistRows(home, baseline()), home);
  const inventedConsentGap = baseline().map(row => ({ ...row, assessmentStatus: "gap_observed" as const }));
  assert.deepEqual(mergeSiteChecklistRows(home, inventedConsentGap.filter(row => ["reject_all_path_availability", "post_reject_tracking_reduction", "privacy_notice_availability"].includes(row.id))), home);
});
test("malformed or missing retained runtime packets fail closed", () => {
  assert.equal(projectFullSiteScoringEvidence({}, "page", "hash"), null);
  assert.equal(projectFullSiteScoringEvidence({ cookieEvents: [{ cookieName: "_ga" }], networkEvents: [] }, "page", "hash"), null);
  const empty = projectFullSiteScoringEvidence({ cookieEvents: [], networkEvents: [] }, "page", "hash")!;
  assert.deepEqual(mergeSiteChecklistRows(storage(["_ga"]), empty), storage(["_ga"]));
});

test("site-wide replay and fingerprinting count unique identities across pages", () => {
  for (const [id, field, key] of [
    ["session_replay_fingerprinting_review", "sessionReplayEvidence", "vendors"],
    ["device_identification_fingerprinting_signal_observed", "browserDeviceEntropyEvidence", "hosts"],
  ]) {
    const withIdentities = (identities: string[]) => baseline().map(row => row.id !== id ? row : {
      ...row, assessmentStatus: "gap_observed" as const, evidenceState: "observed" as const, status: "Gap observed" as const,
      criticalEvidence: { ...row.criticalEvidence, missingOrIncompleteSourceSignals: [], retainedEvidence: {
        promotionEligible: true, [field!]: { [key!]: identities },
      } },
    });
    assert.equal(score(mergeSiteChecklistRows(withIdentities(["A"]), withIdentities(["a", "B", "C"]))), 89);
    assert.equal(score(mergeSiteChecklistRows(withIdentities(["A"]), [...withIdentities(["B"]), ...withIdentities(["B"])])), 90);
    assert.equal(score(mergeSiteChecklistRows(withIdentities(["A"]), withIdentities(Array.from({length: 50}, (_, i) => String(i))))), 75);
  }
});

test("site-wide flat runtime deductions apply once; homepage-only findings stay scoped", () => {
  for (const [id, deduction] of [["sensitive_surfaces_third_party_tracking", 12], ["embedded_content_pre_consent", 5], ["social_media_embed_pre_consent", 5], ["third_party_iframe_pre_consent", 5]] as const) {
    const page = baseline().map(row => row.id !== id ? row : {
      ...row, assessmentStatus: "gap_observed" as const, evidenceState: "observed" as const, status: "Gap observed" as const,
      criticalEvidence: { ...row.criticalEvidence, missingOrIncompleteSourceSignals: [], retainedEvidence: {} },
    });
    assert.equal(score(mergeSiteChecklistRows(baseline(), [...page, ...page])), 100 - deduction, id);
  }
});

const runtimeBase = { timestampMs: 1000, sourceScanner: "preConsentRuntimeScanner", scenario: "fresh_pre_consent", consentStateAtTime: "pre_consent", pagePhase: "network_idle", confidence: 1, directVsInferred: "direct", topLevelUrl: "https://example.test/contact" };
const runtimePacket = {
  cookieEvents: [], networkEvents: [], iframeEvents: [], runtimeTimeline: [], collectionSurfaceObservations: [],
  moduleRun: { moduleName: "preConsentRuntimeScanner", status: "completed", startedAt: "2026-09-06T00:00:00Z", evidenceRefs: [], errors: [] },
};
test("retained additional-page replay and embeds pass through canonical policy", () => {
  const packet = { ...runtimePacket,
    networkEvents: [{ ...runtimeBase, eventId: "request", eventType: "network_request", requestId: "request", method: "POST", requestUrl: "https://www.clarity.ms/collect", url: "https://www.clarity.ms/collect", hostname: "www.clarity.ms", thirdParty: true, collectionEndpointObserved: true }],
    iframeEvents: [{ ...runtimeBase, eventId: "frame", eventType: "iframe", frameUrl: "https://www.youtube.com/embed/abc" }],
  };
  const rows = projectFullSiteScoringEvidence(packet, "page-2", "a".repeat(64), runtimeBase.topLevelUrl)!;
  assert.equal(rows.find(row => row.id === "session_replay_fingerprinting_review")?.assessmentStatus, "review_signal");
  assert.ok(score(mergeSiteChecklistRows(baseline(), rows))! < 100);
  const iframe = rows.find(row => row.id === "third_party_iframe_pre_consent")!;
  assert.ok(["gap_observed", "review_signal"].includes(iframe.assessmentStatus));
  const failed = projectFullSiteScoringEvidence({ ...packet, networkEvents: [], moduleRun: { ...packet.moduleRun, status: "failed" } }, "page", "a".repeat(64), runtimeBase.topLevelUrl)!;
  assert.deepEqual(mergeSiteChecklistRows(baseline(), failed), baseline());
});

test("additional-page fingerprinting requires corroborated transmission and excludes action scenarios", () => {
  const packet = { ...runtimePacket,
    networkEvents: [{ ...runtimeBase, eventId: "fp-request", eventType: "network_request", requestId: "fp", method: "GET", requestUrl: "https://example.test/collect?canvas_hash=redacted&webgl_renderer=redacted" }],
    runtimeTimeline: ["canvas", "webgl"].map(category => ({ ...runtimeBase, eventId: category, eventType: "browser_api_access", hostname: "example.test", evidenceRefs: [{ refId: category, label: `Browser API access: ${category}`, excerpt: category }] })),
  };
  const project = (evidence: Record<string, unknown>) => projectFullSiteScoringEvidence(evidence, "page", "a".repeat(64), runtimeBase.topLevelUrl)!;
  const rows = project(packet);
  assert.equal(score(mergeSiteChecklistRows(baseline(), rows)), 94);
  assert.deepEqual(mergeSiteChecklistRows(baseline(), project({ ...packet, networkEvents: [] })), baseline());
  assert.deepEqual(mergeSiteChecklistRows(baseline(), project({ ...packet, networkEvents: packet.networkEvents.map(event => ({ ...event, scenario: "accept_observation" })), runtimeTimeline: packet.runtimeTimeline.map(event => ({ ...event, scenario: "accept_observation" })) })), baseline());
});

test("additional-page social embeds and sensitive tracking retain their canonical deductions", () => {
  const packet = { ...runtimePacket,
    networkEvents: [{ ...runtimeBase, eventId: "analytics", eventType: "network_request", requestId: "analytics", method: "POST", requestUrl: "https://www.google-analytics.com/g/collect", hostname: "www.google-analytics.com", thirdParty: true, collectionEndpointObserved: true }],
    iframeEvents: [{ ...runtimeBase, eventId: "social", eventType: "iframe", frameUrl: "https://www.facebook.com/plugins/page.php" }],
    collectionSurfaceObservations: [{ observationId: "sensitive", observedAtMs: 500, sourceScanner: runtimeBase.sourceScanner, scenario: runtimeBase.scenario, consentStateAtTime: runtimeBase.consentStateAtTime, pageUrl: runtimeBase.topLevelUrl, surfaceType: "contact", controlCount: 1, hasSensitiveFieldHint: true, fieldTypes: ["health"], labels: ["Medical details"], confidence: 1, directVsInferred: "direct" }],
  };
  const rows = projectFullSiteScoringEvidence(packet, "page", "a".repeat(64), runtimeBase.topLevelUrl)!;
  for (const id of ["social_media_embed_pre_consent", "embedded_content_pre_consent", "sensitive_surfaces_third_party_tracking"]) {
    assert.ok(["review_signal", "gap_observed"].includes(rows.find(row => row.id === id)!.assessmentStatus), id);
  }
});


test("site priority groups repeated canonical issues and retains affected page provenance", () => {
  const projected = (name: string) => projectFullSiteScoringEvidence({cookieEvents: [{eventId: name, eventType: "cookie", timestampMs: 1000, sourceScanner: "preConsentRuntimeScanner", scenario: "fresh_pre_consent", consentStateAtTime: "pre_consent", pagePhase: "network_idle", confidence: 1, directVsInferred: "direct", operation: "set_cookie_header", cookieName: name, cookieDomain: "example.test", cookiePath: "/", cookiePurpose: "analytics", cookieEssentiality: "non_essential"}], networkEvents: []}, name, "a".repeat(64))!;
  const rows = mergeSiteChecklistRows(projected("_ga"), projected("_clck"));
  const findings = buildSitePriorityReview(rows, [
    {id: "home", url: "https://example.test/", homepage: true, findingIds: ["pre_consent_cookies_storage"]},
    {id: "child", url: "https://example.test/about", homepage: false, findingIds: ["pre_consent_cookies_storage"]},
  ]);
  const issue = findings.find(finding => finding.id.endsWith("pre_consent_cookies_storage"))!;
  assert.ok(issue);
  assert.equal(findings.filter(finding => finding.id === issue.id).length, 1);
  assert.deepEqual(issue.pages.map(page => page.id), ["home", "child"]);
  assert.match(JSON.stringify(issue.evidenceJson), /_clck/);
  assert.ok(issue.correctionSteps[0]);
});

test("site priority does not promote additional-page consent or unavailable evidence", () => {
  const unassessed = baseline();
  const inventedConsentGap = baseline().map(row => ({...row, assessmentStatus: "gap_observed" as const}));
  const merged = mergeSiteChecklistRows(unassessed, inventedConsentGap.filter(row => row.id === "reject_all_path_availability"));
  assert.deepEqual(buildSitePriorityReview(merged, []), buildSitePriorityReview(unassessed, []));
});
