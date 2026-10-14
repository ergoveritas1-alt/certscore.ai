# Evidence priority policy — 2026-10-14

Owner request: protect basic evidence across a scan, bound prolific inventories and detailed examples, and decide what yields when time runs short. Implementation is local only; no deployment or new public scan was requested or performed.

## Recommendation

Use breadth before detail, with reserved time, bounded work and explicit coverage. Counts of observed items and distinct findings are different from the number of detailed examples worth retaining. A flat “first 20 cookies” cutoff can hide the single relevant cookie and cannot establish which cookies deserve priority. Severity can help allocate extra proof after a finding has been observed; it must not decide what initially exists or create a finding from an uninspected item.

The priorities are:

1. **Core facts and identity:** navigation/document binding, existing first-layer A/R/O proof, network/cookie capture, storage inventory, scripts/frames, form presence, policy evidence in its owning lane, and early transport evidence. Freeze these before expensive visual or repeated-element detail.
2. **Coverage across distinct findings:** keep at least one usable proof for each retained accessibility rule; distribute field inspection across distinct form groups; preserve main-document footer/header candidates while sampling discovered shadow roots. Preserve the proof required by existing semantic and deduplication decisions.
3. **Extra detail:** additional examples of an already-proven rule, repeated fields within a form, masked form images, final transport refresh and optional crawl metadata use time left after required work and finalization. Within accessibility rounds, critical/serious rule metadata gets earlier extra examples; the underlying rule eligibility, impact and scoring weights do not change.

An incomplete inventory stays incomplete. A valid Accept/Reject comparison can have complete selected-control proof while unrelated controls, frames or inventory work remain unresolved. The prior two-second screenshot fix only grants review time to the verified pair. It does not declare the entire inventory complete. Separate consent, policy, runtime, GPC and action sessions retain their existing ownership and readiness barriers.

## Where contention actually occurs

- The consolidated runtime snapshot previously computed accessible names, visibility, ancestors and open-shadow-root links even in runtime/GPC lanes that discarded those policy-link rows. It also traversed entire DOM roots before applying its retained-link sample. These were unnecessary or unbounded renderer workloads before the basic snapshot could return.
- Form fields were inspected in document order. A prolific first form could exhaust the 250-field allowance before later forms appeared.
- Optional form image capture/review ran immediately before the required WCAG audit. Its timeout did not reserve the audit's existing eight-second allowance, and a timed-out masked capture could still be restoring the shared document when the next audit began.
- The accessibility audit retained five examples per rule only after transferring every failing element and unused pass/related-element data out of Chromium. Large results could exhaust serialization/transfer time. If the final typed artifact exceeded 256 KiB, the entire audit became unavailable, even when one example per finding would have fit.
- Local/session storage key loops were unbounded and sequential. A huge first area could prevent the second area and the rest of the snapshot from being captured.

Separate Lambda lanes do not share a browser document. Many hidden links in the runtime page cannot directly consume the consent-proof session's DOM budget. They can still affect shared-host CPU in local simulation, overall report readiness, artifact sizes and external service demand. The retained SITS evidence reviewed in the previous audit does not establish that large inventories caused its screenshot timeout.

## Implemented limits and allocation

`packages/certscore-scan-core/src/evidence-work-budget.ts` owns `breadth_before_detail.v1` and the shared optional-work calculation. Existing module, parent, action and publication deadlines remain authoritative. Optional work receives the lesser of its existing cap and the remaining time after the required audit reserve and a 250 ms finalization reserve. It never receives a fresh timeout after another task uses the budget.

| Evidence | Core coverage | Detailed-work policy |
| --- | --- | --- |
| Cookies | Existing browser cookie snapshot and network cookie evidence remain uncapped by this change. | No new top-20 selection or per-cookie model calls. |
| Web storage | Capture key identities with redacted values; retain the source area's observed key count in operational diagnostics. | Both areas advance together within 100 ms, up to 10,000 keys per area. Incomplete reads set the existing `ReadComplete` flags false. A capped sample cannot establish an empty or complete inventory. |
| Forms | Discover up to 10,000 field candidates across up to 50 form/control groups within 50 ms. | Inspect at most the existing 250 candidates, round-robin across groups, within 250 ms. Existing retained limits remain 10 forms, 20 fields per form and 60 fields overall. Truncation flows through existing inventory coverage. |
| Policy-link detail in combined capture | Preserve sampled main-document footer/header candidates and discovered-root diversity. Dedicated runtime/GPC sessions do not perform unused policy-link inspection. | Up to 1,000 candidate links; shadow discovery bounded to 10,000 DOM elements, 32 roots and 100 ms; rendered naming/visibility work bounded to 200 ms. Sampling and time exhaustion are explicit in operational diagnostics. Separate policy-lane discovery remains unchanged. |
| Hidden links | Existing positive evidence and bounded main-document scope are preserved. Anchor count is not a count of all hidden links. | Keep the existing 1,000 inspected-candidate, 12 retained-link and 20 ms bounds, including the existing sanitized code-proof byte limits. Shadow-root competition no longer displaces main-document hidden-link candidates. Uninspected links remain unknown. |
| Accessibility | Run the same bundled axe version, configured WCAG tags and full rule evaluation inside the existing maximum eight seconds. Retain complete engine-reported rule/node counts when evaluation finishes. | Trim to the existing five examples per rule inside Chromium before transfer. At the existing 256 KiB artifact ceiling, retain one proof per rule before allocating additional examples fairly. Existing image-alt/link-name, viewport and target-size proof is pinned to preserve semantic/deduplication decisions. |
| Form images and late refresh | Form inventories and early transport observations remain retained. | The required audit runs before optional form pixels/review, after privacy facts are frozen. Images then use actual remaining time within their existing 2.5-second maximum, including cleanup. A stalled visual cannot starve or contaminate the already-completed audit. Final transport refresh and crawl metadata yield to the audit reserve. |

Original native field indices are preserved. The shared field identity bound now permits indices 0–9,999, separately from the 250 inspected-field allowance; later fields are never renumbered to impersonate an earlier control. Existing snapshot identity validation still checks the actual controls and form ownership.

The browser engine can still block or exceed its budget on a pathological page. Required work receives protected opportunities, not a fabricated success guarantee. If even minimum proof for every accessibility rule cannot fit, the audit remains explicitly limited with the existing evidence-size reason. This policy does not evaluate a random subset of WCAG rules or invent full-page accessibility coverage from a sample.

## Evidence, projection and safety

Accessibility observations gain optional, versioned `exampleCoverage`: observed rule-element matches, retained examples, omitted examples and whether the byte budget reduced detail. These counts describe rule-element matches, not deduplicated DOM elements. The shared schema checks them against the retained rule evidence. Normal reports keep all existing examples. Audit completion describes engine coverage; fewer retained examples alone do not turn a completed audit into an incomplete engine run.

The field survives checksum-bound canonical persistence/projection and the shared public accessibility summary. Invalid document binding clears examples and their sampling metadata together. Historical records without the field keep their original interpretation. No display-layer finding, status upgrade, scoring weight or retroactive evidence repair is added.

Explicitly incomplete web-storage capture now limits new GPC paired comparison coverage to `indeterminate`, with lane-specific limitation keys and no score effect. Sampled keys remain descriptive evidence. Existing v1/v2 stored conclusions are not recomputed on read; legacy captures without the new explicit incomplete flag keep their existing semantics. Actual GPC signal-delivery and production-observation proof remain separate.

Operational timing details record policy version, budgets granted to optional tasks, the audit allowance, pixel-cleanup completion, field counts, discovered anchor counts and storage source counts. These use existing timing/manifests and add no artifact upload request. They do not create findings. Unsupported CMP integration, absent product features and incomplete inspection remain distinct existing assessments.

## Cost and release scope

No new browser session, lane, retry, navigation, paid/model call, provisioned capacity, maximum scan deadline or retention period is introduced. Processing and transfer should decrease on prolific pages. The small additional versioned coverage/timing metadata has a pre-approved estimated storage increase below $0.10/month at 100,000 scans/month for normal retained cohorts, under existing retention; repeated examples removed under pressure can more than offset it. This is not authorization for indefinite retention growth or a new service budget.

These changes touch shared contracts, scanner capture and web projection. Deploy compatible contract/web readers before or with the Lambda producer in a separately authorized release. Do not roll out only the new producer to older strict validators. No production record or saved SITS report was changed during implementation.

## Verification

Local browser fixtures cover 5,000 links with no unused runtime policy-style reads; footer-first proof under an artificial style-work delay; many open shadow roots without losing the main footer; a 400-field first form followed by later email/password forms with exact original control indices; an oversized storage area without starving session storage; a short-budget scan retaining all 80 cookies, form inventory, early transport and WCAG findings while a later optional image review stalls; and a 300-element accessibility failure transferred as five examples with its full count.

Contract and projection regressions cover count-bound sampling metadata, historical records, byte-pressure retention across all rules, pinned semantic examples, invalid document binding, native field bounds and public summary parity. GPC regressions require explicit storage truncation to remain indeterminate/neutral while observed keys survive. Existing runtime timeout/recovery, passive localized forms, hidden-link code proof, masked images, full-site identity, accessibility scoring and image-link deduplication tests also pass. Typechecks cover scan-core, contracts, Lambda and web.

Verification used deterministic local fixtures and retained/source inspection only. It made no SITS/public calibration contact, paid moderation request, deployment, push or historical assessment edit.
