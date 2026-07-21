import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildConsentBootstrapScript } from "./consent-bootstrap";

test("Umami is loaded through the consent bootstrap with bounded production settings", () => {
  const script = buildConsentBootstrapScript("G-TEST", {
    domains: ["certscore.ai", "www.certscore.ai"],
    scriptUrl: "https://cloud.umami.is/script.js",
    websiteId: "umami-test-id"
  });

  assert.match(script, /certscoreAnalyticsConsent !== 'granted'/);
  assert.match(script, /certscoreLoadAnalytics/);
  assert.match(script, /certscoreLoadUmami/);
  assert.match(script, /cloud\.umami\.is\/script\.js/);
  assert.match(script, /data-website-id/);
  assert.match(script, /data-do-not-track/);
  assert.match(script, /data-exclude-search/);
  assert.match(script, /umami-test-id/);
  assert.match(script, /certscore\.ai,www\.certscore\.ai/);
});

test("consented product events are mirrored to Umami", async () => {
  const source = await readFile("apps/web/lib/analytics/data-layer.ts", "utf8");
  assert.match(source, /window\.umami\.track\(eventName, parameters\)/);
  assert.match(source, /pushUmamiEvent\((?:attributedEvent|event)\)/);
});
