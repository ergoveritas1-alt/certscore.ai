# GPC completion calibration — September 10–11, 2026

Local-only implementation and California-egress validation. No deployment or
production-policy change is included. The prototype is unavailable through public
or Lambda dispatch and has no production score effect.

## Measurement

The target is strictly greater than 95% completion of a bounded main-document and
retained-HTTP observation on representative pages. Completion requires actual
`Sec-GPC: 1` request evidence, actual main-navigator readback, a same-document
terminal semantic probe, an intact bounded request window, and verified retained
source and session hashes. Unsupported/absent GPP APIs are completed observations
with unknown registration. Malformed or unready APIs remain failures.

This is not the percentage of websites honoring GPC, a compliance rate, or a
measured false-positive/false-negative rate. Full frame/worker coverage, readable
sale/sharing state, acknowledgment and paired response assessment remain separate.
The existing production GPC v1/v2 policy and historical records are unchanged.

## Sampling and execution

The source is the previously reviewed September 8–11 production cohort: 888 terminal
non-canary scans across 867 domains. Its 225 ErgoVeritas scans had already been
excluded. No ErgoVeritas or owned canary contributes to any rate here.

Luna prepared disjoint one-off inventories, each balanced between 60 historically
CMP-observed and 60 CMP-not-observed targets. This deliberately exercises consent
surfaces; it is not a prevalence-weighted estimate for all production traffic or
the internet. Historical completion was an inventory eligibility criterion; fresh
failures were retained in the new results.

The first 120-target cohort was diagnostic and exposed defects that were fixed
before freezing the final implementation. It is reported separately, never pooled
with the final implementation. The next two inventories used identical frozen
source hashes. Existing hard holds removed two targets from each before contact,
leaving 118 per batch. The last extension was fixed before completion of the second
batch; every result from both is included. There were no retries, outcome-based
replacements or additional adaptive batches.

Every public batch used successful canonical central contact-history export,
canonical selection, the owner's recorded cooldown waiver, and unchanged hard
holds. Contact persistence uses idempotent run keys. The adjacent manifests and
reviewed manual ledgers are one-off audit records, not additions to the recurring
51-target registry.

Scans ran locally through the existing AWS California proxy, with egress verified
as San Jose, California, US, before each batch. Locale/timezone matched the intended
California run. No added browser run, action, model call or timeout increase was
used. A temporary narrow SSH ingress/tunnel was used only for this calibration.

## Implemented mechanisms

- A bounded passive GPP listener observes readiness during existing page work;
  terminal readback occurs at the end of that work, within its remaining budget.
- Validated US National and California subsection arrays and documented flat CMP
  objects retain explicit sale/sharing fields. Unknown and contradictory formats
  fail closed.
- CDP loader identity binds actual main-document delivery to semantic readback.
  Same-document URL changes preserve loader identity without fabricating another
  request.
- A producer-owned canonical session checksum preserves independently verified
  main-document proof when the older all-frame snapshot is unavailable.
- Missing synchronous request-header snapshots can use the same request's actual
  `allHeaders()` readback while other work proceeds. Pending or failed readback is
  limited; no configured value or extra wait substitutes for proof.
- Acknowledgment-search coverage is independent of semantic-probe coverage.
  Truncated acknowledgment searches never become an observed absence.

## Verification and tradeoffs

The final frozen source passed 141 focused tests, contracts build, scan-core
typecheck, and `preflight:fast`. Coverage includes real browser fixtures, source
tampering, session/document mismatch, late CMP readiness, storage/state hash
consistency, header readback and cancellation, and unchanged production assessment
boundaries. Luna's final read-only code audit found no actionable false-completion
or production-regression blockers; that is model-assisted review, not independent
human ground truth.

Ten alternating local fixture pairs, after a warmup pair, measured a median added
time of 4.64 ms and sample p95 of 19.07 ms. These fixture measurements do not prove
production latency neutrality. Existing timeouts are unchanged. The finalization
and retained metadata have a bounded cost that must be measured in the production
topology before enablement.

Current incremental recurring production cost is $0/month at 100,000 scans because
the prototype is disabled in production. One-off AWS contact-ledger jobs and
existing-proxy traffic are estimated below $1 total; no new capacity or paid model
calls were added. Future production integration requires a measured cost estimate
and the applicable owner approval.

## Evidence and reproducibility

Local source manifests, egress proof, canonical bundles, session packets, original
checksum pointers and per-row results are retained under
`artifacts/gpc-completion-20260911/`. `Manifest.json` freezes the source hashes and
target order before each batch. `CompletionRows.json` preserves each denominator
decision. The audit replays the assessor against original retained bytes and
pointers, compares its full result with the original assessment, and rejects
source drift or repeated normalized hosts.

Some early access failures returned no session, so the local runner did not save
their original canonical checksum pointer. Their capture-time canonical access
classification is retained, but a new checksum must not be invented as original
proof. The report therefore includes a conservative sensitivity calculation that
keeps these rows as failures. They cannot contribute a successful observation.

The predeclared statistical gate requires at least 100 representative observations,
a point estimate above 95%, and a 95% Wilson lower bound above 95%. Report both the
representative-page denominator and all submitted targets. A point estimate alone
does not establish that stronger gate or production readiness.

Final counts, exact source hashes, audit outcomes and remaining limits are recorded
in `ResultsSummary.json` and the outcome section below after the fixed run ends.

## Remaining investigation priorities

Selective request delivery needs better diagnostics before an injection change.
For example, 360yield retained two main-frame XHR/script requests without GPC even
after actual full-header readback. Other affected sites retained event identities
and URL hashes but compacted the corresponding canonical request detail. A future
bounded CDP request-header observation, correlated to those event identities,
could distinguish browser delivery from Playwright readback omissions. It must
remain observed evidence; configured headers are not a substitute. This additional
diagnostic is not implemented or counted as a fix here.

Still-unready and malformed GPP responses require separate treatment. Xpel and
imgsmail did not provide a ready terminal state. Game8 returned an inventory that
failed the existing section-field validator. Whitelisted bounded observations do
not contain enough original field detail to justify a new parser exception. These
remain limited; there is no retry, longer wait, unsupported-format guess or legal
conclusion.

After the frozen run and original-checksum audit, the local runner was fixed to
save the original canonical pointer even when no session is returned. Runtime and
assessor code are unchanged. This retention fix is not proof of a successful GPC
observation and did not repair or upgrade any old row.
Any future production proposal must also validate the enabled path in the actual
Lambda topology and integrate through typed retained evidence, persistence,
normalized concern, concern policy and unified projection.

## Final outcome

**The strict >95% evidence-backed acceptance target is not achieved.** The observed
point estimate cleared 95%, but its confidence bound did not; a retained-pointer
limitation further reduces the conservative result.

| Population / view | Completed | Rate | 95% Wilson interval |
| --- | ---: | ---: | ---: |
| First diagnostic version, separate cohort | 93/104 | 89.4% | Not used for final gate |
| Frozen implementation, batch 02 | 100/101 | 99.0% | 94.6–99.8% |
| Frozen implementation, batch 03 | 91/98 | 92.9% | See retained gate |
| Combined, capture-time canonical access exclusions | 191/199 | 96.0% | 92.3–97.9% |
| Conservative original-pointer audit | 191/207 | 92.3% | 87.8–95.2% |
| All submitted targets | 191/236 | 80.9% | Access failures included |

The combined 199 denominator includes 197 representative pages and two unknown
access outcomes; unknowns remain failures. Thirty-seven capture-time canonical
no-go outcomes are excluded only from that view. Eight of those no-go records lack
their original canonical checksum pointer and therefore return to the conservative
denominator. Two already-included unknowns also lack pointers. No no-go or unknown
outcome contributes a completion, and no original pointer was reconstructed.

There were 226 original canonical/session pairs. Every pair replayed identically
against the original bytes and checksums; every counted completion had its original
pair. All 13 frozen implementation-file hashes matched across the two batches and
the working tree at audit time. The only subsequent executable change is the local
runner's unconditional original-pointer retention, recorded separately in
`ResultsSummary.json`; scanner runtime, contracts and assessor stayed frozen.

Separate evidence facets among the 197 representative pages:

- 20 terminal supported GPP observations; **18 fully known sale/sharing states**.
- 173 API-unavailable, one unsupported, two not-ready and one invalid response.
- No registered live-status acknowledgment was observed; acknowledgment capture
  completed on 184 pages. Missing acknowledgment is not an opt-out failure.
- 103/199 had independently verified full-context delivery. Main-document
  completion does not upgrade the other frame/worker results.
- Thirteen completed pages used independent main-document binding without the
  older all-frame snapshot checksum.
- Five requests on three pages lacked retained GPC after full-header readback;
  all three stayed failures. No actual header-recovery success was claimed.

The eight failures in the 199 view comprise three request-delivery coverage
failures, two not-ready CMPs, one invalid CMP response and two unknown-access
outcomes. The difference between batches is substantial: the second batch alone
would have overstated reliability. Both remain in the aggregate.

Retained sidecars totaled 7,154,830 bytes across 226 packets: median 24,631 bytes,
p95 81,408 bytes, maximum 218,282 bytes. These are local diagnostic sidecars, not
new production retention. Bounded capture-window median was 4,313 ms and p95
9,042 ms; those figures are observation durations, not incremental latency.

Public contacts were persisted with run keys `gpc-heldout-20260911`,
`gpc-heldout2-20260911` and `gpc-heldout3-20260911`. The temporary SSH tunnel was
closed and its exact temporary security-group rule was independently confirmed
absent. Existing proxy infrastructure remains unchanged. Nothing was deployed.
