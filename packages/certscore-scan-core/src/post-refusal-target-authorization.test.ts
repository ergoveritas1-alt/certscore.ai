import assert from "node:assert/strict";
import test from "node:test";
import {
  authorizePostRefusalTarget,
  bindPostRefusalBrowserResolvedExactTarget,
  ERGOVERITAS_POST_REFUSAL_CANARY_AUTHORIZATION_ID,
  getOwnedPostRefusalCanaryRecipeCase,
  RESOLVED_SCAN_TARGET_AUTHORIZATION_ID,
  resolvePostRefusalExactTarget,
} from "./post-refusal-target-authorization.js";

test("loopback authorization cannot be reused for public targets", () => {
  assert.equal(authorizePostRefusalTarget("http://127.0.0.1:4178/fixture", {
    authorizationId: "loopback_local_lab",
    kind: "loopback",
  }).authorized, true);
  assert.equal(authorizePostRefusalTarget("https://example.com/fixture", {
    authorizationId: "loopback_local_lab",
    kind: "loopback",
  }).authorized, false);
});

test("owned-canary authorization is exact-host and path scoped", () => {
  const authorization = {
    authorizationId: ERGOVERITAS_POST_REFUSAL_CANARY_AUTHORIZATION_ID,
    kind: "owned_canary" as const,
  };
  assert.equal(authorizePostRefusalTarget(
    "https://ergoveritas.com/.well-known/certscore-canary/post-refusal/reject-honored.html",
    authorization,
  ).authorized, true);
  assert.equal(authorizePostRefusalTarget(
    "https://ergoveritas.com/.well-known/certscore-canary/post-refusal/reject-ignored.html",
    authorization,
  ).authorized, true);
  for (let number = 1; number <= 4; number += 1) {
    assert.equal(authorizePostRefusalTarget(
      `https://ergoveritas.com/test${number}.html`,
      authorization,
    ).authorized, true);
    assert.equal(getOwnedPostRefusalCanaryRecipeCase(
      `https://ergoveritas.com/test${number}.html`,
    ), "tcf");
  }
  assert.equal(authorizePostRefusalTarget(
    "https://www.ergoveritas.com/.well-known/certscore-canary/post-refusal/reject-honored.html",
    authorization,
  ).authorized, false);
  assert.equal(authorizePostRefusalTarget(
    "https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html",
    authorization,
  ).authorized, false);
  assert.equal(authorizePostRefusalTarget(
    "https://ergoveritas.com/.well-known/certscore-canary/post-refusal/post-refusal-runtime.js",
    authorization,
  ).authorized, false);
  assert.equal(authorizePostRefusalTarget(
    "https://ergoveritas.com/.well-known/certscore-canary/post-refusal/reject-honored.html?variant=other",
    authorization,
  ).authorized, false);
  assert.equal(authorizePostRefusalTarget(
    "https://ergoveritas.com/.well-known/certscore-canary/post-refusal/reject-honored.html#other",
    authorization,
  ).authorized, false);
  assert.equal(getOwnedPostRefusalCanaryRecipeCase(
    "https://ergoveritas.com/.well-known/certscore-canary/post-refusal/reject-ignored.html",
  ), "tcf");
  assert.equal(getOwnedPostRefusalCanaryRecipeCase(
    "https://ergoveritas.com/test3.html?variant=other",
  ), undefined);
});

test("explicit public authorization requires an exact HTTPS host and path prefix", () => {
  const authorization = {
    authorizationId: "calibration-run-123",
    kind: "explicit_allowlist" as const,
    targets: [{ hostname: "cmp-test.example", pathPrefix: "/consent-test/" }],
  };
  assert.equal(authorizePostRefusalTarget("https://cmp-test.example/consent-test/banner", authorization).authorized, true);
  assert.equal(authorizePostRefusalTarget("https://cmp-test.example/consent-test", authorization).authorized, true);
  assert.equal(authorizePostRefusalTarget("http://cmp-test.example/consent-test/banner", authorization).authorized, false);
  assert.equal(authorizePostRefusalTarget("https://sub.cmp-test.example/consent-test/banner", authorization).authorized, false);
  assert.equal(authorizePostRefusalTarget("https://cmp-test.example/consent-testing", authorization).authorized, false);
  assert.equal(authorizePostRefusalTarget("https://cmp-test.example/other", authorization).authorized, false);
});

test("explicit public authorization accepts an exact terminal path without broadening it", () => {
  const authorization = {
    authorizationId: "calibration-basf",
    kind: "explicit_allowlist" as const,
    targets: [{ hostname: "www.basf.com", pathPrefix: "/us/en" }],
  };

  assert.equal(authorizePostRefusalTarget("https://www.basf.com/us/en", authorization).authorized, true);
  assert.equal(authorizePostRefusalTarget("https://www.basf.com/us/en/", authorization).authorized, true);
  assert.equal(authorizePostRefusalTarget("https://www.basf.com/us/english", authorization).authorized, false);
});

test("normal sharded-scan authorization is bound to one exact normalized HTTPS URL", () => {
  const authorization = {
    authorizationId: "sharded_scan_exact_target.v1" as const,
    kind: "scan_target" as const,
    normalizedUrl: "https://example.com/privacy?region=ca",
    scanId: "scan-123",
  };

  assert.equal(authorizePostRefusalTarget(
    "https://example.com/privacy?region=ca",
    authorization,
    "scan-123",
  ).reason, "authorized_scan_target");
  assert.equal(authorizePostRefusalTarget(
    "https://example.com/privacy?region=eu",
    authorization,
    "scan-123",
  ).authorized, false);
  assert.equal(authorizePostRefusalTarget(
    "https://example.com/privacy/",
    authorization,
    "scan-123",
  ).authorized, false);
  assert.equal(authorizePostRefusalTarget(
    "https://www.example.com/privacy?region=ca",
    authorization,
    "scan-123",
  ).authorized, false);
  assert.equal(authorizePostRefusalTarget(
    "http://example.com/privacy?region=ca",
    authorization,
    "scan-123",
  ).authorized, false);
  assert.equal(authorizePostRefusalTarget(
    "https://example.com/privacy?region=ca",
    authorization,
    "scan-456",
  ).reason, "scan_target_scan_identity_mismatch");
});

test("resolved exact-target authorization v2 follows bounded passive redirects then binds only the final URL", async () => {
  const opened: string[] = [];
  const authorization = {
    authorizationId: RESOLVED_SCAN_TARGET_AUTHORIZATION_ID,
    kind: "scan_target_resolution" as const,
    maxRedirects: 5,
    requestedUrl: "https://example.com/privacy?region=ca",
    resolutionTimeoutMs: 1_500,
    scanId: "scan-123",
  };
  const result = await resolvePostRefusalExactTarget(
    authorization.requestedUrl,
    authorization,
    authorization.scanId,
    {
      fetchImpl: async (input) => {
        const url = String(input);
        opened.push(url);
        return url === authorization.requestedUrl
          ? new Response(null, {
              status: 301,
              headers: { location: "https://www.example.com/privacy?region=ca" },
            })
          : new Response("ok", { status: 200 });
      },
      urlGuard: async (input) => new URL(input),
    },
  );

  assert.equal(result.status, "resolved");
  if (result.status !== "resolved") return;
  assert.equal(result.redirectCount, 1);
  assert.deepEqual(opened, [
    "https://example.com/privacy?region=ca",
    "https://www.example.com/privacy?region=ca",
  ]);
  assert.equal(authorizePostRefusalTarget(
    "https://www.example.com/privacy?region=ca",
    result.authorization,
    "scan-123",
  ).reason, "authorized_resolved_scan_target");
  assert.equal(authorizePostRefusalTarget(
    "https://example.com/privacy?region=ca",
    result.authorization,
    "scan-123",
  ).authorized, false);
  assert.equal(authorizePostRefusalTarget(
    "https://www.example.com/privacy?region=ca",
    result.authorization,
    "scan-456",
  ).reason, "scan_target_scan_identity_mismatch");
});

test("browser-resolved exact-target authorization binds only the observed final HTTPS URL and scan ID", async () => {
  const authorization = {
    authorizationId: RESOLVED_SCAN_TARGET_AUTHORIZATION_ID,
    kind: "scan_target_resolution" as const,
    maxRedirects: 3,
    requestedUrl: "https://example.com/",
    resolutionTimeoutMs: 5_000,
    scanId: "browser-scan-1",
  };
  const result = await bindPostRefusalBrowserResolvedExactTarget({
    durationMs: 900,
    finalUrl: "https://www.example.com/en/?region=ie",
    redirectCount: 2,
    requestedUrl: authorization.requestedUrl,
  }, authorization, authorization.scanId, {
    urlGuard: async (input) => new URL(input),
  });

  assert.equal(result.status, "resolved");
  if (result.status !== "resolved") return;
  assert.equal(result.targetUrl, "https://www.example.com/en/?region=ie");
  assert.equal(authorizePostRefusalTarget(
    result.targetUrl,
    result.authorization,
    authorization.scanId,
  ).reason, "authorized_resolved_scan_target");
  assert.equal(authorizePostRefusalTarget(
    "https://www.example.com/en/",
    result.authorization,
    authorization.scanId,
  ).authorized, false);

  const wrongScan = await bindPostRefusalBrowserResolvedExactTarget({
    durationMs: 900,
    finalUrl: "https://www.example.com/en/?region=ie",
    redirectCount: 2,
    requestedUrl: authorization.requestedUrl,
  }, authorization, "browser-scan-2", {
    urlGuard: async (input) => new URL(input),
  });
  assert.equal(wrongScan.status === "failed" ? wrongScan.failureReason : undefined, "scan_identity_mismatch");

  const excessive = await bindPostRefusalBrowserResolvedExactTarget({
    durationMs: 900,
    finalUrl: "https://www.example.com/en/?region=ie",
    redirectCount: 4,
    requestedUrl: authorization.requestedUrl,
  }, authorization, authorization.scanId, {
    urlGuard: async (input) => new URL(input),
  });
  assert.equal(excessive.status === "failed" ? excessive.failureReason : undefined, "redirect_limit_exceeded");
});

test("resolved exact-target authorization v2 carries only bounded redirect cookies in its passive resolution jar", async () => {
  const requestedUrl = "https://www.example.com/gb/en/";
  const authorization = {
    authorizationId: RESOLVED_SCAN_TARGET_AUTHORIZATION_ID,
    kind: "scan_target_resolution" as const,
    maxRedirects: 3,
    requestedUrl,
    resolutionTimeoutMs: 1_500,
    scanId: "scan-cookie-redirect",
  };
  const cookieHeaders: string[] = [];
  const result = await resolvePostRefusalExactTarget(
    requestedUrl,
    authorization,
    authorization.scanId,
    {
      fetchImpl: async (_input, init) => {
        const headers = new Headers(init?.headers);
        cookieHeaders.push(headers.get("cookie") ?? "");
        if (cookieHeaders.length === 1) {
          return new Response(null, {
            status: 302,
            headers: {
              location: requestedUrl,
              "set-cookie": "permanentLocaleCookie=gb; Domain=.example.com; Path=/; Secure; HttpOnly",
            },
          });
        }
        return new Response("ok", { status: 200 });
      },
      urlGuard: async (input) => new URL(input),
    },
  );

  assert.equal(result.status, "resolved");
  assert.deepEqual(cookieHeaders, ["", "permanentLocaleCookie=gb"]);
});

test("resolved exact-target authorization v2 fails closed for unsafe or excessive redirects", async () => {
  const authorization = {
    authorizationId: RESOLVED_SCAN_TARGET_AUTHORIZATION_ID,
    kind: "scan_target_resolution" as const,
    maxRedirects: 0,
    requestedUrl: "https://example.com/",
    resolutionTimeoutMs: 1_500,
    scanId: "scan-123",
  };
  const excessive = await resolvePostRefusalExactTarget(
    authorization.requestedUrl,
    authorization,
    authorization.scanId,
    {
      fetchImpl: async () => new Response(null, {
        status: 302,
        headers: { location: "https://www.example.com/" },
      }),
      urlGuard: async (input) => new URL(input),
    },
  );
  assert.equal(excessive.status === "failed" ? excessive.failureReason : undefined, "redirect_limit_exceeded");

  const unsafe = await resolvePostRefusalExactTarget(
    authorization.requestedUrl,
    { ...authorization, maxRedirects: 5 },
    authorization.scanId,
    {
      fetchImpl: async () => new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/admin" },
      }),
      urlGuard: async (input) => new URL(input),
    },
  );
  assert.equal(unsafe.status === "failed" ? unsafe.failureReason : undefined, "unsafe_redirect_target");
});
