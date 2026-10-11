import assert from "node:assert/strict";
import test from "node:test";
import { resolveCanonicalVendor } from "./index.js";

test("HubSpot EU1 tracking pixel retains the canonical analytics identity", () => {
  const base = resolveCanonicalVendor({ type: "request", url: "https://track.hubspot.com/__ptq.gif" });
  assert.equal(base.status, "resolved");
  for (const url of [
    "https://track-eu1.hubspot.com/__ptq.gif",
    "https://track-eu1.hubspot.com/__ptq.gif?k=1&v=3.0",
    "https://track-eu1.hubspot.com/ptq.gif",
  ]) {
    const result = resolveCanonicalVendor({ type: "request", url });
    assert.equal(result.status, "resolved", url);
    assert.equal(result.observation?.product, "HubSpot Analytics");
    assert.equal(result.observation?.purpose, "analytics");
    for (const [key, expected] of [
      ["entityId", "ent_182562f6476e"],
      ["vendorId", "ven_32eb0adcc0a3"],
      ["serviceId", "svc_9b547f4290e0"],
    ] as const) {
      assert.equal(base.observation?.registryAttribution?.[key], expected);
      assert.equal(result.observation?.registryAttribution?.[key], expected);
    }
    assert.equal(result.observation?.registryAttribution?.matchKind, "endpoint");
    assert.deepEqual(result.observation?.registryAttribution?.ruleIds, ["hubspot_ptq_tracking_pixel"]);
  }
});

test("HubSpot EU1 pixel attribution stays bounded to its exact HTTPS authority and path", () => {
  for (const url of [
    "https://track-eu1.hubspot.com/ordinary.gif",
    "https://track-eu1.hubspot.com/__ptq.gif/extra",
    "https://track-eu1.hubspot.com/__ptq.gif.evil",
    "https://track-eu1.hubspot.com.evil.test/__ptq.gif",
    "https://track-eu1.hubspot.com@evil.test/__ptq.gif",
    "https://track-eu2.hubspot.com/__ptq.gif",
    "https://example.test/?url=https://track-eu1.hubspot.com/__ptq.gif",
    "http://track-eu1.hubspot.com/__ptq.gif",
  ]) {
    const result = resolveCanonicalVendor({ type: "request", url, hostname: "track-eu1.hubspot.com" });
    assert.notEqual(result.observation?.product, "HubSpot Analytics", url);
  }
});
