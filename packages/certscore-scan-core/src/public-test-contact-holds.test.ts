import assert from "node:assert/strict";
import test from "node:test";
import {
  assertPublicTestContactAllowed,
  publicTestContactHoldForUrl,
} from "./public-test-contact-holds.js";

test("SITS and its subdomains are held from CertScore-initiated live testing", () => {
  assert.equal(publicTestContactHoldForUrl("https://sits.com/en/")?.domain, "sits.com");
  assert.equal(publicTestContactHoldForUrl("https://www.sits.com/")?.domain, "sits.com");
  assert.equal(publicTestContactHoldForUrl("https://privacy.sits.com/")?.domain, "sits.com");
  assert.throws(
    () => assertPublicTestContactAllowed("https://sits.com/en/", "fixture"),
    /Live test contact is paused for sits\.com/,
  );
});

test("the SITS hold does not match unrelated domains", () => {
  assert.equal(publicTestContactHoldForUrl("https://example.com/"), undefined);
  assert.equal(publicTestContactHoldForUrl("https://notsits.com/"), undefined);
  assert.doesNotThrow(() => assertPublicTestContactAllowed("https://example.com/", "fixture"));
});
