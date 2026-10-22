# CertScore.ai Muse repeat-use review

Tested the installed public 1.0.1 skill in the consumer Muse app, continuing the
earlier test-page review. These are live user-authorized test scans, not scanner
calibration or changes to scoring, capture, infrastructure, or schedules.

## Fresh recheck and baseline comparison

Prompt: “Scan https://ergoveritas.com/test1.html again with my saved CertScore.ai
skill and compare it with the previous scan. Has anything changed?”

Muse created recheck `6a223ab2-cc98-4f50-9450-bbf3b8fb6f48` and compared it with
baseline `4d6583b9-6fc9-4461-a163-fd51ec23c9bf`. Both completed on October 22,
2026, at 23:05 UTC and 22:33 UTC respectively, from Ireland, with partial
starting-page coverage. Both returned score 10 and 11 canonical findings.

The answer retained both scan IDs, timestamps, scope and report links. It
described persistent findings, and separately noted a difference in the bounded
GPC request comparison without claiming that GPC was honored or a fix verified.
It avoided repeating the checklist/inventory offers already fulfilled in this
conversation. An independent read of the new bundle confirmed the target,
execution region, score, finding count, completion time and full-report URL.

## California view of the same scan

Prompt: “How does this same scan look in the California report view instead of
the EU view? Can I open that view?”

Muse read the existing scan and inspected the report's switcher. It returned a
direct California link for the recheck, summarized score 70 and the California
topics, and explained the limited coverage and the original Ireland visit.
It did not describe changing review focus as a new California visit.

Clicking the actual link in Muse opened the expected report in Chrome:
https://certscore.ai/scan/6a223ab2-cc98-4f50-9450-bbf3b8fb6f48?reviewFocus=ccpa_cpra.
The view displayed California score 70, four top issues, and the warning that
California visitor behavior was not tested. Clicking GDPR/ePrivacy switched
the same scan back to EU score 10 with eight top issues. No scan was created by
the view change.

## Other pages and locations

Prompt: “I have two other test pages to review:
https://ergoveritas.com/test2.html and https://ergoveritas.com/test3.html. Scan
test2 from California and test3 from Germany. Which page needs attention first?”

Muse completed both requested scans with separate IDs and report links:

| Page | Scan ID | Execution | Result | EU score | California score |
| --- | --- | --- | --- | --- | --- |
| test2.html | `b95bba82-e394-45cd-b55a-b449caeeeff6` | California | completed, limited | 30 | 81, limited coverage |
| test3.html | `287f8280-f619-4afa-ab32-427594895e90` | Germany | completed | 58 | 81, limited coverage |

The scans completed at 23:11 UTC on October 22, 2026. Independent bundle reads
confirmed the exact URLs, execution regions, statuses, scores, finding totals
(11 and 9), and report links. Clicking both actual Muse report links opened the
corresponding public scan pages in Chrome. Muse prioritized test2 based on
observed privacy and accessibility findings. These differently targeted visits
do not establish that geography caused any difference.

## Wording issue and candidate correction

The initial multi-page answer quoted scores 30 and 58 without identifying them
as EU scores in the opening. A California-origin report defaults to the
California focus, where test2 displays 81. Muse explained that distinction
later, but the initial labels were ambiguous. It also called limited coverage
grounds not to rely on the California score, rather than simply preserving the
returned score and describing its bounded coverage.

An unpublished 1.0.2 candidate narrows this issue: label each posture's score,
compare the same posture across pages, distinguish execution location from
report focus, preserve limited-coverage scores, and do not infer geographical
causation from different URLs. It suggests one useful follow-up after a
portfolio review, such as a checklist for the highest-priority page, without
requiring generic invitations to create more scans. Direct focus links still
require returned or live-verified URLs.

The candidate ZIP was attached in Muse with a request to save/reread it and
answer the same two-page question using the completed scans, without creating
another scan. Its helper and manifest exactly match 1.0.1, and skill validation
passed. The original published package and repository packaging check remain
unchanged. The candidate ZIP, complete SKILL source and exact patch are local
artifacts under `output/muse/`. The public download remains version 1.0.1;
only the Muse installation used for this review has the candidate instructions.

Muse confirmed that it saved/reread the candidate and that its helper bytes
were unchanged. Its revised answer clearly compared EU scores 30 and 58,
separately reported both limited-coverage California scores of 81, and explained
that changing both URL and location cannot establish geographic causation.
Both existing report links were retained. It offered one specific next step:
“I can turn test2's findings into a developer checklist for that page, since it
is the first priority.” This was accepted with “Yes, give me that checklist for
test2.”

The follow-up completed with the same test2 scan ID, explicit confirmation that
no new scan was created, EU/California score labels, retained finding IDs and
evidence anchors, suggested owners, manual verification tasks, and the original
full-report link. It suggested a fresh California recheck after fixes are live,
preserving the baseline location, without starting that recheck. It did not
repeat another generic invitation or promotion. The completed response was
captured in `muse-repeat-checklist-follow-through.png`.

This review created three requested scans (test1 recheck, test2 and test3).
Comparison reads, report-view changes and checklist generation reused their
existing scan IDs. No MCP, public-web or scanner deployment was performed.

## Evidence and scope

Screenshots and independent tool responses are retained locally under
`tmp/muse-verification/`, including `muse-repeat-comparison.png`,
`muse-repeat-california-answer.png`, `muse-repeat-california-report.png`, and
`muse-repeat-test1-bundle.json`. Screenshots are not published with the package.
No recurring infrastructure cost or automatic scans are added by this review.

## Follow-up opportunity

Consider adding canonical EU and California report links, each labeled by
focus, to MCP Light navigation/action guidance. Today Muse can read both
posture scores, but inspected the live browser switcher to verify the focus URL.
Returning those links could remove that extra navigation step and align the
quoted score with the destination view. This is a recommendation, not an
implemented or deployed MCP change. Prefer a single task-relevant next step
(highest-priority checklist, deeper evidence, or a same-page location comparison)
to repeated feature callouts or incentives unrelated to the user's question.
