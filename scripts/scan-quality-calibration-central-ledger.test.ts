import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = "packages/db/migrations/0142_scan_domain_contact_ledger.sql";

test("central contact migration captures every scan at the shared scans boundary", async () => {
  const source = await readFile(migrationPath, "utf8");
  assert.match(source, /create table if not exists public\.scan_domain_contacts/);
  assert.match(source, /after insert on public\.scans/);
  assert.match(source, /after update of status, started_at on public\.scans/);
  assert.match(source, /from public\.scans s\s+join public\.domains d/s);
  assert.match(source, /on conflict \(scan_id\) do nothing/);
});

test("central contact migration projects no-go outcomes and preserves manual state", async () => {
  const source = await readFile(migrationPath, "utf8");
  assert.match(source, /after insert on public\.scan_snapshots/);
  assert.match(source, /after update of blocked_flag, captcha_flag, scan_outcome, stop_reason_code/);
  assert.match(source, /when consecutive_no_go >= 2 then 'do_not_calibrate'/);
  assert.match(source, /coalesce\(manual_state, automatic_state\)/);
  assert.match(source, /on conflict \(normalized_domain\) do update/);
});

test("live calibration workflow fails closed on central history and persists contacts", async () => {
  const source = await readFile(".github/workflows/wc01-v2-scan-lab-cohort.yml", "utf8");
  assert.match(source, /PROD_DATABASE_URL/);
  assert.match(source, /v2:calibration-ledger-export/);
  assert.match(source, /effective-eligibility-ledger\.json/);
  assert.match(source, /v2:calibration-contact-persist/);
  assert.doesNotMatch(source, /^\s+schedule:/m);
});
