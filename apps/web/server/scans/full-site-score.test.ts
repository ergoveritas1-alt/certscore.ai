import { buildEmbedScoringEvidence } from "../../lib/scans/embed-scoring-evidence";
import { projectSitewideEvidencePage, sitewideEvidencePageSchema } from "../../lib/scans/sitewide-evidence-index";
import { buildSitePriorityReview } from "../../lib/scans/full-site-priority-review";
import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
(require.cache as Record<string, unknown>)[require.resolve("server-only")] = { exports: {}, loaded: true };
const { countAssessedNonEssentialStorage, isFullSiteScoringCaptureComplete, mergeSiteChecklistRows, projectFullSiteScoringEvidence } = require("./full-site-score") as typeof import("./full-site-score");
import { deriveGdprEprivacyCoverageChecklist } from "../../lib/scans/gdpr-eprivacy-coverage-checklist";
import { deriveGdprEprivacyCoveragePolicyOutcomes } from "../../lib/scans/gdpr-eprivacy-coverage-policy";
import { deriveCanonicalOverallScoreForReport, deriveCanonicalOverallScoreExplanationForReport } from "./canonical-overall-score";

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

test("missing policy remains a homepage-supported site issue with one nine-point charge", () => {
  const coverageOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({ scanCompleted: true, coverageLimited: false,
    runtimeArtifacts: { policyDisclosureSummary: { privacyPolicyPresent: false }, policySurfaceInspection: {
      coverageStatus: "complete", inspectionCompleted: true, linkDiscoveryCoverageStatus: "complete",
      documentRetrievalCoverageStatus: "insufficient", limitationKeys: [], observedSurfaceTypes: [],
      outcome: "no_privacy_policy_observed_complete_coverage", privacyPolicyObserved: false,
    } }, snapshot: { privacy_policy_present: false } });
  const home = deriveGdprEprivacyCoverageChecklist({ scanCompleted: true, coverageLimited: false,
    coverageOutcomes, unifiedFindings: [] }).filter(row => row.id === "privacy_notice_availability");
  const merged = mergeSiteChecklistRows(home, [...home, ...home]);
  const explanation = deriveCanonicalOverallScoreExplanationForReport({ scanRecord: { runtimeArtifacts: null },
    checklistRows: merged, unifiedFindings: [] })!;
  assert.equal(explanation.score, 91);
  assert.equal(explanation.totalPolicyDeductionPoints, 9);
  assert.equal(explanation.deductions[0]?.rules.length, 1);
  assert.equal(explanation.deductions[0]?.rules[0]?.ruleId, "privacy_notice_availability");
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

test("overview storage count uses merged canonical evidence and preserves unknown", () => {
  assert.equal(countAssessedNonEssentialStorage([]), null);
  assert.equal(countAssessedNonEssentialStorage(storage([])), 0);
  assert.equal(countAssessedNonEssentialStorage(mergeSiteChecklistRows(storage(["a", "b"]), storage(["b", "c"]))), 3);
});

test("sitewide evidence index preserves canonical page status and provenance without importing homepage-only checks", () => {
  const rows = storage(["additional-page-cookie"]);
  const page = projectSitewideEvidencePage({pageId: "page-2", url: "https://example.test/second", sourceHash: "a".repeat(64), homepage: false}, rows);
  assert.ok(sitewideEvidencePageSchema.safeParse(page).success);
  assert.equal(page.pageId, "page-2");
  assert.equal(page.homepage, false);
  const storageRow = page.rows.find(row => row.id === "pre_consent_cookies_storage")!;
  assert.equal(storageRow.assessmentStatus, "gap_observed");
  assert.equal(storageRow.status, "Gap observed");
  assert.deepEqual(storageRow.evidenceRefs, rows.find(row => row.id === storageRow.id)!.evidenceRefs);
  assert.ok(!page.rows.some(row => row.id === "reject_all_path_availability"));
  const limited = projectSitewideEvidencePage({...page, homepage: true}, baseline());
  assert.ok(limited.rows.every(row => row.assessmentStatus !== "gap_observed"));
});

test("sitewide displayed status follows canonical assessment rather than legacy checklist label", () => {
  const rows = storage(["cookie"]).map(row => row.id === "pre_consent_cookies_storage" ? {...row, status: "Not confirmed" as const} : row);
  const result = projectSitewideEvidencePage({pageId: "page", url: "https://example.test/", sourceHash: "a".repeat(64), homepage: true}, rows);
  assert.equal(result.rows.find(row => row.id === "pre_consent_cookies_storage")?.status, "Gap observed");
});

test("verified browser scope survives concern policy and reconciles without changing scoring", () => {
  const event = { eventId: "cookie-scope", eventType: "cookie", timestampMs: 1000, sourceScanner: "preConsentRuntimeScanner", scenario: "fresh_pre_consent", consentStateAtTime: "pre_consent", pagePhase: "network_idle", confidence: 1, directVsInferred: "direct", operation: "set_cookie_header", cookieName: "_ga", cookieDomain: "example.test", cookiePath: "/", cookiePurpose: "analytics", cookieEssentiality: "non_essential" };
  const cookie = {name: "_ga", domain: ".example.test", path: "/"};
  const project = (cookies: unknown[], phase = "pre_consent") => projectFullSiteScoringEvidence({cookieEvents: [event], networkEvents: [], cookieSnapshots: [{artifactId: "snapshot", capturedAtMs: 1500, consentStateAtTime: phase, cookies}]}, "page", "a".repeat(64))!;
  const getIdentity = (rows: ReturnType<typeof project>) => (rows.find(row => row.id === "pre_consent_cookies_storage")!.criticalEvidence.retainedEvidence.eligiblePreconsentCookieStorageRows as Record<string, unknown>[])[0]?.exactStorageIdentity;
  const exact = project([cookie]);
  assert.equal(getIdentity(exact), JSON.stringify(["_ga", ".example.test", "/", null]));
  assert.equal(score(exact), score(project([])));
  assert.equal(getIdentity(project([{...cookie,path: "/other"}])), undefined);
  assert.equal(getIdentity(project([cookie], "post_accept")), undefined);
  assert.equal(getIdentity(project([cookie,{...cookie,partitionKey: "https://other.test"}])), undefined);
  assert.equal(getIdentity(project([cookie,{...cookie,domain: "example.test"}])), undefined);
});

test("embed counts merge admitted source identities across pages without multiplying scores", () => {
  const embeds = (urls: string[]) => baseline().map(row => row.id !== "third_party_iframe_pre_consent" ? row : {
    ...row, assessmentStatus: "gap_observed" as const, evidenceState: "observed" as const, status: "Gap observed" as const,
    criticalEvidence: {...row.criticalEvidence, retainedEvidence: {embeddedFrameSources:urls}},
  });
  const home = embeds(["https://facebook.com/plugins/page.php"]);
  const other = embeds(["https://facebook.com/plugins/page.php", "https://youtube.com/embed/video"]);
  const merged = mergeSiteChecklistRows(home, [...other, ...other]);
  assert.deepEqual(merged.find(row=>row.id === "third_party_iframe_pre_consent")?.criticalEvidence.retainedEvidence.embeddedFrameSources,
    ["https://facebook.com/plugins/page.php", "https://youtube.com/embed/video"]);
  assert.equal(score(merged),score(home));
  const review=buildSitePriorityReview(merged,[{id:"home",url:"https://example.test",homepage:true,findingIds:["third_party_iframe_pre_consent"]},{id:"other",url:"https://example.test/other",homepage:false,findingIds:["third_party_iframe_pre_consent"]}]);
  assert.match(review.find(row=>row.id.endsWith("third_party_iframe_pre_consent"))!.summary,/At least 2 distinct third-party embeds.*across 2 pages/);
});


test("site scoring unions versioned embed groups across pages without multiplying shared labels", () => {
  const embeds = (host: string) => baseline().map(row => !["third_party_iframe_pre_consent", "social_media_embed_pre_consent", "embedded_content_pre_consent"].includes(row.id) ? row : ({
    ...row, assessmentStatus: "gap_observed" as const, evidenceState: "observed" as const, status: "Gap observed" as const,
    criticalEvidence: { ...row.criticalEvidence, missingOrIncompleteSourceSignals: [], retainedEvidence: {
      embedScoringEvidence: buildEmbedScoringEvidence([{ host, purpose: "mediaEmbed", resource: `https://${host}/embed/example` }]),
    } },
  }));
  const home = embeds("www.youtube.com");
  const merged = mergeSiteChecklistRows(home, [...home, ...embeds("player.vimeo.com")]);
  assert.equal(score(merged), 95, "existing flat category weight applies once to the combined exposure set");
  for (const row of merged.filter(row => row.id.includes("embed") || row.id.includes("iframe"))) {
    assert.equal((row.criticalEvidence.retainedEvidence.embedScoringEvidence as { groups: unknown[] }).groups.length, 2);
  }
  assert.equal(score(home), 95);
  const distinctWidget = baseline().map(row => row.id !== "embedded_content_pre_consent" ? row : ({
    ...row, assessmentStatus: "gap_observed" as const, evidenceState: "observed" as const, status: "Gap observed" as const,
    criticalEvidence: { ...row.criticalEvidence, missingOrIncompleteSourceSignals: [], retainedEvidence: {
      embedScoringEvidence: buildEmbedScoringEvidence([{ host: "chat.example.test", purpose: "formOrChatWidget", resource: "https://chat.example.test/widget" }]),
    } },
  }));
  assert.equal(score(mergeSiteChecklistRows(home, distinctWidget)), 90, "a separate widget still adds its existing category deduction");
});
