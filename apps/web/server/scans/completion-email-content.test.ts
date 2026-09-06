import assert from "node:assert/strict";
import test from "node:test";
import { aggregateFullSite } from "@website-signal-risk-scanner/shared";
import { buildScanCompletionEmail } from "./completion-email-content";
import {
  page,
  state,
  occurrence,
} from "../../../../packages/shared/src/full-site-crawl.test";

test("completion summary uses canonical distinct counts and neutral wording", () => {
  const aggregate = aggregateFullSite(
    { ...state, status: "completed", completedAt: "2026-09-06T00:01:00.000Z" },
    [
      page("homepage", [
        occurrence("service", "same"),
        occurrence("cookie", "cookie"),
      ]),
      page("interior", [occurrence("service", "same")]),
    ],
  );
  const mail = buildScanCompletionEmail({
    summary: { ...aggregate, resources: undefined },
    domain: "example.test",
    reportUrl: "https://certscore.ai/scan/fixture",
  });
  assert.match(mail.text, /Distinct services observed: 1/);
  assert.match(mail.text, /Distinct cookies observed: 1/);
  assert.match(mail.text, /2 complete, 0 partial/);
  assert.match(mail.text, /Total elapsed time: 60 seconds/);
  assert.match(mail.text, /homepage audit only/);
  assert.doesNotMatch(mail.subject + mail.text, /full site/i);
});

test("blocked crawl emails disclose limits and do not imply absence", () => {
  const aggregate = aggregateFullSite(
    {
      ...state,
      status: "stopped",
      robotsRestriction: "robots.txt prohibits crawling this site.",
    },
    [],
  );
  const mail = buildScanCompletionEmail({
    summary: { ...aggregate, resources: undefined },
    domain: "example.test",
    reportUrl: "https://certscore.ai/scan/fixture",
  });
  assert.match(mail.subject, /limited coverage/);
  assert.match(mail.text, /robots.txt prohibits/);
  assert.match(mail.text, /not evidence of absence/);
});
