import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { apiV2PreConsentRuntimePreviewSchema } from "@certscore/api-contracts";
import { preConsentRuntimePreviewSchema } from "@certscore/contracts";
import { PreConsentRuntimePreviewCard, previewInventory } from "./pre-consent-runtime-preview-card";
import { runtimePreviewFixture } from "./pre-consent-runtime-preview-fixture";

test("preview shows requests, embeds and operational services without double counting", () => {
  const preview = apiV2PreConsentRuntimePreviewSchema.parse(preConsentRuntimePreviewSchema.parse(runtimePreviewFixture));
  assert.equal(previewInventory(preview).length, 6);
  const html = renderToStaticMarkup(<PreConsentRuntimePreviewCard preview={preview} startedAt="2026-09-06T00:00:00.000Z" />);
  for (const text of ["Google Maps embed", "Facebook Page Plugin", "Google Fonts", "Consent management", "Font delivery", "Same-site", "Cross-site", "Requests"]) assert.ok(html.includes(text), text);
  assert.match(html, /Evidence mix:.*Contextual 6/);
  assert.match(html, /h-\[50px\] w-\[50px\]/);
  assert.doesNotMatch(html, /No resource identities/);
  assert.equal(preview.summary.trackingVendorCount, 0, "operational services must not inflate tracking vendors");
});

test("legacy preview includes operational services as contextual rows without inventing timing or relationships", () => {
  const { resources: _resources, ...legacy } = runtimePreviewFixture;
  const rows = previewInventory(legacy);
  assert.equal(rows.length, 2);
  assert.ok(rows.every(row => row.evidence === "Contextual" && row.observed === "Timing unavailable" && row.relationship === "Unknown"));
});

test("resource preview contract rejects unbounded and sensitive extra fields", () => {
  const invalid = { ...runtimePreviewFixture, resources: [{ ...runtimePreviewFixture.resources![0], rawCookieValue: "secret" }] };
  assert.equal(preConsentRuntimePreviewSchema.safeParse(invalid).success, false);
  assert.equal(apiV2PreConsentRuntimePreviewSchema.safeParse(invalid).success, false);
  assert.equal(apiV2PreConsentRuntimePreviewSchema.safeParse({ ...runtimePreviewFixture, resources: Array(21).fill(runtimePreviewFixture.resources![0]) }).success, false);
});
