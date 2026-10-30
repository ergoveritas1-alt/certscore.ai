import assert from "node:assert/strict";
import test from "node:test";
import canaries from "./__fixtures__/assessment-highlights-canaries.json";
import { buildAssessmentHighlightsPresentation, type AssessmentHighlightFinding } from "./assessment-highlights";
import { assessmentHighlightFacts } from "./assessment-highlight-copy";
import { selectRegulatoryReview } from "./regulatory-review-catalog";
const page = { kind: "page" } as const;

for (const canary of canaries) {
  for (const focus of ["gdpr_eprivacy", "ccpa_cpra"] as const) {
    test(`${canary.url} retained report: ${focus}, breadth, bounds, qualified evidence links`, () => {
      const before = structuredClone(canary);
      const findings = selectRegulatoryReview(canary.findings, focus).topIssues as AssessmentHighlightFinding[];
      const result = buildAssessmentHighlightsPresentation(findings, page);
      assert.ok(result.text.length <= 430);
      assert.ok(result.expanded && result.expanded.text.length <= 1000);
      assert.ok(result.links.filter(link => link.label !== "Detailed evidence").length >= 3);
      assert.ok(result.expanded.links.some(link => link.targetId === "accessibility-evidence"));
      for (const link of result.links) assert.ok(result.expanded.links.some(expanded => expanded.label === link.label && expanded.targetId === link.targetId));
      for (const copy of [result, result.expanded]) {
        for (const link of copy.links) assert.ok(copy.text.includes(link.label));
        assert.doesNotMatch(copy.text, /deduct|points|scoring withheld|legally compliant|GPC honored|identical activity/i);
      }
      if (focus === "ccpa_cpra") {
        assert.ok(result.links.some(link => link.targetId === "gpc-evidence"));
        assert.match(result.expanded.text, /Global Privacy Control \(GPC\)/);
        assert.match(result.expanded.text, /Google, Meta and Microsoft/);
        assert.match(result.expanded.text, /GPC was verified/);
        assert.match(result.expanded.text, /All \d sampled tracking requests collected data/);
        assert.match(result.expanded.text, /assuming CCPA\/CPRA applies; it does not prove requests would be refused/);
        if (canary.url.endsWith("test1.html")) {
          assert.match(result.expanded.text, /about 1\.2 seconds/);
          assert.doesNotMatch(`${result.text} ${result.expanded.text}`, /paired comparison|no observable (?:GPC )?response/i);
          assert.match(canary.findings.find(finding => finding.id === "gpc_response")!.summary, /Paired activity comparison: no observable response/);
          assert.doesNotMatch(result.expanded.text, /within 1\.2 seconds|started advertising/);
        } else {
          assert.match(result.expanded.text, /an observable GPC response/);
          assert.doesNotMatch(result.expanded.text, /no observable GPC response/);
        }
      } else {
        assert.ok(result.expanded.links.some(link => link.targetId.endsWith("post_reject_tracking_reduction")));
        assert.ok(result.expanded.links.some(link => link.targetId.endsWith("session_replay_fingerprinting_review")));
      }
      assert.deepEqual(canary, before);
    });
  }
}

test("severity and finding families: prioritize canonical findings and preserve whole qualifications", () => {
  for (const severity of ["critical", "high", "medium", "low"] as const) {
    for (const id of ["gpc_response", "site_integrity_cms_security", "accessibility_priority_group", "regulatory_gap__gdpr_eprivacy__post_reject_tracking_reduction", "california_rights_disclosure_not_observed", "form_data_unexpected_destination"]) {
      const summary = "An observation was retained in this visit. Its scope and purpose remain unconfirmed.";
      const finding = { id, title: `${severity} review`, severity, summary, correctionSteps: ["Verify the retained observation."] };
      const result = buildAssessmentHighlightsPresentation([finding], page, { score: 100 });
      assert.ok(result.text.includes(summary));
      assert.ok(result.text.includes(finding.correctionSteps[0]!));
      assert.ok(result.text.length <= 430);
      assert.equal(result.expanded, undefined);
      assert.doesNotMatch(result.text, /all clear|compliant|minor|legal violation|high-priority remediation/);
    }
  }
  const result = buildAssessmentHighlightsPresentation([
    { id: "site_integrity_cms_security", title: "Low maintenance review", severity: "low" },
    { id: "accessibility_priority_group", title: "Critical keyboard barrier", severity: "critical" },
    { id: "gpc_response", title: "High privacy concern", severity: "high" },
    { id: "site_integrity_hidden_outbound_links", title: "Medium security concern", severity: "medium" },
  ], page);
  assert.match(result.text, /^“Critical keyboard barrier”/);
  assert.match(result.text, /High privacy concern|Medium security concern/);
  assert.doesNotMatch(result.text, /Low maintenance review/);
  assert.doesNotMatch(result.expanded?.text ?? "", /Low maintenance review/,
    "A lower-prominence title without an observation cannot pad expanded highlights.");
});

test("empty, near-empty and large inputs have hard bounds without padding or loss of qualifiers", () => {
  for (const state of ["complete", "limited", "unknown"] as const) {
    for (const score of [0, 50, 100]) {
      const result = buildAssessmentHighlightsPresentation([], page, { score, coverage: { state } });
      assert.equal(result.expanded, undefined);
      assert.deepEqual(result.links, []);
      assert.equal(result.text, state === "complete" ? "No priority issues were identified in the assessed evidence." : "No priority findings are available from this visit.");
    }
  }
  for (const length of [1, 100, 400, 500, 900, 1000, 2000]) {
    const findings = Array.from({ length: 10 }, (_, index) => ({ id: `finding-${index}`, title: `Review ${index}`, summary: `${"a".repeat(length)}. This is unconfirmed.`, correctionSteps: ["b".repeat(length)] }));
    const before = structuredClone(findings);
    const result = buildAssessmentHighlightsPresentation(findings, page);
    assert.ok(result.text.length <= 430);
    assert.ok(!result.expanded || result.expanded.text.length <= 1000);
    for (const copy of [result.text, result.expanded?.text ?? ""]) {
      if (copy.includes("aaa")) assert.ok(copy.includes("This is unconfirmed."));
    }
    assert.deepEqual(findings, before);
  }
});

test("GPC compact variants never drop new restrictions or turn a request sample into proof of collection", () => {
  const sample = canaries[0]!.findings.find(finding => finding.id === "gpc_response")!.summary;
  for (const qualification of ["Collection purpose remains unresolved.", "Restricted processing was declared.", "GPC was not verified for a later document."]) {
    const variants = assessmentHighlightFacts(`${sample} ${qualification}`, "gpc_response");
    assert.equal(variants.length, 1);
    assert.ok(variants[0]!.endsWith(qualification));
  }
  assert.deepEqual(assessmentHighlightFacts("5 script requests were retained; collection is unverified.", "gpc_response"), ["5 script requests were retained; collection is unverified."]);
  const unequal = assessmentHighlightFacts("Retained GPC request samples include 5 classified advertising, marketing, analytics or replay requests, including 2 collection requests.", "gpc_response");
  assert.deepEqual(unequal, ["Samples include 5 tracking requests; 2 collected data."]);
  assert.deepEqual(assessmentHighlightFacts("Retained GPC request samples include 1 classified advertising, marketing, analytics or replay requests, including 1 collection requests.", "gpc_response"), ["The sampled tracking request collected data."]);
});


test("zero GPC samples stay scoped and inconsistent counts are not rewritten", () => {
  const counts = (total: number, collection: number) => `Retained GPC request samples include ${total} classified advertising, marketing, analytics or replay requests, including ${collection} collection requests.`;
  assert.deepEqual(assessmentHighlightFacts(counts(0, 0), "gpc_response"), ["The retained sample contains no classified tracking requests."]);
  assert.deepEqual(assessmentHighlightFacts(counts(1, 0), "gpc_response"), ["Samples include 1 tracking request; 0 collected data."]);
  assert.deepEqual(assessmentHighlightFacts(counts(2, 3), "gpc_response"), [counts(2, 3).replace("GPC", "Global Privacy Control (GPC)")]);
});


test("Reject wording stays about presence after a click, with semantic qualifications intact", () => {
  const summary = "Non-essential entities after Reject: Microsoft Corporation (cookie snapshot, first observed +432 ms after Reject click); Google LLC (service request and cookie snapshot, first observed +159 ms after Reject click). Classified non-essential cookies or service requests were observed after the Reject control was clicked. Cookie presence does not establish active use or verify refusal registration.";
  const result = assessmentHighlightFacts(summary, "regulatory_gap__gdpr_eprivacy__post_reject_tracking_reduction");
  assert.equal(result.length, 1);
  assert.match(result[0]!, /After the Reject click, non-essential cookies or service requests were observed for Microsoft and Google/);
  assert.match(result[0]!, /about 0.2–0.4 seconds/);
  assert.match(result[0]!, /Cookie presence does not establish active use or verify refusal registration/);
  assert.doesNotMatch(result[0]!, /confirmed Reject|ignored|sent data|collected data/);
});
