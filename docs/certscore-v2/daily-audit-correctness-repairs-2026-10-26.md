# CertScore.ai daily audit correctness repairs — October 26, 2026

The owner authorized local implementation after reviewing the daily audit's
ranked recommendations. This work changes no deployment, flags, capture budgets,
model calls, historical reports or production data.

## Completed captures without reports (U4)

A bounded read-only trace found that Settrade and Emailsrvr each reached
`terminal_failure` after one publication attempt with
`publication_invariant_failed:posture_scores_unavailable`. Original runtime
snapshots were usable; their final paths or ephemeral login queries differed
from the separately retained report visit. Requiring those independent visits
to have one exact URL discarded the runtime score-availability proof.

New materializations may use `usable_starting_page_score.v2-independent-visit`
when the original verified runtime snapshot qualifies independently, the exact
report URL is separately retained, both URLs have the same origin, and the
runtime lane has positive successful 2xx navigation proof. The parent document,
scan and source-hash joins remain exact. The runtime loader/artifact identity
and SHA-256 of its full URL remain separate; no extra query values are copied.
No-go, challenge, missing identity, unretained report URLs, unrelated origins
and unverified sources remain ineligible. Existing v1 proof and persisted
historical assessments retain their original contracts.

This proof establishes score availability only. It supplies no policy pass,
coverage completion, finding, choice registration or new scoring weight. The
publication invariant still rejects any report lacking both required scores.
No failed historical request is reset or retried by this change.

## Regional-unavailability error page (D14)

The closed runtime-template classifier recognizes the complete retained MXPlayer
message `OOPS!!! WE ARE CURRENTLY NOT AVAILABLE IN YOUR REGION.` as
`unsupported_region`. The canonical no-go path maps it to blocked access, and
the usable-runtime gate rejects it. Whole-message and size bounds exclude
quoted examples, articles and pages with additional substantive content.

## Selected policy citations and table context (U3 components)

The shared evidence validator rejects a French rights-request notification to
unspecified recipients as a recipient-category witness. Bounded canonical
recognition supports the retained disclosure of data communication to partners,
advisers and providers. A legal obligation to retain records alone is not a
retention period or criterion; actual need/account-lifecycle criteria remain
eligible and discoverable late in retained policy text. Retention-only wording
cannot stand in for a processing-purpose disclosure.

HTML table extraction balances nested table/row/cell boundaries, preserves empty
columns, avoids guessing arbitrary short data rows as headers, and does not
assign ambiguous spanning cells to a column. A nested table's activity heading
comes only from its own parent row. Row offsets and document hashes remain
bound to the original sanitized HTML. Ordinary heading and full-text extraction
remain available for unsupported layouts.

Retained replay can replace MGEN's recipient citation and BeyondTrust's purpose
citation. You.com's retained selected sections omit the substantive retention
witness, so recovery requires re-extracting its already-retained complete text;
that result does not demonstrate recovered historical capture. BeyondTrust's
original sanitized HTML was not retained locally: source-known nested-table
fixtures validate the parser repair, while normalized-text replay avoids the
historical false header relationship. Neither is production verification.

## Verification and cost

Regression tests cover the affected evidence and usable/quoted/error controls,
independent-visit publication through persisted report/API/PDF, and table
boundaries, empty columns and ambiguous spans. Retained source hashes and
baseline/candidate outputs are saved under
`artifacts/daily-scan-audit/runs/20261026T154123Z-manual-correctness-fixes/`.

Estimated recurring increment is below $0.50/month at 100,000 scans, within the
repository's preapproved below-$1 threshold; the estimate was disclosed before
implementation. Existing CPU, memory, visits, lanes, model and retention limits
remain unchanged. Undeployed recurring increment is $0. One bounded read-only
AWS trace reserved $0.02 within the existing $5/month audit allowance.

Local repair and replay do not close these issues. Deployment requires separate
authorization; verification requires eligible ordinarily occurring production
evidence on the repaired revision. ReadCube/Gimbal holds remain in force.
