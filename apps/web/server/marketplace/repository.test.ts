import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { query, closePools } from "@website-signal-risk-scanner/db";
import { createMarketplaceClaim, claimMarketplaceLicense, rotateMarketplaceKey, validateMarketplaceKey, revokeMarketplaceKey, applyLicenseEvent } from "./repository";
import type { LicenseEvent } from "./contracts";

test("Marketplace database lifecycle: single-use claims, ownership, independent licenses, rotation and late events", { skip: !process.env.MARKETPLACE_TEST_DATABASE_URL }, async () => {
  const url = new URL(process.env.MARKETPLACE_TEST_DATABASE_URL!);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname), "Local fixture database only");
  assert.equal(url.pathname, "/marketplace_test", "Dedicated disposable database only");
  process.env.DATABASE_URL = url.toString();
  delete process.env.DATABASE_READ_URL;
  process.env.DATABASE_SSL_MODE = "disable";
  const buyer = "123456789012";
  const arn = (id: string) => `arn:aws:license-manager::${buyer}:license:l-${id}`;
  const event = (id: string, kind: "License Updated - Manufacturer" | "License Deprovisioned - Manufacturer", time: string): LicenseEvent => ({
    id: "00000000-0000-4000-8000-000000000001", source: "aws.agreement-marketplace", account: "199536052647", region: "us-east-1", time, "detail-type": kind,
    detail: { catalog: "AWSMarketplace", product: { code: "product", id: "prod-test" }, license: { arn: arn(id) }, agreement: { id: "agmt-test" }, acceptor: { accountId: buyer } },
  });
  try {
    await query(readFileSync("packages/db/migrations/0203_marketplace_light.sql", "utf8"));
    const claimA = await createMarketplaceClaim({ CustomerAWSAccountId: buyer, ProductCode: "product", LicenseArn: arn("a") });
    await claimMarketplaceLicense(claimA, "user-a");
    await assert.rejects(claimMarketplaceLicense(claimA, "user-a"));
    await assert.rejects(rotateMarketplaceKey(arn("a"), "user-a"), /active Marketplace/);
    const stolenClaim = await createMarketplaceClaim({ CustomerAWSAccountId: buyer, ProductCode: "product", LicenseArn: arn("a") });
    await assert.rejects(claimMarketplaceLicense(stolenClaim, "user-b"));
    await applyLicenseEvent(event("a", "License Updated - Manufacturer", "2026-09-19T10:00:00Z"), true, null);
    await assert.rejects(rotateMarketplaceKey(arn("a"), "user-b"));
    const first = await rotateMarketplaceKey(arn("a"), "user-a");
    assert.equal(await validateMarketplaceKey(first), true);
    const second = await rotateMarketplaceKey(arn("a"), "user-a");
    assert.equal(await validateMarketplaceKey(first), false);
    assert.equal(await validateMarketplaceKey(second), true);
    await revokeMarketplaceKey(arn("a"), "user-b");
    assert.equal(await validateMarketplaceKey(second), true);
    await revokeMarketplaceKey(arn("a"), "user-a");
    assert.equal(await validateMarketplaceKey(second), false);
    const third = await rotateMarketplaceKey(arn("a"), "user-a");
    const claimB = await createMarketplaceClaim({ CustomerAWSAccountId: buyer, ProductCode: "product", LicenseArn: arn("b") });
    await claimMarketplaceLicense(claimB, "user-a");
    await applyLicenseEvent(event("b", "License Updated - Manufacturer", "2026-09-19T10:00:00Z"), true, null);
    const otherLicenseKey = await rotateMarketplaceKey(arn("b"), "user-a");
    await applyLicenseEvent(event("a", "License Deprovisioned - Manufacturer", "2026-09-19T11:00:00Z"), false, null);
    await applyLicenseEvent(event("a", "License Updated - Manufacturer", "2026-09-19T10:00:00Z"), true, null);
    await applyLicenseEvent(event("a", "License Updated - Manufacturer", "2026-09-19T12:00:00Z"), true, null);
    assert.equal(await validateMarketplaceKey(third), false);
    assert.equal(await validateMarketplaceKey(otherLicenseKey), true, "Cancellation cannot affect a concurrent license");
    await assert.rejects(rotateMarketplaceKey(arn("a"), "user-a"));
    await query(`update marketplace_light_keys set expires_at=now()-interval '1 second' where license_arn=$1`, [arn("b")]);
    assert.equal(await validateMarketplaceKey(otherLicenseKey), false);
    const hashes = await query<{ token_hash: string }>("select token_hash from marketplace_light_keys");
    assert.ok(hashes.rows.every(row => /^[a-f0-9]{64}$/.test(row.token_hash)));
    assert.equal(await validateMarketplaceKey("cs_live_workspace"), false);
  } finally { await closePools(); }
});
