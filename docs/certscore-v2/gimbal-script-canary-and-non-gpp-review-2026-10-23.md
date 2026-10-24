# CertScore.ai Gimbal script fix, canary proposal and non-GPP review

October 23, 2026. The owner approved the exact script-version fix locally with
tests, a scoped canary proposal and retained-evidence research. No deployment,
flag changes, public live visits, AWS invocations or non-GPP implementation were
performed in this round.

## Implemented locally

The Settings readiness listener now accepts the exact script URL
`https://cdn.cookielaw.org/scripttemplates/202604.1.0/otBannerSdk.js` only when its
caller has verified the original `https://gimbal.com/` route and final
`https://infillion.com/` document. The observer passes the original dispatch URL
only in its existing complete-route Settings path. Direct Infillion visits,
other source/destination pairs and URL variants receive no new checkpoint.

The prior stub and `202609.1.0` checkpoint behavior is preserved. All sources
share the same two-checkpoint maximum and 10 ms total extra probe budget. There
are no new requests, waits, retries, SDK calls, lanes, memory changes or packet
fields. Early readiness still requires callable GPP; after DOMContentLoaded the
existing opening rule remains, and submission still requires original GPP
baseline, after and terminal proof. Same-document checks, action checks, opening
reserve, 3,000 ms scanner/4,500 ms artifact/5,000 ms worker budgets and 3,008 MB
Lambda remain unchanged. No score or finding logic changes.

Verification: 101 distinct checks passed across the exact-route, Settings
entrance, readiness and new Gimbal script suites. The initial combined run had
100 passes; the final entrance suite replaced its 41 checks with 42 passes,
adding a full observer test where the newly recognized script supplies GPP
before a deliberately delayed DOMContentLoaded. That test exercises the approved
redirect chain, two authorized actions and all three decision reads. All network
identities in fixtures resolve through local fulfillment or a loopback TLS proxy;
no public site is contacted. Scan-core typecheck passed.

New cases cover direct/missing/wrong source binding, wrong destination/path,
foreign host, different version, query and fragment variants, late arrival,
missing early GPP, existing post-DCL opening without GPP, shared count/CPU caps,
changed documents and listener cleanup. Existing submission and external-form
exclusions remain covered. The retained real Gimbal banner finished at 2,145 ms,
after the approximately 1,350 ms action cutoff: this fix does not establish live
recovery or successful opt-out.

## Non-GPP evidence assessment

The offline audit reverified original bundle bytes against the retained receipt
and the embedded action packet against its hash and size. It also checked the
latest passive trace against the prior evidence manifest. Sources are indexed
with hashes in `artifacts/gimbal-script-canary-review-2026-10-23/retained-analysis.json`.

| Retained fact | What it supports and what is missing |
| --- | --- |
| Gimbal's passive loaded OneTrust configuration includes **Allow Sale/Sharing/Targeted Advertising** | A useful site-specific research lead. The flattened category list lacks its group ID, current state, active region/rule and authoritative state semantics. Loaded configuration is not visible/actionable control proof. |
| `OptanonConsent` exists; separate Accept and Reject sessions retain before/after cookie records and a later `OptanonAlertBoxClosed` | Cookie identities/hashes and notice closure do not decode sale/sharing state. Raw values are not retained in these action records. Both sessions explicitly report unconfirmed semantic registration. They cannot be borrowed as proof for the independent sale/sharing session. |
| Historical GPC semantic probe is unavailable; latest passive snapshot has no callable GPP at 2,657 ms | Unknown state or API availability at those checkpoints. This does not prove GPP is permanently absent or identify a replacement API. |
| Cookie Settings entrance and an external Your Privacy Choices link | Two different surfaces, not proof that cookie preference changes complete a sale/sharing opt-out. No verified Settings submission/state transition was captured. |
| Retained privacy and cookie policy text | The privacy capture is predominantly navigation/footer text. Cookie policy discusses browser cookie choices. Neither supplies an exact category-to-sale/sharing-state mapping. This is a retained-content limitation, not a claim about the current complete policy. |

**Conclusion:** a Gimbal-only OneTrust category-state adapter is worth researching,
but cannot be safely implemented from the retained material. Do not hard-code a
conventional category ID, equate all optional-cookie refusal with sale/sharing
opt-out, infer success from disappearing UI or reduced requests, or use a legacy
sale-only signal as proof of both sale and sharing. Keep the existing GPP reader.

A future adapter would need exact controller/configuration and category-ID/label
binding; positively interpreted sale and sharing state; same-session baseline,
after and stable terminal evidence; and the original explicit action, target,
loader and response provenance. It would need a versioned evidence contract and
canonical assessment/persistence support, preserving historical GPP packets.
It must replace the existing three bounded reads, not add polling, waits or
invent `sectionId: 7/8` for non-GPP data. No such adapter or evidence contract is
authorized or implemented here.

The narrow next research approval, if desired, is **Gimbal-only, local,
observation-only category binding**: at most one original-route visit under the
current scanner deadline, one bounded snapshot of already-loaded category IDs,
labels and declared current state, at most 64 entries and 10 ms cooperative DOM/
processing work, under the existing 32,000-byte packet cap. Keep existing guards;
no automatic timeout extension, API polling, toggle, Save, submission, external
form or retry. This would be diagnostic evidence only, not registration proof.
Any new SDK method would first need an exact read-only method review. If the
snapshot cannot fit or configuration is late, stop as limited. This capture
extension requires approval because the present request is retained-evidence
research, and it changes what the action session inspects. A successful snapshot
would inform a second, evidence-specific adapter/action proposal; it would not
authorize that implementation automatically. It may still return insufficient
evidence within current timing limits.

## Proposed canary: two scans, one region, no broad enabling

This is a proposal, not an active canary or implemented gate. Earlier read-only
checks found both Lambda opt-out and preference flags enabled in all three
regions. Web dispatch additionally requires its own gate and `all_eligible`.
The live web environment and deployed code digest were not audited in this
round. Merely leaving current flags unchanged does not isolate new recipes on
deployment.

1. **Release preparation:** identify the deployed artifact and freeze an exact
   reviewed candidate diff. Exclude unrelated dirty-tree work. Account for all
   still-unshipped redirect/Settings changes needed by the candidate. Add a
   server-controlled, default-deny canary authorization for those new behaviors
   and preserve the deployed behavior outside it. Existing supported recipes
   should not be globally disabled. Local gate implementation needs separate
   approval; it has not been added by this fix.
2. **Authorization:** an internal operator creates exactly two one-use scan
   authorizations, one for `https://gimbal.com/` and one for
   `https://readcube.com/`, in existing `us-west-1`, expiring within 24 hours of
   activation. Bind each to scan ID, original URL, reviewed ordered route grant,
   candidate artifact identity, existing recipe versions and region. Carry it
   through the existing verified parent dispatch; enforce it at dispatch and
   worker boundaries. No public request parameter can grant it. Reserve/consume
   each authorization before invocation so failure or retry cannot create an
   extra attempt. Expiry prevents another dispatch. Region selection does not
   itself prove a California visitor context; retain actual context as usual.
3. **Preflight:** exercise a successful owned fixture plus missing GPP, late
   readiness, wrong target and stale/mismatched packet fixtures through artifact
   verification and canonical projection. Require neutral unsupported failures,
   unchanged budgets and single terminal publication. Verify expiry, replay
   rejection and that unrelated scans cannot use the candidate behavior. Do
   not deploy or dispatch until the exact artifact, gate and budget checks pass.
4. **Execution:** two manually initiated internal canary scans, sequentially,
   at most one scan active, no retries or automatic expansion. Use the existing
   Lambda and core/optional workers as ordinarily authorized; add no lane or
   visit per scan. Keep all existing action checks, two-action maximum, GPP proof,
   deadlines, external-form exclusions and retention. Do not change Accept,
   Reject or passive preference permissions. Each scan follows the canonical
   artifact verification and single-result assessment/persistence flow.
5. **Stops and rollback:** stop before the second scan on any unauthorized action,
   target/document/provenance mismatch, budget breach, duplicate publication or
   unjustified finding. A neutral readiness limit alone is an expected result,
   not a reason to retry. Revoke remaining authorizations and return to the
   reviewed prior artifact through the AWS release workflow if necessary; keep
   terminal evidence and do not regenerate reports from late output. Revocation
   cannot undo an already-completed authorized privacy choice.
6. **Decision:** record readiness/capture timings, matched checkpoint, action
   count, three decision-read outcomes, artifact verification, canonical result
   and billed duration. Complete the two-attempt ceiling and review manually.
   A correctly limited result passes safety but does not demonstrate coverage.
   Require verified useful success for each recipe before proposing broader
   exposure of that recipe; no automatic expansion after a successful canary.

Production gate configuration, deployment and execution of this plan all require
explicit approval. The existing global flags can remain unchanged under this
design, but activating the new authorization is itself a rollout decision.
If the release workflow cannot preserve non-canary behavior or isolate the
candidate diff, stop and revise the proposal rather than deploying broadly.

## Cost and exact approval boundary

Local code, fixture tests and retained-evidence analysis add **$0 recurring AWS
cost**. Script recognition adds no capture allocation or retained field, though
successful earlier progress could increase residence inside the existing cap.
Using the prior planning rate, 10 ms at 3,008 MB across 100,000 scans is about
$0.049/month; one additional second is about $4.90/month across all scans, or
$0.029/month at an illustrative 1/169 Gimbal share. This share is not a measured
production prevalence. The fix shares the existing $10 inside $50; it grants no
new money, and unchanged deadlines do not guarantee total spending stays below
that allowance at arbitrary volume.

For the proposed two-scan canary, maximum sale/sharing worker compute at five
seconds each is approximately **$0.00049** at the same planning rate. This is
only that worker's compute, not an estimate of the full scans. Propose a **$0.25
total incremental canary cap**, including coordinator, other enabled workers,
requests, artifacts and logs, drawn from the remaining shared $10 allowance.
Before activation, verify the actual remaining allowance, existing complete-scan
resource caps and current regional rates so the two-scan bound fits $0.25; skip
dispatch if that cannot be demonstrated. Billing lag is not a hard spend guard:
the fixed invocation bound and preflight estimate enforce the cap. No larger
workers, reserved capacity, additional model calls or retention extension.

Separate decisions to approve, neither granted by this document:

- Local implementation/tests of the default-deny, two-scan canary authorization;
  then a separately reviewed AWS deployment and activation of exactly the plan
  above, under the $0.25 cap within the existing allowance.
- The one-visit local Gimbal diagnostic capture extension described above,
  without mutation or external forms. A later non-GPP adapter, any new action
  controls, additional reads/time, or an external-form visit/submission requires
  another evidence-specific authorization.

No approval request for a production non-GPP adapter is ready yet. The lowest-cost
alternative is to retain neutral limited results and defer that recipe's rollout.
