# CMP Accept/Reject recipe coverage

CertScore treats every CMP observed in production as an action-recipe onboarding candidate. “Recognized but unsupported” is an explicit, temporary coverage state; it is never a reason to guess a selector or silently omit Accept/Reject coverage.

The production boundary remains:

1. identify the CMP through `KNOWN_CMP_REGISTRY` signals;
2. resolve one exact, vendor-specific first-layer control;
3. dispatch at most one authorized Accept or Reject action;
4. independently confirm the CMP or TCF state transition;
5. retain the bounded evidence packet and project it through the canonical concern pipeline.

A recipe is production-capable only when both a stable vendor scope or exact
control selector and semantic confirmation are registered. A scoped accessible
recipe must resolve exactly one canonical action inside the vendor-owned
first-layer surface. Closed-shadow recipes additionally require an exact
accessibility-tree match, viewport geometry, and center-point hit verification.
If resolution fails, the observer retains one bounded `cmp_action_coverage`
limitation with a safe fingerprint. It distinguishes:

- a registered recipe that did not resolve;
- a recipe disabled by the per-CMP kill switch;
- a recognized CMP whose selector or confirmation is still missing;
- an unregistered CMP candidate with canonical consent-control evidence; and
- no credible CMP evidence.

The fingerprint contains names and hashes only: cookie names, storage keys, matched registry selectors/globals, control intents, hosts, and hashed script/iframe paths. It never retains cookie values, storage values, raw control text, query strings, or DOM bodies.

## Operations

Run `pnpm ops:cmp-action-coverage` against the read-only production database. The audit groups the prior 90 days by retained CMP identity, maps aliases to the canonical registry, and warns when an unknown or action-incomplete CMP reaches three distinct domains. It also reads the official IAB Europe operational CMP discovery feed for registry discovery; feed membership alone does not authorize clicking.

Use `CERTSCORE_CMP_ACTION_RECIPE_DISABLED` as an action-scoped emergency control. Supported keys are `CMP:accept`, `CMP:reject`, `CMP:*`, and `*`. Regional scanner parity must keep this value identical in every Lambda region.

Onboarding priority is production exposure first. For each candidate, retain representative fixtures, verify vendor documentation, add exact selectors and independent state confirmation to the canonical registry, add both recipe tests and browser tests, then remove the coverage alert. CMPs with closed shadow roots or publisher-custom controls remain active candidates for a vendor API or stable integration contract.

## Current qualification tiers

| CMP | Accept | Reject | Qualification boundary |
| --- | --- | --- | --- |
| Consentmanager | Qualified | Qualified | Exact controls plus TCF/cookie transition |
| HubSpot Consent Banner | Qualified | Qualified | Current and legacy cookie variants |
| Ketch | Qualified | Qualified | Exact controls plus consent-cookie transition |
| Cookie Information | Qualified | Qualified | Exact controls plus TCF/cookie transition |
| Iubenda | Qualified | Qualified | Ordinary free Reject only; paid/subscription variants remain actionless |
| InMobi Choice | Qualified | Qualified | Vendor-scoped accessible controls plus TCF/cookie transition |
| Quantcast Choice | Qualified | Qualified | Vendor-scoped accessible controls plus TCF/cookie transition |
| Termly | Qualified | Qualified | Stable vendor action scope plus consent-state API/event transition |
| Transcend | Qualified | Qualified | Closed-shadow accessibility resolution plus Airgap consent-state transition |

The registry now has bounded Accept and Reject recipes for Consentmanager,
HubSpot Consent Banner, Ketch, Cookie Information, Iubenda, Quantcast Choice,
InMobi Choice, Termly, and Transcend. Quantcast/InMobi actions are scoped to the
vendor UI and confirmed through TCF or the canonical consent cookie. Termly is
scoped to its vendor-supported banner-actions surface and confirmed through
`Termly.getConsentState()` plus a fresh consent event. Transcend's default
closed-shadow experience resolves through the accessibility tree and is
confirmed through `airgap.getConsent()`.

Iubenda's ordinary free Reject control is qualified, but the canonical label
classifier explicitly excludes the `reject_with_subscription` variant. Such a
control remains actionless and cannot begin a purchase or subscription flow.
Publisher-supplied custom UIs remain eligible only when they preserve the
registered vendor scope, unique canonical action semantics, and verifiable
state API transition.

Qualification has three separate meanings:

1. registry-qualified: exact selector plus an independent state confirmation;
2. observer-qualified: repeated fresh browser contexts dispatch exactly one
   action and confirm a fresh transition; and
3. live-cohort-qualified: the same recipe succeeds on a cooldown-eligible,
   ledger-selected public calibration cohort.

Local fixtures and retained production evidence may establish the first two
tiers. They must not be described as live-cohort coverage.
