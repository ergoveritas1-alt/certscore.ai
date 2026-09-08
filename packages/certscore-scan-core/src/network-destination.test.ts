import assert from "node:assert/strict";
import test from "node:test";
import type { NetworkDestination } from "@certscore/contracts";
import { networkDestinationSchema } from "@certscore/contracts";
import { captureResponseDestination, createDestinationEnricher } from "./network-destination";
const now = Date.parse("2026-09-07T00:00:00Z");
const destination: NetworkDestination = { ip: "8.8.8.8", source: "response_server_addr", locationLabel: "server location (may be CDN edge)" };
const metadata = { buildEpoch: new Date(now - 86400000) };

test("missing offline databases retain IP with explicit coverage, never a geographic guess", async () => {
  const enrich = createDestinationEnricher({ country: async () => null, network: async () => null, now: () => now });
  const result = await enrich(destination);
  assert.equal(result?.ip, destination.ip);
  assert.equal(result?.countryCode, undefined);
  assert.deepEqual(result?.enrichment, { country: "database_unavailable", network: "database_unavailable", countryDatabaseBuiltAt: undefined, networkDatabaseBuiltAt: undefined });
  assert.ok(networkDestinationSchema.safeParse(result).success);
  assert.equal(await enrich({ ...destination, ip: "192.168.10.4" }), undefined);
});

test("deduplicates concurrent local lookups and retains country/network provenance", async () => {
  let calls = 0;
  const enrich = createDestinationEnricher({ now: () => now,
    country: async () => ({ metadata, get: () => { calls++; return { country_code: "DE" }; } }),
    network: async () => ({ metadata, get: () => ({ asn: "123", org: "Fixture network" }) }),
  });
  const results = await Promise.all(Array.from({ length: 20 }, () => enrich(destination)));
  assert.equal(calls, 1);
  assert.equal(results[0]?.countryCode, "DE");
  assert.equal(results[0]?.asn, 123);
  assert.equal(results[0]?.source, "response_server_addr_iplocate");
  assert.equal(results[0]?.enrichment?.countryDatabaseBuiltAt, metadata.buildEpoch.toISOString());
  assert.ok(networkDestinationSchema.safeParse(results[0]).success);
});

test("stale databases and unmatched country records do not claim server country", async () => {
  const enrich = createDestinationEnricher({ now: () => now,
    country: async () => ({ metadata, get: () => ({ country_code: undefined }) }),
    network: async () => ({ metadata: { buildEpoch: new Date(now - 31 * 86400000) }, get: () => { throw new Error("stale reader must not be queried"); } }),
  });
  const result = await enrich(destination);
  assert.equal(result?.countryCode, undefined);
  assert.equal(result?.enrichment?.country, "not_found");
  assert.equal(result?.enrichment?.network, "database_stale");
});

test("concurrent responses and redirect hops retain their own server address regardless of completion order", async () => {
  let finishFirst: ((value: { ipAddress: string; port: number }) => void) | undefined;
  const first = captureResponseDestination({ fromServiceWorker: () => false, serverAddr: () => new Promise(resolve => { finishFirst = resolve; }) });
  const second = await captureResponseDestination({ fromServiceWorker: () => false, serverAddr: async () => ({ ipAddress: "1.1.1.1", port: 443 }) });
  finishFirst!({ ipAddress: "8.8.8.8", port: 443 });
  assert.equal(second.destination?.ip, "1.1.1.1");
  assert.equal((await first).destination?.ip, "8.8.8.8");
});

test("service-worker and unavailable responses preserve missing-address reasons", async () => {
  const worker = await captureResponseDestination({ fromServiceWorker: () => true, serverAddr: async () => { throw new Error("must not attribute a service-worker response to a remote server"); } });
  assert.equal(worker.status, "service_worker");
  assert.equal(worker.destination, undefined);
  assert.equal((await captureResponseDestination({ fromServiceWorker: () => false, serverAddr: async () => null })).status, "ip_not_exposed");
  assert.equal((await captureResponseDestination({ fromServiceWorker: () => false, serverAddr: async () => { throw new Error("closed"); } })).status, "unavailable");
});


test("unused or non-public destinations never open database readers", async () => {
  let opens = 0;
  const enrich = createDestinationEnricher({ country: async () => { opens++; return null; }, network: async () => { opens++; return null; } });
  assert.equal(await enrich(undefined), undefined);
  assert.equal(await enrich({ ...destination, ip: "127.0.0.1" }), undefined);
  assert.equal(opens, 0);
});

test("warm cached results expire at the precise database freshness boundary", async () => {
  const built = Date.parse("2026-08-08T12:00:00Z");
  let clock = built + 30 * 86400000 - 1;
  let calls = 0;
  const enrich = createDestinationEnricher({ now: () => clock,
    country: async () => ({ metadata: { buildEpoch: new Date(built) }, get: () => { calls++; return { country_code: "DE" }; } }),
    network: async () => null,
  });
  assert.equal((await enrich(destination))?.countryCode, "DE");
  clock += 3;
  const stale = await enrich(destination);
  assert.equal(stale?.countryCode, undefined);
  assert.equal(stale?.enrichment?.country, "database_stale");
  assert.equal(calls, 1);
});

test("bounded warm cache keeps frequently reused IPs while evicting older entries", async () => {
  const calls = new Map<string, number>();
  const enrich = createDestinationEnricher({ now: () => now,
    country: async () => ({ metadata, get: ip => { calls.set(ip, (calls.get(ip) ?? 0) + 1); return { country_code: "US" }; } }),
    network: async () => null,
  });
  const first = "11.0.0.0", hot = "11.0.0.1";
  for (let i = 0; i < 2048; i++) await enrich({ ...destination, ip: `11.0.${Math.floor(i / 256)}.${i % 256}` });
  await enrich({ ...destination, ip: hot });
  await enrich({ ...destination, ip: "12.0.0.1" });
  await enrich({ ...destination, ip: hot });
  await enrich({ ...destination, ip: first });
  assert.equal(calls.get(hot), 1);
  assert.equal(calls.get(first), 2);
});

test("proxy evidence requires exact provenance and enrichment preserves it", async () => {
  const proxyConnection = { version: "chromium_connection.v1" as const, connectionId: 42, tunnelId: "c5a21136-cb84-4a1a-9cfe-22a7a71fe777", authority: "example.com:443", recordHash: "a".repeat(64) };
  const proxy: NetworkDestination = { ...destination, source: "proxy_connect", proxyConnection };
  assert.equal(networkDestinationSchema.safeParse({ ...proxy, proxyConnection: undefined }).success, false);
  assert.equal(networkDestinationSchema.safeParse({ ...proxy, source: "response_server_addr" }).success, false);
  const enrich = createDestinationEnricher({ now: () => now, country: async () => ({metadata, get: () => ({country_code: "DE"})}), network: async () => null });
  await enrich(destination); // Cache from direct capture must not replace proxy provenance.
  const result = await enrich(proxy);
  assert.equal(result?.source, "proxy_connect_iplocate");
  assert.deepEqual(result?.proxyConnection, proxyConnection);
  assert.equal(networkDestinationSchema.safeParse(result).success, true);
});

test("private proxy address retains connection ID without inventing a destination", async () => {
  const result = await captureResponseDestination({fromServiceWorker: () => false, serverAddr: async () => ({ipAddress: "127.0.0.1", port: 40000, certscoreConnectionId: 42})});
  assert.equal(result.status, "ip_not_exposed");
  assert.equal("connectionId" in result && result.connectionId, 42);
  assert.equal(result.destination, undefined);
});
