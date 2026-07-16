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
    reason: null,
    retryable: false
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
    reason: null,
    retryable: false
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
  assert.equal(status.retryable, false);
  assert.match(status.reason, /could not find DNS records/i);
});

test("checkDomainDns accepts domains resolved by platform lookup fallback", async () => {
  const status = await checkDomainDnsWithResolvers("sonymcs.com", {
    lookup: async () => [{ address: "98.87.70.224", family: 4 }],
    resolve4: async () => {
      throw dnsError("ENOTFOUND");
    },
    resolve6: async () => {
      throw dnsError("ENODATA");
    }
  });

  assert.deepEqual(status, {
    exists: true,
    reason: null,
    retryable: false
  });
});

test("checkDomainDns reports resolver timeouts as retryable instead of nonexistent", async () => {
  const status = await checkDomainDnsWithResolvers("example.com", {
    lookup: async () => {
      throw dnsError("EAI_AGAIN");
    },
    resolve4: async () => {
      throw dnsError("ETIMEOUT");
    },
    resolve6: async () => {
      throw dnsError("ESERVFAIL");
    }
  });

  assert.equal(status.exists, false);
  assert.equal(status.retryable, true);
  assert.match(status.reason, /could not verify/i);
});

test("checkDomainDns accepts a positive lookup when record resolvers are temporarily unavailable", async () => {
  const status = await checkDomainDnsWithResolvers("example.com", {
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    resolve4: async () => {
      throw dnsError("ETIMEOUT");
    },
    resolve6: async () => {
      throw dnsError("ESERVFAIL");
    }
  });

  assert.deepEqual(status, {
    exists: true,
    reason: null,
    retryable: false
  });
});
