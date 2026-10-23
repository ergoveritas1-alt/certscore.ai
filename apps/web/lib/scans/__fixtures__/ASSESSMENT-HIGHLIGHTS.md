# CertScore.ai assessment highlights regression corpus

Run `pnpm test:assessment-highlights` from the repository root. The public web
preflight and AWS deployment workflow require this suite.

`assessment-highlights-reviewed-corpus.json` preserves 80 assessments from two
20-site review cohorts, each with EU and California views. The targeted cohort
includes six retained multi-page reports. Inputs contain already-projected
findings, scope and context; they do not contain raw request payloads. Expected
copy and links capture the accepted editorial behavior after independent review.

The smaller canary, editorial and edge fixtures retain specific qualifications
and fixes. Synthetic critical-priority and uncertain-signal tests are explicitly
separate from retained-site observations.

When wording intentionally changes, review affected inputs and complete
qualifications before updating expected output. Keep the 500-character summary
and 1,000-character expansion limits, evidence links, source immutability,
conditional next steps and independent severity/coverage semantics. Do not
refresh snapshots blindly or derive new findings from fixture context.
