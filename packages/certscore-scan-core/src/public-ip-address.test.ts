import assert from "node:assert/strict";
import test from "node:test";
import { normalizePublicIpAddress } from "./public-ip-address.js";

test("normalizePublicIpAddress retains public IPv4 and IPv6 addresses", () => {
  assert.equal(normalizePublicIpAddress("142.250.72.2"), "142.250.72.2");
  assert.equal(normalizePublicIpAddress("192.0.0.9"), "192.0.0.9");
  assert.equal(normalizePublicIpAddress("2607:f8b0:4005:80a::200e"), "2607:f8b0:4005:80a::200e");
  assert.equal(normalizePublicIpAddress("::ffff:142.250.72.2"), "142.250.72.2");
});

test("normalizePublicIpAddress excludes non-public and malformed addresses", () => {
  for (const value of [
    "0.0.0.0",
    "10.0.0.1",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.10.2",
    "172.16.0.1",
    "192.0.2.10",
    "192.168.1.1",
    "198.18.0.1",
    "198.51.100.20",
    "203.0.113.5",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "::ffff:192.168.1.1",
    "2001:2::1",
    "2001:db8::1",
    "2002:c000:0204::1",
    "3fff::1",
    "fc00::1",
    "fe80::1",
    "fe80::1%en0",
    "ff02::1",
    "not-an-ip",
  ]) {
    assert.equal(normalizePublicIpAddress(value), null, value);
  }
});
