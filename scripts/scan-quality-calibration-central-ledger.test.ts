import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { extractMarkedOutput, hasCompleteMarkedOutput } from "./lib/prod-db-psql-oneoff.js";
import {
  createEmptyCalibrationLedger,
  recordCalibrationOutcomes,
} from "./lib/scan-quality-calibration-ledger.js";

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
  assert.match(source, /aws-actions\/configure-aws-credentials@v6/);
  assert.match(source, /AWS_ROLE_TO_ASSUME/);
  assert.doesNotMatch(source, /PROD_DATABASE_URL/);
  assert.match(source, /v2:calibration-ledger-export/);
  assert.match(source, /--ecs-oneoff/);
  assert.match(source, /effective-eligibility-ledger\.json/);
  assert.match(source, /v2:calibration-contact-persist/);
  assert.match(source, /pnpm --filter @certscore\/scan-core build/);
  assert.match(source, /artifacts\/v2-calibration-\*/);
  assert.doesNotMatch(source, /^\s+schedule:/m);
});

test("production DB log polling requires both output markers", () => {
  assert.equal(hasCompleteMarkedOutput("__TEST_START__\n", "TEST"), false);
  assert.equal(hasCompleteMarkedOutput("__TEST_START__\nrow\n__TEST_END__", "TEST"), true);
  assert.equal(extractMarkedOutput("__TEST_START__\n__TEST_END__", "TEST"), "");
});

test("pre-runtime infrastructure failures do not consume calibration cooldown", () => {
  const ledger = recordCalibrationOutcomes({
    ledger: createEmptyCalibrationLedger(),
    minimumCooldownDays: 30,
    now: new Date("2026-07-17T19:00:00.000Z"),
    summary: {
      results: [{
        completedAt: "2026-07-17T18:57:26.481Z",
        scannerRuntimeStarted: false,
        status: "failed",
        url: "https://ftc.gov",
      }],
    },
    targetUrls: new Set(["https://ftc.gov"]),
  });
  assert.deepEqual(ledger.entries, {});
});

test("started scanner runtimes consume calibration cooldown even when the scan fails", () => {
  const ledger = recordCalibrationOutcomes({
    ledger: createEmptyCalibrationLedger(),
    minimumCooldownDays: 30,
    now: new Date("2026-07-17T19:00:00.000Z"),
    summary: {
      results: [{
        completedAt: "2026-07-17T18:57:26.481Z",
        scannerRuntimeStarted: true,
        status: "failed",
        url: "https://ftc.gov",
      }],
    },
    targetUrls: new Set(["https://ftc.gov"]),
  });
  assert.equal(ledger.entries["https://ftc.gov"]?.state, "cooldown");
  assert.equal(ledger.entries["https://ftc.gov"]?.lastOutcome, "failed");
});

test("central ledger scripts use the production ECS psql one-off boundary", async () => {
  const helper = await readFile("scripts/lib/prod-db-psql-oneoff.ts", "utf8");
  const exporter = await readFile("scripts/export-scan-quality-calibration-ledger.ts", "utf8");
  const persister = await readFile("scripts/persist-scan-quality-calibration-contacts.ts", "utf8");
  assert.match(helper, /certscore-prod-psql-oneoff:1/);
  assert.match(helper, /begin transaction read only/);
  assert.match(helper, /PGSSLMODE/);
  assert.match(exporter, /--ecs-oneoff/);
  assert.match(exporter, /runProdDbSqlOneoff/);
  assert.match(persister, /--ecs-oneoff/);
  assert.match(persister, /runProdDbSqlOneoff/);
  assert.match(persister, /chunk\(contactRows, 8\)/);
  assert.match(persister, /CALIBRATION_CONTACT_PERSIST_\$\{index \+ 1\}/);
});
