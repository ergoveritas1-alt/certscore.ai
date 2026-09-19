import assert from "node:assert/strict";
import test from "node:test";
import { agreementAllowsAccess, validateResolvedCustomer } from "./contracts";
import { allowedSnsCertificate, snsCanonicalMessage } from "./sns";
import { marketplaceKeyProof, verifyMarketplaceKeyProof } from "@certscore/mcp-auth";

test("onboarding requires product, AWS account, and license identity", () => {
  const value = { ProductCode: "product", CustomerAWSAccountId: "123456789012", LicenseArn: "arn:aws:license-manager::123456789012:license:l-123abc" };
  assert.deepEqual(validateResolvedCustomer(value, "product"), value);
  assert.throws(() => validateResolvedCustomer(value, "wrong-product"));
  assert.throws(() => validateResolvedCustomer({ ...value, LicenseArn: undefined }, "product"));
  assert.throws(() => validateResolvedCustomer({ ...value, CustomerAWSAccountId: "" }, "product"));
});
test("license updates require an active, started, unexpired agreement for that buyer", () => {
  const now = Date.now();
  const value = { status: "ACTIVE", startTime: new Date(now - 1000), endTime: new Date(now + 1000), acceptor: { accountId: "123456789012" } };
  assert.equal(agreementAllowsAccess(value, "123456789012", now), true);
  for (const changed of [{ status: "CANCELLED" }, { startTime: undefined }, { startTime: new Date(now + 1) }, { endTime: new Date(now) }, { acceptor: { accountId: "999999999999" } }]) {
    assert.equal(agreementAllowsAccess({ ...value, ...changed }, "123456789012", now), false);
  }
});
test("SNS certificate fetching accepts only the pinned AWS HTTPS certificate path", () => {
  assert.equal(allowedSnsCertificate("https://sns.us-east-1.amazonaws.com/SimpleNotificationService-abc123.pem"), true);
  for (const url of ["http://sns.us-east-1.amazonaws.com/SimpleNotificationService-abc.pem", "https://sns.us-east-1.amazonaws.com.evil.test/SimpleNotificationService-a.pem", "https://sns.us-east-1.amazonaws.com/SimpleNotificationService-a.pem?url=http://localhost", "https://user@sns.us-east-1.amazonaws.com/SimpleNotificationService-a.pem", "https://localhost/a.pem"]) assert.equal(allowedSnsCertificate(url), false);
});
test("SNS signatures include all required fields in AWS order", () => {
  assert.equal(snsCanonicalMessage({ Type: "Notification", MessageId: "id", TopicArn: "topic", Message: "body", Timestamp: "time", SignatureVersion: "2", Signature: "sig", SigningCertURL: "https://example.com", Subject: "subject" }), "Message\nbody\nMessageId\nid\nSubject\nsubject\nTimestamp\ntime\nTopicArn\ntopic\nType\nNotification\n");
});
test("internal auth proof binds token, timestamp, and purpose", () => {
  const time = String(Date.now()); const proof = marketplaceKeyProof("secret", time, "key");
  assert.equal(verifyMarketplaceKeyProof("secret", time, "key", proof), true);
  assert.equal(verifyMarketplaceKeyProof("secret", time, "other", proof), false);
  assert.equal(verifyMarketplaceKeyProof("secret", time, "key", proof, Number(time) + 31_000), false);
  assert.equal(verifyMarketplaceKeyProof("secret", time, "key", "bad"), false);
});
