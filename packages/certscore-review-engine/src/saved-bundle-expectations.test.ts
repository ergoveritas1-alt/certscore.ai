import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  type CanonicalEvidenceBundle,
  type ReviewResult,
  canonicalEvidenceBundleSchema,
} from "@certscore/contracts";
import { reviewEvidenceBundle } from "./index.js";

const fixtureDir = path.resolve(
  process.cwd(),
  "../certscore-contracts/fixtures/saved-bundles",
);

interface ReviewExpectation {
  findings: Record<string, "eligible" | "not_eligible" | "deferred">;
  relatedVendorProducts?: Record<string, string[]>;
}

const expectations: Record<string, ReviewExpectation> = {
  "akamai-security-cookie": {
    findings: {
      third_party_vendors_observed: "not_eligible",
      pre_consent_tracking_detected: "not_eligible",
      third_party_cookie_pre_consent: "not_eligible",
      vendor_associated_cookie_pre_consent: "not_eligible",
      unresolved_collection_endpoint_review_signal: "not_eligible",
    },
  },
  "clarity-collection": {
    findings: {
      third_party_vendors_observed: "eligible",
      pre_consent_tracking_detected: "eligible",
      session_replay_or_behavioral_analytics_observed: "eligible",
      unresolved_collection_endpoint_review_signal: "not_eligible",
    },
    relatedVendorProducts: {
      session_replay_or_behavioral_analytics_observed: ["Microsoft Clarity"],
    },
  },
  "clarity-generic-collect-negative": {
    findings: {
      third_party_vendors_observed: "not_eligible",
      pre_consent_tracking_detected: "not_eligible",
      unresolved_collection_endpoint_review_signal: "eligible",
    },
  },
  "cmp-cookie": {
    findings: {
      third_party_vendors_observed: "not_eligible",
      pre_consent_tracking_detected: "not_eligible",
      third_party_cookie_pre_consent: "not_eligible",
      vendor_associated_cookie_pre_consent: "not_eligible",
    },
  },
  "consent-flow-persistence": {
    findings: {
      reject_control_observed_or_not_observed: "eligible",
      accept_control_observed_or_not_observed: "eligible",
      reject_action_succeeded_or_not_testable: "eligible",
      accept_action_succeeded_or_not_testable: "eligible",
      tracking_after_refusal_review_signal: "eligible",
      reject_did_not_reduce_tracking_review_signal: "eligible",
      accept_reject_runtime_delta_observed: "not_eligible",
      policy_runtime_vendor_alignment_review_signal: "deferred",
    },
  },
  "ga-collection": {
    findings: {
      third_party_vendors_observed: "eligible",
      pre_consent_tracking_detected: "eligible",
      third_party_cookie_pre_consent: "not_eligible",
      unresolved_collection_endpoint_review_signal: "not_eligible",
    },
    relatedVendorProducts: {
      pre_consent_tracking_detected: ["Google Analytics"],
    },
  },
  "ga-first-party-vendor-associated-cookie": {
    findings: {
      pre_consent_tracking_detected: "not_eligible",
      third_party_cookie_pre_consent: "not_eligible",
      vendor_associated_cookie_pre_consent: "eligible",
    },
  },
  "generic-cdn-noise": {
    findings: {
      third_party_vendors_observed: "not_eligible",
      pre_consent_tracking_detected: "not_eligible",
      unresolved_collection_endpoint_review_signal: "not_eligible",
    },
  },
  "google-ads-measurement": {
    findings: {
      third_party_vendors_observed: "eligible",
      pre_consent_tracking_detected: "eligible",
      unresolved_collection_endpoint_review_signal: "not_eligible",
    },
    relatedVendorProducts: {
      pre_consent_tracking_detected: ["Google Ads / DoubleClick"],
    },
  },
  "google-consent-tag-support": {
    findings: {
      third_party_vendors_observed: "not_eligible",
      pre_consent_tracking_detected: "not_eligible",
      unresolved_collection_endpoint_review_signal: "not_eligible",
    },
  },
  "google-owned-unresolved": {
    findings: {
      third_party_vendors_observed: "not_eligible",
      pre_consent_tracking_detected: "not_eligible",
      unresolved_collection_endpoint_review_signal: "eligible",
    },
  },
  "gtm-library-only": {
    findings: {
      third_party_vendors_observed: "eligible",
      pre_consent_tracking_detected: "not_eligible",
      third_party_cookie_pre_consent: "not_eligible",
      unresolved_collection_endpoint_review_signal: "not_eligible",
    },
  },
  "nbcu-site-owned-video-ad-infrastructure": {
    findings: {
      third_party_vendors_observed: "not_eligible",
      pre_consent_tracking_detected: "not_eligible",
      unresolved_collection_endpoint_review_signal: "not_eligible",
    },
  },
  "newrelic-performance-monitoring": {
    findings: {
      third_party_vendors_observed: "not_eligible",
      pre_consent_tracking_detected: "not_eligible",
      unresolved_collection_endpoint_review_signal: "not_eligible",
    },
  },
  "policy-surface-positive": {
    findings: {
      privacy_notice_observed_or_not_observed: "eligible",
      privacy_choices_link_observed: "eligible",
      gpc_disclosure_observed: "eligible",
      policy_vendor_mentions_observed: "eligible",
      policy_runtime_vendor_alignment_review_signal: "deferred",
    },
  },
  "ptvpixel-unresolved": {
    findings: {
      third_party_vendors_observed: "not_eligible",
      pre_consent_tracking_detected: "not_eligible",
      unresolved_collection_endpoint_review_signal: "eligible",
    },
    relatedVendorProducts: {
      third_party_vendors_observed: [],
    },
  },
  "third-party-cookie-positive": {
    findings: {
      third_party_vendors_observed: "eligible",
      pre_consent_tracking_detected: "eligible",
      third_party_cookie_pre_consent: "eligible",
      vendor_associated_cookie_pre_consent: "not_eligible",
    },
  },
};

test("saved-bundle fixtures keep expected review-engine behavior", async () => {
  const fixtures = await loadSavedBundleFixtures();
  assert.deepEqual(
    fixtures.map((fixture) => fixture.name).sort(),
    Object.keys(expectations).sort(),
  );

  for (const fixture of fixtures) {
    const result = await reviewEvidenceBundle(fixture.bundle);
    const expectation = expectations[fixture.name];
    assert.ok(expectation, `${fixture.name}: missing expectation`);

    for (const [findingKey, status] of Object.entries(expectation.findings)) {
      assert.equal(
        finding(result, findingKey)?.eligibility.status,
        status,
        `${fixture.name}: ${findingKey}`,
      );
    }

    for (const [findingKey, products] of Object.entries(expectation.relatedVendorProducts ?? {})) {
      assert.deepEqual(
        relatedVendorProducts(result, findingKey),
        products,
        `${fixture.name}: ${findingKey} related vendors`,
      );
    }
  }
});

test("GTM library-only fixture does not convert tag id into identifier evidence", async () => {
  const bundle = await loadSavedBundleFixture("gtm-library-only");
  const request = bundle.networkEvents.find((event) => event.eventId === "net_gtm_library");

  assert.deepEqual(request?.queryParamNames, ["id"]);
  assert.deepEqual(request?.tagContainerParamNames, ["id"]);
  assert.deepEqual(request?.identifierParamNames, []);
  assert.equal(request?.hasIdentifierLikeParameters, false);
});

async function loadSavedBundleFixtures(): Promise<Array<{
  name: string;
  bundle: CanonicalEvidenceBundle;
}>> {
  const files = (await readdir(fixtureDir))
    .filter((file) => file.endsWith(".json"))
    .sort();
  const fixtures = [];
  for (const file of files) {
    fixtures.push({
      name: file.replace(/\.json$/, ""),
      bundle: await loadSavedBundleFixture(file.replace(/\.json$/, "")),
    });
  }
  return fixtures;
}

async function loadSavedBundleFixture(name: string): Promise<CanonicalEvidenceBundle> {
  const rawText = await readFile(path.join(fixtureDir, `${name}.json`), "utf8");
  return canonicalEvidenceBundleSchema.parse(JSON.parse(rawText));
}

function finding(result: ReviewResult, findingKey: string): ReviewResult["findingCandidates"][number] | undefined {
  return result.findingCandidates.find((candidate) => candidate.findingKey === findingKey);
}

function relatedVendorProducts(result: ReviewResult, findingKey: string): string[] {
  return (finding(result, findingKey)?.relatedVendors ?? [])
    .map((vendor) => vendor.product ?? vendor.vendor)
    .sort();
}
