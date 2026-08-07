import assert from "node:assert/strict";
import test from "node:test";
import { pulseScanThrottleIdentity } from "./repository";

test("root scans include the scanner location in the throttle identity", () => {
  assert.equal(pulseScanThrottleIdentity({
    normalizedDomain: "example.com",
    normalizedUrl: "https://example.com/",
    scanFrom: "eu_ie"
  }), "example.com|eu_ie");
});

test("page scans use a path-specific throttle identity and ignore query strings", () => {
  assert.equal(pulseScanThrottleIdentity({
    normalizedDomain: "example.com",
    normalizedUrl: "https://example.com/test/consent.html?run=123",
    scanFrom: "eu_de"
  }), "example.com/test/consent.html|eu_de");
});

test("the same page uses independent throttle identities across scan locations", () => {
  assert.notEqual(
    pulseScanThrottleIdentity({ normalizedDomain: "example.com", normalizedUrl: "https://example.com/test/consent.html", scanFrom: "eu_ie" }),
    pulseScanThrottleIdentity({ normalizedDomain: "example.com", normalizedUrl: "https://example.com/test/consent.html", scanFrom: "california" })
  );
});

test("different page paths receive different throttle identities", () => {
  assert.notEqual(
    pulseScanThrottleIdentity({ normalizedDomain: "example.com", normalizedUrl: "https://example.com/test/consent.html" }),
    pulseScanThrottleIdentity({ normalizedDomain: "example.com", normalizedUrl: "https://example.com/test/privacy.html" })
  );
});
