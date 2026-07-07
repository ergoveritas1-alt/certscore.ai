import assert from "node:assert/strict";
import test from "node:test";
import {
  getAllowedAuthEmails,
  isAllowedAuthEmail,
  isAuthAccessRestricted,
  isPublicAccountCreationEnabled,
  isSelfServePurchasingEnabled
} from "./access-control-core";

test("access control defaults allow public auth access", () => {
  const env = {};

  assert.equal(isAuthAccessRestricted(env), false);
  assert.equal(isAllowedAuthEmail("BEN@CERTSCORE.AI", env), true);
  assert.equal(isAllowedAuthEmail("bmasek@gmail.com", env), true);
  assert.equal(isAllowedAuthEmail("demo@certscore.ai", env), true);
  assert.equal(isAllowedAuthEmail("xlprep@gmail.com", env), true);
  assert.equal(isAllowedAuthEmail("ben@ergoveritas.com", env), true);
  assert.equal(isAllowedAuthEmail("someone@example.com", env), true);
});

test("access control allows env allowlist overrides", () => {
  const env = {
    CERTSCORE_AUTH_ACCESS_RESTRICTED: "true",
    CERTSCORE_AUTH_ALLOWED_EMAILS: "one@example.com, TWO@example.com "
  };

  assert.deepEqual(Array.from(getAllowedAuthEmails(env)).sort(), ["one@example.com", "two@example.com"]);
  assert.equal(isAllowedAuthEmail("two@example.com", env), true);
  assert.equal(isAllowedAuthEmail("ben@certscore.ai", env), false);
});

test("account creation and self-serve purchasing default to enabled", () => {
  const env = {};

  assert.equal(isPublicAccountCreationEnabled(env), true);
  assert.equal(isSelfServePurchasingEnabled(env), true);
});

test("auth restriction can be explicitly disabled", () => {
  const env = {
    CERTSCORE_AUTH_ACCESS_RESTRICTED: "false"
  };

  assert.equal(isAuthAccessRestricted(env), false);
  assert.equal(isAllowedAuthEmail("someone@example.com", env), true);
});

test("public account and purchasing access can still be explicitly paused", () => {
  const env = {
    CERTSCORE_AUTH_ACCESS_RESTRICTED: "true",
    CERTSCORE_PUBLIC_ACCOUNT_CREATION_ENABLED: "false",
    CERTSCORE_SELF_SERVE_PURCHASING_ENABLED: "false"
  };

  assert.equal(isAuthAccessRestricted(env), true);
  assert.equal(isAllowedAuthEmail("someone@example.com", env), false);
  assert.equal(isPublicAccountCreationEnabled(env), false);
  assert.equal(isSelfServePurchasingEnabled(env), false);
});
