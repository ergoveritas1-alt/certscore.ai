import assert from "node:assert/strict";
import test from "node:test";
import { getGmailConfig } from "./gmail";

test("getGmailConfig normalizes grouped Google app passwords", () => {
  const previousUser = process.env.GMAIL_SMTP_USER;
  const previousPassword = process.env.GMAIL_SMTP_APP_PASSWORD;
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;

  try {
    process.env.GMAIL_SMTP_USER = " sender@certscore.ai ";
    process.env.GMAIL_SMTP_APP_PASSWORD = "abcd efgh ijkl mnop";
    process.env.NEXT_PUBLIC_APP_URL = "https://certscore.ai";

    assert.deepEqual(getGmailConfig(), {
      appPassword: "abcdefghijklmnop",
      appUrl: "https://certscore.ai",
      fromEmail: "sender@certscore.ai"
    });
  } finally {
    if (previousUser === undefined) delete process.env.GMAIL_SMTP_USER;
    else process.env.GMAIL_SMTP_USER = previousUser;
    if (previousPassword === undefined) delete process.env.GMAIL_SMTP_APP_PASSWORD;
    else process.env.GMAIL_SMTP_APP_PASSWORD = previousPassword;
    if (previousAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
  }
});
