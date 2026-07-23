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
