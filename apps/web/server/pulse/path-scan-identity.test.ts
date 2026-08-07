import assert from "node:assert/strict";
import test from "node:test";
import { pulseScanThrottleIdentity } from "./repository";

test("root scans retain the legacy domain throttle identity", () => {
  assert.equal(pulseScanThrottleIdentity({
    normalizedDomain: "example.com",
    normalizedUrl: "https://example.com/"
  }), "example.com");
});

test("page scans use a path-specific throttle identity and ignore query strings", () => {
  assert.equal(pulseScanThrottleIdentity({
    normalizedDomain: "example.com",
    normalizedUrl: "https://example.com/test/consent.html?run=123"
  }), "example.com/test/consent.html");
});

test("different page paths receive different throttle identities", () => {
  assert.notEqual(
    pulseScanThrottleIdentity({ normalizedDomain: "example.com", normalizedUrl: "https://example.com/test/consent.html" }),
    pulseScanThrottleIdentity({ normalizedDomain: "example.com", normalizedUrl: "https://example.com/test/privacy.html" })
  );
});
