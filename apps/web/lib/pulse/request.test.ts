import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { getPulseRequesterContext, normalizePulseUrl, parsePulseDetail, parsePulseFormat, parsePulseFreshness, parsePulseWaitSeconds, trustedMcpInternalRead } from "./request";

test("Pulse request parsing applies canonical defaults and wait bounds", () => {
  assert.equal(parsePulseFormat(null), "json");
  assert.equal(parsePulseFormat("markdown"), "markdown");
  assert.equal(parsePulseDetail(null), "summary");
  assert.equal(parsePulseDetail("quick"), "tiny");
  assert.equal(parsePulseDetail("tiny"), "tiny");
  assert.equal(parsePulseDetail("standard"), "standard");
  assert.equal(parsePulseDetail("full"), "full");
  assert.equal(parsePulseDetail("summary"), "summary");
  assert.equal(parsePulseDetail("evidence"), "evidence");
  assert.equal(parsePulseFreshness(null), "latest");
  assert.equal(parsePulseFreshness("refresh"), "refresh");
  assert.equal(parsePulseWaitSeconds("999"), 80);
  assert.equal(parsePulseWaitSeconds("-10"), 0);
});

test("Pulse URL normalization accepts domains and rejects invalid input", () => {
  const normalized = normalizePulseUrl("example.com");
  assert.equal(normalized.ok, true);
  if (normalized.ok) {
    assert.equal(normalized.normalizedDomain, "example.com");
    assert.equal(normalized.normalizedUrl, "https://example.com/");
  }

  assert.equal(normalizePulseUrl("not a url").ok, false);
});

test("Pulse requester context accepts only a fresh signed anonymous MCP requester proof", () => {
  const previousSecret = process.env.CERTSCORE_OAUTH_JWT_SECRET;
  const secret = "anonymous-mcp-requester-test-secret";
  process.env.CERTSCORE_OAUTH_JWT_SECRET = secret;
  try {
    const ip = "203.0.113.44";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const surface = "mcp_light";
    const session = "opaque-session-binding-123456";
    const proof = createHmac("sha256", secret).update(`${timestamp}.${ip}.${surface}.${session}`).digest("base64url");
    const verified = getPulseRequesterContext(new Request("https://certscore.ai/api/v2/scans", {
      headers: {
        "x-certscore-anonymous-requester-ip": ip,
        "x-certscore-anonymous-requester-timestamp": timestamp,
        "x-certscore-anonymous-requester-proof": proof,
        "x-certscore-anonymous-requester-session": session,
        "x-certscore-anonymous-surface": surface
      }
    }));
    assert.equal(verified.sourceIp, ip);
    assert.equal(verified.anonymousMcpSurface, "mcp_light");
    assert.match(verified.anonymousMcpSessionHash ?? "", /^[a-f0-9]{64}$/);
    assert.ok(verified.ipHash);

    const invalid = getPulseRequesterContext(new Request("https://certscore.ai/api/v2/scans", {
      headers: {
        "x-certscore-anonymous-requester-ip": "198.51.100.90",
        "x-certscore-anonymous-requester-timestamp": timestamp,
        "x-certscore-anonymous-requester-proof": "invalid-proof",
        "x-real-ip": "198.51.100.91"
      }
    }));
    assert.equal(invalid.sourceIp, null);
  } finally {
    if (previousSecret === undefined) delete process.env.CERTSCORE_OAUTH_JWT_SECRET;
    else process.env.CERTSCORE_OAUTH_JWT_SECRET = previousSecret;
  }
});

test("internal Light read proofs are bound to operation, scan, method, and exact path", () => {
  const previousSecret = process.env.CERTSCORE_OAUTH_JWT_SECRET;
  const secret = "anonymous-mcp-requester-test-secret";
  process.env.CERTSCORE_OAUTH_JWT_SECRET = secret;
  try {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const ip = "160.79.104.9";
    const operation = "scan_bundle";
    const scanId = "scan_123";
    const url = "https://certscore.ai/api/v2/scans/scan_123/findings?limit=100";
    const target = "/api/v2/scans/scan_123/findings?limit=100";
    const headers = {
      "x-certscore-anonymous-requester-ip": ip,
      "x-certscore-anonymous-requester-timestamp": timestamp,
      "x-certscore-anonymous-requester-proof": createHmac("sha256", secret).update(`${timestamp}.${ip}.mcp_light`).digest("base64url"),
      "x-certscore-anonymous-surface": "mcp_light",
      "x-certscore-mcp-internal-operation": operation,
      "x-certscore-mcp-internal-scan-id": scanId,
      "x-certscore-mcp-internal-proof": createHmac("sha256", secret).update(`${timestamp}.${operation}.${scanId}.GET.${target}`).digest("base64url")
    };
    const request = new Request(url, { headers });
    assert.deepEqual(trustedMcpInternalRead(request, { operations: ["scan_bundle"], scanId }), { operation, scanId });
    assert.equal(trustedMcpInternalRead(new Request(`${url}&page=2`, { headers }), { operations: ["scan_bundle"], scanId }), null);
    assert.equal(trustedMcpInternalRead(request, { operations: ["scan_status"], scanId }), null);
  } finally {
    if (previousSecret === undefined) delete process.env.CERTSCORE_OAUTH_JWT_SECRET;
    else process.env.CERTSCORE_OAUTH_JWT_SECRET = previousSecret;
  }
});

test("authenticated hosted MCP internal reads use the same bounded proof without anonymous identity", () => {
  const previousSecret = process.env.CERTSCORE_OAUTH_JWT_SECRET;
  const secret = "authenticated-mcp-internal-test-secret";
  process.env.CERTSCORE_OAUTH_JWT_SECRET = secret;
  try {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const operation = "scan_bundle";
    const scanId = "scan_123";
    const url = "https://certscore.ai/api/v2/scans/scan_123/findings";
    const target = "/api/v2/scans/scan_123/findings";
    const headers = {
      authorization: "Bearer verified-upstream-oauth-token",
      "x-certscore-mcp-internal-timestamp": timestamp,
      "x-certscore-mcp-internal-operation": operation,
      "x-certscore-mcp-internal-scan-id": scanId,
      "x-certscore-mcp-internal-proof": createHmac("sha256", secret).update(`${timestamp}.${operation}.${scanId}.GET.${target}`).digest("base64url")
    };
    const request = new Request(url, { headers });
    assert.deepEqual(trustedMcpInternalRead(request, { operations: ["scan_bundle"], scanId }), { operation, scanId });
    assert.equal(trustedMcpInternalRead(new Request(url, { headers: { ...headers, authorization: "" } }), { operations: ["scan_bundle"], scanId }), null);
    assert.equal(trustedMcpInternalRead(new Request(url, { headers: { ...headers, "x-certscore-mcp-internal-proof": "invalid" } }), { operations: ["scan_bundle"], scanId }), null);
    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 301);
    assert.equal(trustedMcpInternalRead(new Request(url, { headers: {
      ...headers,
      "x-certscore-mcp-internal-timestamp": staleTimestamp,
      "x-certscore-mcp-internal-proof": createHmac("sha256", secret).update(`${staleTimestamp}.${operation}.${scanId}.GET.${target}`).digest("base64url")
    } }), { operations: ["scan_bundle"], scanId }), null);
  } finally {
    if (previousSecret === undefined) delete process.env.CERTSCORE_OAUTH_JWT_SECRET;
    else process.env.CERTSCORE_OAUTH_JWT_SECRET = previousSecret;
  }
});
