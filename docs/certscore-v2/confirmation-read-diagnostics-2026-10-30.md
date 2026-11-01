# CertScore.ai confirmation-read diagnostics — October 30, 2026

Choice confirmation is the next higher-priority investigation after the retained
first-layer and policy-content repairs. Existing API/Pulse confirmation output
separates execution, initial registration, terminal decision, receipt availability
and category reasons. It still drops the retained confirmation polling counts
and terminal-read lifecycle state. Empty terminal reasons or an unavailable
terminal decision cannot distinguish a read that never started from an
unverified, in-progress or discarded read. This is a diagnostic projection gap,
not evidence that the site failed to register a choice.

The shared diagnostic summarizer now preserves the original diagnostics version,
initial/terminal pass counts and terminal state under
`consent_confirmation_read_diagnostics.v1`. It validates the existing typed
diagnostics before copying this bounded metadata. Missing or invalid diagnostics
remain null; retained zero remains zero. Counts are polling passes, not SDK calls,
elapsed time or capture duration. The retained counters saturate at 10,000, which
is explicitly exported as `passCountLimit`; a count at that limit is a lower bound.
No read state is reconstructed from counts, reasons, receipt observations or
decision proof, even if those fields appear inconsistent.

Explicit `consent_action_stages.v2` supplies this diagnostic object to the public
confirmation writer. Legacy default stage v1 output remains unchanged. The
existing `choice_confirmation_summary.v2` gains optional, nullable
`readDiagnostics`; earlier v2 output remains readable. V1 summaries reject the
new field and retain their historical meaning. API contracts and OpenAPI bound
and document the field; Pulse consumes the same canonical public writer and
advances its local projection version to `pulse-public-v9`. The enclosing
verified packet hash binds the diagnostics to the existing action projection.
No raw receipt values, names, configuration, payloads or identifiers are added.
The confirmation schema has a named type boundary to keep repeated API/MCP
declaration generation bounded; its strict runtime validator is unchanged.

The terminal diagnostic states are `not_started`, `started`, `unverified`,
`verified` and `discarded`. They describe the recorder's operational state only.
In particular, diagnostic `verified` cannot substitute for the source-, target-
and time-bound semantic terminal witness. A discarded or unstarted read does
not identify its cause. Initial registration, terminal decision verification,
notification acknowledgment, observation completion, category scope, findings
and scoring remain independent and unchanged. No extra polling, SDK call, wait,
capture allowance, retry, new action or decoder is introduced.

The bounded retained replay preserves separate cohorts and compares the frozen
pre-change stage engine and public writer with the candidate:

- Twenty-six owned receipt fixtures retain every legacy stage and existing public
  field. Their diagnostic read states are 20 unverified, two verified and four
  not started. These are local fixtures, not production confirmation gains.
- Eight original production/category packets are reverified by SHA and size.
  Seven retain not-started and one unverified diagnostic reads. No existing
  semantic decision or other public field changes.
- Two original terminal-confirmation regression packets are reverified by SHA
  and size. They lack read diagnostics, so the new field stays null while their
  independently verified terminal decisions remain verified.
- Twelve previously acquired original bundles are reverified by SHA and size.
  Their 22 embedded action packets contain 16 not-started and six unverified read
  diagnostics. This inventory checks embedded diagnostics only; it does not
  invent standalone packet hashes or promote them to public projections.

These cohorts may overlap and are not pooled. They do not recalculate the original
October 29 190-report sample or its 26/39 Accept and 14/23 Reject figures;
October 30's partial day remains separate. The maximum new serialized diagnostic
member in the public replay is 307 bytes. Missing original inputs remain
unavailable. No production confirmation-rate improvement is claimed.

Focused tests cover all three retained diagnostic versions, each lifecycle state,
recorded zero versus missing, capped/invalid counts, invalid/private fields,
unchanged stage v1, semantic-proof separation, API serialization, OpenAPI and
retained Pulse fixtures. Run `pnpm test:retained-audit-fixes` for the combined
43-file focused gate and five typechecks. Frozen source, replay, cost preflight
and immutable log-hash/exit-code validation receipts accompany this work.

Local paid usage is $0. Estimated future incremental bounded interpretation and
response metadata cost is below $0.05/month at 100,000 scans, with unchanged
capture and retention, disclosed before implementation. Deployment remains
separate. No public visit, rescan, cloud query/task, model/API call, privacy action,
flag, service, capacity, paid retention, production budget or historical rewrite
occurs. Existing CMP rollout holds, dashboard snapshots/latest, production audit
checkpoint, issues/release state and model-transition history remain unchanged.
The 36 pinned audit-tool sources are verified without repinning; adoption of the
new diagnostic family remains subject to source/contract review. Schedule, model,
reasoning, project, budget and unique invocation accounting stay unchanged, with
zero scheduled invocations added by this manual work.

The next runtime investigation should use these distinctions to select retained
control/readiness or receipt blockers with original proof. A not-started count
alone does not justify changing capture budgets or retrying a public action.
