import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { getPulseRequesterContext, normalizePulseUrl, parsePulseDetail, parsePulseFormat, parsePulseFreshness, parsePulseWaitSeconds } from "./request";

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
    const proof = createHmac("sha256", secret).update(`${timestamp}.${ip}`).digest("base64url");
    const verified = getPulseRequesterContext(new Request("https://certscore.ai/api/v2/scans", {
      headers: {
        "x-certscore-anonymous-requester-ip": ip,
        "x-certscore-anonymous-requester-timestamp": timestamp,
        "x-certscore-anonymous-requester-proof": proof
      }
    }));
    assert.equal(verified.sourceIp, ip);
    assert.ok(verified.ipHash);

    const invalid = getPulseRequesterContext(new Request("https://certscore.ai/api/v2/scans", {
      headers: {
        "x-certscore-anonymous-requester-ip": "198.51.100.90",
        "x-certscore-anonymous-requester-timestamp": timestamp,
        "x-certscore-anonymous-requester-proof": "invalid-proof",
        "x-real-ip": "198.51.100.91"
      }
    }));
    assert.equal(invalid.sourceIp, "198.51.100.91");
  } finally {
    if (previousSecret === undefined) delete process.env.CERTSCORE_OAUTH_JWT_SECRET;
    else process.env.CERTSCORE_OAUTH_JWT_SECRET = previousSecret;
  }
});
