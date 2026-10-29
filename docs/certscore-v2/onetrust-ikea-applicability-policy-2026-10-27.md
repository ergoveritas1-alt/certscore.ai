# CertScore.ai IKEA OneTrust applicability adapter

The owner authorized local implementation, testing and helpful live checks on
October 27, 2026, with no deployment. This adds a versioned interpretation of
IKEA's effective cookie categories, not a general exception for incomplete
OneTrust receipts.

## Reviewed source and scope

`onetrust_ikea_applicability.v1` applies only to the exact normalized main
document `https://www.ikea.com/` and the served script:

- URL: `https://cdn.cookielaw.org/scripttemplates/202508.2.0/otBannerSdk.js`
- SHA-256: `69d65ec22a3d484d852e795b79517d6757749efdec5c6842b4968a3333afd2c9`
- Decoded body: 511,534 bytes.

The reviewed original bytes are retained in the immutable investigation run
`/Users/benmasek/WC01/artifacts/daily-scan-audit/runs/20261028T042822Z-manual-ikea-passive-sdk-binding/served-otBannerSdk.js`.
The adapter follows that source's `populateGroups`,
`isValidConsentNoticeGroup`, `isValidGroup` and `isGroupHasCookies` behavior,
restricted to flat, named `COOKIE` roots with no IAB purpose or enabled IAB,
vendor-level opt-out or Google-vendor mode. Hierarchies and other category types
are unsupported. Public domain data is the SDK's pre-mapping snapshot; the
adapter therefore derives the effective set rather than treating every public
declaration as a receipt category.

For those supported roots, a category is effective when `ShowInPopup` is true
and either `AlwaysShowCategory` is true or an inspected inventory is nonempty:
`FirstPartyCookies`, `Hosts`, `GeneralVendorsIds` or `VendorServices`. Required
categories must remain effective, and there must be at least one effective
optional category. The adapter is used only when it excludes a declared group.
Empty inventories alone do not establish inapplicability. Nullish optional
vendor arrays have the reviewed SDK's empty-inventory meaning; unexpected
shapes and missing required booleans remain unsupported.

## Session and decision proof

The action lane passively hashes an SDK response it already receives. It adds
no HTTP request, SDK getter, click, wait or cleanup tail. Source proof requires
one exact main-frame GET, status 200, no redirect/service worker, exact size and
hash, and one matching loaded script element. Duplicate or unreviewed SDK loads
invalidate source proof, including after a script element is removed. Navigation,
same-URL reload and disposal invalidate the document epoch. Hash completion after
a baseline cannot retrofit source proof into that earlier read.

The existing single `GetDomainData` read at each configuration checkpoint also
returns bounded primitive applicability inputs when source proof is available.
The fingerprint includes the source/document epoch and all normalized inputs,
not only category IDs. Baseline and confirmation fingerprints must match. The source epoch is also
rechecked after each asynchronous cookie read, so navigation or a replacement
SDK cannot borrow an earlier configuration.
Source, baseline, dispatch and confirmation times bind to the original packet
and the control's exact document hash. Child-frame applicability is unsupported.

New `onetrust_cookie_groups.v3-sdk-applicability` proof retains the declared
inputs and complete derived effective set. It requires a fresh same-identity
cookie, an instrumented post-dispatch write, complete effective receipt groups,
required categories on, and an independent exact-value readback. Accept must
have every effective optional category on; Reject must have each off. Opposite
or mixed states cannot confirm the requested action.

Unsupported source/configuration continues through the existing strict declared
universe check; it gains no category exclusion. A changed verified applicability
fingerprint cannot fall back to a weaker receipt interpretation. Historical v1/v2
proof and legacy decoder semantics remain unchanged. No retained report is
rewritten or upgraded. The typed proof passes through canonical packet validation
and report projection; this does not add a concern, finding, score rule or UI
shortcut.

Bounds remain 64 groups, 10,000 entries per inspected inventory, 256 script
elements, one body attempt per document, a 2 MiB declared-transfer rejection
limit and exact reviewed decoded size. Only counts and hashes are retained;
no raw SDK body, cookie value, vendor identifier or group name is added to
production evidence.

## Validation and release boundary

The first live pair exposed a browser-evaluation serialization bug in the local
candidate and remained unconfirmed. It is retained and counted in contact
history. The corrected browser reader has dedicated Chromium regression tests;
its fixtures provide no bundler globals and make no public requests.

The corrected live pair confirmed both Accept (granted) and Reject (denied).
Both independently served the pinned SDK and retained five declared groups with
only C0001/C0002 effective, plus a fresh instrumented receipt and independent
readback. This verifies this supported case; two checks are not a population
reliability estimate or deployed production verification. Per-run evidence is
under `20261028T045018Z-manual-ikea-applicability-live-verification`.

Schema, lifecycle, unsupported-shape, fresh-write, drift, document, timing,
receipt-identity, opposite-state and canonical projection tests protect the
boundaries. The canonical consent release gate includes the new tests in both
fast and full plans. Retained replay must preserve original registration and
legacy decoder results.

Expected recurring increment is below $0.25/month at 100,000 scans, from bounded
hashing/retained proof on this exact route. Four bounded public contacts across
two pairs have a conservative one-time allowance of $0.40. There is no new model
usage, worker size, timeout, retry, browser lane or retention period. Both pairs
are recorded centrally and in the repository contact ledger, including the
initial unconfirmed attempts. The owner waived cooldown only; contact holds,
no-go handling and identity/region boundaries still apply.

No deployment, push or flag change is authorized. Before any later release,
deploy compatible typed consumers through the canonical AWS consumer barrier
before producers emit the new proof version. The broader existing OneTrust
loading/control-resolution gaps remain separate from this applicability repair.


## October 28 effective-category extension

The owner authorized broader source-reviewed OneTrust effective-category handling,
separate notification acknowledgments, tests and useful local live checks, with
no deployment. Historical IKEA v1 retains its exact source/document boundary.
New supported documents use `onetrust_effective_categories.v2` and
`onetrust_cookie_groups.v4-effective-categories`.

The exact received URL, size and SHA-256 must match this reviewed registry:

| SDK revision | Hosts | Decoded bytes | SHA-256 |
| --- | --- | ---: | --- |
| 202508.2.0 | cdn.cookielaw.org | 511534 | 69d65ec22a3d484d852e795b79517d6757749efdec5c6842b4968a3333afd2c9 |
| 202604.2.0 | cdn.cookielaw.org; cookie-cdn.cookiepro.com | 566048 | 6360568655a50bd856b4678504da3f2e472c9d049d26edd14695c65b0934efbb |
| 202608.1.0 | cdn.cookielaw.org | 604329 | 3d2f7f7ae2fdfbf24acada1eaeaa636b84db784d2587115af8c7288565c65208 |
| 202211.2.0 | cdn.cookielaw.org | 392535 | 49582965b8ddcb8f728f5b4d33b2c73e138690f5c6815bd9918de94f62f4b80b |

Each exact path is `/scripttemplates/<revision>/otBannerSdk.js`, over HTTPS,
without query parameters. The modern revisions share the flat COOKIE predicate
described above. Revision 202211.2.0 requires visibility and nonempty inventory;
it does not consult `AlwaysShowCategory`. That revision retains an observed
boolean when available, or null when unavailable, rather than inventing false.
Modern revisions still require an observed boolean. Source-parity checks execute
the retained SDK predicates against 64 combinations per revision (256 total).

This extension does not infer category applicability from the receipt itself.
It preserves the named, flat, non-IAB constraints, required category preservation,
optional choice, all input/configuration fingerprints and fresh same-identity
write/readback checks. It adds no SDK calls, requests, action lanes, polling,
waits, larger workers or retention period. Unsupported or changed sources and
unsupported configurations remain unconfirmed under the existing strict check.
The source must be received and verified before the baseline in that same main
document. Historical proof versions and reports are not rewritten.

### Notification acknowledgments

`hubspot_notification_acknowledgment.v1` is a separate optional typed observation
on new Accept v2 packets and their verified canonical projections. It requires a
verified HubSpot control in the stable main document, a completed click, complete
unchanged pre-existing granted category state, the same pre-click listener event,
a newly instrumented post-click `__hs_notify_banner_dismiss=true` write and one
exact-identity/value snapshot inside the bounded capture. Missing, stale,
ambiguous, canceled, changed-document or contradictory evidence cannot produce it.
The observer uses its existing baseline and confirmation reads, not extra reads.

An acknowledgment does not set `consentConfirmed`, create a fresh consent decision,
change a score or upgrade historical records. The canonical outcome helper keeps
confirmed decisions, notification acknowledgments, completed unconfirmed actions,
incomplete actions and unknown evidence separate. Projections require the packet
hash; historical missing execution/source remains unknown. This first positive
recipe covers HubSpot notification receipts only, not every provider's dismissal.

Estimated recurring increment for the combined extension is below $0.75/month at
100,000 scans, covering bounded hashing and additional typed evidence under
existing retention. Eight planned local action visits carry a conservative
one-time allowance of $0.80. There are no production scan invocations or model
calls. Cooldown is owner-waived; holds, no-go handling, exact-target guards and
current capture limits remain in force. Compatible typed consumers must pass the
canonical AWS consumer barrier before any later producer deployment. This work
is local and does not authorize deployment or flag changes.

## October 28 retained-source coverage extension

The next authorized pass reviewed ten additional SDK revisions from already
retained bodies. The registry now has 15 exact URL/size/SHA-256 pins across 14
revisions. Exact pins remain in `ONETRUST_REVIEWED_SDKS`; there is no version-range
or host-wide trust. The added source predicates differ as follows:

| Added revision | Category inventory rule |
| --- | --- |
| 202609.2.0, 202609.1.0, 202511.1.0, 202512.1.0 | Visible and always-show or nonempty inventory |
| 202409.2.0, 6.36.0, 202411.1.0, 202502.1.0 | Visible and nonempty inventory; always-show is unused |
| 6.34.0 | Visible and nonempty inventory, excluding vendor services from this predicate |
| 202505.1.0 | Visible and nonempty inventory, or always-show gated by a private SDK flag |

The 202505 adapter does not read or assume the private flag. It supports only
inputs whose membership is invariant under both flag values; otherwise the
existing strict declared-category path applies. All source/document/time,
flat-category, non-IAB, required-category preservation, optional-choice and fresh
receipt/readback requirements remain. Historical proof versions remain unchanged.

Tests execute retained SDK predicate excerpts for every pin, with actual IAB type
arrays and both feature/vendor flag values. Independent execution against all
14 retained full SDK bodies passed 3,580 comparisons and explicitly rejected four
flag-dependent cases. The canonical consent gate passed 521 tests; 81 focused
tests also cover the final source fixtures. Historical replay preserved 1,466
registrations and 450 decoder results.

Ten targeted live Accept checks confirmed seven decisions; all ten completed
observation. Two additional existing-reader diagnostics completed observation
without confirmation. AACSB's verified SDK reached a DOM-script eligibility
fallback before richer inputs; the exact subcondition remains unknown. Sympatico
retained full inputs but had a hidden required category that the preservation
guard will not discard. Findaya's effective set contained only a required
category. These cases remain unresolved; no new category exclusion or replacement
network proof is authorized by these results. The prior broader benchmark has
not been rerun after this expansion and its six observation losses remain open.

All 12 packet hashes/projections and served SDK pins verified against the frozen
runtime. Additional recurring cost is estimated below $0.25/month at 100,000
scans; the 12 local visits carry a conservative $1.20 one-time allowance. No new
production capture calls, requests, waits, workers, model usage or retention are
introduced. No deployment or historical rewrite occurred.

Evidence: `/Users/benmasek/WC01/artifacts/daily-scan-audit/runs/20261028T185456Z-manual-onetrust-source-coverage`.

## October 28 active scope and identical-element binding

The next owner-authorized local pass adds
`onetrust_effective_categories.v3-active-scope` and
`onetrust_cookie_groups.v5-active-scope`. See
`cmp-verification-stages-policy-2026-10-28.md` for the precise new boundaries.
Earlier policies retain their required-category preservation and single-element
rules; new evidence does not reinterpret older packets.

New proof can exclude an explicitly hidden required declaration through the
reviewed SDK predicate while preserving an active required category and optional
choice. It can also bind 2–8 identical SDK script elements to one verified
network response, retaining the element count in the stable configuration hash.
Conflicting sources, extra network loads, count drift, incomplete receipt or
missing fresh write/readback cannot confirm. No capture/time limit increases.

Targeted live verification confirmed Sympatico Accept under active scope and
AACSB Accept with two identical SDK elements. Adecco Accept remained confirmed.
The two requested Reject checks did not reach verified controls and do not prove
Reject readiness. Findaya's required-only configuration remains a separate
diagnostic limitation. No deployment or historical rewrite occurred.

Evidence: `/Users/benmasek/WC01/artifacts/daily-scan-audit/runs/20261028T191403Z-manual-cmp-stages-and-binding`.
