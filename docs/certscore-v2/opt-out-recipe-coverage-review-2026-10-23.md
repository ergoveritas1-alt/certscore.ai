# CertScore.ai retained opt-out recipe coverage review

October 23, 2026. Investigation only, for the ten routes authorized in
[the exact-route policy](opt-out-exact-route-policy-2026-10-23.md). Salomon is
excluded. No deployment, flag changes, live scans, external fetches, runtime
changes or historical rewrites were performed.

## Result and evidence limits

**None of the ten routes currently has a complete new action recipe justified
by the retained evidence.** This is an evidence and action-scope limitation,
not a recommendation to increase worker memory or scan budgets.

All ten historical sale/sharing workers stopped in navigation: eight binding
mismatches and two timeouts (FC-Moto and IFTTT). Every packet has zero actions,
no provider, no recipe, no document token and registration `not_attempted`.
They predate the locally implemented redirect repairs. They therefore cannot
measure the repaired observer's recipe coverage or establish a recipe failure.

The independent passive sessions are useful for triage. Three sites retained
OneTrust recognition; Jaguar also retained TrustArc recognition. Seven had no
recognized CMP. None of the ten preference workers opened a panel or retained
preference controls. All ten independent GPC observations had unavailable
semantic readback and unknown sale/sharing state. This is **not proof that GPP
is absent**, nor a replacement for a before/after read in the action session.

Reverified all ten original bundle SHA-256 hashes and byte sizes against their
local retrieval receipts, and all ten embedded action packet hashes and sizes
against their retained wrappers. The reproducible offline audit, per-site source
paths, JSON pointers, selected observations and code hashes are in
`artifacts/opt-out-recipe-coverage-2026-10-23/{audit.cjs,analysis.json,verification.json}`.
Run `node artifacts/opt-out-recipe-coverage-2026-10-23/audit.cjs` from this checkout.
Other lane observations remain evidence from their own sessions in these verified
bundles; this audit does not independently reconstruct missing lane artifacts.

## The current recipe boundary

The only sale/sharing entry in `packages/shared/src/known-cmps.ts` is
`onetrust.explicit_sale_share.v2`. Its entrance is a uniquely verified native
`button.ot-sdk-show-settings` with an explicit privacy-choice/Do Not Sell label.
Its submission is a uniquely verified native OneTrust save/close button whose
label explicitly says Do Not Sell or Share (or the supported Do Not Sell variant).
Generic Cookie Settings, Manage Settings, Save and cookie Reject are not covered.

The observer also requires the exact authorized document, a visible bound dialog
without forms or non-hidden inputs, no intervening navigation, and supported
same-session GPP section 7/8 sale **and** sharing bits. It checks the baseline,
the post-click opt-out state and the terminal state after the observation window.
An already opted-out baseline does not justify another submission. It does not
act on opaque accessibility-tree selectors, arbitrary frames, hidden controls,
policy text or guessed URLs. Provider recognition alone is insufficient.

Any routine selector/label correction that preserves this explicit action
contract could fit the existing scope once supported by evidence. **No such
complete correction is established for these ten sites.**

## Route findings and permissible next work

| Original route → approved destination | Retained evidence and actual gap | Work within the current scope and budgets | Additional authorization before broader action support |
| --- | --- | --- | --- |
| ReadCube → `about.readcube.com` | OneTrust; visible Cookie Settings (`#onetrust-pc-btn-handler`), Necessary Only and Accept All. Preference worker: `preference_readiness_incomplete`. No verified explicit sale/sharing submit or semantic transition. | Offline fixture for the known Options control; audit readiness and existing passive checkpoints. Keep it classified as Options. | A route/provider-specific Cookie Settings entrance in the action lane. A deeper submission/toggle/state recipe still needs evidence; opening permission alone would not authorize it. |
| Gimbal → `infillion.com` | OneTrust; Cookie Settings and optional-cookie Accept/Reject. Preference worker: `preference_parent_binding_unavailable`. The policy candidate's CMP source is `#ot-sdk-btn`, but its selector is a navigation ancestor and `clickable:false`. Footer text is not a verified explicit button. | Audit and repair provenance/control binding using existing DOM reads; retain exact control identity or unknown. Do not turn the ancestor or cookie-settings label into a sale/sharing button. | Same narrowly scoped Options entrance as ReadCube, followed by evidence-backed authorization for any new submission/state mechanism. |
| Jaguar → exact US homepage/query | OneTrust plus TrustArc recognition; Manage Settings/Accept All. An actual Do Not Sell or Share link leads to `/en-us/jdx/contact-us/contact-us.html`, fetched as “Contact Us Form.” Separate privacy-page text mentions a sale opt-out toggle. Preference capture timed out. | Preserve the observed link and distinguish it from an actionable homepage control. Diagnose the timeout without extra wait. Recognition of two vendors does not itself establish two active recipes. | Exact additional action-page/navigation authority for the contact URL, if pursued. The alternative homepage Options path requires explicit permission. Toggle, generic Save, forms or a new state adapter require separate defined scope; none follows from the route grant. |
| Volkswagen UK → `/en.html` | Visible `#ensAcceptAll`, `#ensRejectAll`, `#ensOpenModal` (Manage Cookies); hidden `#tcf2__ensSave` (Save Consent Preferences). No recognized CMP or sale/sharing decision proof. The `ens` prefix and tag-manager script are not sufficient CMP identity proof. | Add offline provider/control fixtures; review exact identity and passive recognition without adding browser calls. Keep cookie Reject distinct from sale/sharing. | Source-reviewed provider/action/state recipe; explicit Options and any generic Save/toggle scope. Following the separate cookies page with `?open-dialog=true` also requires an exact new target grant. |
| FC-Moto → `/en-us/` | Cookie UI says “Powered by Tracking Garden”; Settings and Accept All retained as `ax:` controls, with incomplete frame inventory. No recognized CMP, stable actionable DOM recipe or sale/sharing semantics. | Retain observed branding as a recognition lead; fixture the AX-only/incomplete-frame limitation. Do not invent a DOM selector or infer that the control is in a particular frame. | Reviewed provider recipe, exact control/document binding and semantic proof; Options scope. Frame/shadow interaction would need explicit scope if subsequently shown necessary. |
| Viadeo → `viadeo.journaldunet.com` | French content, no retained CMP or first-layer controls; privacy-choice inspection has an unnamed hidden control and four uninspected hidden frames. | Preserve incomplete choice coverage; use existing observations for diagnostics. No grounded recipe to add. | A new action recipe only after actual controls and state evidence exist. Additional frame inspection/action, visits or waits are not covered by this redirect grant. |
| IFTTT → `ifttt.com` | Normal page, no retained CMP/control recipe; privacy-choice inspection has 34 unnamed controls. | Diagnose unnamed-control coverage using retained roles/labels and existing reads. Absence of labels does not prove no opt-out. | Further evidence before specifying a recipe. No permission to guess labels, click anonymous controls or add capture time. |
| Livro de Reclamações → `/Inicio/` | Portuguese complaints portal; no retained CMP/choice controls. Choice inspection reports unsupported language and non-representative document. The text alone does not establish an error page. | Audit locale/representativeness handling and canonical classification from existing evidence. Keep unsupported coverage unknown; complaint/login controls are not privacy choices. | Any new action path needs its own verified scope. Do not authorize portal/login/form interactions as a recipe fix. |
| Hollister → `/shop/us` | HTTP 200 but both retained DOM samples show “Oops, something went wrong.” No usable CMP controls; geometry unavailable. | Diagnose an unusable application page rather than a missing recipe. Preserve limited coverage. | Any recovery requiring new attempts, visits, worker/browser changes or broader navigation requires separate review. No evidence supports a recipe or such a recovery yet. |
| Cognition Digital → `www.cognitionads.com` | Retained page text is only “Visit Arpeggio”; choice inspection is non-representative, with no CMP or controls. | Preserve the landing-page limitation; no recipe to implement from this text. | Following that call to action would be new navigation beyond the grant. Resolve and review its exact destination from evidence before proposing authorization; do not infer it from the brand name. |

Jaguar's retained contact-page text does not establish a complete form workflow,
required identity verification or a broken opt-out. Its privacy-page toggle text
is not a visible, bound homepage toggle. Likewise, generic/hidden preference
content in other bundles does not establish an open panel. Guessed
`/privacy/choices` and `/privacy-rights` candidates are excluded from action
evidence, including failed/404 candidates labeled “Your privacy choices.”

## Bounded implementation plan

1. **Diagnostics and fixtures first, without broader action authorization.** Use
   the ten verified bundles to distinguish navigation-not-reached, unknown
   provider, known Options-only UI, incomplete control binding, unavailable
   semantics and unusable/limited page coverage. These are operational review
   categories, not findings or failures of the websites' privacy mechanisms.
   Preserve source/session/document pointers; never backfill action evidence
   from passive lanes. The offline audit above supplies the baseline.
2. **Prioritize ReadCube and Gimbal passive evidence repairs.** Trace the first
   broken readiness/parent-binding/control-locator stage. Reuse existing passive
   checkpoints and reads; do not extend them or open panels. A fix is successful
   when it retains correctly bound facts or a truthful limitation, not when it
   manufactures recipe availability. Add focused local fixtures for the wrong
   ancestor, generic Options labels, late readiness and mismatched sessions.
3. **Review Volkswagen and FC-Moto recognition separately.** Exact retained
   branding/DOM/script facts can support a source-reviewed recognition update;
   they cannot establish sale/sharing behavior. Use the canonical registries and
   classifier. No vendor-wide inference, bespoke label regex, network lookup
   during scans or new semantic polling. Provider documentation/source review
   can be done offline where sources exist; no site probing was done here.
4. **Only after explicit scope approval and adequate evidence, propose an
   action recipe.** ReadCube/Gimbal are the first investigation candidates, not
   promised recoveries. Require exact entrance, dialog, submit, state semantics,
   bounded completion and negative tests. An Options entrance plus explicit
   submit could fit two actions. Open → toggle → Save needs three and is
   outside the current limit. A pre-visible toggle or auto-save path could use
   fewer actions, but no retained case establishes one. Keep the passive CMP
   lane passive even if a separate action-lane recipe is approved.

The five routes with no grounded action UI (Viadeo, IFTTT, Livro, Hollister and
Cognition Digital) should remain coverage investigations. Jaguar's separate
contact workflow is lower priority than the two OneTrust binding investigations.
There is no evidence-based reason to expand waits, retries or worker size now.

## Budgets, costs and exact approval boundary

Keep the checked-in 3,008 MB Lambda configuration; live AWS configuration was
not queried. Preserve 3,000 ms action capture, 5,000 ms worker, 4,500 ms artifact
deadline, at most two control actions, the existing 250 ms grace + 500 ms
observation, 32 request rows and 32,000-byte packet. No new invocation, visit,
retry, model call or retention extension. Other lanes keep their own existing
absolute budgets and passive restrictions.

The observer reserves about 1,300 ms before opening an entrance and requires
more than 1,100 ms before submission. Existing passive final-response timings
omit needed control/semantic work and are from different sessions. Retained
control observations range from approximately 4.6 to 19.4 seconds on the sites
with cookie controls. These are sampling timestamps, not first appearances;
they neither prove early availability nor prove a 3-second capture impossible.
Current evidence cannot forecast an honest successful-recipe percentage.

**Cost of this investigation: $0 incremental recurring infrastructure spend.**
Local fixture/replay work likewise adds no production work. Proposed diagnostics
should reuse reads and typed fields; any additional compute/storage must be
estimated before implementation rather than assumed free because caps stay
fixed. More captures reaching their existing caps can still increase billing.

For sensitivity only, using the planning rate already recorded in the exact-route
policy at 100,000 scans/month: an additional 100 ms on every scan at 3,008 MB
is about $0.49/month compute; one additional second on the ReadCube/Gimbal share
of this 169-scan cohort is about $0.06/month; one second on all ten is about
$0.29/month. These are not measured traffic, adoption or recovery forecasts,
exclude page traffic/storage and are not additive allowances. The cohort is not
a representative production distribution. Future implementations must share the
existing $10/month within $50 and account for the prior redirect work. No budget
change is requested on this evidence.

Additional approval is needed for:

- **New behavior:** explicitly scoped Cookie/Manage Settings opening in the
  sale/sharing lane; any toggle, generic Save, non-GPP decision adapter or
  provider/frame action outside the current explicit recipe. Specify the route,
  exact control intent, decision proof and action count before implementation.
  More money is not the missing authorization for these actions.
- **New action navigation:** Jaguar's contact URL, Volkswagen's separate cookie
  page, any resolved Cognition/Arpeggio destination, or other unlisted routes.
  Existing passive policy retrieval does not grant action authority there.
- **Forms or identity:** a separate reviewed workflow and exact scope if forms,
  verification or user information are actually required. None is authorized or
  sufficiently specified by these retained captures.
- **Expanded resources:** a third action, longer deadline, additional visit,
  retry, larger worker or new paid call; and any recurring cost outside the
  authorized shared allowance. None is recommended now.
- **Operational validation/rollout:** live scans, deployment, flag changes or
  historical rewriting remain separately prohibited without approval. A future
  bounded live capture would need an explicit site/count/action/cost scope;
  synthetic tests alone cannot establish real-world recovery.

These boundaries follow the repository's exact-route instruction to “Preserve
historical v1/v2, existing recipes,” its passive-CMP “no Options/Manage clicks”
policy, and the user's explicit operational restrictions. This review completes
the authorized investigation; no permission request is needed to finish it.
