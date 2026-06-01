import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveGdprEprivacyCoverageChecklist,
  type GdprEprivacyCoverageChecklistItem
} from "./gdpr-eprivacy-coverage-checklist";
import type { UnifiedFindingDisplayPacket } from "./unified-findings";

function makeFinding(
  unifiedFindingId: string,
  findingName: string,
  status: "surface" | "audit_only" | "suppress" = "surface"
) {
  return {
    presentation: { findingName },
    presentationDecision: { status },
    title: findingName,
    unifiedFindingId
  } as UnifiedFindingDisplayPacket;
}

function byId(items: GdprEprivacyCoverageChecklistItem[], id: string) {
  const item = items.find((candidate) => candidate.id === id);
  assert.ok(item, `expected checklist item ${id}`);
  return item;
}

test("deriveGdprEprivacyCoverageChecklist maps canonical unified findings without creating pass/fail language", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    scanCompleted: true,
    unifiedFindings: [
      makeFinding("third_party_cookie_pre_consent", "Third-party cookie before consent"),
      makeFinding("reject_tracking_persists_after_reject", "Tracking continued after reject")
    ]
  });

  assert.equal(byId(items, "pre_consent_cookies_storage").status, "Gap observed");
  assert.deepEqual(byId(items, "pre_consent_cookies_storage").evidenceRefs, ["Third-party cookie before consent"]);
  assert.equal(byId(items, "post_reject_tracking_reduction").status, "Gap observed");
  assert.equal(byId(items, "pre_consent_third_party_tracking").status, "Not observed");
  assert.equal(items.some((item) => ["Pass", "Fail"].includes(String(item.status))), false);
});

test("deriveGdprEprivacyCoverageChecklist treats missing findings as not testable when public-web coverage is limited", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: true,
    scanCompleted: true,
    unifiedFindings: []
  });

  assert.equal(byId(items, "pre_consent_cookies_storage").status, "Not testable");
  assert.match(byId(items, "pre_consent_cookies_storage").limitation ?? "", /absence of a finding/i);
  assert.equal(byId(items, "internal_gdpr_controls_documentation").status, "Out of scope");
});

test("deriveGdprEprivacyCoverageChecklist marks audit-only projected context as insufficient evidence", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    scanCompleted: true,
    unifiedFindings: [
      makeFinding("missing_technical_disclosure", "Technical disclosure missing", "audit_only")
    ]
  });

  assert.equal(byId(items, "runtime_vendor_disclosure_alignment").status, "Insufficient evidence");
  assert.deepEqual(byId(items, "runtime_vendor_disclosure_alignment").evidenceRefs, ["Technical disclosure missing"]);
});
