import assert from "node:assert/strict";
import test from "node:test";
import { buildPasswordEmailContent } from "./password-email-content";

const email = "new-user@example.com";
const url = "https://certscore.ai/api/auth/reset-password/secure-token";

test("account setup emails welcome the user and explain activation", () => {
  const content = buildPasswordEmailContent({
    email,
    purpose: "account_setup",
    url
  });

  assert.equal(content.subject, "Welcome to CertScore.ai — set your password");
  assert.match(content.text, /An account has been created for you using new-user@example\.com\./);
  assert.match(content.text, /create your password and activate your account/);
  assert.match(content.text, /expires in 24 hours/);
  assert.match(content.text, /workspace assigned to you/);
  assert.match(content.text, /not expecting this invitation/);
  assert.match(content.text, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(content.text, /request to reset/);
});

test("password reset emails retain recovery-specific language", () => {
  const content = buildPasswordEmailContent({
    email,
    purpose: "password_reset",
    url
  });

  assert.equal(content.subject, "Reset your CertScore.ai password");
  assert.match(content.text, /request to reset your CertScore\.ai password/);
  assert.match(content.text, /choose a new password/);
  assert.doesNotMatch(content.text, /account has been created/);
});
