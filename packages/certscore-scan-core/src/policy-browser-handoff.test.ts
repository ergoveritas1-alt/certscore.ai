import assert from "node:assert/strict";
import test from "node:test";
import type { BrowserPolicyLink } from "@certscore/contracts";
import { canonicalPolicyUrlIdentity, policySurfaceScanner, selectBrowserPolicyFallback } from "./scanners/policy-surface-scanner.js";

const origin = "https://example.org";
const pageUrl = origin + "/";
const policyUrl = origin + "/legal/website-privacy-notice/";
const policyBody = "<h1>Privacy Notice</h1><p>" +
  "We collect personal information to provide our service. We retain account data for six months. You have the right to access and delete your personal information. ".repeat(20) + "</p>";
const browserLink: BrowserPolicyLink = {
  pageUrl, href: policyUrl, linkText: "Privacy Notice", domLocation: "footer", linkVisibility: "visible",
};
const writer = { baseDir: ".", artifactPath: (name: string) => name,
  writeJsonArtifact: async (name: string) => name, writeTextArtifact: async (name: string) => name,
};
const response = (text: string, status = 200) => new Response(text, { status, headers: { "content-type": "text/html" } });

test("a fresh verified document gets the first policy request and is evaluated once", async t => {
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => {
    calls.push(String(url));
    if (url === policyUrl) return response(policyBody);
    if (url === pageUrl) return response('<footer><a href="/privacy">Privacy Policy</a><a href="/cookie-policy">Cookie Policy</a><a href="/terms">Terms of Service</a></footer>');
    return response("Not Found", 404);
  });
  const start = Date.now();
  const result = await policySurfaceScanner({
    url: pageUrl, normalizedUrl: pageUrl, scanStartedAtMs: start,
    internalBudgetMs: 12_000, absoluteDeadlineAtMs: start + 12_000, discoveryMode: "fast", artifactWriter: writer,
    policySurfaceSeeds: [{ source:"prior_scan_hint", sourceScanId:"prior", hintType:"privacy_policy",
      verifiedDocument:true, url:policyUrl, sourceCompletedAt:new Date(start - 86_400_000).toISOString() }],
  });
  assert.deepEqual(calls.slice(0, 2), [policyUrl, pageUrl]);
  assert.equal(calls.filter(url => url === policyUrl).length, 1);
  const document = result.policySurfaceObservations.find(o => o.finalUrl === policyUrl);
  assert.equal(document?.documentEvaluationState, "usable");
  assert.equal(document?.directlyLinkedFromScannedPage, false);
});

test("a browser policy candidate preserves the URL and its visible first-party source", () => {
  const candidate = selectBrowserPolicyFallback(pageUrl, [browserLink]);
  assert.equal(candidate?.normalizedUrl, policyUrl);
  assert.equal(candidate?.linkSourcePageUrl, pageUrl);
  assert.equal(candidate?.linkText, "Privacy Notice");
  for (const link of [
    { ...browserLink, href: "https://other.example.org/privacy-policy" },
    { ...browserLink, pageUrl: "https://other.example.org/" },
    { ...browserLink, href: policyUrl + "?token=private" },
  ]) assert.equal(selectBrowserPolicyFallback(pageUrl, [link]), undefined);
  assert.equal(selectBrowserPolicyFallback(pageUrl, [browserLink], [], new Map([[canonicalPolicyUrlIdentity(policyUrl), true]])), undefined);
});

test("the policy lane uses a handed-off browser URL in the common-path group", async t => {
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => {
    calls.push(String(url));
    if (url === pageUrl) return response("<main>Welcome to the representative fixture page.</main>");
    if (url === policyUrl) return response(policyBody);
    return response("Not Found", 404);
  });
  const start = Date.now();
  let reads = 0;
  const result = await policySurfaceScanner({
    url: pageUrl, normalizedUrl: pageUrl, scanStartedAtMs: start,
    internalBudgetMs: 10_000, absoluteDeadlineAtMs: start + 10_000, discoveryMode: "fast", artifactWriter: writer,
    browser: {newContext: async () => { throw new Error("no independent rendered page in this fixture"); }} as never,
    readBrowserPolicyLinks: async () => { reads++; return [browserLink]; },
  });
  assert.equal(reads, 1);
  assert.equal(calls.filter(url => url === policyUrl).length, 1);
  const document = result.policySurfaceObservations.find(o => o.finalUrl === policyUrl);
  assert.equal(document?.documentEvaluationState, "usable");
  assert.equal(document?.linkSourcePageUrl, pageUrl);
  assert(document?.selectionReasonCodes?.includes("exact_runtime_browser_policy_link"));
});
