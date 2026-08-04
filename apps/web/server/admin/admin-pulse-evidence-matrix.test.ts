import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("API Activity reads the persisted admin evidence matrix and scanner egress with the linked scan", async () => {
  const list = await readFile("apps/web/server/admin/list-pulse-requests.ts", "utf8");

  assert.match(list, /parseAdminEvidenceMatrix\(row\.admin_evidence_matrix\)/);
  assert.match(list, /ss\.admin_evidence_matrix/);
  assert.match(list, /s\.egress_id as scanner_egress_id/);
  assert.match(list, /scannerEgressId: shouldUseLocalV2DagScanTool\(\)/);
});

test("API Activity keeps the compact detail columns projection-backed", async () => {
  const page = await readFile("apps/web/app/app/admin/pulse/page.tsx", "utf8");

  assert.match(page, /formatRequestedDateTime/);
  assert.match(page, /requestedDateTime\.date/);
  assert.match(page, /requestedDateTime\.time/);
  assert.match(page, /request\.evidenceMatrix/);
  assert.match(page, /policyEvidence=\{matrix\?\.policyEvidence\}/);
  assert.match(page, /\{ label: "Transparency" \}/);
  assert.match(page, /\{ label: "Transport" \}/);
  assert.match(page, /\{ label: "Runtime" \}/);
  assert.match(page, /\{ label: "Scan ID" \}/);
  assert.match(page, /\{ label: "Scanner egress" \}/);
  assert.doesNotMatch(page, /request\.privacyPolicyPresent/);
  assert.doesNotMatch(page, /request\.consentAro/);
});
