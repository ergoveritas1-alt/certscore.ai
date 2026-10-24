# CertScore.ai Gimbal getter availability: retained-evidence review

October 23, 2026. Retained evidence and local source inspection only. No public
visits, browser runs, AWS invocations, deployment, flag changes or runtime edits.
Analysis adds $0 recurring infrastructure cost. Existing Lambda memory, lanes,
scan budgets and the shared $10/month within $50 allowance remain unchanged.

## Finding

Late initialization is the leading explanation consistent with the retained
timings, but the latest packet cannot establish the exact cause. Its
`api_unavailable` means the diagnostic did not find a safely callable
`OneTrust.GetDomainData` at its single checkpoint. It does not establish permanent
API absence, a broken getter, or failed opt-out behavior.

The latest original-route diagnostic verified Gimbal's exact 301 to Infillion,
HTTP 200 and an unchanged final loader. At 2,601 ms it attempted its snapshot;
verification finished at 2,608 ms and cleanup finished at 2,625 ms, within the
2,750 ms capture allowance. The snapshot took about 0.2 ms and made **zero SDK
calls**. Thus it did not time out or throw inside `GetDomainData`, and did not
reach category parsing. No evidence supports a retry or relaxed safety checks.

| Timing relative to each run's final-document commit | Earlier loading trace | Latest category diagnostic |
| --- | ---: | ---: |
| Commit offset from harness start | 755 ms | 1,872 ms |
| OneTrust stub request starts / finishes | +705 / +865 ms | Not retained |
| Exact `202604.1.0` banner request starts / finishes | +1,298 / +1,390 ms | Not retained |
| Category lookup begins | Not performed | +729 ms |

The latest commit was 1,117 ms later: 547 ms more before navigation started and
570 ms more between navigation start and commit. These are observed durations,
not attribution to a particular network or browser cause. If the earlier
post-commit loading pattern recurred, the latest lookup would precede even the
stub's completion. Separate sessions cannot establish that it did recur. Resource
completion also does not prove script execution or SDK initialization. These are
local browser timings, not Lambda latency measurements.

The historical verified bundle retained the configured category “Allow
Sale/Sharing/Targeted Advertising” in a separate consent-proof session at its
reported 5,039 ms offset. That supports historical loaded configuration; it does
not establish getter shape or availability in this short diagnostic. Its lane
and clock origin differ, so that offset cannot be used as an added-wait estimate.
The earlier trace's `gppCallable: false` is about a different API and contains no
`GetDomainData` availability observation.

The locally implemented exact banner-version fix recognizes a readiness event;
it does not load the SDK or accelerate the site. The latest diagnostic harness
does not call that readiness helper. Its result therefore neither validates nor
disproves the script-version fix. Also, a callable API at a late passive snapshot
would not establish readiness before the existing roughly 1,350 ms action cutoff.

## Why the current result is ambiguous

The retained `category-snapshot.ts` reads only an own data-property `OneTrust`
global, then searches the API object and two prototype levels for
`GetDomainData`. It stops at the first descriptor and does not invoke accessors.
Missing/null globals, a global accessor, a missing method, a non-callable method,
a shadowing accessor and an exhausted prototype search can all produce the same
`api_unavailable`. Some malformed objects can instead throw and produce
`read_failed`; the latest run did not report that. It retains no descriptor
reason, document readiness or script timings.

The passive configuration discovery in `cmp-scope-inventory.ts` allows the own
method plus up to four prototype hops, rejecting accessors and built-in object/
function prototypes. Its inventory reader then uses ordinary property access.
The diagnostic's shallower search is a possible coverage difference, not a
demonstrated site defect. No retained record proves Gimbal uses a deeper method,
an accessor, an alias-only API or a particular prototype shape. Do not widen the
lookup, call an accessor, or switch to `Optanon` on this evidence.

## Narrowest next diagnostic — proposal only

Replace the category extraction with **one Gimbal-only availability snapshot**.
This answers why safe discovery fails before spending another attempt extracting
categories. It makes zero SDK calls, including zero `GetDomainData` calls.

1. Use one local original-route visit to `https://gimbal.com/`, preserving the
   exact authorized redirect to `https://infillion.com/`, public-network and
   native TLS checks, contact holds, blocked extra windows/subframe navigation,
   HTTP response verification and before/after URL/loader binding. Never navigate
   directly to the final target to save time.
2. Preserve the 2,750 ms absolute capture allowance including launch/navigation,
   existing cleanup reserve, and one checkpoint at deadline minus 150 ms. Do not
   reset the clock at commit, poll, retry, add a second checkpoint or extend time.
   A late/unverified navigation yields a limited result without a snapshot.
3. In that single evaluation retain `document.readyState`, the own global
   descriptor classification (absent, accessor, null, data type), and the same
   bounded method search's descriptor kind, level and stop reason (found callable,
   non-callable, accessor blocked, chain ended, built-in boundary, search limit,
   or read failure). Record only types/enums/depths; never serialize the SDK object
   or execute JavaScript accessors. Preserve the existing lookup limits.
4. In the same evaluation, make two exact Resource Timing lookups for
   `https://cdn.cookielaw.org/scripttemplates/otSDKStub.js` and
   `https://cdn.cookielaw.org/scripttemplates/202604.1.0/otBannerSdk.js`.
   Retain at most one completed resource entry per URL: start/end times,
   initiator type and a multiple-entry indicator. Keep the browser-relative
   time origin explicit; do not subtract it from host wall-clock offsets.
   No whole-resource inventory, response bodies, headers, cookie values or new
   network requests. Missing timing data is unknown, not proof of a blocked or
   absent script. A completed resource is not proof of execution.
5. Share a 10 ms cooperative evaluation/serialization budget and retain at most
   2,048 bytes of new snapshot metadata inside the existing 32,000-byte packet
   cap. Stop/discard on budget exhaustion, document drift or late completion.
   Browser-native atomic operations cannot be preempted by a JavaScript stopwatch;
   preserve the existing outer deadline/abort and never accept an overrun as valid.
   No category rows, active-group reads, GPP reads, Settings opening, clicks,
   toggles, submissions or external-form navigation in this diagnostic.

Interpretation is deliberately limited:

- No own global or method, with no completed exact script timing: consistent
  with loading delay, but timing omission remains possible.
- Completed banner resource, with no method: narrows the issue to execution,
  initialization, API shape or exposure; does not identify which one by itself.
- Accessor blocked or prototype-search limit: identifies the safe lookup boundary
  to review offline. It does not authorize bypassing that boundary.
- Callable method: shows availability at that instant only. A later category
  capture would still need authorization; action readiness and sale/sharing
  semantics remain unverified.

Before any public run, exercise synthetic offline fixtures for these reason
codes, accessor non-invocation, callable class methods, depth limits, missing/
multiple timing entries, the byte/time caps and changed documents. Do not import
or run the old live harness to perform the offline checks.

## Approval boundary and cost

The previous one-visit category diagnostic is consumed. The current request
explicitly prohibits live scans, so **the proposal has not been implemented or
run**. The exact next approval would be:

> Approve local implementation/tests of the single-checkpoint Gimbal availability
> diagnostic above and exactly one local original-route passive visit, within
> the existing 2,750 ms capture, 10 ms processing and 32,000-byte packet limits.
> Zero SDK calls or actions; exclude external forms. No retries, deployment,
> flag changes, Lambda invocation or canary activation.

That local diagnostic adds $0 AWS compute and $0 recurring infrastructure cost;
only a small local artifact is retained. No additional monthly allowance is
requested. It cannot establish production Lambda performance. Instrumenting
production scans, invoking Lambda, activating the canary, widening getter access,
adding a non-GPP adapter, extracting further category state, increasing time or
performing privacy actions would require separately scoped authorization.

The lower-cost alternative is to retain the current neutral limited outcome and
defer another visit. There is still no evidence-based reason to broaden flags or
enable a non-GPP action recipe.

## Verification and source index

`artifacts/gimbal-getter-review-2026-10-23/audit.cjs` ran offline successfully.
Its `analysis.json` records source hashes and calculated timing deltas. It checked
the latest diagnostic and its four retained harness/test/receipt files against
their manifest, the earlier trace against its manifest, the historical original
bundle against its retained retrieval receipt, and the embedded action packet's
hash and byte size. These checks verify consistency with retained receipts, not
fresh remote state. No existing evidence files were rewritten.

Primary inspected sources:

- `artifacts/scoped-canary-category-diagnostic-2026-10-23/live-gimbal-category.json`
- `artifacts/scoped-canary-category-diagnostic-2026-10-23/category-snapshot.ts`
- `artifacts/scoped-canary-category-diagnostic-2026-10-23/live-category.ts`
- `artifacts/settings-loading-investigation-2026-10-23/trace-gimbal.json`
- `artifacts/mini-bot-review-2026-10-21/scans/ee804c9f-4746-4bc0-9735-aaa520fba265/original/CanonicalEvidenceBundle.json`
- `packages/certscore-scan-core/src/cmp-scope-inventory.ts`
- `packages/certscore-scan-core/src/onetrust-preference-inventory.ts`
