import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { googleTagContextSchema, siteMetadataSchema } from "@certscore/contracts";
import { readDocumentSiteMetadata } from "./cms-version-capture";
import { retainGoogleTagContext } from "./google-tag-context";

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const binding = { documentToken: "loader-fixture", documentUrl: "https://fixture.test/", capturedAtEpochMs: 1000 };
const raw = () => ({ queuesObserved: 1, inspectedEntries: 1, limitations: [], rows: [{ queue: "dataLayer", queueIndex: 0,
  command: "config", destinations: ["G-ABC123"], settings: { allow_google_signals: true } }] });

test("retained Google queue context hashes destinations and never claims account linking, execution or audience use", () => {
  const proof = retainGoogleTagContext(raw(), binding)!;
  assert.equal(proof.rows[0]!.destinations[0]!.tagIdHash, hash("G-ABC123"));
  assert.equal(proof.documentUrlSha256, hash(binding.documentUrl));
  assert.equal(proof.backendAdsLink, "not_observable");
  assert.equal(proof.audienceUse, "not_established");
  assert.equal(proof.coverage, "sampled");
  assert.equal(JSON.stringify(proof).includes("G-ABC123"), false);
  assert.deepEqual(googleTagContextSchema.parse(JSON.parse(JSON.stringify(proof))), proof);
  assert.equal(retainGoogleTagContext(raw(), { ...binding, documentToken: undefined }), undefined);
  for (const value of ["AW-123/person@example.test", "https://ads.test/", "AW-123?user=private", "G-A".repeat(100)]) {
    const input = raw(); input.rows[0]!.destinations = [value];
    assert.equal(retainGoogleTagContext(input, binding), undefined);
  }
  const tooMany = raw(); tooMany.rows = Array.from({ length: 9 }, (_, i) => ({ ...tooMany.rows[0]!, queueIndex: i }));
  assert.equal(retainGoogleTagContext(tooMany, binding), undefined);
  assert.equal(googleTagContextSchema.safeParse({ ...proof, inspectedEntries: 0 }).success, false);
  assert.equal(siteMetadataSchema.safeParse({ contractVersion: "certscore.site-metadata.v1", title: "Fixture", language: "en", generators: [], wordpressAssetObserved: false }).success, true, "historical metadata needs no queue evidence");
});

test("existing metadata snapshot passively retains queued settings and routes without reading user data or invoking accessors", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<html lang="en"><head><title>Fixture</title></head><body>Local fixture</body></html>');
    await page.evaluate(() => {
      const w = window as any; w.getters = 0; w.sdkCalls = 0;
      w.dataLayer = [];
      w.gtag = function () { w.sdkCalls++; w.dataLayer.push(arguments); };
      w.gtag("set", { allow_google_signals: true });
      w.gtag("config", "G-ABC123", { allow_ad_personalization_signals: true });
      const parameters = { send_to: ["AW-123/label", "G-ABC123"], user_id: "private-user", user_data: { email: "private-email" } };
      Object.defineProperty(parameters, "ads_data_redaction", { get() { w.getters++; throw Error("must not read getter"); } });
      w.gtag("event", "conversion", parameters);
      w.pushBefore = w.dataLayer.push;
    });
    let requests = 0; page.on("request", () => requests++);
    const evaluate = page.evaluate.bind(page); let calls = 0;
    page.evaluate = ((...args: any[]) => { calls++; return (evaluate as any)(...args); }) as typeof page.evaluate;
    const captured = await readDocumentSiteMetadata(page, () => ({ token: "loader" }));
    assert.equal(calls, 1, "no additional page evaluate");
    const proof = captured?.googleTagContext; assert.ok(proof);
    assert.equal(proof.rows.length, 3);
    assert.deepEqual(proof.rows.map(r => r.command), ["set", "config", "event"]);
    assert.deepEqual(proof.rows[2]!.destinations.map(r => r.namespace), ["AW", "G"]);
    assert.equal(proof.rows[2]!.destinations[0]!.conversionLabelPresent, true);
    assert.ok(proof.limitations.includes("accessor_omitted"));
    assert.doesNotMatch(JSON.stringify(captured), /private-user|private-email|AW-123|G-ABC123|label/);
    assert.deepEqual(await evaluate(() => { const w = window as any; return { getters: w.getters, sdkCalls: w.sdkCalls, entries: w.dataLayer.length, samePush: w.pushBefore === w.dataLayer.push }; }), { getters: 0, sdkCalls: 3, entries: 3, samePush: true });
    assert.equal(requests, 0);
    assert.equal(await readDocumentSiteMetadata(page, (() => { let n = 0; return () => ({ token: ++n === 1 ? "before" : "after" }); })()), null, "navigation drift discards context");
  } finally { await browser.close(); }
});

test("queue snapshots are bounded samples, support declared custom queues and never convert omission into absence", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<html lang="en"><head><script type="application/json" src="https://www.googletagmanager.com/gtm.js?id=GTM-FIXTURE&l=customLayer"></script></head><body>Fixture</body></html>');
    await page.evaluate("globalThis.__name = target => target");
    await page.evaluate(() => {
      const w = window as any; w.dataLayer = Array.from({ length: 1000 }, (_, i) => ["config", "AW-" + (1000 + i), {}]);
      w.customLayer = [["event", "page_view", { send_to: "AW-123" }]];
      Object.defineProperty(performance, "now", { configurable: true, value: () => 0 });
    });
    const captured = await readDocumentSiteMetadata(page, () => ({ token: "loader" })); const proof = captured?.googleTagContext; assert.ok(proof);
    assert.ok(proof.inspectedEntries <= 64); assert.ok(proof.rows.length <= 8);
    assert.ok(proof.limitations.includes("entry_limit")); assert.equal(proof.coverage, "sampled");
    assert.ok(proof.rows.some(r => r.queueHash === hash("customLayer")));
    await page.evaluate(() => { const w = window as any; delete w.dataLayer; delete w.customLayer; w.reads = 0; Object.defineProperty(w, "dataLayer", { configurable: true, get() { w.reads++; return []; } }); });
    const missing = (await readDocumentSiteMetadata(page, () => ({ token: "loader" })))?.googleTagContext;
    assert.ok(missing?.limitations.includes("accessor_omitted")); assert.equal(missing?.backendAdsLink, "not_observable");
    assert.equal(await page.evaluate(() => (window as any).reads), 0);
    await page.evaluate(() => { let now = 0; Object.defineProperty(performance, "now", { configurable: true, value: () => now += 3 }); });
    const expired = (await readDocumentSiteMetadata(page, () => ({ token: "loader" })))?.googleTagContext;
    assert.ok(expired?.limitations.includes("time_limit")); assert.equal(expired?.inspectedEntries, 0);
  } finally { await browser.close(); }
});
