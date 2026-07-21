import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildConsentBootstrapScript } from "./consent-bootstrap";
import { pushDataLayerEvent, toUmamiEvent } from "./data-layer";

test("Umami loads by default with bounded production settings", () => {
  const script = buildConsentBootstrapScript("G-TEST", {
    domains: ["certscore.ai", "www.certscore.ai"],
    scriptUrl: "https://cloud.umami.is/script.js",
    websiteId: "umami-test-id"
  });

  assert.doesNotThrow(() => new Function(script));
  assert.doesNotMatch(script, /certscoreAnalyticsConsent !== 'granted' \|\| w\.certscoreUmamiLoaded/);
  assert.match(script, /certscoreLoadAnalytics/);
  assert.match(script, /certscoreLoadUmami/);
  assert.match(script, /cloud\.umami\.is\/script\.js/);
  assert.match(script, /data-website-id/);
  assert.match(script, /data-do-not-track/);
  assert.match(script, /data-exclude-search/);
  assert.match(script, /data-before-send/);
  assert.match(script, /certscoreBeforeUmamiSend/);
  assert.match(script, /\/scan\/:scan/);
  assert.match(script, /\/pulse\/:domain/);
  assert.match(script, /delete sanitized\.title/);
  assert.match(script, /delete sanitized\.referrer/);
  assert.match(script, /umami-test-id/);
  assert.match(script, /certscore\.ai,www\.certscore\.ai/);
});

test("coarse product events reach Umami before the optional-consent gate", async () => {
  const source = await readFile("apps/web/lib/analytics/data-layer.ts", "utf8");
  assert.match(source, /pushUmamiEvent\(event\);\s+\n\s+if \(!hasAnalyticsConsent\(\)\)/);
});

test("Umami receives coarse events when optional analytics consent is denied", () => {
  const calls: unknown[][] = [];
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      certscoreAnalyticsConsent: "denied",
      localStorage: { getItem: () => null },
      umami: { track: (...args: unknown[]) => calls.push(args) }
    }
  });

  pushDataLayerEvent({ event: "pricing_cta_clicked", cta_type: "monitoring", plan: "private-plan-value" });

  assert.deepEqual(calls, [["pricing_cta_clicked", { cta_type: "monitoring" }]]);
  Reflect.deleteProperty(globalThis, "window");
});

test("Umami events omit identifiers, destinations, paths, and free-form values", () => {
  assert.deepEqual(
    toUmamiEvent({
      event: "gpt_cta_clicked",
      location: "homepage",
      destination: "certscore_gpt",
      url: "https://example.test/private"
    }),
    { eventName: "gpt_cta_clicked", properties: { location: "homepage" } }
  );
  assert.deepEqual(
    toUmamiEvent({ event: "mcp_light_action", action: "scan", target: "customer.example" }),
    { eventName: "mcp_light_action", properties: { action: "scan" } }
  );
  assert.deepEqual(
    toUmamiEvent({ event: "pricing_cta_clicked", cta_type: "monitoring", plan: "free form" }),
    { eventName: "pricing_cta_clicked", properties: { cta_type: "monitoring" } }
  );
});
