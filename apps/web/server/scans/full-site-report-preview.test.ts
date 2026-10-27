import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { FULL_SITE_CONDITION, FULL_SITE_CONTRACT } from "@website-signal-risk-scanner/shared";

const scanId = "10000000-0000-4000-8000-000000000001";
const pageId = "20000000-0000-4000-8000-000000000001";
const input = () => ({
  crawl: { scan_id: scanId, status: "completed", configuration_hash: "a".repeat(64), policy_json: {},
    requested_json: { maxPages: 500, concurrency: 3, waitSeconds: 5 }, effective_concurrency: 3, effective_wait_seconds: 5,
    region: "eu-central-1", started_at: "2026-10-01T00:00:00Z", completed_at: "2026-10-01T00:30:00Z", robots_json: null, hosts: ["example.com"] },
  pages: [{ id: pageId, target_url: "https://example.com/", final_url: null, source: "homepage", discovery_count: 1, discovery_sources: [],
    selection_reason: "homepage", status: "completed", limitation: null, attempt_count: 1,
    compact_json: { contractVersion: FULL_SITE_CONTRACT, parentScanId: scanId, pageJobId: pageId, attemptId: "30000000-0000-4000-8000-000000000001",
      executionProfile: "homepage_baseline", condition: FULL_SITE_CONDITION, configurationHash: "a".repeat(64), requestedUrl: "https://example.com/", finalUrl: null,
      startedAt: "2026-10-01T00:00:00Z", completedAt: "2026-10-01T00:00:10Z", status: "completed", limitations: [], sourceHash: "b".repeat(64),
      occurrences: [{ id: "request-1", kind: "request", identity: "request-1", label: "https://consent.cookiebot.com/uc.js", vendor: "Cookiebot", domain: "consent.cookiebot.com",
        serviceId: null, purpose: "unknown", resourceType: "script", relationship: "third_party", confidence: "unknown", assessment: "Not assessed", eventCount: 4,
        firstSeenMs: 100, evidenceRefs: ["request-1"], details: {} }], links: [], redirects: [], httpStatus: 200, retryAfterSeconds: null, failureKind: null } },
    { id: "20000000-0000-4000-8000-000000000002", target_url: "https://example.com/failed", final_url: null, source: "rendered_page", discovery_count: 1, discovery_sources: [],
      selection_reason: "link", status: "failed", limitation: "worker_lease_expired", attempt_count: 2, compact_json: null }],
  score: { value: 77, version: "retained-policy", scoredPages: 1, limitedPages: 1, scope: "retained", priorityReview: [{
    id: "retained-finding", rank: 1, title: "Retained finding", summary: "Verified evidence", status: "Potential gap", evidence: ["Proof"], evidenceJson: { binding: "retained" }, correctionSteps: [], pages: [],
  }], assessedNonEssentialStorage: 0, assessedStorageRecords: [], sources: [], evidencePages: [{ rows: [], retained: "x".repeat(1_000_000) }],
    siteIntegrity: { findings: [], coverage: [{ pageId, url: "https://example.com/", homepage: true, status: "captured", retainedLinkCount: 0 }] } },
});

test("prepared first view preserves report facts, skips supporting reads, survives cold modules and rejects changed sources", async () => {
  const directory = await mkdtemp(resolve("apps/web/.report-preview-test-"));
  const fixture = { ...input(), source: "source-a", reads: 0, policies: 0, graphs: 0, incomplete: false, cache: new Map<string, unknown>() };
  const globals = globalThis as typeof globalThis & { reportPreviewFixture?: typeof fixture };
  globals.reportPreviewFixture = fixture;
  try {
    const output = join(directory, "report.cjs");
    await build({ entryPoints: [resolve("apps/web/server/scans/full-site-report.ts")], outfile: output, bundle: true, platform: "node", format: "cjs", packages: "external",
      plugins: [{ name: "fixture", setup(builder) {
        const fixtures: Record<string, string> = {
          "server-only": "",
          "@website-signal-risk-scanner/db": `export async function loadFullSiteCrawl(){return globalThis.reportPreviewFixture.crawl;}
            export async function loadFullSitePages(){globalThis.reportPreviewFixture.reads++;await new Promise(r=>setTimeout(r,5));return globalThis.reportPreviewFixture.pages;}
            export async function query(){return {rows:[]};}`,
          "./full-site-score": `export async function loadFullSiteScore(c,p,options){if(globalThis.reportPreviewFixture.incomplete)options?.onIncompleteEvidence?.();return globalThis.reportPreviewFixture.score;}`,
          "./full-site-reviewed-policies": `export async function loadFullSiteReviewedPolicies(){globalThis.reportPreviewFixture.policies++;return [];}`,
          "./full-site-relationship-counts": `export async function loadFullSiteRelationshipCounts(){globalThis.reportPreviewFixture.graphs++;return new Map();}`,
          "./full-site-report-cache": `export function isDefaultFullSiteReport(){return false;} export async function fullSiteReportSourceKey(){return globalThis.reportPreviewFixture.source;}
            export async function readFullSiteReportCache(id,key){return globalThis.reportPreviewFixture.cache.get(key);}
            export async function writeFullSiteReportCache(id,key,data){globalThis.reportPreviewFixture.cache.set(key,JSON.parse(JSON.stringify(data)));return true;}`,
        };
        builder.onResolve({filter:/.*/}, args => args.path in fixtures ? {path:args.path,namespace:"fixture"} : undefined);
        builder.onLoad({filter:/.*/,namespace:"fixture"}, args => ({contents:fixtures[args.path]!,loader:"js"}));
      }}] });
    const require = createRequire(import.meta.url);
    let module = require(output);
    const [preview, duplicate] = await Promise.all([module.loadFullSiteReportPreview(scanId), module.loadFullSiteReportPreview(scanId)]);
    assert.deepEqual(preview, duplicate);
    assert.equal(fixture.reads, 1, "concurrent overview readers join one build");
    assert.equal(fixture.policies, 0); assert.equal(fixture.graphs, 0);
    assert.deepEqual(preview.score.priorityReview, fixture.score.priorityReview, "keep evidence needed by California editorial selection");
    assert.equal(preview.score.value, 77); assert.equal(preview.score.evidencePages, undefined);
    assert.equal(preview.score.assessedStorageRecords, undefined);
    assert.equal(preview.failedPages[0].limitation, "worker_lease_expired");
    assert.deepEqual(preview.hiddenLinks, { count: 0, pages: 1, lowerBound: false });
    delete require.cache[output]; module = require(output);
    assert.deepEqual(await module.loadFullSiteReportPreview(scanId), JSON.parse(JSON.stringify(preview)));
    assert.equal(fixture.reads, 1, "first open on a cold web process uses completion's prepared view");
    const full = await module.loadFullSiteReport(scanId, new URLSearchParams("kind=all"));
    assert.deepEqual(preview.summary, full.summary);
    assert.deepEqual(preview.networkOverview, full.networkOverview);
    assert.deepEqual(preview.coverage, full.coverage);
    assert.deepEqual(preview.timing, full.timing);
    assert.equal(preview.forms.count, full.collectionSurfaces.rows.length);
    assert.equal(preview.forms.limited, Boolean(full.collectionSurfaces.limitedPages || full.collectionSurfaces.pagesWithoutInventory));
    assert.deepEqual(preview.score.priorityReview, full.score.priorityReview);
    assert.ok(JSON.stringify(preview).length < JSON.stringify(full).length / 10, "bulk evidence is not transferred in the first view");
    fixture.source = "source-b";
    fixture.incomplete = true;
    assert.equal((await module.loadFullSiteReportPreview(scanId)).cacheable, false);
    assert.equal(fixture.cache.has("source-b:overview.v1"), false, "temporary evidence failures must not become durable results");
    fixture.incomplete = false;
    await module.loadFullSiteReportPreview(scanId);
    assert.equal(fixture.cache.has("source-b:overview.v1"), true);
  } finally { delete globals.reportPreviewFixture; await rm(directory, {recursive:true,force:true}); }
});
