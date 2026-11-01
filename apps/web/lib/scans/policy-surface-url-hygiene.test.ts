import { samePolicyDocumentUrl } from "./policy-surface-url-hygiene";
import assert from "node:assert/strict";
import test from "node:test";

import { isGenericBrowserCookieHelpUrl } from "./policy-surface-url-hygiene";

test("isGenericBrowserCookieHelpUrl filters Fandango-style Microsoft Edge cookie help false positives", () => {
  assert.equal(
    isGenericBrowserCookieHelpUrl(
      "https://support.microsoft.com/en-us/windows/manage-cookies-in-microsoft-edge-view-allow-block-delete-and-use-168dab11-0753-043d-7c16-ede5947fc64d"
    ),
    true
  );
});

test("isGenericBrowserCookieHelpUrl filters common browser vendor cookie help pages", () => {
  assert.equal(isGenericBrowserCookieHelpUrl("https://support.google.com/chrome/answer/95647/cookies?hl=en"), true);
  assert.equal(isGenericBrowserCookieHelpUrl("https://support.mozilla.org/en-US/kb/clear-cookies-and-site-data-firefox"), true);
  assert.equal(isGenericBrowserCookieHelpUrl("https://support.apple.com/guide/safari/manage-cookies-sfri11471/mac"), true);
});

test("isGenericBrowserCookieHelpUrl keeps owned cookie policies eligible", () => {
  assert.equal(isGenericBrowserCookieHelpUrl("https://www.fandango.com/policies/cookie-policy"), false);
  assert.equal(isGenericBrowserCookieHelpUrl("https://privacy.microsoft.com/en-us/privacystatement"), false);
});

test("policy document identity preserves query, scheme, port and exact path while allowing section fragments", () => {
  const source = "https://example.test/privacy?tenant=one&revision=2";
  assert.equal(samePolicyDocumentUrl(source, source + "#retention"), true);
  assert.equal(samePolicyDocumentUrl(source, "https://EXAMPLE.test:443/privacy?tenant=one&revision=2"), true);
  for (const other of ["https://example.test/privacy?tenant=two&revision=2",
    "https://example.test/privacy?revision=2&tenant=one", "https://example.test/privacy",
    "http://example.test/privacy?tenant=one&revision=2", "https://example.test:8443/privacy?tenant=one&revision=2",
    "https://www.example.test/privacy?tenant=one&revision=2", "https://example.test/privacy/?tenant=one&revision=2",
    "https://example.test/Privacy?tenant=one&revision=2", "https://user:password@example.test/privacy?tenant=one&revision=2",
    "/privacy?tenant=one&revision=2", "invalid", "file:///privacy"]) {
    assert.equal(samePolicyDocumentUrl(source, other), false, other);
  }
  assert.equal(samePolicyDocumentUrl("/privacy", "/privacy"), false);
});
