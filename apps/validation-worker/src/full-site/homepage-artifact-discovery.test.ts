import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { serializeCanonicalEvidenceArtifact } from "@certscore/contracts/dist/canonical-evidence-artifact.js";
import { fullSitePolicy } from "@website-signal-risk-scanner/shared";

test("the scheduler starts discovery for plain and compressed homepage artifacts and rejects changed bytes", async (t) => {
  const dbPath = require.resolve("@website-signal-risk-scanner/db");
  const db = require(dbPath);
  const { S3Client } = require(require.resolve("@aws-sdk/client-s3", { paths: [dbPath] }));
  const fixture = JSON.parse(readFileSync(require.resolve(
    "../../../../packages/certscore-contracts/fixtures/saved-bundles/policy-surface-positive.json",
  ), "utf8"));
  const url = "https://example.com/";
  const bundle = {
    ...fixture, scanId: randomUUID(), url, normalizedUrl: url,
    resourceInventoryContext: {
      finalUrl: url, configuration: {}, configurationHash: "a".repeat(64), links: [url + "contact"],
    },
  };
  const plain = Buffer.from(JSON.stringify(bundle));
  const encoded = Buffer.from(serializeCanonicalEvidenceArtifact({ ...bundle, fixturePadding: "x".repeat(450_000) }));
  assert.equal(JSON.parse(encoded.toString()).encoding, "gzip_base64");

  let body = plain;
  let input: Record<string, unknown>;
  let running = false, stopped = false, discoveryLeaseRequested = false;
  const candidates: string[] = [];
  const query = async (sql: string, args: unknown[] = []) => {
    if (sql.includes("join lateral(select metadata_json")) return { rows: [input] };
    if (sql.includes("status=$9")) running = args[8] === "running";
    if (sql.includes("stop_reason='homepage_baseline_unverifiable'")) stopped = true;
    if (sql.startsWith("select scan_id from full_site_crawls")) return { rowCount: 1, rows: [{ scan_id: input.scan_id }] };
    if (sql.startsWith("select * from full_site_crawls")) return { rows: [input] };
    if (sql.startsWith("select target_url,status")) return { rows: [{ target_url: input.target_url, status: "completed" }] };
    if (sql.startsWith("insert into full_site_pages") && args[6] === "queued") candidates.push(String(args[2]));
    if (sql.includes("set discovery_lease_until=now()")) discoveryLeaseRequested = running;
    // Leave discovery unclaimed so the replay never makes a website request.
    return { rows: [] };
  };
  const dbModule = require.cache[dbPath]!;
  const originalDb = dbModule.exports;
  dbModule.exports = { ...db, query, withWriteTransaction: (fn: (client: { query: typeof query }) => unknown) => fn({ query }), fullSiteInternalEnabled: () => true };
  t.after(() => { dbModule.exports = originalDb; });
  t.mock.method(S3Client.prototype, "send", async () => ({
    Body: (async function* () { yield body; })(), ContentLength: body.length,
  }));
  const { sweepFullSiteCrawls } = require("./scheduler") as typeof import("./scheduler");
  for (const [format, stored, scanId, homepage, links, changeHash] of [
    ["plain JSON", plain, bundle.scanId, url, [url + "contact"], false],
    ["compressed", encoded, bundle.scanId, url, [url + "contact"], false],
    ["wrong checksum", encoded, bundle.scanId, url, [], true],
  ] as const) {
    running = stopped = discoveryLeaseRequested = false;
    candidates.length = 0;
    body = stored;
    input = {
      scan_id: scanId, page_id: randomUUID(), target_url: homepage, region: "us-west-1", hosts: [new URL(homepage).hostname],
      status: "running", requested_json: { maxPages: 30 }, policy_json: fullSitePolicy({}),
      metadata_json: {
        artifactPointers: { scanArtifactUri: "s3://fixture/homepage.json" },
        artifactMetadata: { scanArtifactUri: {
          sizeBytes: stored.length,
          sha256: changeHash ? "0".repeat(64) : createHash("sha256").update(stored).digest("hex"),
        } },
      },
    };
    await sweepFullSiteCrawls();
    assert.equal(running, !changeHash, format);
    assert.equal(stopped, changeHash, format);
    assert.equal(discoveryLeaseRequested, !changeHash, format);
    assert.deepEqual(candidates, links, format);
  }
});
