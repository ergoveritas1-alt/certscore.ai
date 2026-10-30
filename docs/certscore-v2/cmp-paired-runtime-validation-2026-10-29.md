# CertScore.ai paired CMP runtime validation

This is a bounded local comparison authorized by the owner's “go” after the
October 29 recommendation. No deployment, production scan, feature-flag change,
historical report rewrite or increased action window is authorized.

## Release decision and outcome

**Hold the reliability rollout. No significant overall confirmation improvement was demonstrated.**
The final candidate passes the local safety and regression checks, but the untouched
holdout loses one net verified decision and two completed observations. The small
sample does not establish a deterministic code regression or a population effect;
it does fail the proposed improvement/no-observation-loss gate. No deployment,
flag change or production improvement is claimed.

| Comparison | Reference | Candidate | Change |
| --- | ---: | ---: | ---: |
| Full retained operational confirmations / fixed completed clicks | 365 / 1,576 | 365 / 1,576 | 0.00 pp |
| Diagnostic continuation confirmations / contacts | 5 / 28 | 5 / 28 | 0.00 pp |
| Diagnostic continuation completed observations | 16 | 15 | −1 |
| Untouched holdout confirmations / contacts | 3 / 15 | 2 / 14 | −5.71 pp |
| Untouched holdout confirmations / fixed planned slots | 3 / 16 | 2 / 16 | −6.25 pp |
| Untouched holdout confirmations / completed clicks | 3 / 7 | 2 / 5 | −2.86 pp |
| Untouched holdout completed observations | 7 | 5 | −2 |

The diagnostic conditional rate rose from 31.25% to 33.33% only because its
completed-click denominator fell. That is not improvement. The 14 fully contacted matched action pairs separately show 3/14 → 2/14
(−7.14 pp); the unpaired HTTP 520 contact remains in the raw-contact accounting.
Different diagnostic and holdout candidate builds are never pooled into one percentage-point claim.
The original two interrupted/instrumentation-failed contacts remain separate.

All **96 planned campaign slots** reconcile to **87 actual contacts and nine
uncontacted slots**: two initial contacts, 56 continuation contacts and 29 holdout
contacts. Six slots on the initial two domains were not retried. National Gallery
returned HTTP 520 during the reference Accept visit; its three remaining slots
were skipped by the existing no-go gate. This is an access failure, not proof of
a CMP defect. No reserve, replacement, cooldown waiver or extra visit was used.

The holdout contains one paired gain (Udacity Accept), two losses (OrangeLogic
Accept and FIDO Alliance Accept), one shared confirmation (FIDO Alliance Reject),
ten pairs with neither confirmed and two incomplete National Gallery pairs.
Thus one site has an observed paired gain, two have losses; no production site
improvement is established. All 29 holdout packets agree between their native
canonical projection and the independently run current verifier.

## Fixed question and scope

Does the cumulative current local CMP runtime improve verified decisions over
the exact candidate used in the October 28 live benchmark, without losing
completed observations or relaxing confirmation proof?

The reference is the frozen October 28 candidate overlay with source/build
fingerprint `f0b18ee9779295d51bde1952967a7afaa6eef83d7bc8b302b37c869f4463a520`,
original Git base `6d5a147e51decd6451f6278d4328ae5275a9dd8b`. The initial current
candidate is the validated October 29 runtime based on
`b84ecbbd0cfff8d48a0271ca23eba21c77d2b542`, including its local shared confirmation
changes. Fresh source and compiled-file inventories identify both arms. This
measures cumulative unreleased changes, not the isolated effect of the October
29 API safety correction. The earlier 1,576-action retained comparison remains
unchanged and separate.

Both arms use Node 22.22.1, Playwright 1.58.2 and the same pinned Chromium 1208
headless-shell executable on the same Mac. Locale, timezone and crawler HTTP
identity match. Every action uses a fresh isolated browser context; arm order is
counterbalanced and domains run serially, with at most two domains active.
The original 20-second result, 14-second search, two-second confirmation and
three/eight-second Accept/Reject observation limits remain unchanged. Local
locale/timezone settings do not establish production-region equivalence.

## Selection and measurement

The fixed 24-site cohort contains eight OneTrust, five historically unverified
CMP identity, three HubSpot, two Osano, and two each Cookiebot, CookieYes and
Termly sites. Six predeclared reserves remain unused. Sixteen sites form the
diagnostic phase; eight sites were reserved before any new contact for validation
after offline repairs. The original cap is 96 action-lane contacts. All 30 pool
domains passed fresh central history and the canonical selector. No cooldown
waiver, contact hold override or no-go re-enablement was used.

Historical provider labels determine fixed strata, not current CMP attribution.
The seven selected strata represent 1,330 of the 1,576 historical completed
actions (84.39%); unrepresented providers receive no estimated rate. Report
verified decisions per completed click and per contacted action together with
observation completion, initial registration, terminal verification, notification
acknowledgment, unconfirmed and unresolved outcomes. Keep incomplete pairs and
uncontacted planned slots visible. Native and common canonical verification are
retained separately; disagreement cannot manufacture a confirmation.

A ten-percentage-point gain is a proposed diagnostic target, not a forecast or
population claim. A small selected sample cannot establish internet-wide or
production improvement. Results from different candidate builds must remain
separate, particularly if diagnostic evidence leads to an offline repair before
the held-out phase.

## Initial instrumentation stop

The first diagnostic attempt made two candidate contacts and stopped before any
reference contact. The new visitor compared an in-memory packet containing
optional `undefined` properties against its serialized JSON; JSON correctly
omitted those properties. This triggered a false integrity alarm after the
Coca-Cola observer returned. That packet separately verifies offline as
`not_attempted / deterministic_accept_control_not_found`; it establishes no
consent decision. The concurrent Northwestern Mutual visit was interrupted by
the global stop and retained no terminal packet. Neither is a proven website
restriction or CMP regression.

Both attempts, the original halt, all claims and source hashes remain retained.
The two contacts were recorded centrally and in metadata-only local commit
`7830a5d64`; neither domain will be retried. The corrected harness compares the
JSON-normalized in-memory value while preserving byte hashes, canonical schema,
session, target and projection checks. Positive omission and negative changed-
value tests cover the correction.

A separately sealed continuation is limited to the 14 wholly uncontacted
diagnostic sites and their original 56 slots. It shares the original durable
claim ledger and 96-contact cap, pins the predecessor plan/summary/ledger/halt
and review, and cannot replace a claimed slot or reset the original halt.
The untouched eight-site validation phase retains its original 32 slots.
The maximum remaining campaign total is therefore 90 actual contacts, including
the two consumed attempts. The initial failed run is not erased or reported as
a completed comparison.

## Validation and cost boundary

The initial harness passed 20 Python, two Node and 14 analysis tests before
contact. The corrected continuation passed 23 Python and four Node tests, plus
independent review. The campaign-analysis tests preserve prior attempts and
check that only authorized unclaimed slots can acquire a later result. Runtime
source snapshots and browser identity remain frozen independently of harness
changes.

The checks use local compute and no paid model/API or deployed scanner. Canonical
AWS contact-history export and persistence are estimated below $0.10 once for
the campaign; recurring infrastructure increment is $0. No production cost,
worker capacity, scan budget or retention policy is increased.

Run evidence is retained under
`artifacts/cmp-live-followup-2026-10-29/`, including the immutable selection,
campaign/phase plans, original and corrected harness copies, source/build
inventories, eligibility proof, test logs, every contact outcome and ledger
receipts. The final results below retain every planned slot, including interrupted and
uncontacted slots.

## Evidence-backed implementation

The earlier shared batch introduced one API confirmation gate for both action
observers, preserved precise reader diagnostics, and added source-verified stage
and failure reporting. The starting runtime already contained OneTrust source
pins, effective-category and readiness changes. They are not counted again as
new October 29 implementation. The earlier full assessment is
[retained here](/Users/benmasek/WC01/docs/certscore-v2/cmp-action-confirmation-reliability-2026-10-29.md).

The diagnostic phase isolated one additional shared control defect: “Reject All
Not Essential Cookies” was incorrectly rejected as a negated choice. The fix adds
that exact English category phrase to the existing category masking mechanism
and advances the classifier registry to v23. It changes two production lines.
True negation, conflicting accessible labels, notification-only controls, missing
receipts and unchanged receipts retain their safeguards. Twelve real observer
loopback cases and 84 focused contract tests verify this behavior; among 22
retained diagnostic labels, only this intended phrase changes classification.

This is a verified local **control-resolution** improvement. Billtrust was not
revisited, and its separate unreviewed-SDK blocker remains. It is not a demonstrated
live consent-confirmation gain. The Udacity gain does not exercise the new category phrase.
The harness JSON-serialization repair and failure-reason ordering correction
improve measurement/attribution only. Neither manufactures a consent receipt.

### Representative paired evidence

- **Udacity Accept:** both arms completed the click and observation. The reference
  retained `group_universe_incomplete`. The candidate retained a reviewed
  `202608.1.0` OneTrust SDK source (604,329 bytes; SHA-256
  `3d2f7f7ae2fdfbf24acada1eaeaa636b84db784d2587115af8c7288565c65208`),
  document-bound effective-category inputs and a fresh `OptanonConsent` granted
  witness after dispatch. This supports the single observed cumulative-runtime
  gain; it does not isolate the new label fix or prove a production gain.
  Both frozen runtimes already pin this exact SDK and derive the same effective
  groups from the candidate’s retained inputs. The mechanism causing the paired
  difference therefore remains unproven.
- **OrangeLogic Accept:** the reference resolved and confirmed the HubSpot control.
  The candidate exhausted its control search without finding an actionable control.
  Retained evidence does not identify whether runtime, page timing or another
  session difference caused the loss.
- **FIDO Alliance Accept:** the reference confirmed a fresh CookieYes receipt.
  The candidate aborted during control resolution at its result deadline, before
  a click. This is a failed observation/confirmation opportunity, not evidence
  that a completed consent decision was rejected by the verifier.

Udacity: [reference original packet](/Users/benmasek/WC01/artifacts/cmp-live-followup-2026-10-29/holdout/visits/06-udacity.com-accept-reference/PostAcceptEvidencePacket.json), [candidate original packet](/Users/benmasek/WC01/artifacts/cmp-live-followup-2026-10-29/holdout/visits/06-udacity.com-accept-candidate/PostAcceptEvidencePacket.json).

OrangeLogic: [reference original packet](/Users/benmasek/WC01/artifacts/cmp-live-followup-2026-10-29/holdout/visits/15-orangelogic.com-accept-reference/PostAcceptEvidencePacket.json), [candidate original packet](/Users/benmasek/WC01/artifacts/cmp-live-followup-2026-10-29/holdout/visits/15-orangelogic.com-accept-candidate/PostAcceptEvidencePacket.json).

FIDO Alliance: [reference original packet](/Users/benmasek/WC01/artifacts/cmp-live-followup-2026-10-29/holdout/visits/21-fidoalliance.org-accept-reference/PostAcceptEvidencePacket.json), [candidate original packet](/Users/benmasek/WC01/artifacts/cmp-live-followup-2026-10-29/holdout/visits/21-fidoalliance.org-accept-candidate/PostAcceptEvidencePacket.json).

## Provider results

Historical provider labels define fixed strata; they do not prove the currently
observed action control's identity. “CMP identity unverified” never means that no
CMP exists. C/U/R below means verified consent / completed but unconfirmed click /
contacted without a completed action. Uncontacted planned slots are separate.
No completed holdout click has unresolved verification; all three candidate
unconfirmed clicks remain explicitly unconfirmed.

### Untouched holdout

| Fixed provider stratum | Planned per arm | Contacts before → after | C/U/R before → after | Uncontacted before → after | Confirmed/contact change | Sites with gain / loss |
| --- | ---: | ---: | --- | ---: | ---: | ---: |
| CMP identity unverified | 4 | 4 → 4 | 0/2/2 → 0/2/2 | 0 → 0 | 0.00 pp | 0 / 0 |
| OneTrust | 4 | 4 → 4 | 0/1/3 → 1/0/3 | 0 → 0 | 25.00 pp | 1 / 0 |
| Cookiebot | 2 | 1 → 0 | 0/0/1 → 0/0/0 | 1 → 2 | unavailable pp | 0 / 0 |
| HubSpot Consent Banner | 2 | 2 → 2 | 1/1/0 → 0/1/1 | 0 → 0 | -50.00 pp | 0 / 1 |
| CookieYes | 2 | 2 → 2 | 2/0/0 → 1/0/1 | 0 → 0 | -50.00 pp | 0 / 1 |
| Osano | 2 | 2 → 2 | 0/0/2 → 0/0/2 | 0 → 0 | 0.00 pp | 0 / 0 |
| **Overall** | **16** | **15 → 14** | **3/4/8 → 2/3/9** | **1 → 2** | **−5.71 pp** | **1 / 2** |

Initial registrations are 3 → 2; there are zero additional verified terminal
states or verified notification acknowledgments. Unknown notification evidence
is not evidence of absence. Observation/contact falls 46.67% → 35.71% (−10.95 pp).
Cookiebot has no candidate contact after the safety stop, so a provider rate and
historically weighted overall rate are unavailable. Termly was deliberately only
in the diagnostic cohort; this holdout gap was not filled after seeing results.
TrustArc and Sourcepoint were not in this bounded live cohort.

### Diagnostic continuation, earlier frozen candidate

| Provider stratum | Contacts per arm | C/U/R before → after | Completed observations before → after | Confirmed/contact change |
| --- | ---: | --- | ---: | ---: |
| CMP identity unverified | 6 | 0/4/2 → 0/4/2 | 4 → 4 | 0.00 pp |
| OneTrust | 8 | 0/5/3 → 0/5/3 | 5 → 5 | 0.00 pp |
| Cookiebot | 2 | 1/0/1 → 1/0/1 | 1 → 1 | 0.00 pp |
| HubSpot Consent Banner | 4 | 2/1/1 → 2/0/2 | 3 → 2 | 0.00 pp |
| CookieYes | 2 | 2/0/0 → 2/0/0 | 2 → 2 | 0.00 pp |
| Osano | 2 | 0/0/2 → 0/0/2 | 0 → 0 | 0.00 pp |
| Termly | 4 | 0/1/3 → 0/1/3 | 1 → 1 | 0.00 pp |
| **Overall** | **28** | **5/11/12 → 5/10/13** | **16 → 15** | **0.00 pp** |

This phase has zero newly confirmed sites. The initial two harness-affected
contacts and six uncontacted slots remain in the full campaign accounting;
they are not silently removed from the original diagnostic plan.

### Full retained cohort, final classifier v23

The retained-replay baseline is clean Git revision
`b84ecbbd0cfff8d48a0271ca23eba21c77d2b542`, distinct from the October 28
`f0b18ee…` overlay used as the live reference.
All 2,800 packet identities and all 1,576 completed-action joins verify. The
original initial-registration table remains **356/1,218/2** (confirmed /
unconfirmed / aborted). The operational table includes nine already-retained
terminal decisions and remains **365/1,209/2**, both before and after. Those nine
are not new improvements. Here R denotes aborted/unresolved completed-click rows.

| Provider | Fixed completed clicks | Operational C/U/R before = after | Confirmed rate before = after | Change | Newly confirmed sites |
| --- | ---: | --- | ---: | ---: | ---: |
| CMP identity unverified | 510 | 21/488/1 | 4.12% | 0.00 pp | 0 |
| OneTrust | 449 | 86/362/1 | 19.15% | 0.00 pp | 0 |
| Cookiebot | 129 | 122/7/0 | 94.57% | 0.00 pp | 0 |
| HubSpot Consent Banner | 87 | 7/80/0 | 8.05% | 0.00 pp | 0 |
| CookieYes | 71 | 62/9/0 | 87.32% | 0.00 pp | 0 |
| Osano | 51 | 0/51/0 | 0.00% | 0.00 pp | 0 |
| TrustArc | 42 | 1/41/0 | 2.38% | 0.00 pp | 0 |
| Termly | 33 | 25/8/0 | 75.76% | 0.00 pp | 0 |
| Consentmanager | 31 | 9/22/0 | 29.03% | 0.00 pp | 0 |
| Sourcepoint | 24 | 0/24/0 | 0.00% | 0.00 pp | 0 |
| Iubenda | 23 | 6/17/0 | 26.09% | 0.00 pp | 0 |
| Usercentrics | 21 | 0/21/0 | 0.00% | 0.00 pp | 0 |
| Cookie Information | 20 | 0/20/0 | 0.00% | 0.00 pp | 0 |
| DSGVO All in One / tarteaucitron | 15 | 0/15/0 | 0.00% | 0.00 pp | 0 |
| CookieScript | 10 | 0/10/0 | 0.00% | 0.00 pp | 0 |
| Didomi | 8 | 5/3/0 | 62.50% | 0.00 pp | 0 |
| Google Funding Choices | 8 | 3/5/0 | 37.50% | 0.00 pp | 0 |
| Drupal EU Cookie Compliance module, non-TCF | 7 | 1/6/0 | 14.29% | 0.00 pp | 0 |
| Condé Nast Privacy Runtime | 6 | 6/0/0 | 100.00% | 0.00 pp | 0 |
| VWO consent state | 6 | 2/4/0 | 33.33% | 0.00 pp | 0 |
| InMobi Choice CMP | 5 | 3/2/0 | 60.00% | 0.00 pp | 0 |
| Orejime | 4 | 0/4/0 | 0.00% | 0.00 pp | 0 |
| Transcend | 4 | 3/1/0 | 75.00% | 0.00 pp | 0 |
| Borlabs Cookie | 3 | 3/0/0 | 100.00% | 0.00 pp | 0 |
| DataGrail | 3 | 0/3/0 | 0.00% | 0.00 pp | 0 |
| Ketch | 3 | 0/3/0 | 0.00% | 0.00 pp | 0 |
| Fides | 2 | 0/2/0 | 0.00% | 0.00 pp | 0 |
| Axeptio | 1 | 0/1/0 | 0.00% | 0.00 pp | 0 |
| **Overall** | **1,576** | **365/1,209/2** | **23.16%** | **0.00 pp** | **0** |

OneTrust's historical 449 initial actions reconcile as **85 confirmed + 363
unconfirmed + one aborted**. The remaining action is colocrossing.com Accept,
scan `4242dd6a-70ef-4ffb-ae8e-22580b82ad7e`, whose observation was truncated.
Its one preexisting terminal-only confirmation is on another row, producing the
operational 86/362/1 above. No eligibility correction or denominator change was made.

Full replay: [retained-after-label/operational-comparison.json](/Users/benmasek/WC01/artifacts/cmp-live-followup-2026-10-29/retained-after-label/operational-comparison.json); historical preservation: [retained-after-label/historical-preservation.json](/Users/benmasek/WC01/artifacts/cmp-live-followup-2026-10-29/retained-after-label/historical-preservation.json).

## Ranked blockers and addressable coverage

The diagnostic candidate has 23 unresolved actions on 12 sites. Its exclusive
primary groups are 13 control-resolution actions on eight sites, five source/
session/target-binding actions on three sites, four insufficient-evidence actions
on three sites and one unsupported-receipt action on one site. Site counts overlap.
The full table preserves secondary reasons, packet hashes and representative slots.
Exposure is an investigation ceiling, not a forecast of recoveries. Retained-only
confirmation recovery remains zero for this evidence.

| Provider | Earliest supported blocker | Actions | Sites | Representative slot | Future investigation ceiling |
| --- | --- | ---: | ---: | --- | ---: |
| OneTrust | source session target binding | 5 | 3 | `02-iapp.org-accept-candidate` | 5 |
| CMP identity unverified | insufficient or unavailable evidence | 3 | 2 | `08-hachettebookgroup.com-accept-candidate` | 3 |
| OneTrust | control resolution or stale document | 3 | 2 | `03-billtrust.com-reject-candidate` | 3 |
| Termly | control resolution or stale document | 3 | 2 | `22-lincoln.ac.uk-reject-candidate` | 3 |
| CMP identity unverified | control resolution or stale document | 2 | 1 | `09-sygic.com-accept-candidate` | 2 |
| HubSpot Consent Banner | control resolution or stale document | 2 | 1 | `13-iion.io-accept-candidate` | 2 |
| Osano | control resolution or stale document | 2 | 1 | `16-e2open.com-accept-candidate` | 2 |
| CMP identity unverified | receipt missing or unsupported | 1 | 1 | `10-roboflow.com-accept-candidate` | 1 |
| Cookiebot | control resolution or stale document | 1 | 1 | `18-worldathletics.org-accept-candidate` | 1 |
| Termly | insufficient or unavailable evidence | 1 | 1 | `22-lincoln.ac.uk-accept-candidate` | 1 |

[Complete diagnostic evidence and secondary reasons](/Users/benmasek/WC01/artifacts/cmp-live-followup-2026-10-29/diagnostic-provider-blockers-v2.json). The original historical full provider-by-reason table is preserved in the earlier assessment; 1,088 historical rows have schema limitations that cannot be repaired by inventing missing receipts.

### Holdout blockers, final frozen candidate

All 32 holdout slots are classified, including the three uncontacted slots.
The candidate’s 16 slots contain two confirmations, eight control-resolution
blockers, one capture-deadline blocker, two insufficient-evidence outcomes,
one unsupported receipt and two uncontacted slots. Earlier and contributing
reasons remain attached; capture-level annotations preserve the packet classifier
alongside the HTTP/deadline evidence. No canonical decision changes.

| Provider stratum | Primary blocker | Actions | Sites | Representative slot | Future investigation ceiling |
| --- | --- | ---: | ---: | --- | ---: |
| OneTrust | control resolution or stale document | 3 | 2 | `06-udacity.com-reject-candidate` | 3 |
| CMP identity unverified | control resolution or stale document | 2 | 2 | `11-wma.net-accept-candidate` | 2 |
| Cookiebot | not contacted | 2 | 1 | `19-nationalgallery.org.uk-accept-candidate` | 0 |
| Osano | control resolution or stale document | 2 | 1 | `17-computer.org-accept-candidate` | 2 |
| CMP identity unverified | insufficient or unavailable evidence | 1 | 1 | `11-wma.net-reject-candidate` | 1 |
| CMP identity unverified | receipt missing or unsupported | 1 | 1 | `12-tu-darmstadt.de-accept-candidate` | 1 |
| CookieYes | capture or sdk readiness | 1 | 1 | `21-fidoalliance.org-accept-candidate` | 1 |
| HubSpot Consent Banner | control resolution or stale document | 1 | 1 | `15-orangelogic.com-accept-candidate` | 1 |
| HubSpot Consent Banner | insufficient or unavailable evidence | 1 | 1 | `15-orangelogic.com-reject-candidate` | 1 |

[Every holdout row and its original evidence](/Users/benmasek/WC01/artifacts/cmp-live-followup-2026-10-29/holdout-analysis/failure-classification.json). These counts are exposure ceilings, not promised confirmations; uncontacted slots are not permission to revisit.

## Next highest-return work and stopping rules

1. **Resolve the shared control/readiness losses before rollout.** Preserve the
   OrangeLogic and FIDO Alliance counterexamples and reproduce the missing-control
   and stalled-resolution paths in offline fixtures under the existing absolute
   deadline. Their retained evidence establishes the lost opportunities, not one
   proven cause. Only source/session-bound timing evidence can justify a specific
   runtime repair; do not increase timeouts or bypass semantic guards to improve
   the rate. The Billtrust category phrase is already fixed locally.
2. **Improve exact OneTrust source/document binding.** Five completed but
   unconfirmed diagnostic actions across IAPP, Billtrust and Brandwatch expose
   this group. Start with offline same-document versus full-navigation fixtures.
   Preserve a source receipt only with a positive independent document/loader
   witness; unchanged URL alone is insufficient. IAPP's retained
   `sdk_document_changed` does not prove an erroneous invalidation. Brandwatch's
   `202401.1.0` SDK needs exact bytes and review; Billtrust first needs an exact
   captured SDK identity. Existing URL/hash-only artifacts cannot supply them.
3. **Extend receipt coverage only where action binding and a complete protocol
   are demonstrated.** Roboflow's generic ancestor selector and hashed Finsweet
   cookie do not justify a named adapter or a decoded decision. Missing saved
   events, wrong sessions, conflicting state, notifications and inapplicable
   categories remain nonconfirming.

Further historical replay has diminishing returns now that every completed row
has its available original packet and all applicable proofs were rechecked.
Repeated public visits without a discriminating capture hypothesis would also
have low value. A future diagnostic should stop once it obtains one decisive
source/document/readiness witness, hits its existing bound, or encounters a no-go;
no retry to chase a positive result. Any new visits require a fresh authorized
cohort and eligibility check. Existing Gimbal/ReadCube holds remain in force.
Do not expand capture, recurring costs or production budgets on these results.

## Validation, revisions and release evidence

- Canonical consent gate: **741/741 passed**, including Cookiebot, CookieYes,
  Termly, historical schemas, missing/conflicting receipts, notification-only
  controls, inapplicable categories and wrong-document/session evidence.
- Full contracts: **848/848 passed**; contracts and scan-core TypeScript passed.
  The first contracts run's sole failure was sandbox IPC permission for a child
  test process; the permitted rerun passed, and both logs are preserved.
- Canonical scoring/projection: **40/40 passed**; focused analysis: **54/54 passed**
  and strict TypeScript checks passed. Test sets overlap and are not summed.
- Corrected harness: **23 Python + four Node tests passed**. Exact source/build
  inventories and preflight passed for both arms. No code changed after the
  holdout candidate was frozen. All 29 holdout native/common projections agree.
- Historical source/exports and prior reports remain hash-identical. Full retained
  replay and canonical scoring have no effect changes. Local `git diff --check`
  passed and is retained in the final seal.

| Revision identity | Value |
| --- | --- |
| Live reference original Git base | `6d5a147e51decd6451f6278d4328ae5275a9dd8b` |
| Live reference original source/build manifest | `f0b18ee9779295d51bde1952967a7afaa6eef83d7bc8b302b37c869f4463a520` |
| Diagnostic candidate source | `00450c2aa823ea1dd24d94fd207ebbe07df53c738b5428122aba9c67d6554b62` |
| Diagnostic candidate build | `03c7138ad31246f8b67e189c2e6e036485a25b3f4dd24b6661aeb0daab4106c7` |
| Final candidate source | `07acf7d02b40ca3f467e6ad518a36cc588deeda91d451ac0391e38901f5e8c90` |
| Final candidate build | `614c8aad555286221c713619a26812cf47b869e9b9501fe9dbde594a3891d368` |
| Full retained audit source scope | `475439a51ce7af9dba6c755b006a731910a8af2f73ecf5cb26f2d10a9d387772` |
| Frozen holdout plan | `24ae43d11dccf1aedb4277bfd4457a869dd4e7edbde1837d6f1fb022bdea8f42` |
| Contact metadata local commits | `7830a5d64`, `4f3a9c18c`, `ddaebdf6d` |

The final snapshot is the recorded local source overlay; these metadata-only
commits do not claim to contain the runtime changes. The earlier implementation
base remains `b84ecbbd0cfff8d48a0271ca23eba21c77d2b542`. Different inventory scopes
have different fingerprints and are labeled explicitly.

The category phrase adds no browser work, waits or network calls; its estimated
future CPU increment is below **$0.01/month at 100,000 scans**. Contact-ledger AWS
work is estimated below **$0.10 one-time**; local validation adds no recurring AWS
cost. No paid model/API, larger worker, deployment or production scan was used.

Detailed results: [holdout](/Users/benmasek/WC01/artifacts/cmp-live-followup-2026-10-29/holdout-analysis/comparison.json), [all 96 campaign slots](/Users/benmasek/WC01/artifacts/cmp-live-followup-2026-10-29/campaign-analysis-final/campaign-comparison.json), [label fixtures](/Users/benmasek/WC01/artifacts/cmp-live-followup-2026-10-29/validation/category-qualifier-validation.json), [contracts/scoring](/Users/benmasek/WC01/artifacts/cmp-live-followup-2026-10-29/validation/final-contracts-and-scoring-validation.json).

All **87 contacts** are persisted in the canonical central contact ledger and the
reviewed local manual ledger. National Gallery’s no-go is retained; the other
new contacted domains retain their cooldowns. The three metadata-only commits
were local; nothing was pushed or deployed.

Independent follow-up: [paired evidence and next-fix review](/Users/benmasek/WC01/artifacts/cmp-live-followup-2026-10-29/holdout-next-fix-review.json). Final-verifier replay produced zero diagnostic metric/stage drift; see [drift check](/Users/benmasek/WC01/artifacts/cmp-live-followup-2026-10-29/campaign-analysis-final/diagnostic-measurement-drift.json).
