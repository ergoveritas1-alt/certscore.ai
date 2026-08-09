import assert from "node:assert/strict";
import test from "node:test";
import {
  isCanonicalIdSyncEndpoint,
  resolveCanonicalCookieKnowledge,
  resolveCanonicalVendorLegalContext
} from "./cookie-knowledge-base";

test("canonical NBCNews cookie knowledge separates non-essential categories from true infrastructure", () => {
  const categories = new Map([
    ["_gcl_au", "advertising"],
    ["_ga", "analytics"],
    ["_ga_CANARYTEST", "analytics"],
    ["_gid", "analytics"],
    ["_fbp", "advertising"],
    ["_fbc", "advertising"],
    ["CLID", "analytics"],
    ["MUID", "advertising"],
    ["MR", "advertising"],
    ["ANONCHK", "advertising"],
    ["SM", "advertising"],
    ["aam_uuid", "advertising"],
    ["sailthru_pageviews", "marketing"],
    ["_parsely_visitor", "analytics"],
    ["cX_P", "personalization"],
    ["cX_G", "personalization"],
    ["_lr_geo_location", "advertising"],
    ["fw_vcid2", "advertising"]
  ]);
  for (const [name, category] of categories) {
    const knowledge = resolveCanonicalCookieKnowledge(name);
    assert.equal(knowledge.category, category);
    assert.equal(knowledge.essentiality, "non_essential");
    assert.ok(knowledge.description.length > 20);
    assert.ok(knowledge.dataTypes.length > 0);
  }

  for (const name of ["ak_bmsc", "bm_mi", "__cf_bm", "_dd_s", "OptanonConsent", "usprivacy"]) {
    assert.equal(resolveCanonicalCookieKnowledge(name).essentiality, "essential");
  }

  assert.deepEqual(resolveCanonicalCookieKnowledge("unclassified_nbc_cookie"), {
    category: "unknown",
    dataTypes: [],
    description: "Purpose is not yet classified in the canonical cookie knowledge base; manual review is recommended.",
    essentiality: "unknown",
    name: "unclassified_nbc_cookie",
    vendor: null
  });
});

test("canonical Microsoft cookie knowledge keeps documented Clarity and identity purposes distinct", () => {
  assert.deepEqual(resolveCanonicalCookieKnowledge("CLID"), {
    category: "analytics",
    dataTypes: ["cross-site browser identifier", "behavioral analytics identifier"],
    description: "Microsoft Clarity third-party identifier recording when Clarity first observed the browser across sites using Clarity.",
    essentiality: "non_essential",
    name: "CLID",
    vendor: "Microsoft Clarity",
  });
  assert.equal(resolveCanonicalCookieKnowledge("MUID").vendor, "Microsoft Identity Synchronization");
  assert.equal(resolveCanonicalCookieKnowledge("MR").essentiality, "non_essential");
  assert.equal(resolveCanonicalCookieKnowledge("SRM_B").essentiality, "unknown");
});

test("canonical audit candidates classify documented UET, Google publisher, and HubSpot cookies", () => {
  for (const name of ["_uetsid", "_uetvid", "__gads", "__gpi", "__hstc", "hubspotutk", "__hssc", "__hssrc"]) {
    const knowledge = resolveCanonicalCookieKnowledge(name);
    assert.equal(knowledge.essentiality, "non_essential");
    assert.ok(knowledge.description.length > 20);
    assert.ok(knowledge.dataTypes.length > 0);
  }
  assert.equal(resolveCanonicalCookieKnowledge("_uetsid").vendor, "Microsoft Advertising / Bing UET");
  assert.equal(resolveCanonicalCookieKnowledge("hubspotutk").vendor, "HubSpot");
});

test("canonical LinkedIn and TikTok cookie knowledge preserves consent and advertising distinctions", () => {
  assert.equal(resolveCanonicalCookieKnowledge("lidc").essentiality, "essential");
  assert.equal(resolveCanonicalCookieKnowledge("lidc").category, "security");
  assert.equal(resolveCanonicalCookieKnowledge("li_gc").essentiality, "essential");
  assert.equal(resolveCanonicalCookieKnowledge("li_gc").category, "consent_management");
  assert.equal(resolveCanonicalCookieKnowledge("li_sugr").essentiality, "non_essential");
  assert.equal(resolveCanonicalCookieKnowledge("li_sugr").category, "advertising");
  assert.equal(resolveCanonicalCookieKnowledge("ttcsid_pixel123").vendor, "TikTok");
  assert.equal(resolveCanonicalCookieKnowledge("ttcsid_pixel123").essentiality, "non_essential");
});

test("canonical Amazon cookie knowledge classifies ubid locale variants as non-essential persistent identifiers", () => {
  assert.deepEqual(resolveCanonicalCookieKnowledge("ubid-acbde"), {
    category: "analytics",
    dataTypes: ["persistent browser identifier", "anonymous user identifier"],
    description: "Amazon persistent browser identifier used to distinguish devices and anonymous users in event and engagement measurement.",
    essentiality: "non_essential",
    name: "ubid-acbde",
    vendor: "Amazon",
  });
  assert.equal(resolveCanonicalCookieKnowledge("ubid-main").essentiality, "non_essential");
  assert.equal(resolveCanonicalCookieKnowledge("not-ubid-acbde").essentiality, "unknown");
});

test("canonical ID-sync and legal context registry does not infer data location from server IP", () => {
  for (const host of [
    "cm.g.doubleclick.net",
    "am-match.taboola.com",
    "ats.rlcdn.com",
    "nbcuni.demdex.net",
    "gum.criteo.com"
  ]) {
    assert.equal(isCanonicalIdSyncEndpoint(host), true);
  }
  assert.equal(isCanonicalIdSyncEndpoint("www.nbcnews.com"), false);

  const google = resolveCanonicalVendorLegalContext("Google LLC");
  assert.equal(google?.headquartersCountry, "US");
  assert.equal(google?.transferMechanism.mechanism, "sccs_assumed_unverified");
  assert.equal(google?.transferMechanism.verifiedAsOf, "2026-07-23");

  const criteo = resolveCanonicalVendorLegalContext("Criteo SA");
  assert.equal(criteo?.headquartersCountry, "FR");
  assert.equal(criteo?.transferMechanism.mechanism, "unknown");
});
