# CertScore.ai webmaster remediation quality audit

## Scope and implementation

Audit all eight issue/action sections in the existing ErgoVeritas showcase
report. A usable action must say which page/resource/element/policy passage to
inspect, how to trace the producing code or configuration, what to change,
which owner must approve it, and what before/after checks establish completion.
Missing implementation detail is explicit, with diagnostic steps instead of
invented file names, selectors, vendor configuration or legal conclusions.

Shared plans now serve supported canonical finding presentation, checklist
guidance, CMP guidance and PDF action generation. Existing persisted finding
statuses and presentation decisions remain authoritative. The PDF can replace
stale generic action copy without rematerializing or upgrading its findings.

The eight audited sections cover pre-choice tracking/storage/replay, refusal,
device APIs, policy/runtime conflict, missing rights disclosure, semantic
labels, text alternatives and concealed outbound links. Each has a named owner,
source-level steps and verification criteria. Rule-specific accessibility
guidance binds only the rule IDs already assigned to the issue and the
scan-bound retained node evidence; it does not turn an inventory into a new
finding. HTML examples are explicitly illustrative and require meaningful
page-specific text, rather than blanket ARIA or tabindex changes.

The refusal guide names the retained Google Analytics endpoint and `_gid`
write, distinguishes a configured eight-second re-test target from the
early-stop measured sample, and explains queued callbacks, SDK disabling and
targeted cleanup without deleting the saved choice. The policy conflict pairs
the retained claim with its linked endpoint. Rights guidance identifies the
specific non-discrimination omission while leaving applicability and wording
approval with the privacy owner. Device APIs require call-stack/data-flow
diagnosis rather than asserting proven fingerprinting.

Every deployment workflow includes staging, approval, publication/cache
invalidation, rollback and before/after evidence. A runtime or policy finding
cannot be closed solely because an attribute or statement was changed. Unknown
cases remain a diagnosis task; the report does not pretend that unretained
implementation details can be recovered from a display summary.

## Technical references checked

- [W3C form labels](https://www.w3.org/WAI/tutorials/forms/labels/)
- [W3C image alternatives](https://www.w3.org/WAI/tutorials/images/decision-tree/)
- [W3C button pattern](https://www.w3.org/WAI/ARIA/apg/patterns/button/)
- [Chrome Network analysis](https://developer.chrome.com/docs/devtools/network/reference/)
- [Chrome breakpoints](https://developer.chrome.com/docs/devtools/javascript/breakpoints)
- [OneTrust blocking methods](https://my.onetrust.com/s/article/UUID-518074a1-a6da-81c3-be52-bae7685d9c94?language=en_US)
- [CPPA consumer-rights information](https://www.cppa.ca.gov/faq.html)

These support implementation guidance, not a new legal assessment or finding.

## Verification and boundaries

Re-export scan `4374b04f-1164-42cd-954b-105fc5872b86` from localhost without a
new scan. Only generation time and six appendix `correctionSteps` presentation
arrays change in its JSON relative to the 22-page baseline. All retained
evidence, canonical projections, statuses, source hashes, score (28/100), policy
coverage (7/11 Observed) and disclosure/methodology text remain unchanged.

The final PDF has 24 pages, with the complete remediation chapter on pages 2–7.
Appendix C remains two pages; each appendix starts on a new page; Accept/Reject
results remain one section. Continued action pages identify the relevant issue.
All pages are rendered and checked for bounds, overlap and broken destinations.
The dated audit receipt is `webmaster-remediation-verification.json` beside the
PDF; it supersedes earlier presentation receipts for the current export.

The isolated release audit passes all 325 focused export, guidance, canary and
unified-finding tests, along with web typecheck and `git diff --check`. The
separate legacy canonical-copy suite has 11 unresolved wording/confidence
assertion failures, reproduced against the unchanged pre-release source; it is
not claimed as passing. Assertions for the intentionally changed vendor-list
wording and tactical accessibility instructions are updated. No unrelated
rationale or confidence logic is changed.
Authenticated export returns 200; anonymous export remains 401. A local
development server memory-threshold restart interrupted one attempt; retry
after its normal restart succeeds. No memory/capacity or infrastructure
configuration is changed. No canary source publication or production rollout.

Expanded guidance adds approximately 9,694 bytes of unified action text per
representative report. Assuming two retained copies at 100,000 scans/month,
the estimated incremental storage is 1.94 GB, below $0.50/month. This is within
the owner's below-$1 pre-approval and was disclosed before release. No new scan,
browser lane, model call, retention period, background job or capacity is
introduced.
