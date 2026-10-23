import assert from "node:assert/strict";
import test from "node:test";
import { buildExecutiveOverview, EXECUTIVE_OVERVIEW_MAX_LENGTH } from "./executive-overview-copy";
import { buildExecutiveOverview as buildOlderOverview } from "../../scanso2/report-lab/executive-overview-copy";

test("page highlights explain the projected Reject finding before accessibility", () => {
  const findings = [
    { id: "regulatory_gap__gdpr_eprivacy__post_reject_tracking_reduction",
      title: "Non-essential activity after confirmed Reject", status: "Potential gap",
      summary: "Qualifying non-essential requests were observed during the retained post-Reject capture." },
    { id: "accessibility_priority_group", title: "Accessibility issues",
      summary: "Review automated accessibility findings and retained examples in Detailed evidence." },
  ];
  const copy = buildExecutiveOverview({ findings });
  assert.match(copy, /^“Non-essential activity after confirmed Reject”/);
  assert.match(copy, /retained post-Reject capture/);
  assert.match(copy, /Accessibility issues/);
  assert.doesNotMatch(copy, /2 priority issues were identified/);
  assert.doesNotMatch(copy, /comparison baseline|visitor choice|Transport security checks|8-second/);
  assert.ok(copy.length <= EXECUTIVE_OVERVIEW_MAX_LENGTH);
  assert.equal(buildOlderOverview({ findings }), copy);
});

test("a projected Accept contradiction is summarized without inventing denied purposes or remediation", () => {
  const copy = buildExecutiveOverview({ findings: [{
    id: "acceptance_signal_contradicts_action", title: "Consent-state review",
    summary: "The retained consent state contradicted the confirmed Accept action." }],
  });
  assert.match(copy, /retained consent state contradicted the confirmed Accept action/);
  assert.doesNotMatch(copy, /analytics|advertising|needs to be corrected|comparison baseline/);
});

test("an empty finding set stays concise and does not assert compliance", () => {
  const copy = buildExecutiveOverview({ findings: [], context: { coverage: { state: "complete" } } });
  assert.equal(copy, "No priority issues were identified in the assessed evidence.");
  assert.doesNotMatch(copy, /compliant|secure|encouraging|every site behavior/);
});
