import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Admin scan evidence matrix is published once from the canonical checklist and persisted", async () => {
  const summary = await readFile("apps/web/server/admin/admin-scan-summary.ts", "utf8");
  const repository = await readFile("apps/web/server/admin/repository.ts", "utf8");
  const migration = await readFile("packages/db/migrations/0167_scan_snapshot_admin_evidence_matrix.sql", "utf8");

  assert.match(summary, /detail: "evidence"/);
  assert.match(summary, /gdprEprivacyChecklistRows/);
  assert.match(summary, /surfacedResults\?\.gdprEprivacyFindings/);
  assert.match(summary, /projectAdminEvidenceMatrix\(\{/);
  assert.match(summary, /sourceProjectionVersion: recordString\(snapshot, "report_projection_version"\)/);
  assert.match(repository, /admin_evidence_matrix = excluded\.admin_evidence_matrix/);
  assert.match(migration, /add column if not exists admin_evidence_matrix jsonb/);
});

test("Admin scan list reads the bounded matrix without report reconstruction or scalar display fallbacks", async () => {
  const list = await readFile("apps/web/server/admin/list-admin-scans.ts", "utf8");
  const page = await readFile("apps/web/app/app/admin/scans/page.tsx", "utf8");

  assert.match(list, /parseAdminEvidenceMatrix\(overviewSnapshot\?\.admin_evidence_matrix\)/);
  assert.doesNotMatch(list, /buildPulseProjection|publishCanonicalScanReportProjection|materializeAdminScanSummar/);
  assert.match(page, /scan\.evidenceMatrix/);
  assert.match(page, /policyEvidence=\{matrix\?\.policyEvidence\}/);
  assert.doesNotMatch(page, /scan\.privacyPolicyPresent|scan\.consentAro|scan\.cmpVendorName/);
  assert.match(page, /\{ label: "Transparency" \}, \{ label: "Transport" \}, \{ label: "Runtime" \}/);
});
