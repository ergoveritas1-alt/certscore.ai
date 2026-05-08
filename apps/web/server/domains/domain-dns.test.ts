import assert from "node:assert/strict";
import test from "node:test";
import { checkDomainDnsWithResolvers } from "./domain-dns-core";

function dnsError(code: string) {
  return Object.assign(new Error(code), { code });
}

test("checkDomainDns accepts domains with IPv4 records", async () => {
  const status = await checkDomainDnsWithResolvers("example.com", {
    resolve4: async () => ["93.184.216.34"],
    resolve6: async () => {
      throw dnsError("ENODATA");
    }
  });

  assert.deepEqual(status, {
    exists: true,
    reason: null
  });
});

test("checkDomainDns accepts domains with IPv6 records", async () => {
  const status = await checkDomainDnsWithResolvers("example.com", {
    resolve4: async () => {
      throw dnsError("ENODATA");
    },
    resolve6: async () => ["2606:2800:220:1:248:1893:25c8:1946"]
  });

  assert.deepEqual(status, {
    exists: true,
    reason: null
  });
});

test("checkDomainDns rejects domains without address records", async () => {
  const status = await checkDomainDnsWithResolvers("missing.example", {
    resolve4: async () => {
      throw dnsError("ENOTFOUND");
    },
    resolve6: async () => {
      throw dnsError("ENOTFOUND");
    }
  });

  assert.equal(status.exists, false);
  assert.match(status.reason, /could not find DNS records/i);
});
