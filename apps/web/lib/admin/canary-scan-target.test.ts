import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { readFileSync } from "node:fs";
import { scanCanaryTargetSql } from "./canary-scan-target";

test("scan SQL references reject untrusted expressions; fast and detailed filters share the target rule", () => {
  assert.throws(() => scanCanaryTargetSql("s.config);select 1;--"));
  const repository = readFileSync("apps/web/server/admin/repository.ts", "utf8");
  assert.match(repository, /scanCanaryTargetSql\("s.scan_config_json"\)/);
});
const url = process.env.INTERNAL_PROVENANCE_TEST_DATABASE_URL;
test("starting-target canaries are recognized without page/request rows and unrelated URLs remain visible", {skip: !url}, async () => {
  assert.ok(["localhost","127.0.0.1"].includes(new URL(url!).hostname));
  const db = new pg.Client({connectionString: url}); await db.connect();
  try {
    const targets = [
      "https://ergoveritas.com/.well-known/certscore-canary/sentinels/consent-stress.html",
      "https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html",
      "https://customer.test/", "https://customer.test/path/.well-known/certscore-canary/check",
      "https://customer.test/?next=/.well-known/certscore-canary/check",
      "https://customer.test/xwell-known/certscore-canary/check", null,
    ];
    const rows = (await db.query(`select ${scanCanaryTargetSql("s.scan_config_json")} as canary
      from jsonb_array_elements($1::jsonb) s(scan_config_json)`, [JSON.stringify(targets.map(normalizedUrl => ({normalizedUrl})))])).rows;
    assert.deepEqual(rows.map(r => r.canary), [true,true,false,false,false,false,false]);
  } finally {await db.end();}
});
