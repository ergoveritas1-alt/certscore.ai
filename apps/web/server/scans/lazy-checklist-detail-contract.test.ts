import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const detailRoutePath =
  "apps/web/app/api/scans/[scanId]/report-details/gdpr-eprivacy/route.ts";
const projectionPath = "apps/web/server/scans/scan-report-projection.ts";
const sharedViewPath = "apps/web/components/scans/shared-scan-detail-view.tsx";

test("closed checklist details use a canonical generation-bound lazy read", async () => {
  const [detailRoute, projection, sharedView] = await Promise.all([
    readFile(detailRoutePath, "utf8"),
    readFile(projectionPath, "utf8"),
    readFile(sharedViewPath, "utf8"),
  ]);

  assert.match(sharedView, /presentation=\{checklistPresentation\}/);
  assert.match(sharedView, /lazyChecklistDetailsAvailable/);
  assert.doesNotMatch(sharedView, /items=\{checklistEvidenceTransport\.rows\}/);
  assert.match(detailRoute, /status\.reportGeneration !== generation/);
  assert.match(detailRoute, /getPersistedCanonicalReportProjection/);
  assert.match(detailRoute, /hydrateChecklistPolicyEvidence/);
  assert.match(detailRoute, /reportApiAccessError/);
  assert.match(detailRoute, /private, no-store/);
  assert.doesNotMatch(detailRoute, /public, max-age/);
  assert.match(projection, /COMPLETED_REPORT_CACHE_MAX_ENTRIES = \d+/);
  assert.match(projection, /while \(completedReportProjectionCache.size > COMPLETED_REPORT_CACHE_MAX_ENTRIES\)/);
  assert.match(projection, /primeCompletedReportProjectionCache/);
});
