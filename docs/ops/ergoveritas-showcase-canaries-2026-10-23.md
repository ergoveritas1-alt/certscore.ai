# CertScore.ai showcase canaries — October 23, 2026

Owner authorized changes, AWS publication and fresh scans of the two owned pages,
with a 20–45 target for both GDPR/ePrivacy and California postures. This release
changes static canary behavior and notices only; no scanner, scoring policy,
production report history or CertScore.ai application deployment is included.

- test1: small pre-consent cookie inventory, canvas/audio calls, Microsoft Clarity,
  identified advertising requests, most state cleared after Reject with one
  residual Google case, concealed outbound link, small accessibility sample,
  and a deliberately unavailable named sale/sharing choice destination.
- test2: broader accessibility sample, Pinterest suppressed under GPC while other
  identified advertising requests remain, two residual advertising cases after
  Reject, working manual choices for later visits, and a substantive policy.
- Both remain clearly labeled owned synthetic fixtures, no-index, with fixed
  invented identifiers. Input values are never read or transmitted. Successful
  collection and finding eligibility must be verified by the canonical pipeline.
- Runtime is isolated in certscore-showcase-canary.js; shared regression runtime
  is unchanged. Existing AWS S3/CloudFront helpers publish committed assets only.
- Reconciled two local test2 alt/link examples absent from live, avoiding an
  unintended expansion. Notices now describe the implemented state and requests.

Validation before publication: offline behavioral verifier (baseline/GPC, manual
choice, Reject cleanup/residual activity), JS and shell syntax, diff whitespace,
calibration registry, central contact-history export, and canonical owned-target
selection with the owner's explicit repeat-scan authorization recorded. The
change-aware fast preflight finds no application deployment targets.

Expected incremental hosting cost: below $0.25/month at 100,000 scans for the
small static runtime/notice changes; no recurring capacity, extra capture budget,
model calls or retention change. Bounded verification scans and a read-only
contact-ledger one-off use existing infrastructure.

Live verification results will be appended after publication and fresh scans.

## First verification and refinement

Published baec7f91529a24c9282b2264ba9b6d2f90f93bf1 using the two existing
S3/CloudFront helpers; all assets matched on apex and www. Fresh reports:

- test1: 368fcfbb-75b6-4a32-a35e-1e03c3ef390e, GDPR 33, California 49.
  Strong variety: pre-consent activity/storage, after-Reject Google, replay,
  device identification, hidden link, rights disclosure and accessibility.
  The named choice URL returned 404 during direct verification, but its capture
  remained untested in the scan; it correctly had no score effect.
- test2: 49f347c0-223b-419c-a8af-eaca80df2a7c, GDPR 40, California 63.
  GPC retained verified Google and Microsoft advertising collection. Unresolved
  linked supplements correctly prevented a missing-right conclusion.

Refinement adds low-contrast and author-declared zoom restriction examples to
test1, providing two additional observable accessibility categories. Test2
consolidates notices/choices into one discoverable policy document, with the
working manual choice on that document; older standalone choice pages remain
available. Its partial GPC example now suppresses Pinterest while retaining
Google, Meta and Microsoft. This changes the actual test behavior and does not
reinterpret limited capture or change any score policy.

## Verified final behavior

Fresh scans of 1521be46bb383ed6d5781598020c63d87328ec45:

| Page | GDPR/ePrivacy | California | Public report |
| --- | ---: | ---: | --- |
| test1 | 28 | 44 | https://certscore.ai/scan/1a02167e-bb00-408b-a5a2-4a647a28156b |
| test2 | 40 | 44 | https://certscore.ai/scan/1bd6fcb0-f749-45f1-967b-4056c5cf31af |

All four scores are in the requested 20–45 range. Canonical report exports
retain the corresponding score policies (GDPR v23, California v17), evidence
and coverage states. No historical score or policy was changed.

Test1: seven GDPR top issues, with tracking/storage, residual Google after Reject,
Microsoft Clarity replay, observed canvas/audio identification, concealed outbound
link and five captured accessibility rules. California retains qualified Google,
Meta and Microsoft GPC activity, a scoped rights-disclosure gap and accessibility.

Test2: distinct partial GPC reduction (Pinterest suppressed), while successful
Google, Meta and Microsoft advertising requests remain with verified GPC delivery;
residual Google/Microsoft activity after Reject, replay, rights disclosure and
broader accessibility examples. California rights coverage now supports the
scoped missing-disclosure finding after notice consolidation.

California coverage remains explicitly limited (5/6 families) on both reports.
Test2's accessibility audit is limited; retained positive findings remain factual,
not proof of complete WCAG coverage. These two owned fixtures do not establish an
internet-wide calibration baseline or legal compliance status.

Final copy polish corrects the older, standalone test2 pages' cookie counts and
Pinterest/GPC wording. Those pages are no longer linked by the scanned main page
or governing policy; main page, runtime and governing policy bytes stay identical
to the fresh passing scans. The offline verifier also exercises manual choice
save, cleanup (including _epik), later-visit suppression and reset.

The generated owned-target contact ledger is retained beside this note; the four
scan contacts use idempotent calibration run key
`owned-showcase-2026-10-23-1521be46` in addition to normal MCP contact recording.
The rotating public inventory is unchanged. Local bounded report exports and
scan responses are under tmp/canary-score-showcase-review/.
