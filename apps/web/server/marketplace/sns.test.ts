import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createSign } from "node:crypto";
import { snsCanonicalMessage, verifyMarketplaceSns, type SnsEnvelope } from "./sns";

test("SNS accepts signed notifications and confirmations; rejects modified payloads and untrusted topics", async () => {
  const dir = mkdtempSync(join(tmpdir(), "marketplace-sns-test-"));
  try {
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem"), "-subj", "/CN=local-test-only", "-days", "1"], { stdio: "ignore" });
    const key = readFileSync(join(dir, "key.pem"));
    const cert = readFileSync(join(dir, "cert.pem"), "utf8");
    const topic = "arn:aws:sns:us-east-1:123456789012:test";
    const fetcher: typeof fetch = async (_url, options) => {
      assert.equal(options?.redirect, "error");
      return new Response(cert);
    };
    for (const Type of ["Notification", "SubscriptionConfirmation"] as const) {
      const value: SnsEnvelope = { Type, MessageId: "00000000-0000-4000-8000-000000000001", TopicArn: topic, Message: "test", Timestamp: new Date().toISOString(), SignatureVersion: "2", Signature: "", SigningCertURL: "https://sns.us-east-1.amazonaws.com/SimpleNotificationService-abc123.pem", ...(Type === "SubscriptionConfirmation" ? { Token: "test-token", SubscribeURL: "https://sns.us-east-1.amazonaws.com/" } : { Subject: "test" }) };
      value.Signature = createSign("RSA-SHA256").update(snsCanonicalMessage(value)).sign(key, "base64");
      assert.equal((await verifyMarketplaceSns(value, topic, fetcher)).Type, Type);
      await assert.rejects(verifyMarketplaceSns({ ...value, Message: "tampered" }, topic, fetcher), /signature/);
      await assert.rejects(verifyMarketplaceSns(value, "wrong-topic", async () => { throw new Error("must not fetch"); }), /Untrusted/);
      await assert.rejects(verifyMarketplaceSns({ ...value, SigningCertURL: "https://localhost/cert.pem" }, topic, fetcher), /Untrusted/);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
