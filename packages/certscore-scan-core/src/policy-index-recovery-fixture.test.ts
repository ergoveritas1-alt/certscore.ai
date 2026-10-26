import assert from "node:assert/strict";
import test from "node:test";
import { isFreshPriorScanAccelerationSource } from "@website-signal-risk-scanner/shared";
import { extractCandidates } from "./scanners/policy-surface-scanner.js";
import {
  policyIndexRecoveryFixtureOptions,
  policyIndexRecoveryFixtureResponse,
  type IndexRecoveryFixtureRequest,
} from "./test-fixtures/policy-index-recovery.js";

// These tests only evaluate fixture data and pure selection/classification.
// Do not import policy-index-recovery.test.ts: it registers scanner integrations.
const baseUrl = "http://127.0.0.1:12345";
const scanStartedAtMs = Date.parse("2026-10-26T12:00:00Z");
const response = (url: string, overrides: Partial<IndexRecoveryFixtureRequest> = {}) =>
  policyIndexRecoveryFixtureResponse({ baseUrl, url, navigation: false, renderedRecovery: false,
    delayedNotice: false, multilingual: false, ...overrides });

test("browser-only index recovery has a fresh synthetic prior hint; other cases remain unseeded", () => {
  for (const mode of [false, true, "homepage"] as const) {
    const options = policyIndexRecoveryFixtureOptions(baseUrl, scanStartedAtMs, mode);
    assert.ok(options.nanoAssistProvider?.classifyLinks, "fallback ranking always has a local mock");
    if (mode !== true) {
      assert.deepEqual(options.policySurfaceSeeds, []);
      continue;
    }
    assert.equal(options.policySurfaceSeeds?.length, 1);
    const seed = options.policySurfaceSeeds![0]!;
    assert.equal(seed.url, baseUrl + "/privacy");
    assert.equal(seed.source, "prior_scan_hint");
    assert.equal(seed.hintType, "privacy_policy");
    assert.equal(seed.sourceScanId, "fixture-prior-policy-index");
    assert.ok(isFreshPriorScanAccelerationSource(seed.sourceCompletedAt!, scanStartedAtMs));
    assert.ok(Date.parse(seed.sourceCompletedAt!) < scanStartedAtMs);
  }
});

test("prior-hint browser recovery and observed-homepage recovery keep distinct routes", () => {
  assert.equal(response("/", { renderedRecovery: true }).status, 403);
  assert.equal(response("/", { renderedRecovery: true, navigation: true }).status, 403);
  assert.equal(response("/privacy", { renderedRecovery: true }).status, 403);
  const redirected = response("/privacy", { renderedRecovery: true, navigation: true });
  assert.equal(redirected.status, 302);
  assert.equal(redirected.headers.location, "/policycenter/b2c");

  assert.equal(response("/", { renderedRecovery: "homepage" }).status, 403);
  const homepage = response("/", { renderedRecovery: "homepage", navigation: true });
  assert.equal(homepage.status, 200);
  const links = extractCandidates(baseUrl + "/", homepage.body, "Privacy Policy");
  assert.equal(links[0]?.normalizedUrl, baseUrl + "/policycenter/b2c");
  assert.equal(links[0]?.discoveryMethod, "footer_link");
  assert.equal(links[0]?.clickable, true);
  assert.equal(response("/privacy").status, 403, "ordinary guesses stay denied");
});

test("index response graph still leads to the Europe notice through the declared JSON and redirect", () => {
  assert.match(response("/policycenter/b2c").body, /OneTrust\.NoticeApi\.LoadNotices/);
  const indexConfig = JSON.parse(response("/index.json").body);
  assert.equal(indexConfig.languages.en.policyUrl, baseUrl + "/index-body.json");
  const index = JSON.parse(response("/index-body.json").body).notices[0].content;
  assert.match(index, /English \(Europe\) Privacy Policy/);
  assert.match(index, /href="\/policycenter\/b2c\/en-emea"/);
  const child = response("/policycenter/b2c/en-emea");
  assert.equal(child.status, 301);
  assert.equal(child.headers.location, "/policycenter/b2c/en-emea/");
  assert.match(response(child.headers.location!).body, /\/europe\.json/);
  const notice = response("/europe.json");
  assert.equal(notice.headers["content-type"], "application/json");
  assert.match(JSON.parse(notice.body).notices[0].content, /contractual necessity/);
  assert.match(response("/policycenter/b2c/en-us").body, /Processing Error/);
});

test("delayed, slow-HTML and multilingual fixture cases retain their original data and delays", () => {
  assert.equal(response("/europe.json", { delayedNotice: true }).delayMs, 3000);
  assert.equal(response("/policycenter/b2c/en-emea/", { slowHtml: true }).delayMs, 3200);
  assert.equal(response("/english-body.json", { slowHtml: true }).delayMs, 650);
  assert.equal(response("/europe.json").delayMs, 0);
  assert.match(response("/policycenter/b2c/en-emea/", { multilingual: true }).body, /true, "en-gb"/);
  const config = JSON.parse(response("/europe.json", { multilingual: true }).body);
  assert.equal(config.languages["en-gb"].policyUrl, baseUrl + "/english-body.json");
  assert.equal(response("/wrong-locale.json").status, 404);
});

test("the Nano fixture mock is bounded and uses only supplied deterministic candidates", async () => {
  const options = policyIndexRecoveryFixtureOptions(baseUrl, scanStartedAtMs, true);
  const link = extractCandidates(baseUrl + "/", '<a href="/policycenter/b2c">Privacy Policy</a>', "Privacy Policy")[0]!;
  const eligible = Array.from({ length: 12 }, (_, i) => ({ ...link, candidateId: `candidate_${i}` }));
  const candidates = [
    { ...link, candidateId: "unfetchable", fetchable: false },
    { ...link, candidateId: "observation", observationOnly: true },
    { ...link, candidateId: "low", deterministicScore: 0.49 },
    { ...link, candidateId: "unknown", deterministicSurfaceType: "unknown" as const },
    ...eligible,
  ];
  const input = { assistId: "fixture-assist", pageUrl: baseUrl + "/", candidates };
  const result = await options.nanoAssistProvider!.classifyLinks!(input);
  assert.equal(result.assistId, input.assistId);
  assert.deepEqual(result.rankedCandidates.map(row => row.candidateId), eligible.slice(0, 8).map(row => row.candidateId));
  assert.deepEqual(result.rankedCandidates.map(row => row.priorityRank), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.ok(result.rankedCandidates.every(row => row.confidence === link.deterministicScore));
  assert.deepEqual(await options.nanoAssistProvider!.classifyLinks!(input), result);
});
