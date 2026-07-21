import assert from "node:assert/strict";
import test from "node:test";
import {
  CAMPAIGN_ATTRIBUTION_STORAGE_KEY,
  captureCampaignAttribution,
  normalizeCampaignAttribution,
  readCampaignAttributionFromSearch
} from "./campaign-attribution";

test("campaign attribution keeps only the supported, bounded UTM fields", () => {
  assert.deepEqual(
    readCampaignAttributionFromSearch(
      "?utm_source=theadminbar&utm_medium=newsletter&utm_campaign=privacy_agency_test&utm_content=sidebar&utm_term=privacy%20scan&gclid=ignored"
    ),
    {
      utm_campaign: "privacy_agency_test",
      utm_content: "sidebar",
      utm_medium: "newsletter",
      utm_source: "theadminbar",
      utm_term: "privacy scan"
    }
  );
  assert.equal(normalizeCampaignAttribution({ utm_source: "\u0000bad" }), null);
  assert.equal(normalizeCampaignAttribution({ utm_source: "x".repeat(201) }), null);
});

test("first-touch attribution is retained and does not become direct traffic on later navigation", () => {
  const stores = new Map<string, Map<string, string>>([
    ["localStorage", new Map()],
    ["sessionStorage", new Map()]
  ]);
  const makeStorage = (name: string) => ({
    getItem: (key: string) => stores.get(name)?.get(key) ?? null,
    setItem: (key: string, value: string) => stores.get(name)?.set(key, value),
    removeItem: (key: string) => stores.get(name)?.delete(key)
  });
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: makeStorage("localStorage"),
      sessionStorage: makeStorage("sessionStorage"),
      location: { search: "?utm_source=theadminbar&utm_medium=newsletter&utm_campaign=privacy_agency_test" }
    }
  });

  try {
    const first = captureCampaignAttribution();
    assert.deepEqual(first.attribution, {
      utm_campaign: "privacy_agency_test",
      utm_medium: "newsletter",
      utm_source: "theadminbar"
    });
    assert.equal(first.hasIncoming, true);
    assert.equal(stores.get("localStorage")?.has(CAMPAIGN_ATTRIBUTION_STORAGE_KEY), true);

    const second = captureCampaignAttribution("?");
    assert.deepEqual(second.attribution, first.attribution);
    assert.equal(second.hasIncoming, false);
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  }
});
