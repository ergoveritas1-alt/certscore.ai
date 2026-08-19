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
  assert.match(detailRoute, /public, max-age=31536000, immutable/);
  assert.match(projection, /COMPLETED_REPORT_CACHE_MAX_ENTRIES = 8/);
  assert.match(projection, /primeCompletedReportProjectionCache/);
});
