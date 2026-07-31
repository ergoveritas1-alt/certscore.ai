import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildNormalizedConcerns,
  buildUnifiedFindingCandidatesFromConcerns
} from "./normalized-concerns";
import { buildRuntimeCookieInventory } from "./runtime-cookie-evidence";
import {
  buildPreConsentDataFlows,
  buildRuntimeInventoryGroupRows,
  formatGroupedParty,
  type TrackerInventoryRow
} from "./runtime-inventory-projection";

const fixture = JSON.parse(readFileSync(
  new URL("./test-fixtures/nbcnews-0112a54a.json", import.meta.url),
  "utf8"
)) as {
  hybridRuntimeEvidence: Record<string, unknown>;
  scanId: string;
  site: string;
  trackerRows: TrackerInventoryRow[];
};

function fixtureInventory() {
  return buildRuntimeCookieInventory({
    hybridRuntimeEvidence: fixture.hybridRuntimeEvidence
  });
}

test("NBCNews 0112a54a computes cookie party relative to nbcnews.com using PSL boundaries", () => {
  assert.equal(fixture.scanId, "0112a54a");
  const rows = fixtureInventory().rows;
  for (const domain of ["demdex.net", "criteo.com", "doubleclick.net", "taboola.com"]) {
    const matching = rows.filter((row) => row.domain === domain);
    assert.ok(matching.length > 0, `fixture should retain ${domain}`);
    assert.ok(matching.every((row) => row.party === "third_party"), `${domain} must be third party`);
  }

  for (const cookieName of [
    "_gcl_au",
    "aam_uuid",
    "sailthru_pageviews",
    "_parsely_session",
    "cX_P",
    "cX_G",
    "_lr_geo_location",
    "fw_vcid2"
  ]) {
    const row = rows.find((candidate) => candidate.cookieName === cookieName);
    assert.equal(row?.party, "first_party", `${cookieName} is stored on nbcnews.com`);
    assert.equal(row?.setByThirdPartyScript, true, `${cookieName} must retain third-party setter context`);
    assert.ok((row?.initiatorChain?.length ?? 0) > 0, `${cookieName} must retain an initiator chain`);
  }
});

test("NBCNews 0112a54a applies canonical cookie categories and never defaults unknown cookies to Essential", () => {
  const rows = fixtureInventory().rows;
  const expectedCategories = new Map([
    ["_gcl_au", "advertising"],
    ["aam_uuid", "advertising"],
    ["sailthru_pageviews", "marketing"],
    ["_parsely_session", "analytics"],
    ["cX_P", "personalization"],
    ["cX_G", "personalization"],
    ["_lr_geo_location", "advertising"],
    ["fw_vcid2", "advertising"],
    ["ak_bmsc", "security"],
    ["bm_mi", "security"],
    ["__cf_bm", "security"],
    ["_dd_s", "security"],
    ["OptanonConsent", "consent_management"],
    ["usprivacy", "consent_management"]
  ]);
  for (const [cookieName, category] of expectedCategories) {
    assert.equal(rows.find((row) => row.cookieName === cookieName)?.category, category);
  }

  const unknown = rows.find((row) => row.cookieName === "BI_UI_previousPage");
  assert.equal(unknown?.category, "unknown");
  assert.equal(unknown?.essentiality, "unknown");

  const grouped = buildRuntimeInventoryGroupRows({
    cookieRows: rows,
    firstPartyDomain: fixture.site,
    trackerRows: []
  });
  const unknownGroup = grouped.find((row) =>
    row.cookieNames.includes("BI_UI_previousPage")
  );
  assert.equal(unknownGroup?.macroCategory, "Review");
  assert.notEqual(unknownGroup?.macroCategory, "Essential");
});

test("NBCNews 0112a54a merges cookie, request, and storage rows to one canonical vendor entity", () => {
  const cookieRows = fixtureInventory().rows;
  const dataFlows = buildPreConsentDataFlows(fixture.hybridRuntimeEvidence);
  const grouped = buildRuntimeInventoryGroupRows({
    cookieRows,
    dataFlows,
    firstPartyDomain: fixture.site,
    trackerRows: fixture.trackerRows
  });
  for (const entity of [
    "Adobe Inc.",
    "Criteo SA",
    "Akamai Technologies, Inc.",
    "Cloudflare, Inc.",
    "Piano Software Inc.",
    "OneTrust, LLC"
  ]) {
    assert.equal(
      grouped.filter((row) => row.canonicalEntity === entity).length,
      1,
      `${entity} should produce one expandable report row`
    );
  }
  assert.doesNotMatch(grouped.map((row) => formatGroupedParty(row.party)).join(","), /—/);

  const uniqueVendors = new Set(grouped.map((row) => row.canonicalEntity ?? row.vendor));
  const uniqueDomains = new Set(grouped.flatMap((row) => row.domains));
  assert.equal(uniqueVendors.size, grouped.length);
  assert.ok(uniqueDomains.size > 0);
});

test("NBCNews 0112a54a retains per-cookie lifespan, description, data types, and setter chain", () => {
  const row = fixtureInventory().rows.find((candidate) => candidate.cookieName === "_gcl_au");
  assert.equal(row?.lifespanSeconds, 40000000);
  assert.equal(row?.lifespanSource, "max_age");
  assert.equal(row?.longLived, true);
  assert.match(row?.description ?? "", /Google advertising/i);
  assert.ok(row?.dataTypes?.includes("conversion identifier"));
  assert.deepEqual(row?.initiatorChain, [
    "https://mps.nbcuni.com/runtime.js",
    "https://securepubads.g.doubleclick.net/tag/js/gpt.js"
  ]);
});

test("NBCNews 0112a54a reports three distinct data-flow layers and tags canonical ID-sync endpoints", () => {
  const flows = buildPreConsentDataFlows(fixture.hybridRuntimeEvidence);
  assert.equal(flows.length, 3);
  assert.ok(flows.every((flow) => flow.idSync));
  assert.ok(flows.every((flow) =>
    flow.networkDestination.label === "server location (may be CDN edge)"
  ));

  const google = flows.find((flow) => flow.endpoint === "cm.g.doubleclick.net");
  assert.deepEqual(google?.networkDestination, {
    ip: "142.250.72.2",
    country: "US",
    countryCode: "US",
    asn: 15169,
    provider: "Google LLC",
    label: "server location (may be CDN edge)"
  });
  assert.equal(google?.controllingEntity.legalEntity, "Google LLC");
  assert.equal(google?.controllingEntity.headquartersCountry, "US");
  assert.equal(google?.transferMechanism.mechanism, "sccs_assumed_unverified");
  assert.equal(google?.transferMechanism.verifiedAsOf, "2026-07-23");

  const criteo = flows.find((flow) => flow.endpoint === "gum.criteo.com");
  assert.equal(criteo?.controllingEntity.headquartersCountry, "FR");
  assert.equal(criteo?.transferMechanism.mechanism, "unknown");
});

test("NBCNews 0112a54a sends known pre-consent ID-sync evidence through normalized concern policy as High", () => {
  const concerns = buildNormalizedConcerns({
    reviewFindingCandidates: [],
    runtimeArtifacts: {
      consentSurfaceObserved: true,
      consentTimeline: (fixture.hybridRuntimeEvidence.timelineMarkers as Record<string, unknown>),
      hybridRuntimeEvidence: fixture.hybridRuntimeEvidence
    },
    validationFindings: []
  });
  const concern = concerns.find((candidate) =>
    candidate.suggestedUnifiedFindingId === "rtb_cookie_sync_observed"
  );
  assert.equal(concern?.severity, "high");
  assert.equal(concern?.promotionEligibility, "eligible");
  assert.equal(concern?.externalSurfacingEligibility, "eligible");
  assert.ok(concern?.evidenceStrengthFlags.includes("direct_runtime"));
  const candidate = buildUnifiedFindingCandidatesFromConcerns(concerns).find((entry) =>
    entry.normalizedConcern.suggestedUnifiedFindingId === "rtb_cookie_sync_observed"
  );
  assert.equal(candidate?.severity, "high");
});
