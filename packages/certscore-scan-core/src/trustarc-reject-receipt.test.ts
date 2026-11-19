import assert from "node:assert/strict";
import test from "node:test";
import type { BrowserContext, Page } from "playwright";
import { readTrustArcRejectReceipt, TRUSTARC_REJECT_COOKIE_DOMAINS, usesTrustArcUnderscoreReceipt } from "./trustarc-reject-receipt.js";

function fixture(target: string, domain: string) {
  const clickedAt = Date.now() - 100;
  const cookies = [
    { name: "notice_preferences", value: "0:" },
    { name: "notice_gdpr_prefs", value: "0:" },
    { name: "cmapi_cookie_privacy", value: usesTrustArcUnderscoreReceipt(target) ? "permit_1_required" : "permit 1 required" },
  ].map(cookie => ({ ...cookie, path: "/", domain: `.${domain}` }));
  const writes = cookies.map(({ name, value }, index) => ({
    name, value, storageType: "cookie", sequence: index + 1, documentUrl: target,
    cookieAssignment: `${name}=${value}; Domain=.${domain}; Path=/`,
    observedAtEpochMs: clickedAt + index + 1,
  }));
  const read = (snapshot = cookies, recorded = writes, url = target) =>
    readTrustArcRejectReceipt(
      { cookies: async (requestedUrl: string) => {
        assert.equal(requestedUrl, target);
        return snapshot;
      } } as unknown as BrowserContext,
      { url: () => url, evaluate: async () => ({ writes: recorded }) } as unknown as Page,
      clickedAt,
    );
  return { clickedAt, cookies, writes, read };
}

for (const [target, domain] of TRUSTARC_REJECT_COOKIE_DOMAINS) {
  test(`TrustArc required-only readback on ${target}`, async () => {
    const { clickedAt, read } = fixture(target, domain);
    const verified = await read();
    assert.equal(verified?.decision, "denied");
    assert.equal(verified?.observedAtEpochMs, clickedAt + 3);
  });
}

test("TrustArc requires exact cookie scope and three fresh, matching writes", async () => {
  const { clickedAt, cookies, writes, read } = fixture("https://www.ea.com/games/battlefield", "ea.com");
  assert.equal(await read(cookies.slice(0, 2)), undefined);
  assert.equal(await read([...cookies, cookies[0]!]), undefined);
  assert.equal(await read(cookies.map(cookie => ({ ...cookie, domain: "www.ea.com" }))), undefined);
  assert.equal(await read(cookies.map(cookie => ({ ...cookie, path: "/games" }))), undefined);
  assert.equal(await read(cookies, writes.slice(0, 2)), undefined);
  assert.equal(await read(cookies, writes.map(write => ({ ...write, observedAtEpochMs: clickedAt }))), undefined);
  assert.equal(await read(cookies, writes.map(write => ({ ...write, observedAtEpochMs: Date.now() + 1_000 }))), undefined);
  assert.equal(await read(cookies, writes.map(write => ({ ...write, documentUrl: "https://www.ea.com/ea-studios/popcap" }))), undefined);
  const contradictory = { ...writes[2]!, cookieAssignment: "cmapi_cookie_privacy=permit 1,2,3; Domain=.ea.com; Path=/" };
  assert.equal(await read(cookies, [...writes, contradictory]), undefined);
});

test("an identical TrustArc state on an unreviewed route does not trigger a read", async () => {
  const { read } = fixture("https://www.ea.com/games/battlefield", "ea.com");
  assert.equal(await read(undefined, undefined, "https://www.ea.com/"), undefined);
  assert.equal(await read(undefined, undefined, "https://www.concur.com/"), undefined);
  assert.equal(await read(undefined, undefined, "https://www.delonghi.com/en-us"), undefined);
});


test("snapshot-only routes still require exact instrumented writes on a fresh run", async () => {
  for (const domain of ["assurant.com", "kornferry.com", "productmadness.com"]) {
    const { cookies, read } = fixture(`https://www.${domain}/`, domain);
    assert.equal(await read(cookies, []), undefined);
    assert.equal((await read())?.decision, "denied");
  }
});


test("the underscore encoding stays scoped to its reviewed routes", async () => {
  const fixtureForMobvista = fixture("https://www.mobvista.com/en", "mobvista.com");
  assert.equal((await fixtureForMobvista.read())?.writes.length, 3);
  assert.equal(await fixtureForMobvista.read(fixtureForMobvista.cookies.map(cookie =>
    cookie.name === "cmapi_cookie_privacy" ? { ...cookie, value: "permit 1 required" } : cookie)), undefined);

  const fixtureForGarmin = fixture("https://www.garmin.com/en-US/", "garmin.com");
  assert.equal(await fixtureForGarmin.read(fixtureForGarmin.cookies.map(cookie =>
    cookie.name === "cmapi_cookie_privacy" ? { ...cookie, value: "permit_1_required" } : cookie)), undefined);
});
