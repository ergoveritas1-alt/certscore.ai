# CertScore.ai Red Hat opt-out integration

Owner-authorized local implementation and verification, November 5, 2026.
Red Hat's exact opt-out action and one verified same-page reload now have a
versioned scanner path and a separate canonical execution assessment. The path
is **off by default**. Nothing was deployed or enabled in production.

## Live result

The integrated scanner made one intentional verification visit through the
standard `runSaleSharingOptOutObserver` entry point. Its packet passed the normal
retention function, dispatch/source checks and SHA-256 verification; artifact
storage was local, with an injected storage client and no AWS scanner invocation.

| Checkpoint | Retained observation |
| --- | --- |
| Baseline, 1,648 ms | Original document, TrustArc implied `[0]` |
| Native click, 1,654 ms | Exact visible and accessible opt-out label, bound portal and verified hit target |
| Immediate read, 1,660 ms | Still implied `[0]` |
| Reload request, 2,085 ms | One main-frame GET to exactly `https://www.redhat.com/en`, bound to the click and original document |
| Reload response | HTTP 200, no redirect; distinct replacement loader verified |
| Terminal read, 2,414 ms | Replacement document, TrustArc asserted `[1]` |
| Capture / cleanup | 2,416 / 2,421 ms |

This confirms a recorded explicit choice after the opt-out click. Category `[1]`
is not interpreted as sale/sharing purpose or proof of tracking cessation.
There is **no measured post-confirmation activity window**. The packet remains
`limited`, semantic sale/sharing registration remains `unconfirmed`, and no
activity finding or scoring effect is created from this evidence.

## Integration and boundaries

`bounded_sale_sharing_opt_out.v4-redhat-reload` and
`trustarc.redhat_explicit_choice.v1` are separate from historical v1–v3 recipes.
The coordinator selects v4 only when both the existing opt-out worker flag and
`CERTSCORE_REDHAT_OPT_OUT_RELOAD_ENABLED=1` permit it. The latter is not enabled
by this work and is also checked at the worker boundary.

Selection consumes the already checksum-verified consent packet. It requires
exactly one eligible, visible, geometry-verified native button with the exact
opt-out label on the reviewed Red Hat document. The dispatch retains the source
hash, observation ID and original source document token. The coordinator creates
a separate opt-out parent payload/hash and retains the executed dispatch in the
manifest. Accept and Reject keep their original payloads/hashes and scheduling.

Runtime authorization is specific to the HTTPS apex → www/en 301 → 200 route.
The action requires a fresh implied `[0]` baseline, exact matching visible and
accessible labels, native button semantics, no form, SDK-owned portal identity,
and verified geometry. Existing asserted or unsupported baseline states do not
trigger an action. At most one click and one same-page reload are allowed.
Browser reload reasons, main frame, exact URL, GET method, Fetch/Network request
join, distinct loader, source hash and action timing all bind the replacement
navigation. Redirects, other destinations, forms, stale proof and second reloads
fail closed. Native TLS and public-network checks remain active.

Capture remains 3,000 ms with the existing 250 ms cleanup reserve; worker/artifact
caps remain 5,000/4,500 ms. No Lambda configuration or memory change was made.
The existing 750 ms follow-up, maximum three bounded SDK reads and shared
32-check/10 ms readiness allowance remain unchanged. No extra model call,
preference-panel opening, external form, retry or generic redirect support was
added. ReadCube/Gimbal holds remain intact.

## Daily audit semantics

The verified packet produces `opt_out_execution_assessment.v1` through canonical
California assessment persistence. `certscore.audit-choice-summary.v2` exposes:

- action completion;
- choice confirmation phase (`confirmed_initial` or `confirmed_terminal`);
- confirmation basis (semantic GPP state or explicit CMP choice);
- post-confirmation observation coverage.

The semantic registration label is now **Sale/sharing state confirmation**.
The follow-up capture label explicitly refers to sale/sharing state confirmation.
A terminal CMP choice does not populate either semantic confirmation or completed
follow-up coverage. The funnel adds `choice_recorded` independently of its
existing semantic `confirmed` stage. Historical v1 summaries and v1–v3 evidence
remain readable, without fabricating missing execution assessments or rewriting
reports. An out-of-range historical confirmation timestamp remains unavailable
in the new bounded timestamp field without breaking the historical assessment.

## Verification

The retained replay verified four original Red Hat artifacts and all 65 files
pinned by the preceding verification receipt. Two earlier diagnostic packets
and the new integrated packet yield three completed actions, two terminal
confirmations, zero semantic sale/sharing confirmations and zero measured
post-confirmation windows. The earlier blocked-reload attempt stays unconfirmed.
Replay results are internal reviews, not historical report mutations.

The focused test runs passed: 25 contract/projection/audit tests, 31 coordinator
and retention tests, 50 audit/projection regressions, and 32 historical/coverage
tests (these groups overlap). Browser verification passed 22 action scenarios,
four loopback HTTPS observer scenarios, plus cancellation and pure reload-proof
checks. Negative cases include wrong/duplicate labels, forms, SDK mismatch,
unsupported/prior state, crossed-document reads, late controls, changed targets,
reload redirects, missing proof, hash mismatch and inactive flags. The coordinator
tests verify original Accept/Reject dispatch hashes and one source read. Scanner,
Lambda, web and validation-worker TypeScript checks passed. Registry and diff
whitespace checks passed.

An existing injected handler timing test initially depended on public DNS and
failed in the restricted environment. It now uses a public literal address for
validation with an injected no-network artifact function; no page is contacted.

## Contact accounting and test isolation incident

Two early browser-fixture attempts unexpectedly contacted Red Hat because a
redirect bypassed the Playwright fixture intercept. Both stopped before any
click or SDK read. Their times and outcomes are retained in
`fixture-bypass-contact-summary.json` and recorded in both central and manual
contact ledgers. They were not successful verification scans.

The corrected end-to-end fixtures use an owned loopback HTTPS server and a
CONNECT proxy restricted to the two fixture hostnames, with external DNS mapped
to loopback. Action-only fixtures also block external resolution. This prevents
fixture interception failures from contacting public sites.

After fixing isolation, the intentional live check used a successful fresh
central history export, the canonical selector, the owner's cooldown waiver and
contact holds. That single visit is also recorded centrally and manually under
its own idempotent key. Existing AWS tasks were recovered after disconnected
waiters; writes were not repeated. Local egress geography was not independently
verified. This is route verification, not a population success-rate estimate.

Recurring incremental cost while disabled: **$0**. Bounded metadata storage if
later enabled is estimated below **$0.10/month at 100,000 scans**, with no capture
budget increase. One-time contact-ledger bookkeeping, including the incident, is
estimated below **$0.15**. Production deployment and activation remain separate.

Evidence and logs: `outputs/redhat-scanner-integration-2026-11-05/`.
