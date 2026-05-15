import assert from "node:assert/strict";
import test from "node:test";
import { buildMonitorSiteActivationEmailText } from "./monitor-site-activation-email";

test("buildMonitorSiteActivationEmailText keeps activation copy cautious", () => {
  const text = buildMonitorSiteActivationEmailText({
    activeFrequency: "weekly",
    appUrl: "https://certscore.ai",
    hostname: "example.com",
    normalizedUrl: "https://example.com"
  });

  assert.match(text, /monitoring setup for example\.com has been confirmed/);
  assert.match(text, /Configured cadence: Weekly/);
  assert.match(text, /public-web observations/);
  assert.match(text, /review signals/);
  assert.match(text, /evidence for review/);
  assert.match(text, /not legal advice/);
  assert.match(text, /not .*certification/i);
  assert.match(text, /not .*compliance determination/i);
  assert.doesNotMatch(text, /\billegal\b/i);
  assert.doesNotMatch(text, /\bviolation\b/i);
  assert.doesNotMatch(text, /\bnon-compliant\b/i);
  assert.doesNotMatch(text, /\bguaranteed\b/i);
});

test("buildMonitorSiteActivationEmailText includes status link when available", () => {
  const text = buildMonitorSiteActivationEmailText({
    activeFrequency: "monthly",
    appUrl: "https://certscore.ai",
    hostname: "example.com",
    normalizedUrl: "https://example.com",
    statusUrl: "https://certscore.ai/monitor-site/status/status-token"
  });

  assert.match(text, /review the request status at https:\/\/certscore\.ai\/monitor-site\/status\/status-token/);
  assert.doesNotMatch(text, /\/app\/domains/);
});
