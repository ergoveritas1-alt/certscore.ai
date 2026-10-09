# Local A/R checkpoint candidate paired benchmark

October 9, 2026. Owner-authorized localhost execution. No deployment, source-code change, identity change, extra lane, model call, timeout extension, form submission or automatic retry. Contact bookkeeping uses the approved AWS ECS database boundary; the browser scans run locally.

## Decision

The new **ten-pair diagnostic sample passes** its configured timing and control-parity checks: median candidate-minus-reference visit duration **−126ms**, nearest-rank p95/max **+529ms**, versus limits of +500ms median and +2000ms p95. Exact observed A/R/O states match on **10/10 pairs**. All **20 canonical evidence bundles** and **40 action packets** validate.

Luna approved composition and reviewed retained page visuals, typed controls and result interpretation. This is model-assisted evidence review, not human-adjudicated population accuracy. No baseline was promoted. The previous nine-pair +6407ms p95 remains a failed historical result; the new sample does not retroactively repair it or establish the cause of those outliers. No release preflight or production verification is claimed, and deployment remains on hold.

## Protocol and source integrity

Canonical registry validation, a fresh central all-channel contact export, repository contact-hold checks and canonical role-stratified target selection passed before contact. The selector used the owner's existing explicit cooldown waiver; blocked/do-not-calibrate states and repository holds remained enforced. Target and the prohibited platform target were excluded. Ten sites were selected without hand-picking a favorable result; three overlap the earlier rotation.

Five pairs are reference-first and five candidate-first, with at most two different domains concurrent. Every source/site visit starts independent fresh consent-proof, Accept and Reject sessions. ConsentCheckBot HTTP identity, native Chromium navigator, en-IE/Europe-Dublin, local California egress and no proxy match the earlier protocol. Action search is 13s, result budget 30s, Accept observation 3s, Reject observation 8s, and Reject dispatch delay 500ms. No failed/no-go visit was retried; none was identified in this sample.

The reference remains the frozen **pre-retention working source**, not deployed code: `artifacts/ar-onetrust-confirmation-20261009/candidate`, 1003 files, original aggregate SHA-256 `139912b3e8639a982ade09b9e8177f0550f49d48df2b63ada73163099e1245cb`. Every retained file hash verified before and after the run.

The current combined candidate is frozen under `artifacts/ar-checkpoint-paired-20261009/candidate`: 1008 files, SHA-256 `b01833fcc4a4b7fbf4f1bf67f9ea01091ff9ff87d70cad94476432e7bf36b5f2`, using SHA-256 of the compact sorted relative-path/hash JSON map. All candidate files also match the working package sources before and after the run. The delta from the prior failed candidate is recorded in `source-delta-from-prior-candidate.json`: intended passive challenge, recapture and semantic checkpoint contracts/scanner/tests, plus omitted `.DS_Store` metadata. Neither earlier snapshot was changed. This comparison measures the accumulated candidate changes and different live streams; it cannot isolate the checkpoint fix's causal effect.

Timing is whole three-session child-process visit wall time. It is not production Lambda latency, consent-module time, end-to-end report readiness, or a sum of overlapping lane durations. At ten pairs, nearest-rank p95 is the maximum.

| Site | Candidate minus reference |
| --- | ---: |
| USA.gov | −70ms |
| Spotify | −204ms |
| Hotjar | +62ms |
| Best Buy | +529ms |
| MSNBC | −126ms |
| Notion | −550ms |
| Healthline | −16ms |
| Progressive | −698ms |
| Caltech | −177ms |
| Mozilla | +296ms |

Attempted sites: 10; completed paired visits: 20; usable pairs: 10; excluded pairs: 0; isolated browser contacts: 60.

## Controls, actions and retained evidence

Notion alone exposed actionable first-layer Accept and Reject controls. Each version completed **one Accept click and one Reject click**, confirmed both decisions and retained completed observation proof (`succeeded_with_confirmation`). There were no completed-but-unconfirmed clicks. Each other source/site produced action packets without attempting an A/R click. Those nine pairs do not count as action successes. This is a small live action sample, supported separately by the existing deterministic/owned-canary evidence; it does not establish a fleet success rate.

Notion's visuals show A/R/O; Hotjar's redirected Contentsquare page shows Cookie settings (Options only). The remaining eight sites show no first-layer A/R/O in their retained visits. Spotify, Healthline and MSNBC retain separate privacy entry points; those are not reclassified as Accept or Reject. No access challenge or missed no-go was found during retained review.

Preserve these completeness facts:

- Best Buy's module is partial in both versions, while structured inventory is complete-empty and normal main-page screenshots/text are retained. Its default viewport image is a 1×1 placeholder; the usable visual proof is the loader-bound reference packet-recovery screenshot and candidate settled screenshot. Placeholder bytes are never counted as usable visual proof.
- MSNBC's candidate inventory is partial while reference inventory is complete-with-controls. Both retain the same visible non-A/R/O privacy-choice control. Candidate evidence contains the new completed-channel and partial-fallback basis markers. All four 750ms semantic reads still time out, so retention did not remove those waits. Candidate visit duration is 126ms shorter and passive module duration 370ms shorter in this pair; neither number establishes causality.
- Notion inventory is partial in both versions, with its three positively observed controls preserved and visually supported.

The analysis script initially counted only the enum `succeeded`, omitting `succeeded_with_confirmation`. This diagnostic counting error was corrected in this run's analysis scripts before the final metrics; production code, packets and projection contracts were not changed.

## Bookkeeping and artifacts

All 60 isolated contacts were centrally persisted with idempotent run key `ar-checkpoint-paired-20261009`. The generated repository ledger candidate was reviewed: only the ten selected target entries and ledger timestamp change; every other record is preserved. Registry validation passed again after the run. This record and the reviewed canonical ledger are committed separately from the existing dirty implementation work, as required by the calibration protocol.

Artifacts are under `artifacts/ar-checkpoint-paired-20261009/`: source manifests/integrity checks, selection and ledger evidence, `summary.json`, `metrics.json`, `timing-and-parity.json`, packet hashes, canonical bundle/image hashes, original snapshots, scripts and logs. No repeated scan or AWS canary was used.

No recurring cost change was introduced by this benchmark. Estimated one-time AWS export/persistence bookkeeping is **under $0.50**, disclosed before proceeding. Browser execution is localhost. The candidate's previously disclosed metadata estimate remains below $0.01/month at 100,000 scans for checkpoint retention; this benchmark does not measure fleet costs.

Remaining work: full release readiness and owned end-to-end checks before deployment; preserve the unresolved cause of the earlier Fandango/MSNBC pairwise outliers and the limited live action denominator. Do not spend another tuning cycle claiming broad speed gains from this sample.
