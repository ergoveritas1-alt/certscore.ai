import assert from "node:assert/strict";
import test from "node:test";
import { validateScanUrl } from "./url-preflight";

const publicResolve = async () => [{ address: "93.184.216.34", family: 4 as const }];
const privateResolve = async () => [{ address: "127.0.0.1", family: 4 as const }];
const dnsFailure = async () => {
  throw new Error("ENOTFOUND");
};

function htmlResponse(status = 200, headers: Record<string, string> = {}) {
  return new Response("<html><body>ok</body></html>", {
    headers,
    status
  });
}

function asUrl(input: URL | RequestInfo) {
  return input instanceof Request ? new URL(input.url) : new URL(input);
}

test("normalizes bare domains to https origin", async () => {
  const result = await validateScanUrl("Example.COM", {
    fetchImpl: async () => htmlResponse(),
    resolveHostname: publicResolve
  });

  assert.equal(result.status, "ok");
  assert.equal(result.normalizedUrl, "https://example.com/");
  assert.equal(result.hostname, "example.com");
});

test("rejects invalid URLs with typo suggestion", async () => {
  const result = await validateScanUrl("example,com", {
    fetchImpl: async () => htmlResponse(),
    resolveHostname: publicResolve
  });

  assert.equal(result.status, "invalid_url");
  assert.equal(result.suggestion, "example.com");
});

test("rejects emails and suggests the domain only", async () => {
  const result = await validateScanUrl("person@example.com", {
    fetchImpl: async () => htmlResponse(),
    resolveHostname: publicResolve
  });

  assert.equal(result.status, "invalid_url");
  assert.equal(result.suggestion, "example.com");
});

test("rejects private resolved IPs and localhost before fetch", async () => {
  const privateResult = await validateScanUrl("example.com", {
    fetchImpl: async () => {
      throw new Error("should not fetch private DNS result");
    },
    resolveHostname: privateResolve
  });
  const localhostResult = await validateScanUrl("localhost", {
    fetchImpl: async () => htmlResponse(),
    resolveHostname: publicResolve
  });

  assert.equal(privateResult.status, "domain_not_found");
  assert.equal(localhostResult.status, "invalid_url");
});

test("corrects protocol typos safely", async () => {
  const result = await validateScanUrl("htps://example.com", {
    fetchImpl: async () => htmlResponse(),
    resolveHostname: publicResolve
  });

  assert.equal(result.status, "ok");
  assert.equal(result.normalizedUrl, "https://example.com/");
  assert.equal(result.suggestion, "https://example.com");
});

test("suggests common TLD typos", async () => {
  const result = await validateScanUrl("example.con", {
    fetchImpl: async () => htmlResponse(),
    resolveHostname: dnsFailure
  });

  assert.equal(result.status, "domain_not_found");
  assert.equal(result.suggestion, "example.com");
});

test("classifies DNS failure", async () => {
  const result = await validateScanUrl("missing.example", {
    fetchImpl: async () => htmlResponse(),
    resolveHostname: dnsFailure
  });

  assert.equal(result.status, "domain_not_found");
});

test("falls back from https to http", async () => {
  const result = await validateScanUrl("example.com", {
    fetchImpl: async (url) => {
      if (asUrl(url).protocol === "https:") {
        throw new Error("TLS failed");
      }
      return htmlResponse();
    },
    resolveHostname: publicResolve
  });

  assert.equal(result.status, "ok");
  assert.equal(result.finalUrl, "http://example.com/");
});

test("falls back between non-www and www hosts", async () => {
  const result = await validateScanUrl("example.com", {
    fetchImpl: async (url) => {
      if (asUrl(url).hostname !== "www.example.com") {
        throw new Error("host failed");
      }
      return htmlResponse();
    },
    resolveHostname: publicResolve
  });

  assert.equal(result.status, "ok");
  assert.equal(result.finalUrl, "https://www.example.com/");
});

test("allows same-domain redirects without confirmation", async () => {
  const result = await validateScanUrl("http://example.com", {
    fetchImpl: async (url) => {
      const parsed = asUrl(url);
      if (parsed.protocol === "https:" && parsed.hostname === "example.com") {
        return htmlResponse(301, { location: "https://www.example.com/en-us" });
      }
      return htmlResponse();
    },
    resolveHostname: publicResolve
  });

  assert.equal(result.status, "ok");
  assert.equal(result.requiresConfirmation, false);
  assert.equal(result.finalUrl, "https://www.example.com/en-us");
});

test("requires confirmation for cross-domain redirects", async () => {
  const result = await validateScanUrl("example.com", {
    fetchImpl: async (url) => {
      if (asUrl(url).hostname === "example.com") {
        return htmlResponse(302, { location: "https://other.com/" });
      }
      return htmlResponse();
    },
    resolveHostname: publicResolve
  });

  assert.equal(result.status, "redirected_to_different_domain");
  assert.equal(result.requiresConfirmation, true);
  assert.equal(result.finalUrl, "https://other.com/");
});

test("classifies bot or challenge-looking responses", async () => {
  const result = await validateScanUrl("example.com", {
    fetchImpl: async () => new Response("Checking your browser before accessing this site", { status: 403 }),
    resolveHostname: publicResolve
  });

  assert.equal(result.status, "blocked_or_challenged");
});

test("classifies timeouts", async () => {
  const result = await validateScanUrl("example.com", {
    fetchImpl: async (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      }),
    requestTimeoutMs: 5,
    resolveHostname: publicResolve
  });

  assert.equal(result.status, "timeout");
});
