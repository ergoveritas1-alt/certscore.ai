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
