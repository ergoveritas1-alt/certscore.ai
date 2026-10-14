import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { readOneTrustInventoryInDocument } from "./onetrust-preference-inventory.js";

const read = (value: unknown) => JSON.parse(JSON.stringify(runInNewContext(`(${readOneTrustInventoryInDocument.toString()})()`, {
  window: { OneTrust: { GetDomainData: () => value } },
}) ?? null));

test("loaded OneTrust declarations retain names and explicit units without inventing services or completeness", () => {
  const input = { Groups: [{ CustomGroupId: "C0002", GroupName: "Analytics", FirstPartyCookies: [
    { Name: "_ga", Description: "Audience measurement", Lifespan: "2 years", CookieValue: "private" },
    { Name: "unit_unknown", Lifespan: "730" }, { Name: "session", IsSession: true },
  ], Hosts: [{ HostName: "example-analytics.test", Cookies: [{ Name: "host_cookie", Lifespan: "1 day" }] }] }] };
  const before = structuredClone(input), result = read(input);
  assert.deepEqual(result.categories, ["Analytics"]);
  assert.deepEqual(result.services, []);
  assert.deepEqual(result.declarations.map((row: any) => [row.name, row.duration]), [["_ga", "2 years"], ["unit_unknown", ""], ["session", "Session"], ["host_cookie", "1 day"]]);
  assert.equal(result.truncated, false); assert.equal(result.declarationInventoryComplete, undefined);
  assert.ok(!JSON.stringify(result).includes("private")); assert.deepEqual(input, before);
});

test("configuration parsing is bounded and missing or malformed API data supplies no invented evidence", () => {
  for (const value of [null, {}, { Groups: {} }, { Groups: [{ CustomGroupId: "bad id", FirstPartyCookies: [{ Name: "fake" }] }] }]) {
    const result = read(value); assert.ok(result === null || result.declarations.length === 0);
  }
  const result = read({ Groups: Array.from({ length: 65 }, (_, i) => ({ CustomGroupId: `C${i}`, GroupName: `Category ${i}`, FirstPartyCookies: Array.from({ length: 101 }, (_, j) => ({ Name: `cookie_${i}_${j}` })) })) });
  assert.equal(result.declarations.length, 100); assert.equal(result.truncated, true);
  assert.ok(result.categories.length <= 64);
});
