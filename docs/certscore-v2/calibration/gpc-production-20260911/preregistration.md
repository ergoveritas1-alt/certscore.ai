# GPC completion v2 acceptance preregistration

Status: selected through fresh central exports; 260 targets frozen before acceptance contact. Internal benchmark.

This benchmark evaluates the evidence-completion rate for the bounded
`main_document_and_retained_http_requests` (completion assessor/session v2) observation. It does not measure
whether GPC was honored, sale/sharing state, legal compliance, tracker
suppression, or any score effect.

## Frozen design

- Submit one fixed cohort of 260 targets after fresh central eligibility is
  recomputed from a new central history export.
- Preserve the prior source-pool composition: 183 historically CMP-observed
  and 654 historically CMP-not-observed candidates (21.86% observed). Select
  approximately 57 observed and 203 not-observed targets, subject to current
  eligibility. Historical GPC outcomes are not a selection feature.
- Require at least 200 representative observations and a completion point
  estimate strictly above 95%, with the 95% Wilson lower confidence bound
  strictly above 95%.
- Freeze the target list before any contact. Do not retry, replace, adaptively
  stop, or remove targets based on GPC results. Exclude owned canaries and
  report them separately.
- Keep all submitted outcomes in the audit record. Only independently verified
  canonical non-representative no-go outcomes may leave the representative
  denominator; unknown or unverifiable access remains a denominator failure.

## v2 evidence definition

Completion requires the existing main-document delivery, navigator readback,
terminal semantic probe, exact session/source/document binding, and a complete
drop-free bounded request window. Actual HTTP requests remain required to carry
retained `Sec-GPC: 1` proof.

A new typed `preTransmissionBlock` outcome may satisfy the request-lifecycle
facet only for the same retained Playwright `Request` object when its pinned
Chromium failure readback is exactly `csp` or `mixed-content`, with no response,
no service-worker ownership, exact event/loader binding, and no evidence of
transmission. It must remain separate from ordinary HTTP rows and must never be
encoded as `Sec-GPC: 1`. Aborts, redirects with missing hop proof, ambiguous
identity, unknown failure strings, and missing timing remain incomplete.

Historical v1 packets and counts are preserved unchanged. Diagnostics are
separate evidence and cannot repair v1 records or borrow headers across
requests, redirect hops, frames, loaders, or sessions.

## Reporting and acceptance

Report the representative denominator, completed count, point rate, Wilson
interval, all-submitted rate, excluded non-representative count, canary count,
failure reasons, and the separate facets for semantic state, acknowledgment,
full-context delivery, and paired comparison. A passing completion gate remains
diagnostic-only and does not authorize production integration.

The acceptance cohort must be held out after selection and audited against the
frozen manifest, fresh source hashes, original retained pointers, exact session
bindings, schema versions, and implementation hashes. No external contacts,
production writes, deployment, or model/API calls are part of preregistration.

## Source and pending inputs

The source pool is copied by reference from the prior follow-up acceptance
package in `/Users/benmasek/WC01/artifacts/gpc-completion-followup-20260911`.
Fresh central eligibility is required before target selection. The root agent
must place the fresh central history export at
`acceptance-prep/central-history-export.json`; the selector may then produce
the frozen selected-target manifest and contact ledger. Until that file exists,
`selectedTargets` remains empty and the manual ledger remains uncontacted.
