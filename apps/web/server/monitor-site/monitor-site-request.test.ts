import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeWebsiteHostname,
  validateMonitorSiteRequestForm
} from "./monitor-site-request-validation";

function form(entries: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    formData.set(key, value);
  }
  return formData;
}

test("validateMonitorSiteRequestForm accepts a monitor request with report source context", () => {
  const result = validateMonitorSiteRequestForm(
    form({
      company: "Example Co",
      fullName: "Ada Lovelace",
      message: "Watch consent and accessibility drift.",
      monitoringGoal: "pre-consent-tracking",
      sourceContext: "pricing",
      sourcePageUrl: "https://certscore.ai/monitor-site?website=example.com",
      sourcePlan: "pro",
      sourceReportUrl: "https://certscore.ai/scans/public/report-123",
      website: "www.example.com",
      workEmail: "ADA@EXAMPLE.COM"
    })
  );

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.value.normalizedHostname, "example.com");
  assert.equal(result.value.workEmail, "ada@example.com");
  assert.equal(result.value.monitoringGoal, "pre-consent-tracking");
  assert.equal(result.value.sourceContext, "pricing");
  assert.equal(result.value.sourcePlan, "pro");
  assert.equal(result.value.sourceReportUrl, "https://certscore.ai/scans/public/report-123");
});

test("validateMonitorSiteRequestForm requires a valid work email and website", () => {
  const invalidEmail = validateMonitorSiteRequestForm(
    form({
      website: "example.com",
      workEmail: "not-email"
    })
  );
  assert.deepEqual(invalidEmail, { ok: false, error: "Enter a valid work email." });

  const invalidWebsite = validateMonitorSiteRequestForm(
    form({
      website: "not a host",
      workEmail: "name@example.com"
    })
  );
  assert.deepEqual(invalidWebsite, { ok: false, error: "Website is required for monitoring interest." });
});

test("validateMonitorSiteRequestForm falls back to the default monitoring goal and drops unsafe URLs", () => {
  const result = validateMonitorSiteRequestForm(
    form({
      monitoringGoal: "unsupported",
      sourcePageUrl: "javascript:alert(1)",
      sourcePlan: "enterprise-plus",
      sourceReportUrl: "ftp://example.com/report",
      website: "https://www.example.org/path",
      workEmail: "name@example.org"
    })
  );

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.value.monitoringGoal, "changes");
  assert.equal(result.value.normalizedHostname, "example.org");
  assert.equal(result.value.sourcePageUrl, null);
  assert.equal(result.value.sourcePlan, null);
  assert.equal(result.value.sourceReportUrl, null);
});

test("normalizeWebsiteHostname handles bare domains and full URLs", () => {
  assert.equal(normalizeWebsiteHostname("certscore.ai"), "certscore.ai");
  assert.equal(normalizeWebsiteHostname("https://www.certscore.ai/path?x=1"), "certscore.ai");
  assert.equal(normalizeWebsiteHostname(""), null);
});
