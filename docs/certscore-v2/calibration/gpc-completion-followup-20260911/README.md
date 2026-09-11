# GPC completion follow-up — September 11, 2026

Local California-egress calibration only. No deployment, production integration,
scoring change or historical-record upgrade is included.

## Scope and completion definition

This pass follows the [earlier completion calibration](../gpc-completion-20260911/README.md).
The target remains strictly greater than 95% completion of bounded main-document
and retained-HTTP observation, with a **95% Wilson lower confidence bound above 95%**.
This follow-up preregisters **at least 200 representative observations**.

Completion requires actual main-document Sec-GPC delivery, actual main-navigator
readback, verified document/session/source binding, a terminal semantic probe and
a complete, no-drop retained request window. Unsupported or absent GPP APIs can
complete the observation while sale/sharing state remains unknown. Unready or
malformed responses, incomplete request proof and unverifiable sources fail closed.

This is not the percentage of sites honoring GPC, a legal-compliance measure or an
independently measured false-positive/false-negative rate. Readable sale/sharing
state, full-context delivery, acknowledgments and paired comparisons remain separate
facets. Luna review is model-assisted review, not independent human ground truth.

## Implementation

- Added bounded typed request diagnostics using the existing local GPC CDP session:
  fixed failure and blocked-reason codes, hashed request identity, timing basis,
  delivery readback and explicit ambiguous/unbound candidate descriptions.
- Diagnostic correlation cannot populate a missing header or upgrade completion.
  Redirect-chain extra-info remains ambiguous; configured injection never substitutes
  for observed delivery. Caps and overflow counters bound retained metadata.
- GPP adapter v4 supports the canonical array `GpcSegmentType: 1` representation
  alongside the legacy marker. Both markers must agree if present. Invalid values
  and unknown/malformed state remain limited. Fixed diagnostic codes distinguish
  API absence, readiness, inventory, fields and marker failures without raw GPP data.
- The local runner validates the actual canonical file and saves its original
  checksum pointer before optional session handling. Blocked/no-session outcomes
  now retain original access evidence. Exclusive creation prevents audit-time
  replacement; historical missing pointers are not reconstructed.

No additional browser, action, model call, polling interval, retry, timeout or tail
wait was added. Local opt-in remains unavailable through public/Lambda dispatch.
Existing production GPC v1/v2, score policy and canonical publication are unchanged.

## Sampling and contact controls

The source is the September 8–11 production cohort: 888 terminal non-canary scans
across 867 domains, already excluding 225 ErgoVeritas scans. No owned canary enters
these statistics. The source pool contains completed eligible HTTPS targets; this
is a source-cohort estimate, not all terminal production scans or the internet.

Six previously failing targets were selected for diagnosis and excluded from the
fresh acceptance selection. They remain a separately disclosed stress set. After
one six-target diagnostic run, four received one post-fix verification; there are
no further retries. These ten diagnostic contacts are not pooled into acceptance.

A depleted disjoint pool would have almost eliminated historically CMP-observed
sites, so it was rejected before acceptance contact. The final design permits
prior-domain overlap and preserves the source composition: **57 historically
CMP-observed and 203 not-observed targets**. Historical GPC results were not a
selection feature. This is a fresh observation cohort, not a domain-disjoint holdout.
Comparison with the earlier 50/50 CMP-stratified cohort is not causal evidence of
an error-rate reduction.

Canonical central history was freshly exported for the complete 837-target pool in
three disjoint shards. The canonical selector retained hard holds, excluded 69 held
targets from that pool and applied only the explicitly authorized cooldown waiver.
It selected and deterministically interleaved one fixed **260-target** cohort before
contact. Every selected result is retained; no replacements or adaptive batches.

Targets, source revision/file hashes, selection hashes and fresh San Jose,
California, US egress proof were frozen before the run. Requests used the existing
AWS California proxy from localhost. One-off manifests and reviewed manual ledgers
are audit records, not additions to the recurring 51-target registry. Ledger
`completed` describes the scanner contact outcome; it does not assert GPC completion.

## Known-case result

**None of the six known failures is established as resolved.**

| Case | Retained reason | Result |
| --- | --- | --- |
| Xpel | GPP signal not ready; applicable sections 2/7, section list 7 | Limited |
| imgsmail | GPP signal not ready; applicable section 0, section list 2 | Limited |
| Game8 | Invalid GPC subsection marker, still invalid with adapter v4 | Limited |
| 360yield | Two requests lack retained header proof; failed CDP candidates have no extra-info | Limited |
| sberbank-tele | Two request events lack retained header proof; candidate identity may be ambiguous | Limited |
| HugeDomains | Aborted stylesheet request; redirect-chain extra-info cannot be assigned safely | Limited |

The first diagnostic run completed 0/6. Post-fix verification completed 0/4.
Xpel/imgsmail were not recontacted after their diagnostic result. These limits are
not evidence that a site received a request without GPC or failed an opt-out.
The format support is fixture-verified but did not fix Game8's live invalid marker.
The post-fix four-target verification predates the final diagnostic-only
blocked-reason field; absent metadata must not be filled from later observations.

## Verification and tradeoffs

The final source passed **127 focused tests**, contracts build and scan-core
typecheck. Tests cover actual browser readback, missing/zero timing, redirect and
extra-info ambiguity, out-of-order events, bounded overflow, late immutability,
canonical GPP array/flat forms, malformed/conflicting fields and original-pointer
retention on a real blocked/no-session fixture. `preflight:fast` passed; the final
small diagnostic-enum additions were covered by the subsequent focused suite and
typecheck. Luna's final read-only code audit found no false-completion or production
exposure blocker.

Existing timeouts do not prove zero overhead. The sidecar and event-listener work
have bounded CPU/metadata cost. A ten-pair alternating static localhost fixture,
after one warmup pair, measures the enabled prototype versus disabled capture;
the public calibration was concurrently running on this host. Median added time was
**2.46 ms**, with a sample p95 of **34.00 ms**. These are not production latency
estimates; ten static pairs do not characterize heavy pages or Lambda behavior.

Incremental recurring production cost is **$0/month at 100,000 scans** because the
prototype remains disabled in production. One-off existing-proxy traffic and AWS
contact-ledger jobs are estimated below $1 total. No capacity or paid model API
calls were added. Future production integration requires a measured cost estimate
and applicable approval.

## Audit method

`artifacts/gpc-completion-followup-20260911/audit-acceptance.ts` checks all 260 frozen
targets and 14 implementation hashes, original pointer size/SHA/URI, schemas,
canonical access classification and producer-owned session/source binding. It
replays each full assessment and reconstructs the gate row, rejecting disagreements.
Intact pointer pairs are counted separately from source/document-bound sessions;
a valid file hash cannot rescue an invalid final-document binding. The six known
diagnostic records and four follow-up records are independently replayed and hashed,
with exact URL exclusion from the acceptance denominator enforced.
A missing original pointer is never repaired with a new expected checksum.

The audit applies the preregistered **minimum 200**; the runner's generic incremental
`CompletionGate.json` uses its default minimum 100 and is not the final acceptance
verdict. Unknown access and unverifiable sources remain denominator failures. Only
originally retained, verified canonical no-go records leave the representative-page
denominator; all submitted targets are also reported. The fixed cohort is audited
only after every target terminates, regardless of interim rates.

## Final outcome

**The strict target is not achieved.** The measured completion rate is above 95%,
but the 95% Wilson lower bound is 93.1%, below the required 95%. The fixed run
finished all 260 targets; it was not extended or selectively stopped.

| View | Completed / denominator | Rate | 95% Wilson interval |
| --- | ---: | ---: | ---: |
| Representative pages, final gate | 214 / 222 | **96.4%** | **93.1–98.2%** |
| All submitted targets | 214 / 260 | 82.3% | Includes 38 verified non-representative outcomes |
| Historically CMP-observed stratum | 55 / 57 | 96.5% | 88.1–99.0% |
| Historically CMP-not-observed stratum | 159 / 165 | 96.4% | 92.3–98.3% |

The representative completion-failure rate is **8/222 = 3.6%**. Both historical
CMP strata track similarly in this sample. All 38 non-representative outcomes were
in the not-observed source stratum; no unknown-access row was excluded. The known
six diagnostic failures remain separate and unresolved; this acceptance sample
does not erase them or establish an internet-wide reliability rate.

Every one of the **260 original canonical pointers verified**. There were 254
original session/pointer pairs and six no-session outcomes; all six retained their
original canonical no-go proof. All 260 assessments replayed identically and all
14 frozen implementation hashes matched. Of the 254 intact file pairs, 252 also
passed source/session binding; one representative and one non-representative pair
remained unbound. Neither file integrity nor another lane's navigator readback was
used to upgrade them. All 214 counted completions have original, verified evidence.

The pointer-retention fix therefore passed a live check, including no-session
outcomes. No old pointer was repaired. The earlier conservative 92.3% and this
96.4% are not a measured causal improvement: original-pointer coverage and cohort
composition differ, and the previously known six runtime failures were not resolved.

Separate facets among 222 representative pages:

- 14 terminal supported GPP observations, with **12 fully known sale/sharing states**.
- 205 API-unavailable, one unsupported, one not-ready and one unbound/incomplete
  semantic result. API absence does not establish that an opt-out was honored.
- 127/222 had independent full-context delivery proof. Main-document completion
  does not upgrade other frames or workers.
- No registered live-status acknowledgment was observed; acknowledgment capture
  was complete on 213 pages. Missing acknowledgment is not a failure to honor GPC.
- Session packets on representative pages contain 34,436 request rows, including
  failed/unbound packets; 42 used full-header readback but still lacked GPC proof.
  No readback-recovery success is claimed.

Retained local sidecars totaled **8,789,962 bytes** across 254 packets: median
24,880 bytes, p95 107,260 bytes and maximum 209,740 bytes. The compact request
**diagnostics alone** totaled 69,980 bytes: median 147 bytes, p95 148 bytes and
maximum 28,088 bytes. These are local artifacts, not production retention.
Capture-window median was 4,169 ms and p95 9,568 ms; window duration is not added
latency. Exact records and hashes are in `ResultsSummary.json`.

## Remaining failures and next focus

| First broken evidence stage | Cases | Share of eight failures | Interpretation |
| --- | ---: | ---: | --- |
| Browser-blocked request lacks retained delivery proof | 5 | **62.5%** | Zignature has mixed-content candidates; admissions.nic.in, alidns, Discord and IANA have CSP-blocked candidates |
| Aborted request lacks per-hop delivery proof | 1 | 12.5% | Cloudinary; an aborted request must not be assumed unsent |
| Terminal CMP readiness | 1 | 12.5% | AdRoll remains not loaded/not ready |
| Terminal document binding | 1 | 12.5% | Trustpilot retained hashes, but final-document proof failed |

**Highest priority: a canonical request-lifecycle evidence contract.** Distinguish
actual transmitted requests from requests conclusively blocked before transmission,
using browser-owned request identity, redirect-hop identity and explicit terminal
outcomes. Preserve every request fact; do not discard failures or treat URL/timing
correlation as authoritative identity. Only verified pre-transmission blocking could
justify a separate completed observation of that outcome. Missing identity,
ambiguous redirects, actual missing headers and unknown abort timing must remain
limited. Version the contract and assessor rather than silently changing old rows.

If all five blocked-resource cases gained sufficient proof, the upper bound in this
same sample would be **219/222 = 98.6%**, removing at most 62.5% of current failures.
That is an opportunity estimate, **not an implemented or verified recovery**. Fresh
validation on another frozen cohort would still be required. This approach should
reuse existing protocol events and deadlines; its CPU/metadata cost must be measured
before production enablement. No added wait or public retry is recommended.

Next, retain bounded loader/commit diagnostics for terminal-document failures and
per-hop actual delivery evidence for aborted requests. A navigator value from an
earlier document is insufficient. Keep unready/malformed GPP state limited within
the existing window; do not replace unknown state with an inferred decision or add
long waits to obtain a better rate.

The temporary SSH ingress was removed, independently verified absent, and local
port 18129 was confirmed closed. No proxy capacity was added. Nothing was deployed.

All **270 public contacts** were persisted through the canonical idempotent ledger:
six under `gpc-followup-diag-20260911`, four under `gpc-followup-verify-20260911`,
and 260 under `gpc-followup-acceptance-20260911`. The reviewed acceptance manual
ledger has 222 cooldown and 38 blocked entries. Existing hard holds were respected.
