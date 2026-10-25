import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FindingRow } from "./report-finding-row";
import { FindingRow as AlternateFindingRow } from "../scanso2/report-finding-row";
import { SitePriorityReview } from "./site-priority-review";
import { REGULATORY_REVIEW_TOPICS } from "../../lib/scans/regulatory-review-catalog";
import { FINDING_APPLICABILITY_REGISTRY } from "../../lib/scans/finding-applicability-registry";
import { findingApplicabilityContext } from "../../lib/scans/finding-applicability-context";
import { ACCESSIBILITY_PREVIEW, REGULATORY_PREVIEW_FINDINGS } from "../../app/dev-fixtures/regulatory-review/preview-data";
Object.assign(globalThis, { React });

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
      assert.match(disclosure[2]!, /Applicability/);
      assert.doesNotMatch(disclosure[2]!.split("</summary>")[0]!, /Not assessed/);
      assert.match(disclosure[2]!, /When this matters/);
      assert.match(disclosure[2]!, /What to check/);
      assert.doesNotMatch(disclosure[2]!, /From this scan/);
      assert.doesNotMatch(disclosure[2]!, /data-applicability-key="unmapped"/);
      assert.ok(html.indexOf(context.ruleUrl) < html.indexOf('aria-label="Regulatory applicability"'));
      if (context.cases.length) assert.ok(html.indexOf('aria-label="Regulatory applicability"') < html.indexOf("Related enforcement"));
      if (reviewFocus === "ccpa_cpra") {
        assert.match(disclosure[2]!, /CPPA · CCPA coverage/);
        assert.match(disclosure[2]!, /thresholds and exemptions/);
        assert.doesNotMatch(disclosure[2]!, /European Commission|ePrivacy/);
      } else {
        assert.match(disclosure[2]!, /European Commission/);
        assert.doesNotMatch(disclosure[2]!, /CPPA|CCPA|California residency/);
        assert.equal(disclosure[2]!.includes("Confirm the applicable national ePrivacy rules"), context.rule.includes("ePrivacy"));
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
    assert.equal(note.key, "accessibility");
    assert.match(note.when, /WCAG supplies technical criteria/);
    assert.match(note.checks.join(" "), /compliance date/);
    assert.ok(note.sources.some(link => link.url === "https://www.w3.org/WAI/policies/"));
    assert.equal(note.sources.some(link => link.url.includes("ada.gov")), focus === "ccpa_cpra");
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


test("every registry entry renders compact checks without repeating the scan summary", () => {
  for (const entry of FINDING_APPLICABILITY_REGISTRY) for (const reviewFocus of entry.modes) {
    const input = { ...finding, id: entry.findingIds[0]!, evidenceJson: { privateDiagnostic: "DO_NOT_RENDER_AS_APPLICABILITY", scoreEffect: "deduction" } };
    const html = renderToStaticMarkup(<FindingRow priority reviewFocus={reviewFocus} finding={input} />);
    const note = html.match(/aria-label="Regulatory applicability"[^>]*>(.*?)<\/details>/s)![1]!;
    assert.ok(note.includes(`data-applicability-key="${entry.key}"`));
    assert.doesNotMatch(note, /From this scan|Retained observation/);
    assert.match(html, /Retained observation/, "the original finding summary stays visible outside applicability");
    assert.doesNotMatch(note, /DO_NOT_RENDER_AS_APPLICABILITY|deduction|scoreEffect/);
    assert.equal((note.match(/<li class="flex items-start/g) ?? []).length, entry.checks.length);
  }
});
