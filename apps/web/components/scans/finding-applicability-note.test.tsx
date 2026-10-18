import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FindingRow } from "./report-finding-row";
import { FindingRow as AlternateFindingRow } from "../scanso2/report-finding-row";
import { SitePriorityReview } from "./site-priority-review";
import { REGULATORY_REVIEW_TOPICS } from "../../lib/scans/regulatory-review-catalog";
import { findingApplicabilityContext } from "../../lib/scans/finding-applicability-context";
import { ACCESSIBILITY_PREVIEW, REGULATORY_PREVIEW_FINDINGS } from "../../app/dev-fixtures/regulatory-review/preview-data";

const finding = { title: "Retained finding", rank: 1, summary: "Retained observation.", status: "Partial concern" as const,
  focus: "", vendors: [], evidence: [], evidenceJson: {}, correctionSteps: [] };

test("every mapped top issue has a collapsed applicability note next to its regulation in the selected mode", () => {
  let contexts = 0;
  for (const topic of REGULATORY_REVIEW_TOPICS) for (const reviewFocus of ["gdpr_eprivacy", "ccpa_cpra"] as const) {
    const context = topic.contexts[reviewFocus];
    if (!context) continue;
    for (const id of topic.findingIds) {
      const input = { ...finding, id };
      const before = structuredClone(input);
      const html = renderToStaticMarkup(<FindingRow priority reviewFocus={reviewFocus} finding={input} />);
      const disclosure = html.match(/<details\b([^>]*)aria-label="Regulatory applicability"[^>]*>(.*?)<\/details>/s);
      assert.ok(disclosure, `${reviewFocus}: ${id}`);
      assert.doesNotMatch(disclosure[1]!, /\bopen(?:=|\s|$)/);
      assert.match(disclosure[2]!, /Applicability.*Not assessed/s);
      assert.match(disclosure[2]!, /whether the referenced law or this particular obligation applies/);
      assert.match(disclosure[2]!, /circumstances of this scan/);
      assert.match(disclosure[2]!, /What to check:/);
      assert.ok(html.indexOf(context.ruleUrl) < html.indexOf('aria-label="Regulatory applicability"'));
      if (context.cases.length) assert.ok(html.indexOf('aria-label="Regulatory applicability"') < html.indexOf("Related enforcement"));
      if (reviewFocus === "ccpa_cpra") {
        assert.match(disclosure[2]!, /CPPA: who must comply with CCPA/);
        assert.match(disclosure[2]!, /thresholds and exemptions/);
        assert.doesNotMatch(disclosure[2]!, /European Commission|ePrivacy/);
      } else {
        assert.match(disclosure[2]!, /European Commission/);
        assert.doesNotMatch(disclosure[2]!, /CPPA|CCPA|California residency/);
        assert.equal(disclosure[2]!.includes("applicable national ePrivacy rules"), context.rule.includes("ePrivacy"));
      }
      assert.deepEqual(input, before, "editorial scope guidance cannot mutate evidence or finding status");
    }
    contexts++;
  }
  assert.equal(contexts, 39);
});

test("each selected issue has exactly one note, including accessibility, in both modes", () => {
  for (const reviewFocus of ["gdpr_eprivacy", "ccpa_cpra"] as const) {
    const html = renderToStaticMarkup(<SitePriorityReview findings={[...REGULATORY_PREVIEW_FINDINGS, ACCESSIBILITY_PREVIEW]} reviewFocus={reviewFocus} pending={false} sitewideAvailable scannedPages={1} />);
    const issues = (html.match(/id="sitewide-/g) ?? []).length;
    assert.ok(issues > 1);
    assert.equal((html.match(/aria-label="Regulatory applicability"/g) ?? []).length, issues);
    assert.equal((html.match(/id="report-top-issues"/g) ?? []).length, 1);
  }
});

test("accessibility has technical scope guidance without assuming ADA applicability", () => {
  for (const focus of ["gdpr_eprivacy", "ccpa_cpra"] as const) {
    const note = findingApplicabilityContext("accessibility_priority_group", focus);
    assert.match(note.reference!.label, /WCAG technical standard/);
    assert.match(note.explanation, /has not determined whether .*accessibility law/);
    assert.equal(note.explanation.includes("the ADA"), focus === "ccpa_cpra");
    assert.ok(note.lookups.some(link => link.url === "https://www.w3.org/WAI/policies/"));
    assert.equal(note.lookups.some(link => link.url.includes("ada.gov")), focus === "ccpa_cpra");
    assert.deepEqual(findingApplicabilityContext("individual_accessibility_finding", focus, "accessibility"), note);
  }
});

test("unmapped issues and alternate top rows receive a note without inventing an obligation", () => {
  for (const Row of [FindingRow, AlternateFindingRow]) {
    const html = renderToStaticMarkup(<Row priority finding={{ ...finding, id: "unmapped_finding" }} />);
    assert.match(html, /aria-label="Regulatory applicability"/);
    assert.match(html, /does not have a mapped regulatory obligation/);
    const ordinary = renderToStaticMarkup(<Row finding={{ ...finding, id: "unmapped_finding" }} />);
    assert.doesNotMatch(ordinary, /aria-label="Regulatory applicability"/);
  }
});
