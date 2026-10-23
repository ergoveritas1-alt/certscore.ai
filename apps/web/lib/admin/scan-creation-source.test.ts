import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { readFileSync } from "node:fs";
import { scanCreationSource, scanCreatedViaSql, scanCreatorSql } from "./scan-creation-source";

test("creation channels use exact retained values, never requester identity", () => {
  assert.equal(scanCreationSource("homepage-anonymous"), "browser_homepage");
  assert.equal(scanCreationSource("manual-dashboard"), "browser_dashboard");
  assert.equal(scanCreationSource("new-domain-overview"), "browser_dashboard");
  assert.equal(scanCreationSource("marketing-full-scan"), "browser");
  assert.equal(scanCreationSource("mcp"), "mcp");
  assert.equal(scanCreationSource("mcp_light"), "mcp_light");
  assert.equal(scanCreationSource("mcp_authenticated"), "mcp_authenticated");
  assert.equal(scanCreationSource("sdk"), "api");
  assert.equal(scanCreationSource("browser"), "browser");
  assert.equal(scanCreationSource("api-full-scan"), "unknown");
  assert.equal(scanCreationSource("operator-post-reject-proof-verification"), "internal");
  for (const value of [null, "", "ChatGPT", "anonymous", "192.0.2.1"]) assert.equal(scanCreationSource(value), "unknown");
});

test("creation filter and display share the selector and preserve pagination", () => {
  const repository = readFileSync("apps/web/server/admin/repository.ts", "utf8");
  const page = readFileSync("apps/web/app/app/admin/scans/page.tsx", "utf8");
  assert.equal(repository.match(/scanCreatedViaSql\("s.id", "s.scan_config_json"\)/g)?.length, 2);
  assert.match(repository, /created_via_filter = \$26/);
  assert.equal(repository.match(/!filters.createdVia &&/g)?.length, 3);
  assert.match(page, /searchParams=\{\{ createdVia:/);
  assert.match(page, /label: "Created via"/);
  assert.match(page, /Requested via:/);
});

const url = process.env.CREATION_SOURCE_TEST_DATABASE_URL;
test("SQL creator attribution ignores reuse and reads, preserves oldest creation and distinguishes MCP surfaces", { skip: !url }, async () => {
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(url!).hostname));
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  try {
    await db.query(`begin;
      create temp table scans(id text, scan_config_json jsonb);
      create temp table scan_requests(public_id text, scan_id text, fulfilled_by_scan_id text, requested_at timestamptz, request_channel text, resolution_mode text, requested_by jsonb default '{}', request_context jsonb default '{}', requested_url text);
      create temp table pulse_requests(public_id text, scan_id text, requested_at timestamptz, request_channel text, resolution_mode text, request_context jsonb, requested_by jsonb, requested_url text);
      insert into scans values ('browser','{"source":"homepage-anonymous"}'), ('light','{"source":"pulse_api"}'), ('auth','{}'), ('legacy','{}'), ('unknown','{}');
      insert into scan_requests(public_id,scan_id,fulfilled_by_scan_id,requested_at,request_channel,resolution_mode) values ('browser-create','browser','browser','2026-09-01','homepage-anonymous','queued_new_scan');
      insert into pulse_requests(public_id,scan_id,requested_at,request_channel,resolution_mode,request_context,requested_by) values
        ('later-mcp','browser','2026-09-02','mcp','reused_existing_scan','{}','{}'),
        ('light-create','light','2026-09-01','mcp','created_new_scan','{"anonymousMcpSurface":"mcp_light"}','{"anonymous":true}'),
        ('auth-create','auth','2026-09-01','mcp','queued_new_scan','{}','{"anonymous":false}'),
        ('legacy-create','legacy','2026-09-01','mcp','created_new_scan','{}','{"anonymous":true}'),
        ('read-only','unknown','2026-09-01','mcp','reused_existing_scan','{}','{}'),
        ('later-browser','light','2026-09-02','homepage-anonymous','reused_existing_scan','{}','{}');`);
    const sql = `select s.id, ${scanCreatedViaSql("s.id", "s.scan_config_json")} as kind from scans s order by s.id`;
    const rows = (await db.query(sql.replaceAll("public.", "pg_temp."))).rows;
    assert.deepEqual(rows, [
      { id: "auth", kind: "mcp_authenticated" }, { id: "browser", kind: "browser_homepage" },
      { id: "legacy", kind: "mcp" }, { id: "light", kind: "mcp_light" }, { id: "unknown", kind: "unknown" }
    ]);
    const creator = (await db.query(scanCreatorSql("'browser'").replaceAll("public.", "pg_temp."))).rows[0];
    assert.equal(creator.public_id, "browser-create");
    const filtered = (await db.query(`select * from (${sql.replaceAll("public.", "pg_temp.")}) origins where kind = $1 limit 1`, ["browser_homepage"])).rows;
    assert.deepEqual(filtered, [{ id: "browser", kind: "browser_homepage" }]);
  } finally {
    await db.query("rollback");
    await db.end();
  }
});
