import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Pool } from "pg";
import { withNonBlockingDatabaseLock } from "../packages/db/src/non-blocking-lock";

const databaseUrl = process.env.CERTSCORE_FINALIZATION_TEST_DATABASE_URL;

test("independent publishers and early-policy handoffs converge on one terminal pass", {
  skip: !databaseUrl,
}, async () => {
  const url = new URL(databaseUrl!);
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.pathname, "/certscore_finalization_test");
  const firstPool = new Pool({ connectionString: databaseUrl, max: 3 });
  const secondPool = new Pool({ connectionString: databaseUrl, max: 3 });
  try {
    await firstPool.query(`
      drop table if exists public.scan_events, public.nano_signal_work_items;
      create table public.scan_events (
        scan_id uuid, event_type text, metadata_json jsonb, created_at timestamptz default now()
      );
      create table public.nano_signal_work_items (
        scan_id uuid primary key, requested_at timestamptz, not_before timestamptz,
        poll_count integer, recovered boolean, recovery_mode text, updated_at timestamptz
      );
    `);
    await firstPool.query(await readFile("packages/db/migrations/0189_policy_projection_reprojection.sql", "utf8"));
    await firstPool.query(await readFile("packages/db/migrations/0208_single_terminal_policy_projection.sql", "utf8"));
    const scanId = "00000000-0000-4000-8000-000000000123";
    const append = (type: string, metadata: object = {}) => firstPool.query(
      "insert into public.scan_events(scan_id,event_type,metadata_json) values($1,$2,$3)",
      [scanId, type, metadata],
    );
    await append("signals.nano_doc_enrichment_requested");
    for (let i = 0; i < 2; i += 1) await append("v2_policy_evidence.received", {
      terminalProjectionPolicy: "completed_early_review_only.v1",
    });
    assert.equal((await firstPool.query("select count(*)::int as count from nano_signal_work_items")).rows[0].count, 1);
    assert.equal((await firstPool.query("select recovery_mode from nano_signal_work_items")).rows[0].recovery_mode, null);

    let builds = 0;
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const first = withNonBlockingDatabaseLock(`canonical-report-publication:${scanId}`, async () => {
      builds += 1;
      entered();
      await gate;
      return "ready";
    }, () => firstPool.connect());
    await started;
    const second = await withNonBlockingDatabaseLock(`canonical-report-publication:${scanId}`, async () => {
      builds += 1;
    }, () => secondPool.connect());
    assert.deepEqual(second, { acquired: false });
    release();
    assert.deepEqual(await first, { acquired: true, value: "ready" });
    assert.equal(builds, 1);
    assert.equal((await withNonBlockingDatabaseLock(`canonical-report-publication:${scanId}`, async () => "reused", () => secondPool.connect())).acquired, true);

    await append("signals.nano_doc_enrichment_completed");
    await append("v2_policy_evidence.received", { terminalProjectionPolicy: "completed_early_review_only.v1" });
    assert.equal((await firstPool.query("select count(*)::int as count from nano_signal_work_items")).rows[0].count, 0,
      "late policy completion must not reopen a terminal scan");
    await append("browser_extension.observed_signals_ingested");
    assert.equal((await firstPool.query("select recovery_mode from nano_signal_work_items")).rows[0].recovery_mode,
      "browser_extension_signal_reprojection", "changed verified evidence must retain its recovery path");
    await append("signals.nano_doc_enrichment_completed");
    await append("v2_policy_evidence.received");
    assert.equal((await firstPool.query("select recovery_mode from nano_signal_work_items")).rows[0].recovery_mode,
      "policy_projection_reprojection", "legacy policy processing must remain compatible");
  } finally {
    await Promise.all([firstPool.end(), secondPool.end()]);
  }
});
