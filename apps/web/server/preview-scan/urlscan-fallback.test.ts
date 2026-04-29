import assert from "node:assert/strict";
import test from "node:test";
import { choosePreferredUrlscanSource, fetchUrlscanResult, isUrlscanResultThin } from "./urlscan-fallback";

test("thin region-error urlscan results are identified as weak", () => {
  assert.equal(
    isUrlscanResultThin({
      page: {
        title: "Fandango | A Message To Our Fans",
        url: "https://www.fandango.com/region-error"
      },
      data: {
        cookies: [{}],
        requests: [{}, {}, {}, {}]
      },
      lists: {
        domains: ["www.fandango.com", "geo.example.net", "img.example.net"],
        ips: ["1.1.1.1", "2.2.2.2", "3.3.3.3"]
      },
      technologies: []
    }, "www.fandango.com"),
    true
  );
});

test("preferred urlscan source promotes richer same-host homepage results", () => {
  const retained = {
    reportUrl: "https://urlscan.io/result/thin/",
    resultApiUrl: "https://urlscan.io/api/v1/result/thin/",
    result: {
      page: {
        title: "Fandango | A Message To Our Fans",
        url: "https://www.fandango.com/region-error"
      },
      data: {
        cookies: [{}],
        requests: [{}, {}, {}, {}]
      },
      lists: {
        domains: ["www.fandango.com", "geo.example.net", "img.example.net"],
        ips: ["1.1.1.1", "2.2.2.2", "3.3.3.3"]
      },
      technologies: []
    }
  };

  const promoted = {
    reportUrl: "https://urlscan.io/result/rich/",
    resultApiUrl: "https://urlscan.io/api/v1/result/rich/",
    result: {
      page: {
        title: "Movie Tickets & Movie Times | Fandango",
        url: "https://www.fandango.com/"
      },
      data: {
        cookies: new Array(64).fill({}),
        requests: new Array(355).fill({})
      },
      lists: {
        domains: new Array(89).fill("domain"),
        ips: new Array(85).fill("ip")
      },
      technologies: new Array(20).fill("tech")
    }
  };

  const selected = choosePreferredUrlscanSource({
    retained,
    candidates: [promoted],
    preferredHostname: "www.fandango.com"
  });

  assert.equal(selected?.resultApiUrl, promoted.resultApiUrl);
  assert.equal(selected?.reportUrl, promoted.reportUrl);
});

test("urlscan result fetches bypass the Next data cache", async () => {
  const originalFetch = globalThis.fetch;
  const calls: RequestInit[] = [];

  globalThis.fetch = (async (_url, init) => {
    calls.push(init ?? {});
    return new Response(JSON.stringify({ page: { url: "https://example.com/" } }), {
      headers: {
        "content-type": "application/json"
      },
      status: 200
    });
  }) as typeof fetch;

  try {
    const result = await fetchUrlscanResult("https://urlscan.io/api/v1/result/example/");

    assert.equal(result?.page && typeof result.page === "object", true);
    assert.equal(calls[0]?.cache, "no-store");
    assert.equal("next" in (calls[0] ?? {}), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
