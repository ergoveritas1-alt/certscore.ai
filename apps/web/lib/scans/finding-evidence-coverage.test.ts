import assert from "node:assert/strict";
import test from "node:test";
import {
  FINDING_EVIDENCE_ID_COVERAGE,
  FINDING_EVIDENCE_NON_CONTRACT_RATIONALES,
  validateFindingEvidenceCoverage
} from "./finding-evidence-coverage";
import { getFindingEvidenceContractForFindingOrUnifiedId } from "./finding-evidence-contracts";

test("finding evidence coverage table is internally auditable", () => {
  assert.deepEqual(validateFindingEvidenceCoverage(), []);
});

test("WS01 and WC01 cookie-preconsent aliases resolve explicitly", () => {
  const byWs01Id = new Map(FINDING_EVIDENCE_ID_COVERAGE.flatMap((entry) =>
    entry.ws01FindingIds.map((id) => [id, entry] as const)
  ));

  assert.equal(byWs01Id.get("tracking_cookies_set_before_consent")?.reportFindingId, "third_party_cookie_pre_consent");
  assert.equal(byWs01Id.get("tracking_cookies_set_before_consent")?.contractFindingId, "tracking_cookies_set_before_consent");
  assert.equal(
    getFindingEvidenceContractForFindingOrUnifiedId("tracking_cookies_set_before_consent")?.findingId,
    "tracking_cookies_set_before_consent"
  );
  assert.equal(byWs01Id.get("analytics_cookies_before_consent")?.reportFindingId, "analytics_cookie_pre_consent");
  assert.equal(byWs01Id.get("analytics_cookie_pre_consent")?.contractFindingId, "analytics_cookies_before_consent");
  assert.equal(
    getFindingEvidenceContractForFindingOrUnifiedId("analytics_cookies_before_consent")?.findingId,
    "analytics_cookies_before_consent"
  );
});

test("non-contract high-risk families have explicit ownership rationale", () => {
  const rationaleById = new Map(FINDING_EVIDENCE_NON_CONTRACT_RATIONALES.map((rationale) => [rationale.id, rationale]));

  assert.equal(rationaleById.get("accessibility_rule_level_validation")?.owner, "accessibility_validation");
  assert.ok(rationaleById.get("accessibility_rule_level_validation")?.findingIds.includes("critical_form_completion_barrier"));
  assert.equal(rationaleById.get("financial_claim_validation_contract")?.owner, "financial_validation");
  assert.ok(rationaleById.get("financial_claim_validation_contract")?.findingIds.includes("guaranteed_or_high_return_claims_present"));
  assert.equal(rationaleById.get("cookie_security_posture_support")?.owner, "security_posture_support");
  assert.ok(rationaleById.get("cookie_security_posture_support")?.findingIds.includes("weak_cookie_security_attributes"));
});
