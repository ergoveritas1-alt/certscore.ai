import assert from "node:assert/strict";
import test from "node:test";
import { resolveCanonicalVendorHeadquarters, VENDOR_HEADQUARTERS_REFERENCES, VENDOR_HEADQUARTERS_VERSION } from "./vendor-headquarters";
import { resolveCanonicalVendorLegalContext } from "./cookie-knowledge-base";

test("every HQ entry has a unique exact entity and reviewable HTTPS provenance", () => {
  const seen = new Set<string>();
  for (const row of VENDOR_HEADQUARTERS_REFERENCES) {
    assert.ok(!seen.has(row.entity)); seen.add(row.entity);
    assert.equal(row.registryVersion, VENDOR_HEADQUARTERS_VERSION);
    assert.match(row.checkedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(row.sources.length && row.note);
    for (const source of row.sources) { assert.equal(new URL(source.url).protocol, "https:"); assert.ok(source.title); }
    if (row.status === "verified") assert.match(row.headquartersCountry!, /^[A-Z]{2}$/);
    else assert.equal(row.headquartersCountry, null);
  }
});

test("new recognized providers have HQ metadata without inferred transfer safeguards", () => {
  for (const entity of ["Amplitude, Inc.", "Cloudflare, Inc.", "Meta Platforms, Inc.", "FullStory, Inc.", "LinkedIn Corporation", "Microsoft Corporation", "Mixpanel, Inc."]) {
    const legal = resolveCanonicalVendorLegalContext(entity);
    assert.equal(legal?.controllingEntity, entity);
    assert.equal(legal?.headquartersCountry, "US");
    assert.equal(legal?.transferMechanism.mechanism, "unknown");
  }
});

test("regional entities, legacy identities and registered offices never inherit group HQ", () => {
  assert.equal(resolveCanonicalVendorHeadquarters("Meta Platforms Ireland Limited"), null);
  assert.equal(resolveCanonicalVendorHeadquarters("Google Ireland Limited"), null);
  assert.equal(resolveCanonicalVendorHeadquarters("AS15169"), null);
  assert.equal(resolveCanonicalVendorHeadquarters(null), null);
  assert.equal(resolveCanonicalVendorHeadquarters("google llc"), null);
  for (const entity of ["Hotjar Ltd", "Segment.io, Inc.", "TikTok Technology Limited", "X Corp."]) {
    assert.equal(resolveCanonicalVendorHeadquarters(entity)?.status, "unverified");
    assert.equal(resolveCanonicalVendorHeadquarters(entity)?.headquartersCountry, null);
    assert.equal(resolveCanonicalVendorLegalContext(entity), null);
  }
});

test("corpus-prioritized HQ references preserve exact entities and unknown transfer mechanisms", () => {
  for (const [entity, country] of [["Amazon.com, Inc.", "US"], ["HubSpot, Inc.", "US"], ["Comscore, Inc.", "US"], ["Usercentrics A/S", "DK"], ["The Trade Desk, Inc.", "US"], ["Functional Software, Inc.", "US"], ["Akamai Technologies, Inc.", "US"]]) {
    assert.equal(resolveCanonicalVendorLegalContext(entity)?.headquartersCountry, country);
    assert.equal(resolveCanonicalVendorLegalContext(entity)?.transferMechanism.mechanism, "unknown");
  }
  for (const entity of ["Amazon Web Services, Inc.", "PubMatic, Inc.", "Volentio JSD Limited", "UNPKG (operator unverified)"]) assert.equal(resolveCanonicalVendorLegalContext(entity), null);
  assert.equal(resolveCanonicalVendorHeadquarters("Usercentrics GmbH"), null);
});

test("expanded international HQ references do not inherit parent or regional entity locations", () => {
  for (const [entity, country] of [
    ["Yandex LLC", "RU"], ["Marfeel Solutions, S.L.", "ES"],
    ["Index Exchange Inc.", "CA"], ["Siteimprove A/S", "DK"],
    ["Wingify Software Pvt. Ltd.", "IN"], ["Spotify AB", "SE"],
    ["Sourcepoint Technologies, Inc.", "US"], ["Didomi SAS", "FR"],
    ["Blockthrough Inc.", "CA"], ["Trustpilot A/S", "DK"],
    ["ZoomInfo Technologies LLC", "US"], ["TrustArc Inc.", "US"],
  ]) {
    const legal = resolveCanonicalVendorLegalContext(entity);
    assert.equal(legal?.controllingEntity, entity);
    assert.equal(legal?.headquartersCountry, country);
    // Even a source discussing transfers or certification supplies HQ only.
    assert.equal(legal?.transferMechanism.mechanism, "unknown");
  }
  for (const entity of ["Yandex N.V.", "Spotify USA, Inc.", "ZoomInfo Technologies Inc.", "Trustpilot Group plc", "eyeo GmbH"]) {
    assert.equal(resolveCanonicalVendorHeadquarters(entity), null);
  }
});

test("reviewed mailing addresses, team locations and different legal entities stay unknown", () => {
  for (const entity of ["OpenJS Foundation", "CookieYes Limited", "ID5 Technology, Inc.", "Fonticons, Inc."]) {
    const reference = resolveCanonicalVendorHeadquarters(entity);
    assert.equal(reference?.status, "unverified");
    assert.equal(reference?.headquartersCountry, null);
    assert.ok(reference?.sources.length);
    assert.equal(resolveCanonicalVendorLegalContext(entity), null);
  }
  assert.equal(resolveCanonicalVendorHeadquarters("ID5 Technology Limited"), null);
});
