import assert from "node:assert/strict";
import test from "node:test";
import { createMarketplaceAccessVerifier } from "./agreement-access";

const binding = { license_arn: "license-a", agreement_id: "agmt-a", buyer_account_id: "123456789012" };
const active = { status: "ACTIVE", acceptor: { accountId: binding.buyer_account_id }, startTime: new Date(0) };
const attributed = { agreementId: binding.agreement_id, licenseArn: binding.license_arn };

test("missed cancellation is denied after the five-minute freshness bound", async () => {
  let now = 1000, calls = 0, cancelled = false;
  const verify = createMarketplaceAccessVerifier({ binding: async () => binding, now: () => now, agreement: async () => { calls++; return { ...active, status: cancelled ? "CANCELLED" : "ACTIVE" }; } });
  assert.deepEqual(await verify("key"), attributed);
  cancelled = true; now += 299999;
  assert.deepEqual(await verify("key"), attributed);
  now++;
  assert.equal(await verify("key"), null);
  assert.equal(calls, 2);
});

test("invalid keys never call AWS; delivered revocation defeats a cached grant", async () => {
  let enabled = true, calls = 0;
  const verify = createMarketplaceAccessVerifier({ binding: async token => enabled && token === "valid" ? binding : null, agreement: async () => { calls++; return active; } });
  assert.equal(await verify("invalid"), null);
  assert.equal(calls, 0);
  assert.deepEqual(await verify("valid"), attributed);
  enabled = false;
  assert.equal(await verify("valid"), null);
  assert.equal(calls, 1);
});

test("AWS failures never extend stale access and recover on a later request", async () => {
  let now = 1000, fail = false;
  const verify = createMarketplaceAccessVerifier({ binding: async () => binding, now: () => now, agreement: async () => { if (fail) throw new Error("AWS unavailable"); return active; } });
  assert.deepEqual(await verify("key"), attributed);
  now += 300000; fail = true;
  await assert.rejects(verify("key"), /AWS unavailable/);
  fail = false;
  assert.deepEqual(await verify("key"), attributed);
});

test("coalesces simultaneous checks and rechecks rotation during the AWS call", async () => {
  let enabled = true, calls = 0;
  let resolve!: (value: typeof active) => void;
  const pending = new Promise<typeof active>(done => { resolve = done; });
  const verify = createMarketplaceAccessVerifier({ binding: async () => enabled ? binding : null, agreement: () => { calls++; return pending; } });
  const first = verify("key"), second = verify("key");
  await Promise.resolve();
  enabled = false; resolve(active);
  assert.deepEqual(await Promise.all([first, second]), [null, null]);
  assert.equal(calls, 1);
});

test("checks buyer and agreement expiry even within the cache freshness window", async () => {
  let now = 1000;
  const verify = createMarketplaceAccessVerifier({ binding: async token => ({ ...binding, buyer_account_id: token === "other" ? "999999999999" : binding.buyer_account_id }), now: () => now, agreement: async () => ({ ...active, endTime: new Date(2000) }) });
  assert.deepEqual(await verify("key"), attributed);
  assert.equal(await verify("other"), null);
  now = 2000;
  assert.equal(await verify("key"), null);
});
