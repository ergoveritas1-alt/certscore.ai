import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { reportAwareScanStatusSql } from "./scan-report-publication-sql";
import { SCAN_REPORT_PROJECTION_VERSION } from "./scan-report-projection-contract";
import { LOCAL_V2_DAG_SCAN_PROCESSOR } from "./local-v2-dag-scan-config";

const require = createRequire(new URL("../../../../packages/db/package.json", import.meta.url));
const { Client } = require("pg") as typeof import("pg");
const databaseUrl = process.env.ADMIN_ACTIVITY_TEST_DATABASE_URL;

test("Admin SQL never counts an unpublished canonical report as completed and preserves legacy reports", { skip: !databaseUrl }, async () => {
  assert.match(databaseUrl!, /(?:localhost|127\.0\.0\.1|^postgresql:\/\/\/)/);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const ready = {
    report_projection_status: "ready", report_projection_version: SCAN_REPORT_PROJECTION_VERSION,
    report_projection_computed_at: "2026-10-31T21:00Z", report_projection_source_hash: "a".repeat(64),
    report_projection_payload: {}, report_projection_payload_sha256: "b".repeat(64), report_projection_payload_size_bytes: 10,
  };
  const fixture = (id: string, overrides: Record<string, unknown> = {}) => ({ id, status: "completed",
    scan_config_json: { processor: LOCAL_V2_DAG_SCAN_PROCESSOR }, publication_status: "completed", snapshot: ready, ...overrides });
  const rows = [
    fixture("wesco", { publication_status: "terminal_failure", snapshot: null }),
    fixture("stale-ready-terminal", { publication_status: "terminal_failure" }),
    fixture("pending", { publication_status: "pending", snapshot: null }),
    fixture("ready"),
    fixture("bad-hash", { snapshot: { ...ready, report_projection_payload_sha256: "invalid" } }),
    fixture("missing-payload", { snapshot: { ...ready, report_projection_payload: null } }),
    fixture("failed-projection", { snapshot: { ...ready, report_projection_status: "failed" } }),
    fixture("old-readable", { snapshot: { ...ready, report_projection_version: "scan-report-projection-v24" } }),
    fixture("legacy", { scan_config_json: {}, publication_status: null, snapshot: null }),
    fixture("raw-failed", { status: "failed" }),
    fixture("running", { status: "running", publication_status: "pending", snapshot: null }),
    fixture("event-bound", { scan_config_json: {}, publication_status: null, snapshot: null }),
  ];
  try {
    await client.query("begin");
    await client.query("create temp table fixture_events(scan_id text,event_type text)");
    await client.query("insert into fixture_events values ('event-bound','v2_lambda_result.received')");
    const expression = reportAwareScanStatusSql("s", "ss", "publication_request").replaceAll("public.scan_events", "fixture_events");
    const result = await client.query(`select s.id, ${expression} as status
      from jsonb_to_recordset($1::jsonb) as s(id text,status text,scan_config_json jsonb,publication_status text,snapshot jsonb)
      left join lateral jsonb_to_record(s.snapshot) as ss(report_projection_status text,report_projection_version text,
        report_projection_computed_at timestamptz,report_projection_source_hash text,report_projection_payload jsonb,
        report_projection_payload_sha256 text,report_projection_payload_size_bytes int) on true
      left join lateral (select s.publication_status as status, case when s.publication_status is not null then s.id end as scan_id) publication_request on true`,
      [JSON.stringify(rows)]);
    assert.deepEqual(Object.fromEntries(result.rows.map(row => [row.id, row.status])), {
      wesco: "failed", "stale-ready-terminal": "failed", pending: "finalizing", ready: "completed",
      "bad-hash": "finalizing", "missing-payload": "finalizing", "failed-projection": "failed",
      "old-readable": "completed", legacy: "completed", "raw-failed": "failed", running: "running", "event-bound": "finalizing",
    });
  } finally { await client.query("rollback"); await client.end(); }
});
