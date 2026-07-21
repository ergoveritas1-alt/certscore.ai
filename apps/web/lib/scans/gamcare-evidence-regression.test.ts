import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { deriveGdprEprivacyCoverageChecklist } from "./gdpr-eprivacy-coverage-checklist";
import { meaningfulPolicySurfaceTitle, prioritizePublicPolicySurfaces } from "./policy-enrichment-row";
import { buildRuntimeCookieInventory } from "./runtime-cookie-evidence";
import { buildRuntimeInventoryGroupRows, buildTrackerInventoryGroupRows } from "./runtime-inventory-projection";

const fixture = JSON.parse(readFileSync(
  new URL("./test-fixtures/gamcare-evidence-regression.json", import.meta.url),
  "utf8"
)) as {
  cookieRows: Array<Record<string, unknown>>;
  domain: string;
  policySurfaces: Array<{ type: string; url: string }>;
  trackerRows: Array<Record<string, unknown>>;
};

test("GamCare contextual infrastructure remains neutral inventory with separate priority and confidence", () => {
  const grouped = buildTrackerInventoryGroupRows(fixture.trackerRows as never);
  assert.deepEqual(grouped.map((row) => row.priority), ["contextual", "contextual", "contextual"]);
  assert.ok(grouped.every((row) => row.confidence === "high"));

  const checklist = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    runtimeTrackerPriorityRows: grouped.map((row) => ({
      domains: row.domains,
      firstSeenMs: row.firstSeenMs,
      party: row.party,
      priority: row.priority,
      purpose: row.purpose,
      regulatoryRelevance: row.regulatoryRelevance,
      vendor: row.vendor
    })),
    scanCompleted: true,
    unifiedFindings: [
      {
        concernContext: { evidenceStrengthFlags: ["direct_runtime"] },
        evidence: { flags: ["direct_runtime"] },
        presentation: { findingName: "Pre-consent third-party tracking" },
        presentationDecision: { status: "surface" },
        sourceRefs: [],
        title: "Pre-consent third-party tracking",
        unifiedFindingId: "pre_consent_tracking_detected"
      }
    ] as never
  });
  const tracking = checklist.find((row) => row.id === "pre_consent_third_party_tracking");
  assert.equal(tracking?.status, "Not observed");
  assert.match(tracking?.note ?? "", /neutral inventory|do not establish tracking/i);
});

test("GamCare cookielawinfo snapshots resolve to consent management rather than OneTrust security", () => {
  const inventory = buildRuntimeCookieInventory({
    hybridRuntimeEvidence: { preconsentCookieEvidence: fixture.cookieRows }
  });
  const grouped = buildRuntimeInventoryGroupRows({
    cookieRows: inventory.rows,
    firstPartyDomain: fixture.domain,
    trackerRows: []
  });
  assert.ok(grouped.every((row) => row.vendor === "CookieYes"));
  assert.ok(grouped.every((row) => row.purpose === "Consent management"));
  assert.ok(grouped.every((row) => row.priority === "contextual"));
});

test("GamCare policy projection is bounded, meaningful, and excludes non-policy pages", () => {
  const surfaces = prioritizePublicPolicySurfaces(fixture.policySurfaces, { siteDomain: fixture.domain });
  assert.equal(surfaces.length, 5);
  assert.equal(surfaces.some((surface) => surface.url === "https://gamcare.org.uk/"), false);
  assert.equal(surfaces.some((surface) => /account-rules|acceptable-behaviour/.test(surface.url)), false);
  assert.ok(surfaces.some((surface) => surface.type === "cookie_policy"));
  assert.ok(surfaces.some((surface) => surface.type === "terms_of_service"));
  assert.equal(
    meaningfulPolicySurfaceTitle("privacy_policy", "https://gamcare.org.uk/privacy/privacy-support-and-treatment-services"),
    "Privacy Support And Treatment Services"
  );
});
