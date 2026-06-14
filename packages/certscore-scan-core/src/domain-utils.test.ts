import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyCookieParty,
  classifyParty,
  getHostname,
  getRegistrableDomain,
  isSameSiteOrParty,
} from "./domain-utils.js";

test("classifies basic first-party and third-party registrable domain boundaries", () => {
  assert.equal(classifyParty("https://cdn.example.com/a.js", "https://example.com"), "first_party");
  assert.equal(isSameSiteOrParty("https://cdn.example.com/a.js", "https://example.com"), true);
  assert.equal(classifyParty("https://tracker.example.net/pixel", "https://example.com"), "third_party");
});

test("uses public suffix rules for multi-label and private suffix domains", () => {
  assert.equal(getRegistrableDomain("www.example.co.uk"), "example.co.uk");
  assert.equal(classifyParty("https://analytics.example.co.uk/collect", "https://www.example.co.uk"), "first_party");
  assert.equal(classifyParty("https://tracker.co.uk/pixel", "https://www.example.co.uk"), "third_party");
  assert.equal(classifyParty("https://foo.github.io/script.js", "https://bar.github.io"), "third_party");
  assert.equal(classifyParty("https://foo.appspot.com/collect", "https://bar.appspot.com"), "third_party");
});

test("preserves localhost and IP behavior for local fixture scans", () => {
  assert.equal(getRegistrableDomain("localhost"), "localhost");
  assert.equal(getRegistrableDomain("127.0.0.1"), "127.0.0.1");
  assert.equal(getRegistrableDomain("::1"), "::1");
  assert.equal(classifyParty("http://localhost:4173/script.js", "http://localhost:3000"), "first_party");
  assert.equal(classifyParty("http://127.0.0.1:4173/script.js", "http://127.0.0.1:3000"), "first_party");
  assert.equal(classifyParty("https://www.google-analytics.com/g/collect", "http://127.0.0.1:3000"), "third_party");
});

test("classifies cookie domains against the top-level hostname", () => {
  assert.equal(classifyCookieParty(".example.com", "www.example.com"), "first_party");
  assert.equal(classifyCookieParty("tracker.example.net", "www.example.com"), "third_party");
  assert.equal(classifyCookieParty("www.example.com", "www.example.com"), "first_party");
  assert.equal(classifyCookieParty("doubleclick.net", "www.example.com"), "third_party");
});

test("handles invalid, missing, public-suffix-only, mixed-case, and trailing-dot hosts safely", () => {
  assert.equal(getHostname("not a url"), null);
  assert.equal(getRegistrableDomain(undefined), null);
  assert.equal(getRegistrableDomain("co.uk"), null);
  assert.equal(getHostname("HTTPS://WWW.Example.COM./path"), "www.example.com");
  assert.equal(getRegistrableDomain("WWW.Example.COM."), "example.com");
  assert.equal(classifyParty("not a url", "https://example.com"), "unknown");
});
