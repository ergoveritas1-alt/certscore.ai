import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  wc01ShadowDisplaySafeExcerptFixture,
  wc01ShadowProjectionFixture,
  wc01ShadowRowFixture,
  wc01ShadowVendorFixture,
} from "./fixtures/wc01-shadow-fixtures";
import {
  buildWc01V2ShadowInspectionSummary,
  containsBlockedRawFields,
  containsForbiddenGapObservedToken,
  generateWc01V2ShadowBatch,
  generateWc01V2ShadowSingleFromFile,
  parseV2ReportProjectionDraftJson,
  projectV2DraftJsonToWc01Shadow,
  renderWc01V2ShadowInspectionMarkdown,
} from "./wc01-shadow-output";
import { projectV2ToWc01ShadowProjection } from "./wc01-shadow-contract";
import type { V2ProjectionStatus } from "./index";

test("summary includes status, WC01 assessment, vendor, warning, and guardrail counts", () => {
  const shadow = projectV2ToWc01ShadowProjection(wc01ShadowProjectionFixture([
    wc01ShadowRowFixture({
      findingKey: "pre_consent_tracking_detected",
      status: "observed",
      relatedVendors: [wc01ShadowVendorFixture({ purpose: "advertising" })],
    }),
    wc01ShadowRowFixture({
      findingKey: "policy_runtime_vendor_alignment_review_signal",
      status: "review_signal",
      relatedVendors: [wc01ShadowVendorFixture({ purpose: "security" })],
    }),
    wc01ShadowRowFixture({
      findingKey: "privacy_notice_observed_or_not_observed",
      status: "coverage_limitation",
      category: "policy_surface",
      coverageLimitations: [{
        limitationKey: "policy_surface_not_run",
        description: "Policy surface scanner did not run.",
        affectedFindingKeys: ["privacy_notice_observed_or_not_observed"],
        sourceModulesRequired: ["policySurfaceScanner"],
        sourceModulesPresent: [],
      }],
    }),
  ]));
  const summary = buildWc01V2ShadowInspectionSummary(shadow);
  const markdown = renderWc01V2ShadowInspectionMarkdown(summary);

  assert.equal(summary.productionEligible, false);
  assert.equal(summary.rowsByStatus.observed, 1);
  assert.equal(summary.rowsByStatus.review_signal, 1);
  assert.equal(summary.rowsByStatus.coverage_limitation, 1);
  assert.equal(summary.rowsByWc01AssessmentStatus.checked, 1);
  assert.equal(summary.rowsByWc01AssessmentStatus.review_signal, 1);
  assert.equal(summary.rowsByWc01AssessmentStatus.coverage_limitation, 1);
  assert.equal(summary.vendorsByPurpose.advertising, 1);
  assert.equal(summary.vendorsByPurpose.security, 1);
  assert.equal(summary.rowsWithCoverageLimitations.length, 1);
  assert.equal(summary.topFindingEligibleCount, 0);
  assert.equal(summary.gapEligibleCount, 0);
  assert.equal(summary.containsForbiddenGapObservedToken, false);
  assert.equal(summary.containsBlockedRawFields, false);
  assert.match(markdown, /Internal shadow diagnostic only\. Not customer-facing report output\./);
  assert.match(markdown, /topFindingEligible count: 0/);
  assert.match(markdown, /gapEligible count: 0/);
  assert.match(markdown, /no forbidden gap status token appears: true/);
  assert.match(markdown, /no raw blocked fields found: true/);
});

test("projecting draft JSON carries sanitizer warnings but remains shadow-only", () => {
  const projection = wc01ShadowProjectionFixture([
    wc01ShadowRowFixture({
      findingKey: "pre_consent_tracking_detected",
      status: "observed",
      sourceEvidenceRefs: [{
        refId: "ref_AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz112233",
      }],
    }),
  ]);
  const shadow = projectV2DraftJsonToWc01Shadow(JSON.stringify(projection));

  assert.equal(shadow.productionEligible, false);
  assert.ok(shadow.sanitizerWarnings.includes("contains_long_opaque_value_without_redaction_context"));
  assert.equal(shadow.rows.every((row) => row.topFindingEligible === false), true);
  assert.equal(shadow.rows.every((row) => row.gapEligible === false), true);
});

test("projecting saved draft JSON normalizes long source-ref URL path tokens", () => {
  const projection = wc01ShadowProjectionFixture([
    wc01ShadowRowFixture({
      findingKey: "vendors_appear_only_after_accept_review_signal",
      status: "review_signal",
      displaySafeExcerpts: [
        wc01ShadowDisplaySafeExcerptFixture({
          excerptId: "excerpt_airbnb_api",
          sourceEventId: "event_airbnb_api",
          displayValueRedacted: "www.airbnb.com/api/v3/Header/<redacted>",
          hostname: "www.airbnb.com",
          path: "/api/v3/Header/<redacted>",
        }),
        wc01ShadowDisplaySafeExcerptFixture({
          excerptId: "excerpt_safe_url",
          sourceEventId: "event_safe_url",
          displayValueRedacted: "collector.example.test/collect?cid=<redacted>",
          hostname: "collector.example.test",
          path: "/collect",
        }),
        wc01ShadowDisplaySafeExcerptFixture({
          excerptId: "excerpt_greenhouse_sync",
          sourceEventId: "event_greenhouse_sync",
          displayValueRedacted: "ecf.d41.co/sync/3?redacted_param=<redacted>&RampID=<redacted>",
          hostname: "ecf.d41.co",
          path: "/sync/3",
        }),
      ],
      sourceEvidenceRefs: [
        {
          refId: "ref_airbnb_api",
          eventId: "event_airbnb_api",
          url: "https://www.airbnb.com/api/v3/Header/bb590cf8c21b62e4b5122e1cd19969f1f1df72832040a335fd45af52597440e4?currency=USD",
        },
        {
          refId: "ref_safe_url",
          eventId: "event_safe_url",
          url: "https://collector.example.test/collect?cid=raw",
        },
        {
          refId: "ref_greenhouse_sync",
          eventId: "event_greenhouse_sync",
          url: "https://ecf.d41.co/sync/3?6b44172d18624c55a4d068276cff6e94-08c07ec89cef45d29b9dc337a94179ca-1-1515-paapi100=raw&RampID=raw",
          label: "https://ecf.d41.co/sync/3?6b44172d18624c55a4d068276cff6e94-08c07ec89cef45d29b9dc337a94179ca-1-1515-paapi100=raw&RampID=raw",
        },
      ],
    }),
  ]);
  const shadow = projectV2DraftJsonToWc01Shadow(JSON.stringify(projection));
  const summary = buildWc01V2ShadowInspectionSummary(shadow);
  const serialized = JSON.stringify(shadow);

  assert.equal(shadow.rows[0]?.evidence.sourceRefIds.includes("ref_airbnb_api"), true);
  assert.equal(shadow.rows[0]?.evidence.sourceRefIds.includes("ref_safe_url"), true);
  assert.equal(shadow.rows[0]?.evidence.sourceRefIds.includes("ref_greenhouse_sync"), true);
  assert.equal(summary.sanitizerWarnings.includes("contains_long_opaque_value_without_redaction_context"), false);
  assert.equal(summary.containsForbiddenGapObservedToken, false);
  assert.equal(summary.containsBlockedRawFields, false);
  assert.doesNotMatch(serialized, /bb590cf8c21b62e4b5122e1cd19969f1f1df72832040a335fd45af52597440e4/);
  assert.doesNotMatch(serialized, /cid=raw/);
  assert.doesNotMatch(serialized, /6b44172d18624c55a4d068276cff6e94-08c07ec89cef45d29b9dc337a94179ca/);
});

test("projecting saved draft JSON normalizes hashed asset names and opaque cookie names in display-safe excerpts", () => {
  const posthogCookieName = "ph_phc_q2wUqNSr9AsKvH56PBbg9RX5dGKypQZi1gxk3cuSXJ5_posthog";
  const hashedFontName = "NeulisSans-Medium-4ca240848423fd06f1154500dc217a3e";
  const projection = wc01ShadowProjectionFixture([
    wc01ShadowRowFixture({
      findingKey: "third_party_cookie_pre_consent",
      status: "observed",
      displaySafeExcerpts: [
        wc01ShadowDisplaySafeExcerptFixture({
          excerptId: "excerpt_posthog_cookie",
          evidenceKind: "cookie_sent",
          displayValueRedacted: `${posthogCookieName}=[redacted]`,
          cookieNames: [posthogCookieName],
        }),
        wc01ShadowDisplaySafeExcerptFixture({
          excerptId: "excerpt_hashed_font",
          displayValueRedacted: `www.fullstory.com/static/${hashedFontName}.woff2`,
          hostname: "www.fullstory.com",
          path: `/static/${hashedFontName}.woff2`,
        }),
      ],
    }),
  ]);
  projection.rows[0]!.evidencePacket.displaySafeExcerptStats.representativeGroupKeys = [
    `cookie_sent|consent_flow_runtime|baseline_pre_consent|pre_consent|supabase.com|/|vendor_840b3e05|${posthogCookieName}`,
  ];

  const shadow = projectV2DraftJsonToWc01Shadow(JSON.stringify(projection));
  const summary = buildWc01V2ShadowInspectionSummary(shadow);
  const serialized = JSON.stringify(shadow);
  const excerpts = shadow.rows[0]?.evidence.displaySafeExcerpts ?? [];

  assert.equal(summary.sanitizerWarnings.includes("contains_long_opaque_value_without_redaction_context"), false);
  assert.equal(excerpts[0]?.displayValueRedacted, "redacted_cookie_name=[redacted]");
  assert.deepEqual(excerpts[0]?.cookieNames, ["redacted_cookie_name"]);
  assert.equal(excerpts[1]?.displayValueRedacted, "www.fullstory.com/static/<redacted>.woff2");
  assert.equal(excerpts[1]?.path, "/static/<redacted>.woff2");
  assert.doesNotMatch(serialized, new RegExp(posthogCookieName));
  assert.doesNotMatch(serialized, new RegExp(hashedFontName));
});

test("unsupported projection statuses fail closed in JSON helper", () => {
  const projection = wc01ShadowProjectionFixture([
    wc01ShadowRowFixture({
      findingKey: "unsupported_status_fixture",
      status: "gap_observed" as V2ProjectionStatus,
    }),
  ]);
  const shadow = projectV2DraftJsonToWc01Shadow(JSON.stringify(projection));
  const row = shadow.rows[0];

  assert.equal(row?.status, "coverage_limitation");
  assert.equal(row?.wc01AssessmentStatus, "coverage_limitation");
  assert.equal(containsForbiddenGapObservedToken(shadow), false);
});

test("bad projection JSON fails validation", () => {
  assert.throws(
    () => parseV2ReportProjectionDraftJson(JSON.stringify({ projectionVersion: "fixture" })),
    /missing required field: scanId/i,
  );
  assert.throws(
    () => parseV2ReportProjectionDraftJson(JSON.stringify({
      projectionVersion: "fixture",
      scanId: "scan",
      url: "https://example.test",
      rows: {},
      coverageLimitations: [],
    })),
    /rows must be an array/i,
  );
});

test("raw blocked fields are not included in shadow output", () => {
  const rawExcerpt = {
    ...wc01ShadowDisplaySafeExcerptFixture({
      displayValueRedacted: "https://collector.example/path?fbclid=raw-click-id",
    }),
    requestBody: "raw body",
    responseBody: "raw response",
    setCookieHeaders: ["raw cookie"],
    rawNanoReasoning: "raw nano reasoning",
  };
  const shadow = projectV2ToWc01ShadowProjection(wc01ShadowProjectionFixture([
    wc01ShadowRowFixture({
      findingKey: "pre_consent_tracking_detected",
      status: "observed",
      displaySafeExcerpts: [rawExcerpt],
    }),
  ]));

  assert.equal(containsBlockedRawFields(shadow), false);
  assert.doesNotMatch(JSON.stringify(shadow), /raw body|raw response|raw cookie|raw nano reasoning|raw-click-id/);
});

test("single-file generator writes JSON and markdown artifacts", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "wc01-shadow-single-"));
  try {
    const projectionPath = join(tempDir, "V2ReportProjectionDraft.json");
    const outPath = join(tempDir, "out", "Wc01V2ShadowProjection.json");
    const projection = wc01ShadowProjectionFixture([
      wc01ShadowRowFixture({ findingKey: "pre_consent_tracking_detected", status: "observed" }),
    ]);
    await writeFile(projectionPath, JSON.stringify(projection), "utf8");

    const result = await generateWc01V2ShadowSingleFromFile({ projectionPath, outPath });
    const output = JSON.parse(await readFile(outPath, "utf8")) as unknown;
    const markdown = await readFile(result.summaryPath!, "utf8");

    assert.equal(result.summary.productionEligible, false);
    assert.equal(containsForbiddenGapObservedToken(output), false);
    assert.match(markdown, /Internal shadow diagnostic only/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("batch generator writes per-site artifacts and aggregate summaries", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "wc01-shadow-batch-"));
  try {
    const projectionDir = join(tempDir, "projections");
    const outDir = join(tempDir, "out");
    await writeFixtureProjection(join(projectionDir, "site-a", "V2ReportProjectionDraft.json"), [
      wc01ShadowRowFixture({
        findingKey: "pre_consent_tracking_detected",
        status: "observed",
        relatedVendors: [wc01ShadowVendorFixture({ purpose: "advertising" })],
      }),
      wc01ShadowRowFixture({
        findingKey: "reject_action_succeeded_or_not_testable",
        status: "not_testable",
        category: "consent_flow",
      }),
    ]);
    await writeFixtureProjection(join(projectionDir, "nested", "site-b", "V2ReportProjectionDraft.json"), [
      wc01ShadowRowFixture({
        findingKey: "policy_runtime_vendor_alignment_review_signal",
        status: "review_signal",
        category: "policy_surface",
        relatedVendors: [wc01ShadowVendorFixture({ purpose: "security" })],
      }),
      wc01ShadowRowFixture({
        findingKey: "privacy_notice_observed_or_not_observed",
        status: "coverage_limitation",
        category: "policy_surface",
        coverageLimitations: [{
          limitationKey: "policy_surface_not_run",
          description: "Policy surface scanner did not run.",
          affectedFindingKeys: ["privacy_notice_observed_or_not_observed"],
          sourceModulesRequired: ["policySurfaceScanner"],
          sourceModulesPresent: [],
        }],
      }),
    ]);

    const summary = await generateWc01V2ShadowBatch({ projectionDir, outDir });
    const aggregateJson = JSON.parse(await readFile(join(outDir, "wc01-shadow-batch-summary.json"), "utf8")) as typeof summary;
    const aggregateMarkdown = await readFile(join(outDir, "wc01-shadow-batch-summary.md"), "utf8");

    assert.equal(summary.totalProjectionFilesFound, 2);
    assert.equal(summary.succeededCount, 2);
    assert.equal(summary.failedCount, 0);
    assert.equal(summary.totalRowCount, 4);
    assert.equal(summary.rowsByStatus.observed, 1);
    assert.equal(summary.rowsByStatus.review_signal, 1);
    assert.equal(summary.rowsByStatus.coverage_limitation, 1);
    assert.equal(summary.rowsByStatus.not_testable, 1);
    assert.equal(summary.vendorPurposeCounts.advertising, 1);
    assert.equal(summary.vendorPurposeCounts.security, 1);
    assert.deepEqual(summary.sitesWithNotTestableRows, ["site-a"]);
    assert.deepEqual(summary.sitesWithCoverageLimitations, ["nested/site-b"]);
    assert.equal(summary.productionEligibleTrueCount, 0);
    assert.equal(summary.topFindingEligibleCount, 0);
    assert.equal(summary.gapEligibleCount, 0);
    assert.equal(summary.forbiddenGapStatusTokenPresenceCount, 0);
    assert.equal(summary.rawBlockedFieldsPresenceCount, 0);
    assert.equal(aggregateJson.totalProjectionFilesFound, 2);
    assert.match(aggregateMarkdown, /WC01 v2 Shadow Batch Summary/);
    assert.match(await readFile(join(outDir, "site-a", "Wc01V2ShadowProjection.summary.md"), "utf8"), /Source URL/);
    assert.match(
      await readFile(join(outDir, "nested", "site-b", "Wc01V2ShadowProjection.json"), "utf8"),
      /wc01\.v2_shadow_projection\.1/,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("batch generator continues on malformed projection and reports guardrail warnings", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "wc01-shadow-batch-failure-"));
  try {
    const projectionDir = join(tempDir, "projections");
    const outDir = join(tempDir, "out");
    await writeFixtureProjection(join(projectionDir, "good", "V2ReportProjectionDraft.json"), [
      wc01ShadowRowFixture({
        findingKey: "unsupported_status_fixture",
        status: "gap_observed" as V2ProjectionStatus,
      }),
    ]);
    await mkdir(join(projectionDir, "bad"), { recursive: true });
    await writeFile(
      join(projectionDir, "bad", "V2ReportProjectionDraft.json"),
      JSON.stringify({ projectionVersion: "fixture" }),
      "utf8",
    );

    const summary = await generateWc01V2ShadowBatch({ projectionDir, outDir });

    assert.equal(summary.totalProjectionFilesFound, 2);
    assert.equal(summary.succeededCount, 1);
    assert.equal(summary.failedCount, 1);
    assert.equal(summary.failures[0]?.siteKey, "bad");
    assert.match(summary.failures[0]?.errorMessage ?? "", /missing required field/i);
    assert.equal(summary.disallowedStatusWarningCount, 1);
    assert.equal(summary.unsupportedStatusCount, 0);
    assert.equal(summary.guardrailFailures.length, 1);
    assert.deepEqual(summary.guardrailFailures[0], {
      siteKey: "good",
      failures: ["disallowed_status_warning"],
    });
    assert.equal(containsForbiddenGapObservedToken(summary), false);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

async function writeFixtureProjection(
  path: string,
  rows: ReturnType<typeof wc01ShadowRowFixture>[],
) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(wc01ShadowProjectionFixture(rows)), "utf8");
}
