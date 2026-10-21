# Canonical scoring policy

The owner-approved September 6, 2026 scoring table is defined in
`apps/web/lib/scans/scoring-policy.ts`. The local `/scoring-review` page renders
this registry directly. Change the registry rather than copying policy numbers
into report components or documentation.

Local versions: `gdpr-eprivacy-posture.v22`, `overall-posture.v13`, and
`full-site-distinct-findings.v12`. These changes have not been deployed.
The separately approved California recipient scoring policy is unchanged.

The score starts at 100, subtracts eligible deductions after shared family caps,
and stops at 0. Insufficient evidence can withhold a score; it does not imply a
zero score. Scores are risk signals, not legal certification.

A dismissible cookie information notice alone does not establish an applicable
Accept/Reject consent choice. A missing Reject finding requires a verified
choice control or independently classified non-essential activity through the
canonical concern and checklist path. An incomplete first-layer inspection is
a coverage limit, not a scored absence.

Incomplete runtime or critical coverage remains a visible limitation. It does
not suppress a numeric score supported by the canonical checklist and unified
findings. Unknown consent controls do not become scored absences. A retained
scan no-go decision still withholds the report score and findings.
Reassessing an older cached null site score reads its already-retained page
artifacts once and persists the repaired result. In the current localhost cohort,
one cached result required repair; estimated incremental storage and compute cost
is below $0.01, with no new scan or browser work.

Storage and tracking use 8 for the first eligible identity/vendor, 4 for the
second, and 2 for each additional, capped independently at 40. Session replay
and fingerprinting use 6, 4, and 1 for each additional identity. Sensitive runtime
(replay plus sensitive-surface tracking) and fingerprinting each have a 25-point
cap. Replay identities use canonical vendor/product names; fingerprinting uses
hosts. Storage retains exact storage identity; tracking uses canonical vendors.

Decline/Reject deducts 12, within the 22-point consent-control cap. A completed,
authorized Reject path with classified non-essential cookie/service presence uses
15/20/23/25/27/28/29/30 points for 1–8+ distinct canonical entities, capped at 30.
Count each entity once across cookies and services. Unknown ownership supports
the initial 15 but no extra increments. Refusal confirmation and identifier
matching are not prerequisites; retained packet, control/document binding,
post-click timing and bounded capture proof remain required. See
[canonical Reject presence](certscore-v2/reject-nonessential-presence-policy.md).
Historical v20/v21 assessments retain their original 15/5/0 tiers and cap of 15;
v18/v19 retain their original interpretation.
 Legacy privacy-checklist accessibility, choice-quality, withdrawal and
cross-border rows have no direct deduction;
the underlying findings/checklist evidence remains available.

Sensitive-surface tracking deducts 12. Each of embedded content, social embeds,
and third-party iframes deducts 5, sharing the 20-point embed cap. Under the new
`distinct_embed_exposure.v1` projection, an already-charged host/purpose/resource
group does not attract another category charge. Canonical pixels remain tracking
evidence without an additional embed charge; different resource paths or content
purposes remain distinct. Historical rows without this projection keep the prior
calculation. See the [local cookie/embed review and after-Reject proposal](certscore-v2/cookie-embed-scoring-review-2026-10-14.md).
The after-Reject tiers are implemented locally under the separately versioned policy linked above. Privacy-notice
availability deducts 9 (owner-approved October 11, 2026), shown as
“Privacy policy not found: −9 points” when
the canonical deduction applies. The report attribution uses the same capped
calculation as the score; other transparency rows do not add another charge
when the missing-policy deduction applies. A supported missing-policy finding
also appears in the site assessment, scoped to its retained homepage evidence.
Stored historical scores retain their recorded versions and amounts. Transport and eligible California GPC retain the
registry's existing deductions. Zero-deduction checks are omitted from the table.

## Hidden outbound links — September 17, 2026 update

The owner approved an overall-score deduction of 17 points for the first verified
hidden outbound link occurrence and 5 for each additional occurrence, capped at
40 across the entire report. Six occurrences reach the cap. The scoring review
sheet includes this rule from the same registry used by the engine.

Policy `certscore.site-integrity-policy.v4` accepts one or more verified retained
hidden links. The previous three-link/two-domain/two-method threshold is replaced;
strict evidence, provenance and capture verification remain unchanged. Typed
projection → normalized concern → concern policy → unified finding score effect
is required. There is no regulatory checklist deduction or inferred legal gap.

Each scan/page/link reference counts once; duplicate copies of a page projection
do not multiply points. Separate occurrences on different pages count separately.
Destination URLs are not retained, so these are not claimed as unique destinations.
Truncated captures contribute only actually retained qualifying links. Missing,
empty, malformed or unverifiable evidence remains neutral. The family cap applies
once after unioning eligible homepage and additional-page score effects, then the
shared score floor applies. Existing California GPC scoring is independent.

New materializations record overall policy v4. The owner-requested local report
is explicitly rematerialized; no bulk historical rewrite is performed. Existing
full-site scores recalculate through versioned cache invalidation. The added bounded
score-effect metadata is estimated below $0.10/month at 1,000 ten-page reports with
three months of retention; no new scans, model calls or infrastructure are added.

## Single-page and full-site scope

Single-page scores consume that page's canonical checklist and unified findings.
Full-site scores keep homepage consent, action, policy, transport and GPC
assessments, and combine eligible runtime evidence from assessed pages for
storage, tracking, replay, sensitive-surface tracking, fingerprinting, embeds
and any already-retained verified accessibility audits.
Identity-based rows union eligible identities; flat deductions apply once across
the site, never once per page. The same family caps and zero floor apply.

Additional pages must pass artifact hash, attempt, page and configuration
verification. Typed runtime observations pass through the shared evidence
adapters, normalized concerns, concern policy and checklist projection before
scoring. Missing, malformed, unverified or failed runtime evidence cannot create
a deduction. No additional-page consent or action evidence is synthesized.

Versioned persisted historical homepage reports are not bulk-rewritten. New
materializations use this policy. Full-site cache keys include the policy version
and source hashes, invalidating older calculated full-site scores. Deployment is
separate from editing this policy.

## Retained no-go report eligibility

`apps/web/lib/scans/scan-report-disposition.ts` consumes the existing shared
`projectExternalScanNoGo` projection. A retained typed `no_go` decision withholds
the target score, including when an older snapshot contains a numeric score.
Scoring callers must supply the scan's access context; neither an empty checklist
nor successful sign-in-page resources can restore eligibility. The report model
returns a separate no-go result, so public and authenticated reports show the
canonical blocker and next action without a benchmark, executive assessment,
substantive findings or regulatory checklist.

Persistence writes a null score. Previously stored payloads are verified against
their original size and hash before applying the same read-time eligibility;
their retained evidence and stored assessment are not rewritten. A typed
`continue_with_diagnostics` decision takes precedence over a lane-local visual
NO_GO or stale snapshot, preserving independently recovered partial reports.
HTTP hints, screenshots and absence of runtime activity do not create decisions
in the reporting layer. Scoring numbers and policy versions are unchanged.

`pnpm test:scan-no-go` covers scanner classification, canonical score eligibility,
historical payload integrity, and public/authenticated rendering using retained
assessment data from scan `0b9a3256-aa72-4378-acff-e205fd6cdc5e`. This gate runs in
fast/full preflight, PR validation and the AWS web deployment workflow. No new
scans, model calls, artifact reads, retries or infrastructure are introduced;
expected incremental recurring cost is $0/month.

## Verification and cost

Regression coverage lives in `scoring-policy.test.ts`,
`regulatory-coverage-score.test.ts`, `canonical-overall-score.test.ts` and
`full-site-score.test.ts`, covering approved numbers, removed deductions, caps,
zero floor, evidence gates and cross-page deduplication.

No new scans, browser lanes, model calls or artifact reads are introduced by this
policy revision. Additional deterministic processing of already-read artifacts is
estimated below $1/month at 1,000 three-page reports. The prior full-site artifact
read/write estimate remains documented in `full-site-resource-crawls.md`.

## Obsolete transfer guidance — October 3, 2026

Owner-approved `outdated_transfer_disclosure.v1` deducts three points once
sitewide, within the existing Policy transparency cap of 12. The scorecard
renders the central registry. The verified retained target-owned policy document
is interpreted during canonical materialization; a typed versioned assessment
retains its document hash, source URL, scan date, and bounded supporting passage.
Normalized concern -> concern policy -> checklist projection -> shared scoring
is the only scoring path. A badge or raw reference cannot cause a deduction.

The initial precision-first rules cover explicit English/German Privacy Shield
reliance or current ombudsman guidance after the registry's invalidation date.
Historical, superseded, explicitly corrected, uncertain, unsupported-language,
unbound, malformed, or legacy references stay neutral. This assesses obsolete
policy wording, never whether a particular transfer is unlawful. A missing-policy
deduction subsumes this smaller policy-quality deduction within the same cap.
Stored historical reports are not bulk rewritten; new materializations carry the
new policy versions. No new browser work, models, lanes or waits are introduced.
Bounded assessment metadata is estimated below $0.10/month at 100,000 scans.

Production verification also covers unrelated German risk negation: “nicht
ausgeschlossen” must not cancel current ombudsman guidance. Explicit negation
of reliance or certification remains neutral. Replaying the October 3 retained,
hash-verified cotp.group policy through the canonical projection yields 97.
The accompanying passive form fix retains styled native choices through a
visible browser-associated label in the same form, preserving hidden/inert/CMP
exclusions and existing field caps. It adds no interaction, wait, or model call;
incremental compute is estimated below $0.10/month at 100,000 scans.

## Accessibility — October 10, 2026 update

The owner approved six overall-score categories: text alternatives 3; accessible
names/labels/semantics 4; contrast 3; author-declared zoom restrictions 2; measured
pointer-target size/spacing 2; keyboard and reproduced focus together 6. The
shared accessibility cap is 12 across the report, once per category regardless
of repeated nodes, rules, packets or pages. Both privacy views use the same
overall score; framework-specific privacy scores remain unchanged.

Typed effects originate only from verified retained audit concerns and concern
policy, then pass through unified findings to central scoring. Unsupported,
manual-review, malformed, stale or unbound evidence is neutral. Scoring
eligibility is separate from executive prominence. Verified image/link overlap
charges the stronger category once; unresolved overlap with image-only-link
evidence is explicitly recorded and conservatively charged once. Independently
evidenced distinct barriers can contribute both categories within the cap.

The retained ASPCA replay gives 52 → 41 (11 accessibility points) without changing
its production record. Historical single-page scores are preserved; no backfill
is introduced. See `accessibility-scoring-proposal.md` for eligibility, overlap,
additional-page provenance and regression details. No scans, browser work, model
calls, waits or new artifact reads are added to the scan path. Incremental
metadata/processing is estimated below $0.50/month at 100,000 scans/month with
three months of retention; the one read-only replay retrieval is below $0.02.

### October 17, 2026: WCAG parity across review postures (local)

Owner-authorized `california-regulatory-posture.v11-wcag` includes the existing
verified accessibility category effects in the California posture. EU scoring
already consumes them; its amounts are unchanged. Both aggregators use
`accessibilityFindingDeductionBreakdown`, after canonical concern-policy and
unified finding projection. Audit-only prominence does not suppress an otherwise
verified score effect. Missing or failed audits remain neutral. Each category
charges once, with the existing image/link overlap policy, keyboard/focus shared
allowance and 12-point WCAG cap. WCAG evidence alone does not make an unavailable
California privacy assessment available. No scanner lane, capture, model call,
wait or recurring infrastructure cost is added. No deployment is authorized.

The five retained local reports were rebuilt through canonical publication:
Spotify CA 100→94 (EU 59), Healthline CA 100→97 (EU 53), Chase CA 100→98
(EU 66), Linear CA 88→76 (EU 88), Walmart CA 100→100 (EU 80). All EU values
are unchanged. Walmart's failed accessibility audit is not an accessibility pass.
Artifacts and before/after assertions: `artifacts/wcag-posture-review-2026-10-17`.

A bounded signed-out Spotify browser verification confirmed that the visible
“Log in here” link is overridden by `aria-label=", opens in a new tab"`. The
advertising expander's `aria-labelledby` resolves correctly and the DOM
accessibility snapshot exposes its name; the native AX omission alone is not a
confirmed unnamed-button failure. Escape restores focus to Your Privacy Choices.
Manual review evidence is retained separately, without injecting it into scanner
findings or adding a second semantic-category charge. No full scanner reruns
were required. Central contact export/persistence costs are estimated below
$0.05 in one-off AWS usage; recurring increase is $0/month.

## October 21, 2026 canonical Reject presence rule

New CertScore.ai materializations use 15/20/23/25/27/28/29/30 points for 1–8+ distinct canonical non-essential entities, capped at 30, when a completed,
authorized Reject path retains classified non-essential cookies and/or services.
Cookie persistence and service requests qualify without an identifier match or
semantic refusal confirmation. Use `after_reject_nonessential_presence.v1`,
GDPR/ePrivacy v22, overall v13 and full-site v12 through the canonical persisted
assessment, normalized concern, concern-policy and unified checklist flow.
Historical scores retain their original policy. See
[the canonical policy](certscore-v2/reject-nonessential-presence-policy.md).
