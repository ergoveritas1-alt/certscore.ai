# CertScore.ai showcase canaries — October 23, 2026

Owner authorized changes, AWS publication and fresh scans of the two owned pages,
with a 20–45 target for both GDPR/ePrivacy and California postures. This release
changes static canary behavior and notices only; no scanner, scoring policy,
production report history or CertScore.ai application deployment is included.

- test1: small pre-consent cookie inventory, canvas/audio calls, Microsoft Clarity,
  identified advertising requests, most state cleared after Reject with one
  residual Google case, concealed outbound link, small accessibility sample,
  and a deliberately unavailable named sale/sharing choice destination.
- test2: broader accessibility sample, Meta suppressed under GPC while other
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

Expected incremental hosting cost: below $0.10/month at 100,000 scans for the
small static runtime/notice changes; no recurring capacity, extra capture budget,
model calls or retention change. Bounded verification scans and a read-only
contact-ledger one-off use existing infrastructure.

Live verification results will be appended after publication and fresh scans.
