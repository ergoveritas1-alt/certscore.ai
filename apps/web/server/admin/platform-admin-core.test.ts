import assert from "node:assert/strict";
import test from "node:test";
import { parsePlatformAdminEmails } from "./platform-admin-core";

test("platform admin email parsing includes defaults and comma-separated env entries", () => {
  const emails = parsePlatformAdminEmails(" codex.local@certscore.ai, BEN@CERTSCORE.AI ");

  assert.equal(emails.has("bmasek@gmail.com"), true);
  assert.equal(emails.has("ben@certscore.ai"), true);
  assert.equal(emails.has("codex.local@certscore.ai"), true);
  assert.equal(emails.has("BEN@CERTSCORE.AI"), false);
});
