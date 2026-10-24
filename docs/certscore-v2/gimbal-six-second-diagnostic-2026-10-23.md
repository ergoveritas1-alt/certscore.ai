# CertScore.ai Gimbal six-second passive diagnostic

October 23, 2026. The owner authorized local implementation/tests and exactly one
passive original-route visit with a 6,000 ms capture. That visit is consumed.
No retry, deployment, flag change or production-budget change occurred.

## Outcome

All five exact CMP resources completed with HTTP 200 in this session. At the
single terminal snapshot, the document was complete and the own OneTrust
descriptor contained an object (`data_object`). This establishes later global
availability, not method availability, correct configuration, GPP/state support,
action readiness or a completed opt-out. No SDK method or accessor was invoked.

| Event/resource | Host elapsed time |
| --- | ---: |
| Navigation / final commit / HTML finished | 475 / 1,202 / 1,272 ms |
| DOMContentLoaded | 1,864 ms |
| Stub request → finished | 1,867 → 2,111 ms |
| Exact site configuration request → finished | 2,115 → 2,312 ms |
| Geolocation request → finished | 2,312 → 2,480 ms |
| Exact banner request → finished | 2,480 → 2,572 ms |
| Exact regional/language request → finished | 2,594 → 2,652 ms |
| Page load event | 2,226 ms |
| Collector freeze / terminal snapshot start | 5,854 / 5,855 ms |
| Snapshot verified / capture plus cleanup | 5,864 / 5,896 ms |

The load event preceded several CMP completions, illustrating why page load is
not CMP readiness. Geolocation public validation spanned 48 ms; that does not
prove a DNS-only bottleneck. Request timings describe one observed sequence,
not a verified mandatory dependency chain or a source-level execution trace.

All five downloads finished before the former 2,750 ms capture deadline, though
the regional request finished after its approximately 2,600 ms snapshot. There
was no intermediate global snapshot in this run. Consequently, the evidence
does **not** show that OneTrust needed six seconds, identify when its object
appeared, or prove that the former capture would have observed it. Session
variation and the later checkpoint must remain separate explanations.

The stub and all subsequent CMP work still occurred after the nominal 1,350 ms
action-readiness cutoff. This passive result does not supply the separately
required control/state evidence or justify borrowing action reserves. It also
cannot establish production Lambda reliability from one local browser visit.

## Implementation and validation

All implementation changes live under
`artifacts/gimbal-six-second-diagnostic-2026-10-23/`. The local
`diagnostic-bounds.ts` defines the 6,000 ms exception and reuses the prior
document/snapshot safeguards. Collector and harness use that one absolute
deadline, without resetting it at navigation or commit. The terminal reserve
remains 150 ms, with the existing 250 ms cleanup reserve outside capture.

All other limits remain unchanged: seven exact document/CMP resource slots,
one shared 32-candidate allowance across Document/Script/XHR/Fetch, GET/exact
URL scope, 10 ms cooperative processing, 2,048-byte diagnostic, 32,000-byte packet,
one terminal snapshot, native TLS, public-network/contact/redirect guards,
isolated context and verified original route plus terminal loader. No added
headers, bodies, configuration values, cookies, SDK calls, actions or external
forms. A full or expired collector is not reopened by the extra time.

**35 offline tests pass**, including all previous exact-scope/provenance/cap
checks, late initialization before six seconds, rejection at the absolute
deadline despite late commit, unchanged candidate/CPU exhaustion, document
invalidation and snapshot limits. Focused TypeScript checking passes.

The live diagnostic used 26 candidates and approximately 1.35 ms processing.
Its compact diagnostic and full packet are verified within their unchanged byte
caps in `verification.json`. The original Gimbal URL followed one verified HTTP
301 to Infillion; HTTP 200 and the same final loader were verified before/after
the snapshot. Source/evidence hashes and the exclusive attempt receipt are
retained alongside `visit-gimbal-six-second.json` and `verify.cjs`.

## Cost and decision boundary

Zero SDK calls/actions, external-form visits and AWS invocations. Incremental
recurring AWS cost is **$0**. Production helper, contract-budget and Lambda
handler hashes remain unchanged. The current Lambda, six-lane topology, existing
production scan budgets and shared $10/month within $50 allowance are preserved.

The experiment answered the narrower question: this local session progressed
through the selected CMP downloads and exposed the own OneTrust object by the
later checkpoint. Keep production budgets and flags unchanged. No further
automatic diagnostic or rollout follows. Stop here pending a retained-evidence
decision about whether the remaining state-verification work is worthwhile.
Any further live visit, new SDK/state read, adapter/action work, larger budget,
external form, deployment or activation needs separate authorization.
