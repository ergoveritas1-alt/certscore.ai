import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { policySurfaceObservationSchema } from "@certscore/contracts";
import { chromium } from "playwright";
import { inspectCmpPolicyHtml, readDidomiPublisherPolicy, didomiPolicyReference } from "./cmp-policy-discovery.js";
import { cmpConfigCandidates, dedupeCandidates, extractCandidates, prioritizePolicyCandidateEvaluation, policySurfaceScanner } from "./scanners/policy-surface-scanner.js";
import { createArtifactWriter } from "./artifact-writer.js";
const base = "https://publisher.example/";
const extract = (html: string) => dedupeCandidates(extractCandidates(base, html, "Privacy Policy"));

test("same footer and CMP URL deduplicate, preserve footer priority and CMP provenance", () => {
  const rows = extract('<footer><a href="/privacy">Privacy Policy</a></footer><div id="onetrust-banner-sdk"><a href="/privacy">Privacy Policy</a></div>');
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.discoveryMethod, "footer_link");
  assert.equal(rows[0]?.cmpDiscovery?.[0]?.cmpProvider, "OneTrust");
});
test("CMP-only and already-present preference-center links use canonical multilingual classification", () => {
  for (const [scope, label] of [["onetrust-consent-sdk", "Privacy Policy"], ["didomi-host", "Datenschutzerklärung"], ["CybotCookiebotDialog", "Politique de confidentialité"]]) {
    const rows = extract(`<div id="${scope}"><div class="preferences"><a href="./legal">${label}</a></div></div>`);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.normalizedUrl, base + "legal");
    assert.equal(rows[0]?.deterministicSurfaceType, "privacy_policy");
    assert.equal(rows[0]?.cmpDiscovery?.[0]?.source, "cmp_dom");
  }
});
test("CMP vendor subtrees and provider privacy policies cannot enter publisher candidates", () => {
  const rows = extract('<div id="onetrust-consent-sdk"><div class="ot-vendor-list"><a href="https://policies.google.com/privacy">Privacy Policy</a><a href="https://facebook.com/privacy">Privacy Policy</a></div><a href="https://www.onetrust.com/privacy/">Privacy Policy</a></div>');
  assert.equal(rows.length, 0);
});
test("TCF GVL and arbitrary nested privacyPolicyURL fields are never publisher configuration", () => {
  const vendorList = { vendors: Object.fromEntries(Array.from({ length: 500 }, (_, i) => [i, { privacyPolicyURL: `https://vendor-${i}.example/privacy` }])) };
  const rows = extract(`<script>window.didomiConfig = ${JSON.stringify(vendorList)};</script><script type="application/json">${JSON.stringify({ privacyPolicyUrl: "https://vendor.example/privacy" })}</script>`);
  assert.equal(rows.length, 0);
  assert.equal(readDidomiPublisherPolicy({ didomiConfig: vendorList }), undefined);
});
test("Didomi exact app config resolves relative URL and remains a non-clickable candidate", () => {
  const [candidate] = extract('<script>window.didomiConfig = {"app":{"privacyPolicyURL":"/legal/privacy"},"vendors":{"a":{"privacyPolicyURL":"https://vendor.example/privacy"}}};</script>');
  assert.equal(candidate?.normalizedUrl, base + "legal/privacy");
  assert.equal(candidate?.clickable, false);
  assert.equal(candidate?.cmpDiscovery?.[0]?.sourceLocator, "window.didomiConfig.app.privacyPolicyURL");
});
test("exact configuration read does not execute getters or recurse into vendor state", () => {
  let called = false;
  const config = { get didomiConfig() { called = true; return { app: { privacyPolicyURL: "/privacy" } }; } };
  assert.equal(readDidomiPublisherPolicy(config), undefined);
  assert.equal(called, false);
  assert.equal(readDidomiPublisherPolicy({ didomiConfig: { app: { privacyPolicyURL: "/privacy" } } }), "/privacy");
  assert.deepEqual(didomiPolicyReference("javascript:alert(1)", base), []);
});
test("TrustArc init URL requires canonical host and target domain binding", () => {
  const script = (host: string, domain: string) => `<script src="https://${host}/notice?domain=${domain}&amp;privacypolicylink=%2Fprivacy"></script>`;
  assert.equal(extract(script("consent.trustarc.com", "publisher.example"))[0]?.cmpDiscovery?.[0]?.cmpProvider, "TrustArc");
  assert.equal(extract(script("consent.trustarc.com", "unrelated.example")).length, 0);
  assert.equal(extract(script("evil.example", "publisher.example")).length, 0);
});
test("script/comment fake anchors cannot become CMP DOM links", () => {
  assert.equal(extract('<script>const fake = \'<a href="/privacy">Privacy Policy</a>\';</script><!-- <a href="/privacy">Privacy Policy</a> -->').length, 0);
});
test("existing non-CMP link discovery remains unchanged", () => {
  const rows = extract('<footer><a href="/privacy">Privacy Policy</a><a href="/cookies">Cookie Policy</a></footer>');
  assert.equal(rows.length, 2);
  assert.ok(rows.every(row => row.cmpDiscovery === undefined));
});
test("strong site link precedes CMP DOM, then CMP config", () => {
  const rows = prioritizePolicyCandidateEvaluation(extract('<script>window.didomiConfig = {"app":{"privacyPolicyURL":"/config"}};</script><div id="didomi-host"><a href="/cmp">Privacy Policy</a></div><footer><a href="/site">Privacy Policy</a></footer>'));
  assert.deepEqual(rows.map(row => row.normalizedUrl), [base + "site", base + "cmp", base + "config"]);
});
test("bounded configuration extraction ignores oversized and malformed scripts", () => {
  assert.equal(inspectCmpPolicyHtml('<script>window.didomiConfig = ' + ' '.repeat(65000) + '{"app":{"privacyPolicyURL":"/privacy"}};</script>', base).configReferences.length, 0);
  assert.equal(inspectCmpPolicyHtml('<script>window.didomiConfig = { broken</script>', base).configReferences.length, 0);
});
test("passive browser readback handles JS-config syntax with no network or action", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    let requests = 0; page.on("request", () => requests++);
    await page.setContent("<script>window.didomiConfig = { app: { privacyPolicyURL: '/privacy' }, vendors: { privacyPolicyURL: '/vendor' } };</script>");
    const raw = await page.evaluate(readDidomiPublisherPolicy, undefined);
    assert.equal(raw, "/privacy");
    assert.equal(cmpConfigCandidates(didomiPolicyReference(raw, base), base)[0]?.normalizedUrl, base + "privacy");
    assert.equal(requests, 0);
  } finally { await browser.close(); }
});

for (const mode of ["dom", "config", "invalid", "rendered-vendor", "rendered-shadow"] as const) test(`canonical policy scan validates ${mode} discovery without promoting a URL alone`, async () => {
  let baseUrl = "";
  const requests: string[] = [];
  const policy = "We collect personal data for service delivery. Our legal basis is contractual necessity. We retain account records for two years. Contact privacy@publisher.example to exercise your right to access, delete or object. We transfer data using standard contractual clauses. ".repeat(12);
  const server = createServer((req, res) => {
    requests.push(req.url ?? ""); res.setHeader("content-type", "text/html");
    if (req.url === "/") {
      const control = mode === "rendered-shadow" ? `<div id="usercentrics-root"></div><script>document.getElementById('usercentrics-root').attachShadow({mode:'open'}).innerHTML='<a href="/publisher-notice">Privacy Policy</a><div class="vendor-list"><a href="/vendor-privacy">Privacy Policy</a></div>';</script>`
        : mode === "dom" ? '<div id="didomi-host"><a href="/publisher-notice">Privacy Policy</a></div>'
        : mode === "rendered-vendor" ? `<script>document.addEventListener('DOMContentLoaded', () => {document.body.innerHTML='<div id="didomi-host"><div class="vendor-list"><a href="/vendor-privacy">Privacy Policy</a></div></div>'; window.didomiConfig={app:{privacyPolicyURL:'/publisher-notice'}};});</script>`
        : '<script>window.didomiConfig = {"app":{"privacyPolicyURL":"/publisher-notice"}};</script>';
      res.end(`<html><body>${control}</body></html>`);
    } else if (req.url === "/publisher-notice") {
      res.end(mode === "invalid" ? "Processing Error Close" : `<main><h1>Publisher Privacy Policy</h1><p>${policy}</p></main>`);
    } else { res.statusCode = 404; res.end("Not found"); }
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const addr = server.address(); assert.ok(addr && typeof addr !== "string"); baseUrl = `http://127.0.0.1:${addr.port}`;
  const dir = await mkdtemp(path.join(tmpdir(), "cmp-policy-fixture-"));
  try {
    const result = await policySurfaceScanner({ url: baseUrl + "/", normalizedUrl: baseUrl + "/", scanStartedAtMs: Date.now(), internalBudgetMs: 6000, discoveryMode: "fast", artifactWriter: await createArtifactWriter(dir) });
    const observation = result.policySurfaceObservations.find(row => row.normalizedUrl === baseUrl + "/publisher-notice");
    assert.ok(observation, JSON.stringify(result.moduleRun));
    assert.ok(observation.cmpDiscovery?.length);
    const retained = policySurfaceObservationSchema.parse(observation);
    assert.deepEqual(retained.cmpDiscovery, observation.cmpDiscovery);
    if (mode === "invalid") {
      assert.notEqual(observation.documentEvaluationState, "usable");
      assert.notEqual(observation.governingPolicySelection?.state, "selected");
    } else {
      assert.equal(observation.status, "fetched");
      assert.equal(observation.documentEvaluationState, "usable");
      assert.match(observation.textExcerpt ?? "", /contractual necessity/);
    }
    assert.equal(requests.filter(url => url === "/vendor-privacy").length, 0);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(dir, { recursive: true, force: true }); }
});

for (const sitePolicyUsable of [true, false]) test(`site link and CMP configuration are both retained when site policy is ${sitePolicyUsable ? "usable" : "unusable"}`, async () => {
  const requests: string[] = [];
  const policyText = "We collect personal data for service delivery. Our legal basis is contractual necessity. We retain account records for two years. Contact privacy@publisher.example to exercise your right to access, delete or object. ".repeat(12);
  const server = createServer((req, res) => {
    requests.push(req.url ?? "");
    res.setHeader("content-type", "text/html");
    if (req.url === "/") {
      res.end('<html><body><footer><a href="/site-policy">Privacy Policy</a></footer><script>window.didomiConfig = {"app":{"privacyPolicyURL":"/configured-policy"}};</script></body></html>');
    } else if (req.url === "/site-policy") {
      res.end(sitePolicyUsable ? `<main><h1>Privacy Policy</h1><p>${policyText}</p></main>` : "Processing Error Close");
    } else if (req.url === "/configured-policy") {
      res.end(`<main><h1>Privacy Policy</h1><p>${policyText}</p></main>`);
    } else { res.statusCode = 404; res.end("Not found"); }
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const addr = server.address(); assert.ok(addr && typeof addr !== "string");
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  const dir = await mkdtemp(path.join(tmpdir(), "cmp-policy-fallback-fixture-"));
  try {
    const result = await policySurfaceScanner({ url: baseUrl + "/", normalizedUrl: baseUrl + "/", scanStartedAtMs: Date.now(), internalBudgetMs: 9000, discoveryMode: "fast", artifactWriter: await createArtifactWriter(dir) });
    assert.ok(requests.includes("/site-policy"));
    assert.ok(requests.includes("/configured-policy"));
    const siteObservation = result.policySurfaceObservations.find((row) => row.normalizedUrl === baseUrl + "/site-policy");
    const cmpObservation = result.policySurfaceObservations.find((row) => row.normalizedUrl === baseUrl + "/configured-policy");
    assert.ok(siteObservation);
    assert.equal(cmpObservation?.status, "fetched");
    assert.equal(cmpObservation?.cmpDiscovery?.[0]?.source, "cmp_config");
    const selected = result.policySurfaceObservations.find((row) => row.governingPolicySelection?.state === "primary");
    if (sitePolicyUsable) {
      assert.equal(siteObservation.status, "fetched");
      assert.ok(selected);
    } else {
      assert.notEqual(siteObservation.documentEvaluationState, "usable");
      assert.equal(selected?.normalizedUrl, baseUrl + "/configured-policy");
    }
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(dir, { recursive: true, force: true }); }
});
