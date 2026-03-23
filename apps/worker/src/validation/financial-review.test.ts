import assert from "node:assert/strict";
import test from "node:test";
import type { ObservedPageEvidence, ScanSignalHit } from "@website-signal-risk-scanner/shared";
import { buildFinancialSectionReviewFindings } from "./financial-review";

test("buildFinancialSectionReviewFindings emits performance and high-risk disclosure review findings", () => {
  const pageEvidence: ObservedPageEvidence[] = [
    {
      evidenceId: "claim-1",
      scanId: "scan-1",
      pageUrl: "https://example.com/",
      pageType: "homepage",
      pageRole: "core",
      crawlDepth: 0,
      sourceKind: "dom_text",
      matchedText: "Earn 12% APY",
      selector: null,
      domPath: null,
      containerSelector: null,
      containerDomPath: null,
      siblingIndex: 1,
      tokenStart: 0,
      tokenEnd: 2,
      screenshotRef: null,
      metadata: null
    },
    {
      evidenceId: "risk-1",
      scanId: "scan-1",
      pageUrl: "https://example.com/risk",
      pageType: "support",
      pageRole: "support",
      crawlDepth: 3,
      sourceKind: "dom_text",
      matchedText: "Capital at risk",
      selector: null,
      domPath: null,
      containerSelector: null,
      containerDomPath: null,
      siblingIndex: 0,
      tokenStart: 0,
      tokenEnd: 2,
      screenshotRef: null,
      metadata: null
    }
  ];

  const signalHits: ScanSignalHit[] = [
    {
      id: "hit-performance",
      scanId: "scan-1",
      signalKey: "financial.return_or_yield_percentage_present",
      detectorName: "financial_return_or_yield_percentage",
      detectorType: "text_pattern",
      detectorVersion: "financial-v1",
      pageUrl: "https://example.com/",
      pageType: "homepage",
      pageRole: "core",
      evidenceRefs: ["claim-1"],
      payload: { count: 1 }
    },
    {
      id: "hit-high-risk",
      scanId: "scan-1",
      signalKey: "financial.leverage_language_present",
      detectorName: "financial_leverage_language",
      detectorType: "text_pattern",
      detectorVersion: "financial-v1",
      pageUrl: "https://example.com/",
      pageType: "homepage",
      pageRole: "core",
      evidenceRefs: ["claim-1"],
      payload: { count: 1 }
    },
    {
      id: "hit-risk",
      scanId: "scan-1",
      signalKey: "financial.loss_risk_disclosure_text_present",
      detectorName: "financial_loss_risk_disclosure_text",
      detectorType: "text_pattern",
      detectorVersion: "financial-v1",
      pageUrl: "https://example.com/risk",
      pageType: "support",
      pageRole: "support",
      evidenceRefs: ["risk-1"],
      payload: { count: 1 }
    }
  ];

  const findings = buildFinancialSectionReviewFindings({
    pageEvidence,
    signalHits
  });

  const ruleKeys = findings.map((finding) => finding.rule_key);
  assert.equal(ruleKeys.includes("section_review.claim_block_without_local_risk_disclosure"), true);
  assert.equal(ruleKeys.includes("section_review.high_risk_product_without_local_loss_risk_disclosure"), true);
});
