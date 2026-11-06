import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "pg";
import { recordScanCaptureLimitation } from "./scan-capture-limitation";

// This test uses session-local temporary tables only. Set the URL to an isolated
// local PostgreSQL instance; never use a production connection for tests.
test("capture no-go persistence supports anonymous scans and rejects stale or successful results", {
  skip: !process.env.CAPTURE_LIMITATION_TEST_DATABASE_URL,
}, async () => {
  const client = new Client({ connectionString: process.env.CAPTURE_LIMITATION_TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query(`create temporary table scans (
      id text primary key, organization_id text, domain_id text, pages_requested int,
      status text, scan_config_json jsonb
    ); create temporary table scan_snapshots (
      scan_id text primary key, organization_id text, domain_id text, pages_requested int,
      pages_scanned int, coverage_level text, homepage_fetch_status text, scan_outcome text,
      stop_reason_code text, stop_reason_label text, stop_reason_detail text,
      scan_no_go_assessment jsonb, score_scored_at timestamptz
    )`);
    const completedAt = "2026-11-06T00:57:26.558Z";
    const input = {
      scanId: "anonymous", completedAt,
      assessment: { decision: "no_go", reasonCodes: ["runtime_capture_unverified"] },
      presentation: { snapshotScanOutcome: "homepage_runtime_capture_unverified", snapshotHomepageFetchStatus: "capture_failed",
        snapshotStopReasonCode: "homepage_runtime_capture_unverified",
        snapshotStopReasonLabel: "Starting-page capture incomplete", snapshotStopReasonDetail: "Capture limitation." },
    };
    const execute = (sql: string, values: unknown[]) => client.query(sql, values);
    for (const [id, status] of [["anonymous", "failed"], ["successful", "completed"], ["scored", "failed"], ["existing-no-go", "failed"]]) {
      await client.query("insert into scans values ($1, null, 'domain', 1, $2, $3)",
        [id, status, { execution: { v2DagLambda: { completedAt } } }]);
    }
    await recordScanCaptureLimitation({ ...input, completedAt: "2026-11-06T00:56:00Z" }, execute);
    assert.equal((await client.query("select * from scan_snapshots")).rowCount, 0, "stale result ignored");
    await recordScanCaptureLimitation({ ...input, scanId: "successful" }, execute);
    assert.equal((await client.query("select * from scan_snapshots")).rowCount, 0, "completed scan preserved");
    await recordScanCaptureLimitation(input, execute);
    await recordScanCaptureLimitation(input, execute);
    const rows = (await client.query("select * from scan_snapshots")).rows;
    assert.equal(rows.length, 1, "duplicate delivery is idempotent");
    assert.equal(rows[0].organization_id, null);
    assert.equal(rows[0].scan_no_go_assessment.decision, "no_go");
    assert.equal(rows[0].pages_scanned, 0);
    assert.equal(rows[0].score_scored_at, null);
    assert.equal(rows[0].stop_reason_label, "Starting-page capture incomplete");
    await client.query("insert into scan_snapshots (scan_id,pages_scanned,score_scored_at) values ('scored',1,now())");
    await client.query("insert into scan_snapshots (scan_id,pages_scanned,scan_no_go_assessment) values ('existing-no-go',0,$1)",
      [{ decision: "no_go", reasonCodes: ["authentication_required"] }]);
    await recordScanCaptureLimitation({ ...input, scanId: "scored" }, execute);
    await recordScanCaptureLimitation({ ...input, scanId: "existing-no-go" }, execute);
    assert.equal((await client.query("select pages_scanned from scan_snapshots where scan_id='scored'")).rows[0].pages_scanned, 1);
    assert.deepEqual((await client.query("select scan_no_go_assessment from scan_snapshots where scan_id='existing-no-go'")).rows[0].scan_no_go_assessment.reasonCodes, ["authentication_required"]);
    assert.equal((await client.query("select status from scans where id='anonymous'")).rows[0].status, "failed");
  } finally { await client.end(); }
});
