# Scan report evidence corrections — October 8, 2026

## Scope

Implementation following review of retained SITS report
`e0fdabad-90e2-4688-8da7-49f83adc39b6`, subsequently authorized for production
release by the owner. No new SITS contact, historical-record mutation, or score
backfill is part of this release.

- Default fresh re-scan on in the Overview scan launcher.
- Preserve bounded timelines after completed Accept/Reject clicks when capture
  is partial, without implying semantic consent registration or scoring effects.

- Keep exact HubSpot `/embed/v3/form/<portal>/<form>/json` downloads attributed to
  HubSpot Forms, with functional infrastructure purpose. Counters and separately
  classified analytics/advertising requests retain their original purposes.
- Keep tag-management loaders in the Reject request inventory without treating a
  loader alone as qualifying non-essential activity. Actual downstream tracking
  remains independently eligible under the existing concern/scoring policy.
- Loader/form-delivery-only traffic no longer ends Reject observation early.
  Continue inside the existing registration-anchored window; qualifying requests,
  writes and consent contradictions still allow their existing bounded early exit.
  Semantic readback overlaps observation instead of restarting the window.
- Retain the Reject capture end separately from worker finalization. Describe
  configured windows as maxima; use actual capture timing where retained. Legacy
  worker-completion timestamps remain worker-completion timestamps.
- Select controller-owned DPO evidence before structurally stronger platform
  contacts. Retained SITS policy replay selects its designated officer/contact;
  platform-only DPO text does not establish the site's own officer.
- Fit the real masked post-Accept form into the existing bounded screenshot crop,
  including its notice and Submit area. Restore zoom, scrolling and animation
  state. Keep control binding, pixel verification, moderation and display-safety
  checks unchanged. This does not reconstruct old images or invent absent notices.
- Preserve observed accessible field names from bounded `aria-labelledby` and
  `aria-label` metadata. Normalize required markers for operational company fields;
  conflicting metadata remains unknown. These are inventory review labels, not
  new findings or score effects.

## Owner approval and cost

The owner explicitly approved existing-window continuation on October 8, 2026:
**up to $80 per 100,000 affected scans**, including worker and coordinator compute.
The increase applies only where loader/form-delivery traffic previously stopped
observation before qualifying evidence or the window end. Its production frequency
is not established by these fixtures. No extra lane, invocation, retry, model call,
or timeout increase is added. The lower-cost alternative presented to the owner
was keeping the early stop and reporting partial coverage, which can miss later
tracking.

The bounded capture-end field was disclosed at **under $0.10/month at 100,000
scans/month**, within the repository's pre-approved below-$1 threshold. Form fitting
uses the existing image count, pixel bounds, moderation call and deadline; policy
and field-label corrections add no paid service or model call.

## Verification

Use retained policy replay and loopback fixtures, with external request URLs
intercepted locally. The new regression suite covers early analytics, later
analytics after loaders, neutral loader-only full-window completion, exact retained
capture end, controller/platform DPO selection, complete masked form context and
layout restoration. Contract tests reject inconsistent capture clocks and preserve
legacy completion semantics. Resolver tests preserve exact attribution identities,
separate form definitions from counters, and guard URL boundaries.

Local proof and test logs are in the ignored
`artifacts/report-review-fixes-20261008/` directory. The screenshot proof is a
deterministic loopback form, not a fresh SITS screenshot. Historical report counts,
policy excerpts and images are unchanged until separately authorized canonical
reprocessing or a new eligible scan.

Completed checks: 6 new local regressions, 80 Reject observer tests, 166 resolver
tests, 37 contract/field-review tests, 118 report/timeline tests, 11 policy tests,
and 38 form-capture tests passed. Web, scan-core and contracts typechecks and the
resolver/contracts build passed. The in-app browser rejected binding to its
existing localhost error tab under its URL policy; no browser workaround was used.
The local report preview was therefore not independently inspected in this turn.

Registry source context:
[HubSpot external forms](https://knowledge.hubspot.com/forms/set-up-and-style-your-form-on-an-external-site)
and [Google consent mode](https://developers.google.com/tag-platform/security/guides/consent).
The rule is restricted to the retained form-definition endpoint shape; neither
source is used to infer the scanned site's consent state.
