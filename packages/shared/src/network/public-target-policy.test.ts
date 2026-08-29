import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyPublicTargetAddress,
  isLocalOnlyTargetHostname,
  isPublicTargetAddress
} from "./public-target-policy";

test("public target policy rejects unsafe IPv4 ranges", () => {
  for (const address of [
    "0.0.0.0", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.169.254",
    "172.16.0.1", "192.168.1.1", "192.0.2.1", "198.18.0.1", "198.51.100.1",
    "203.0.113.1", "224.0.0.1", "240.0.0.1", "255.255.255.255"
  ]) {
    assert.equal(isPublicTargetAddress(address), false, address);
  }
  assert.equal(isPublicTargetAddress("1.1.1.1"), true);
  assert.equal(isPublicTargetAddress("93.184.216.34"), true);
});

test("public target policy rejects unsafe IPv6 and mapped addresses", () => {
  for (const address of [
    "::", "::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "fc00::1", "fd00:ec2::254",
    "fe80::1", "ff02::1", "2001:db8::1", "3fff::1", "2002::1"
  ]) {
    assert.equal(isPublicTargetAddress(address), false, address);
  }
  assert.deepEqual(classifyPublicTargetAddress("2606:4700:4700::1111").public, true);
});

test("public target policy rejects local-only hostname classes", () => {
  for (const hostname of [
    "localhost", "api.localhost", "host.local", "localhost.localdomain", "service.internal", "router.home.arpa"
  ]) {
    assert.equal(isLocalOnlyTargetHostname(hostname), true, hostname);
  }
  assert.equal(isLocalOnlyTargetHostname("example.com"), false);
});
