# CertScore.ai CMP verification stages and shared binding

The owner authorized local implementation of precise rejection reasons, shared
category/source binding repairs, targeted passive evidence, and separate stage
metrics on October 28, 2026. Helpful local live checks are authorized and cooldown
is waived. Contact holds, exact-target authorization, no-go stops and all existing
scan/action budgets remain. No deployment or flag change is authorized.

## Precise diagnostics

New `consent_confirmation_diagnostics.v3` retains at most 12 unique shared reasons
with independent initial/terminal phase sets. It distinguishes SDK absence,
unreviewed source, duplicate network loads, pending/unavailable/mismatched bytes,
document invalidation, script element absence/conflict/limits, unsupported category
shape/IAB/hierarchy, unobserved private-flag dependence, missing required/optional
scope, and receipt verification failures. Reasons use existing reads and bounded
source-capture state. They cannot supply a consent witness, score or finding.
Historical v1/v2 contracts retain their original reason vocabularies.

## Versioned active category scope

New `onetrust_effective_categories.v3-active-scope` /
`onetrust_cookie_groups.v5-active-scope` preserves the served SDK's reviewed flat
COOKIE predicate. It may exclude a required declaration only when that declaration
is explicitly hidden by the same-session `ShowInPopup` input and the reviewed
predicate excludes it. At least one active required category and one active
optional category must remain. A visible required category cannot be discarded.
All source hashes, non-IAB/named/flat restrictions, bounded inventories, private
flag invariance, complete effective receipt, fresh instrumented write, exact cookie
identity and independent readback remain mandatory. No category is excluded merely
because it is missing from the cookie. Older applicability policies preserve
every declared required category under their original rules.

This handles the retained Sympatico shape: one hidden required declaration and
another required category in the active scope. A required-only configuration,
such as the reviewed Findaya capture, does not gain a synthetic optional decision
or a positive claim about tracking absence. Its diagnostic remains separate.

## Identical script elements

The same new applicability version may retain
`onetrust_script_binding.v2-identical-elements` with a count of 2–8 script elements
only when every matching element references the exact same verified SDK URL.
The whole document inspection stays capped at 256 script elements. Source capture
still requires one exact reviewed main-frame GET/200 response, matching decoded
size/hash, no redirect/service worker, and a stable document epoch. A second SDK
network load invalidates source proof, even when its URL is identical.

The element count participates in the pre-click/post-click configuration
fingerprint. Conflicting URLs, count drift, an unsupported source, excessive
elements or incomplete receipts remain unconfirmed. Historical policies cannot
acquire this binding metadata. No new fetch, SDK read or wait is introduced.

## Passive events and network receipts

`cmp_passive_diagnostics.v1` is diagnostic only. The existing storage init script
also installs main-document listeners for `OneTrustGroupsUpdated` and
`OTConsentApplied`, retaining at most eight event names/times, no payload. Existing
state/write reads collect those observations; there is no extra page round trip,
SDK call, wait or mutation. A missing read is explicitly `not_read`; truncation
is retained. Optional diagnostics cannot discard independent write evidence.

Browser network events retain at most eight main-frame POST observations to three
exact endpoints reviewed in retained configuration: the HTTPS
`/request/v1/consentreceipts` routes on `privacyportal.onetrust.com`,
`privacyportal-eu.onetrust.com` and `privacy.erm-gre.bce.ca`. This is a bounded
diagnostic endpoint registry, not domain-wide consent recognition. Requests,
available response status/time and failure are joined by actual Request identity.
There are no body/header reads, active requests, retries or XHR replacements.
Raw URLs, tokens, payloads, cookie values and identifiers are not retained in this
new diagnostic. Navigation resets the document scope; late callbacks cannot enter
a later epoch. Cleanup freezes and detaches listeners without a tail wait.

An event, HTTP success or absent response never confirms a decision. In particular,
OneTrust's groups event also occurs on load, and the served SDK can emit its applied
event after initiating a beacon. State, action, applicability and independent
readback proof remain separate. The recorded document hash can be compared with
the verified action document; a mismatch is not promoted to action evidence.
Clock-invalid optional diagnostics are omitted instead of failing the action.

## Stage reporting

`consent_action_stages.v1` derives provider attribution, resolved control, completed
click, completed observation, verified category scope and verified decision from
validated source-hash projections. Category scope verification currently measures
typed OneTrust group proof; other provider scopes remain unknown. Separate
diagnostic category checks and passive observations do not establish eligibility
or a decision. Notification acknowledgments remain separate outcomes.

`scripts/cmp-stage-benchmark.ts` verifies original packet bytes before projection
and produces a JSON/CSV/HTML table. Reference/candidate arms, cohorts and actions
remain separate. Counts include known failures and explicit unknowns. Uncontacted
planned slots remain visible but do not enter contacted-visit denominators. Missing
provider evidence means unverified CMP, never no CMP. Retained historical reasons
may be tabulated from their verified source bytes without rewriting stored reports,
registrations or decisions. This tool does not update the production dashboard or
daily audit state and makes no network requests.

## Cost and release boundary

Estimated additional recurring compute and retained evidence cost is below
$0.50/month at 100,000 scans with existing retention. Nine local action visits
across the initial two diagnostics and seven final checks have a conservative
$0.90 one-time allowance. No production scans, model/API calls, larger workers,
capture windows or retention periods are added. Required contact metadata is
persisted separately from product changes.

Before any later deployment, compatible typed consumers must precede producers
through the canonical AWS consumer barrier. This local work does not close the
earlier broader benchmark's six observation losses or establish population or
production-region reliability. The run's summary records actual validation and
all live outcomes, including unsuccessful attempts:

`/Users/benmasek/WC01/artifacts/daily-scan-audit/runs/20261028T191403Z-manual-cmp-stages-and-binding`.
