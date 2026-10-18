import assert from "node:assert/strict";
import test from "node:test";
import {sanitizeEvidenceRequestUrl} from "./evidence-request-url";

test("network display URLs remove credentials, fragments and identifier values in every URL component", () => {
  for (const url of [
    "https://user:password@c.clarity.ms/c.gif?MUID=private-token&sid=private-token#private-token",
    "https://ad.doubleclick.net/activity;src=private-token;ord=private-token?uid=private-token",
    "https://dpm.demdex.net/ibs:dpid=private-token&dpuuid=private-token",
    "https://collector.test/uid/private-token?x=private-token",
    "https://collector.test/value%253Dprivate-token?email%40private-token=value",
  ]) {
    const result = sanitizeEvidenceRequestUrl(url)!;
    assert.ok(result.startsWith("https://"));
    assert.ok(!result.includes("private-token"), result);
    assert.ok(!result.includes("password"), result);
    assert.equal(sanitizeEvidenceRequestUrl(result), result);
  }
  assert.equal(sanitizeEvidenceRequestUrl("https://dpm.demdex.net/id?d_cid=secret"), "https://dpm.demdex.net/id?d_cid=[redacted]");
  assert.equal(sanitizeEvidenceRequestUrl("https://site.test/collect?uid=secret", {query:"marker"}), "https://site.test/collect?redacted=1");
  assert.equal(sanitizeEvidenceRequestUrl("javascript:alert(1)"), undefined);
});
