# Missing privacy-policy discovery correction

Production scan `be4e1384-e69b-4e45-9148-d07a6c1d7c15` of
`https://www.ribcompany.com/` completed policy discovery without an observed
policy link. Thirteen guessed policy-document URLs returned HTTP 404. Its
retained bundle classified the search as limited because neither scanner
producer passed the negative-search verification argument. Consequently the
canonical missing-policy finding and its approved nine-point deduction were
not eligible. Failed guessed URLs alone do not establish absence.

The policy lane now retains versioned negative-search proof from its existing
static fetch and rendered inspection. It requires representative successful
static/rendered documents, a complete unsampled candidate enumeration, no
uninspected frames/open shadow roots, matching static/rendered URLs, a stable
rendered document between text and DOM reads, and no observed privacy candidate.
Failures, incomplete documents, truncation and deadlines remain neutral. The
proof is target-bound and retained in the canonical inspection and hash-bound
early policy packet. It follows the existing concern, checklist, finding and
score pipeline, including the shared page score used in either regulatory view.

No historical scan is rewritten. New scans retain the additional proof; the
original ribcompany.com capture cannot retroactively gain missing DOM coverage
metadata. No production verification scan or model call is added.

Regression coverage includes a real browser against local fixtures, contract
validation and target/document drift, early handoff hashing, and canonical
priority, site-assessment and score explanation. Preflight includes the new
focused regression. Existing positive and unavailable-policy behavior remains
covered by the full policy suite.

Incremental recurring cost: less than $0.10/month at 100,000 scans for bounded
proof metadata and processing. No additional lane, request, model call, browser
run, wait, retention duration or provisioned capacity.

Production verification of scan `7685bc7c-49e6-4856-9d89-178797dc350f`
identified an additional seed-provenance defect: production injects canonical
common-path hints into discovery candidates. Those guessed URLs were incorrectly
counted as observed privacy links by the negative-proof gate, and a stronger seed
could also mask an observed link to the same URL during deduplication.
The gate now excludes guessed paths from observed-link inventory, and deduplication
prefers observed link provenance over seed hints. Two real-browser regressions
reproduce both defects before the fix and pass afterward. The same evidence,
coverage, scoring and cost requirements remain in force.
