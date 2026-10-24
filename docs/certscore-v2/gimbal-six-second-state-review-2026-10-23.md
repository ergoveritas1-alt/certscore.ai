# CertScore.ai Gimbal six-second state-verification review

October 23, 2026. Retained-evidence/source review only. No live visit, browser,
SDK call, privacy action, deployment, flag change or production edit. Recurring
AWS cost increase: $0.

## Decision

**The result justifies one narrow state-binding feasibility investigation, if
Gimbal coverage merits it. It does not justify a state adapter, action trial or
production budget increase.** Stop timing-only diagnostics: the useful next
question is whether the exact sale/sharing category can be bound to an ID and
readable diagnostic state. Stopping entirely remains reasonable if this route
is not a priority.

The verified visit downloaded all five exact CMP resources by 2,652 ms and
observed an own OneTrust object at the sole 5,855 ms snapshot. The object was
not inspected for methods, GPP, category identity or state. The earlier category
diagnostic returned `api_unavailable` with zero calls; its safe getter has never
successfully run in these local category diagnostics. Positive object presence
now makes a tightly scoped read more plausible, without guaranteeing it.

All selected downloads finished before 2,750 ms. There was no earlier global
snapshot, so six seconds is neither a demonstrated minimum nor a reliable
production requirement. The nominal action-readiness cutoff remains about
1,350 ms under the current reserves, and the stub began at 1,867 ms in this run.
Neither the later object nor the download timestamps establish action readiness.

## What still separates a diagnostic from state verification

| Evidence | What it would establish | What remains missing |
| --- | --- | --- |
| Own OneTrust object, already observed | Bounded global presence | Callable safe getter, valid configuration, current state |
| Unique exact label + category ID from one read | Candidate category binding in that session | Authoritative sale and sharing semantics, active rule/region |
| Configured Status and matched active-group membership | Raw configuration/membership facts | Whether this means an effective sale/sharing opt-out |
| Completed action and same-session baseline/post/terminal proof | Potential verified transition after semantic qualification | Requires separate action/adapter authorization and canonical integration |

The existing OneTrust cookie-state code verifies optional-cookie decisions using
configured groups and receipt proof. It is not automatically a sale/sharing
adapter. Do not reuse its `denied` classification as sale/sharing success or
substitute category labels for authoritative state semantics. Preserve the
existing GPP decision path and historical evidence contracts.

## Narrowest proposed next step

First implement and offline-test a compact, local-only category reader adapted
from the earlier reviewed diagnostic. Do not directly reuse that reader: it
allowed up to 16 KiB of rows and cannot guarantee the newer shared 2 KiB cap.

If separately authorized for a public validation:

1. One original-route visit, with a renewed **6,000 ms local diagnostic exception**,
   the existing 250 ms cleanup reserve, exact route/TLS/public-network guards,
   isolated context and same-loader checks. No production deadline changes.
2. Replace the current terminal snapshot with one bounded snapshot at deadline
   minus 150 ms. At most **one `OneTrust.GetDomainData()` call**, only if found
   through the already-reviewed own-data/bounded-prototype lookup (at most three
   inspected objects, never accessor invocation). If unavailable, stop unknown;
   no polling, alternative API, broader prototype search or retry.
3. Inspect at most 64 group entries, including subgroups, through bounded
   descriptor-safe traversal with cycle/duplicate checks. Match only the exact
   retained label **Allow Sale/Sharing/Targeted Advertising**. Retain at most one
   unique match: a bounded category ID, raw configured Status and whether that
   exact ID occurs in each already-loaded `OnetrustActiveGroups`/
   `OptanonActiveGroups` data property. Bound membership inspection to 64 IDs and
   4,096 source characters; retain membership booleans/unknown only, not lists.
   Do not assume a conventional ID or interpret Status/membership as opt-out.
4. Keep the existing seven exact request slots/32 shared candidates and
   provenance. Share the 10 ms cooperative allowance and **2,048 bytes across
   the entire request trace plus terminal read**, within the 32,000-byte packet.
   A compact match should fit ordinary captures; tests must enforce the cap,
   not increase it. Duplicate exact labels, truncation, accessor-only fields,
   malformed membership, document changes and overruns remain explicit unknown/
   limited results. Do not drop provenance to force a successful-looking row.
5. No Settings opening, toggle, Save, consent mutation, cookie read, GPP call,
   new method, external form, arbitrary configuration dump or request body/header
   read. A native SDK call cannot be preempted by the cooperative stopwatch;
   discard an overrun and keep the outer abort/cleanup boundary.

Offline tests must cover unavailable/accessor/prototype-shadowed getters, exact
label ambiguity, field and array-index accessors, cycles and 64-entry bounds,
malformed/duplicate membership IDs, already-consumed collector processing,
combined packet size, changed documents and an atomic getter overrun. Assert
at most one getter call and zero action/open/submission calls.

This is **state-binding research**, not verified state interpretation. A unique
row would make an evidence-specific semantic review possible; it would not
authorize an adapter or action. An unavailable, ambiguous or limited result
ends the one attempt without retry. Do not launch another timing-only visit.

## Approval required

Neither the earlier category visit nor the six-second zero-SDK visit grants
another attempt; both are consumed. The exact proposed authorization is:

> Implement/test the compact Gimbal category-binding diagnostic locally, then
> run one original-route passive visit under a renewed 6,000 ms diagnostic-only
> limit. Permit at most one reviewed GetDomainData call and bounded reads of the
> matched category's active-group membership. Keep all existing guards, shared
> processing/candidate/byte caps, zero privacy actions and no external forms.
> No retry, deployment, flag change, Lambda invocation or production-budget change.

Implementation/tests may be approved without the visit. Explicitly note that
this changes the previous **zero SDK calls** scope to **at most one reviewed
read-only SDK call**; it does not change the zero-actions boundary. Expected
additional recurring AWS cost is $0. Keep the existing Lambda, six lanes and
shared $10/month within $50 allowance; no extra money or capacity is requested.

Production budget changes require evidence of useful readiness under a bounded
route-specific policy, preserved action/observation reserves, worker/coordinator/
contract validation, realistic affected volume, latency and cost checks, and
separate deployment/activation approval. New SDKs, semantic adapters, action
trials or external forms each require their own authorization. The present
result supports none of those changes by itself. Keep production budgets and
flags unchanged.

## Verification

`artifacts/gimbal-state-feasibility-review-2026-10-23/audit.cjs` verified the
six-second manifest, evidence and unchanged production hashes, and reverified
the earlier category diagnostic and reader hashes. It records known/unknown
facts and reviewed source hashes in `analysis.json`. No prior evidence or
production source was changed; the proposed reader was not implemented here.
