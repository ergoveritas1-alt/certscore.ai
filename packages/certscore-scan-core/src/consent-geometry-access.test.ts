import assert from "node:assert/strict";
import test from "node:test";
import {
  buildConsentGeometryEgressDiagnostic,
  classifyConsentGeometryAccess,
  collectConsentGeometryPageAccess,
  firstProxyEnv,
  missingRequiredProxyDiagnostic,
} from "./consent-geometry-access.js";

test("classifyConsentGeometryAccess marks bot/security pages as security no-go", () => {
  const diagnostic = classifyConsentGeometryAccess({
    httpStatus: 403,
    title: "Access Denied",
    bodyText: "Performing security verification. This page is displayed while the website verifies you are not a bot.",
  });

  assert.equal(diagnostic.status, "rate_limited_or_security_challenge");
  assert.ok(diagnostic.reasonCodes.includes("http_status_403"));
  assert.ok(diagnostic.reasonCodes.includes("access_denied_text"));
  assert.ok(diagnostic.reasonCodes.includes("bot_security_check"));
});

test("classifyConsentGeometryAccess marks hard access denied pages as access no-go", () => {
  const diagnostic = classifyConsentGeometryAccess({
    httpStatus: 403,
    title: "Access Denied",
    bodyText: "Access denied.",
  });

  assert.equal(diagnostic.status, "access_no_go");
  assert.ok(diagnostic.reasonCodes.includes("http_status_403"));
  assert.ok(diagnostic.reasonCodes.includes("access_denied_text"));
});

test("classifyConsentGeometryAccess marks HTTP 200 access denied bodies as access no-go", () => {
  const diagnostic = classifyConsentGeometryAccess({
    httpStatus: 200,
    title: "Access Denied",
    bodyText: "Access Denied You don't have permission to access \"http://www.lowes.com/\" on this server.",
  });

  assert.equal(diagnostic.status, "access_no_go");
  assert.ok(diagnostic.reasonCodes.includes("access_denied_text"));
});

test("classifyConsentGeometryAccess separates rate-limited and security challenge pages", () => {
  const diagnostic = classifyConsentGeometryAccess({
    httpStatus: 429,
    title: "Security Checkpoint",
    bodyText: "Vercel Security Checkpoint. Browser verification required before continuing.",
  });

  assert.equal(diagnostic.status, "rate_limited_or_security_challenge");
  assert.ok(diagnostic.reasonCodes.includes("http_status_429"));
  assert.ok(diagnostic.reasonCodes.includes("bot_security_check"));
});

test("classifyConsentGeometryAccess marks human challenge copy as no-go", () => {
  const diagnostic = classifyConsentGeometryAccess({
    httpStatus: 200,
    title: "Walmart | Save Money. Live better.",
    bodyText: "Robot or human? Activate and hold the button to confirm that you're human. Press & Hold.",
  });

  assert.equal(diagnostic.status, "rate_limited_or_security_challenge");
  assert.ok(diagnostic.reasonCodes.includes("bot_security_check"));
});

test("classifyConsentGeometryAccess marks temporary access restriction copy as no-go", () => {
  const diagnostic = classifyConsentGeometryAccess({
    httpStatus: 200,
    title: "Access is temporarily restricted",
    bodyText: "We detected unusual activity from your device or network. Automated activity on your network may be the reason.",
  });

  assert.equal(diagnostic.status, "rate_limited_or_security_challenge");
  assert.ok(diagnostic.reasonCodes.includes("temporarily_restricted"));
  assert.ok(diagnostic.reasonCodes.includes("bot_security_check"));
});

test("classifyConsentGeometryAccess marks Polish temporary interstitial copy as no-go", () => {
  const diagnostic = classifyConsentGeometryAccess({
    httpStatus: 200,
    title: "TVN24",
    bodyText: "Zaraz wracamy",
  });

  assert.equal(diagnostic.status, "access_no_go");
  assert.ok(diagnostic.reasonCodes.includes("temporary_interstitial"));
});

test("classifyConsentGeometryAccess marks Imperva hCaptcha copy as no-go", () => {
  const diagnostic = classifyConsentGeometryAccess({
    httpStatus: 200,
    title: "Hertz",
    bodyText: "www.hertz.com - Additional security check is required. I am human hCaptcha. Powered by Imperva.",
  });

  assert.equal(diagnostic.status, "rate_limited_or_security_challenge");
  assert.ok(diagnostic.reasonCodes.includes("bot_security_check"));
  assert.ok(diagnostic.reasonCodes.includes("imperva_challenge"));
});

test("classifyConsentGeometryAccess marks Cloudflare broken-origin SSL pages as access no-go", () => {
  const diagnostic = classifyConsentGeometryAccess({
    httpStatus: 526,
    title: "Invalid SSL certificate",
    bodyText: "Error 526 Ray ID: abc123 SSL handshake failed. Cloudflare is unable to establish an SSL connection to the origin server.",
  });

  assert.equal(diagnostic.status, "access_no_go");
  assert.ok(diagnostic.reasonCodes.includes("http_status_526"));
  assert.ok(diagnostic.reasonCodes.includes("cloudflare_challenge"));
  assert.ok(diagnostic.reasonCodes.includes("cloudflare_origin_error"));
});

test("classifyConsentGeometryAccess marks Kasada WAF pages as security no-go", () => {
  const diagnostic = classifyConsentGeometryAccess({
    httpStatus: 403,
    title: "403 Forbidden",
    bodyText: "Request blocked. Protected by Kasada. x-kpsdk-cd: 1.",
  });

  assert.equal(diagnostic.status, "rate_limited_or_security_challenge");
  assert.ok(diagnostic.reasonCodes.includes("http_status_403"));
  assert.ok(diagnostic.reasonCodes.includes("forbidden_text"));
  assert.ok(diagnostic.reasonCodes.includes("kasada_challenge"));
});

test("classifyConsentGeometryAccess leaves ordinary pages eligible for A/R/O", () => {
  const diagnostic = classifyConsentGeometryAccess({
    httpStatus: 200,
    title: "Example",
    bodyText: "Welcome to our site. We use cookies. Accept All Reject All Manage Cookies.",
  });

  assert.equal(diagnostic.status, "loaded");
  assert.deepEqual(diagnostic.reasonCodes, []);
});

test("classifyConsentGeometryAccess does not treat ordinary Cloudflare Pages attribution as a challenge", () => {
  const diagnostic = classifyConsentGeometryAccess({
    httpStatus: 200,
    title: "Arne Brachhold",
    bodyText: "Senior manager and software architect. Powered by Astro, Minimal Mistakes & Cloudflare Pages. Privacy Policy.",
  });

  assert.equal(diagnostic.status, "loaded");
  assert.deepEqual(diagnostic.reasonCodes, []);
});

test("classifyConsentGeometryAccess marks navigation timeouts distinctly", () => {
  const diagnostic = classifyConsentGeometryAccess({
    errorMessage: "page.goto: Timeout 15000ms exceeded.",
  });

  assert.equal(diagnostic.status, "timeout");
});

test("classifyConsentGeometryAccess keeps rendered HTTP-200 partial evidence loaded", () => {
  const diagnostic = classifyConsentGeometryAccess({
    httpStatus: 200,
    errorMessage: "Pre-consent runtime reached its 35000ms module budget; retained bounded partial evidence.",
  });

  assert.equal(diagnostic.status, "loaded");
});

test("collectConsentGeometryPageAccess bounds hanging frame text extraction", async () => {
  const page = {
    frames: () => [
      { evaluate: () => new Promise(() => undefined) },
      { evaluate: async () => ({ title: "Example", bodyText: "Welcome. We use cookies. Accept All." }) },
    ],
  };

  const startedAt = Date.now();
  const diagnostic = await collectConsentGeometryPageAccess(page as never, 200, {
    frameTextTimeoutMs: 20,
    supplementalBodyText: "Supplemental privacy text.",
  });

  assert.equal(diagnostic.status, "loaded");
  assert.match(diagnostic.textExcerpt ?? "", /We use cookies/);
  assert.ok(Date.now() - startedAt < 250);
});

test("egress diagnostic detects configured proxy env without exposing value", () => {
  const env = {
    SCAN_PROXY_SERVER: "socks5://127.0.0.1:1080",
  } as NodeJS.ProcessEnv;

  assert.deepEqual(firstProxyEnv(env), {
    key: "SCAN_PROXY_SERVER",
    value: "socks5://127.0.0.1:1080",
  });
  assert.deepEqual(buildConsentGeometryEgressDiagnostic({ env, label: "aws-eu-ie-proxy", requireProxy: true }), {
    label: "aws-eu-ie-proxy",
    proxyConfigured: true,
    proxyServerEnvKey: "SCAN_PROXY_SERVER",
    requiredProxy: true,
  });
});

test("missingRequiredProxyDiagnostic records egress no-go without a browser run", () => {
  const diagnostic = missingRequiredProxyDiagnostic({ label: "aws-eu-ie-proxy" });

  assert.equal(diagnostic.status, "access_no_go");
  assert.ok(diagnostic.reasonCodes.includes("required_proxy_missing"));
});
