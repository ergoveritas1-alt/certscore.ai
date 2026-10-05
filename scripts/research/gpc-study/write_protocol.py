from pathlib import Path
import json,csv,statistics
R=Path('artifacts/research/gpc-controlled-study-2026');s=json.loads((R/'calibration_statistics.json').read_text());m=json.loads((R/'sample_manifest.json').read_text())
def table(keys,rows):return '\n'.join(['| '+' | '.join(keys)+' |','| '+' | '.join(['---']*len(keys))+' |']+['| '+' | '.join(str(v) for v in r)+' |' for r in rows])
def write(name,text):(R/name).write_text(text.strip()+'\n')
write('prod_calibration.md',f'''# Production calibration for the controlled GPC study

This calibration uses the frozen production pilot, not the future sample: September 28–30, 2026, scanner cef8e729; 922 external California targets, 919 completed executions and 1,838 original worker artifacts verified against retained hashes/sizes. Subsequent production releases are not silently mixed in. The larger week's 3,223 execution inventory remains context; downloading older heterogeneous captures would not create the missing long-window completeness contracts.

## Activity timing and ascertainment

Complete post-commit request evidence is available at 250/500/1,000 ms for **355/343/317 baseline visits** and **388/374/352 GPC visits**, respectively. **Zero visits certify complete 2-, 5- or 10-second request sets.** The maximum independently certified horizon in these artifacts is one second. Different horizon denominators are selected by retention/access; they are not a duration experiment. `calibration_activity.csv` supplies cumulative counts and nearest-rank median/p75/p90/p95/p99 for each lane/horizon, with exact n, for total/third-party requests, tracker services/requests, advertising/marketing and analytics/replay. These are request attempts, not successful transmissions.

Requests outside certified windows remain retained observations, not complete later censuses. The earlier investigation found 50 pairs with no tracker services in the short interval but tracker identities in a longer retained inventory; definitions and eligibility differ. This supports avoiding early-zero conclusions but **does not quantify the incremental yield of a complete ten-second window**. Keep ten seconds as a prespecified research choice and measure nested endpoints from the same visit; production does not provide evidence to shorten it.

Cookie events represent repeated Set-Cookie/document-cookie write observations, not necessarily newly created unique cookies. The event counts in the calibration table are lower bounds and inherit no network-completeness guarantee. Unique creations cannot be certified at these horizons. Storage snapshots are asynchronous; a continuous storage-write stream is not retained in these passive artifacts, so cumulative storage activity is unavailable rather than zero.

## Timing distributions

Milliseconds; nearest-rank quantiles, each denominator reported separately. These durations overlap and must not be summed into total latency.

{table(['Lane','Quantity','n','Median','p75','p90','p95','p99'],[[x['lane'],x['metric_ms'],x['n'],x['median'],x['p75'],x['p90'],x['p95'],x['p99']] for x in s['timings']])}

Worker completion is its recorded completedAt-startedAt. Commit is relative to worker start; semantic and storage/cookie times are relative to retained commit. Representative-page determination is an outcome without a separately trustworthy timestamp; browser startup, navigation, semantic operation duration, and outcome determination must not be relabeled interchangeably. Coordinator invocation/tail timing is present only in the 23 previously retrieved manifests; the full worker cohort supports the table, not a full-cohort invocation-overhead estimate. Runtime capture freeze after commit is not proof that every event through that point was retained.

Recommend **10 s post-commit**, **30 s navigation cap**, **50 s total visit cap** (60 s worker envelope), **60 s minimum between paired visits**, **15 min minimum between blocks**, **one active visit per domain**, and **two total active research visits** initially. Spacing is a conservative operational design choice; production contains no repeated external sites that validate an ideal interval. No quiet-based early finish, reset, alternate URL, retry or consent click is introduced.

## Failure and rank sensitivity

Counts below overlap; denominator is all selected production submissions in the band. A failed comparison is not a negative GPC response. The production rank distribution is highly concentrated: 860/922 in ranks 10,001–100,000; other strata are too small for stable differences. Use these rates to plan attrition, not to adjust the new sample based on prior effects.

{table(['Rank band','n','Challenge','Denied','Navigation','Blank','Document mismatch','Request retention limit','Usable network pair'],[[x['rank_band'],x['n'],x['bot_challenge'],x['access_denied'],x['navigation_failed'],x['blank_or_unusable'],x['document_mismatch'],x['request_retention_limit'],x['network_pair_usable']] for x in s['rank_bands']])}

GPC semantic status: `{s['semantic_status']}`. Only ten terminal semantic probes were observed; two paired semantic comparisons passed. Raw signal inventories show worker-navigator limits on 135/919 visits in each condition, frame-read limits on 113/919 baseline and 105/919 GPC visits, and zero reported nonzero request-drop counters. Incomplete/hash-unverifiable retention is a separate issue and must not be mislabeled overflow. Detailed raw-derived coverage diagnostics accompany this calibration; unknown, overflow and incomplete inventories remain separate. Main-document delivery was verified in 828/922; strict comparison passed 107/922 and bounded comparison 264/922, union 269/922 (29.2%). A reasonable planning range for the new protocol is **25–60% usable pairs**, not a forecast; fixed windows may improve retention while standard UA and different sample composition change access, and stricter frame/worker requirements may reduce it. The pilot must update this operational estimate without changing outcomes or replacing sites.

## Baseline, browser, and user agent

Production installs navigator.globalPrivacyControl=false in baseline and true plus Sec-GPC: 1 in GPC. Fresh contexts prevent visitor-state reuse but not server/cache/order effects. Local native Playwright Chromium **145.0.7632.6 / Playwright 1.58.2** has no globalPrivacyControl property and sends no Sec-GPC. Injected false exposes a detectable property; enabled exposes true and sends the header. Window injection leaves WorkerNavigator unmodified; full-treatment coverage must fail closed when workers are encountered. Results are retained in `browser_probe_macos.json`. The final native Linux ARM64 research image uses **Chromium 154.0.8037.57**, also with no GPC property/header absent injection; `browser_probe_linux.json` verifies all three conditions and worker behavior locally on that exact binary. The study freezes this image rather than assuming the preliminary macOS browser is equivalent. The inspected production image actually contains Debian Chromium 151.0.7922.71, so bundled Playwright's Chromium number must not be substituted for the production executable.

Use **native GPC absence** as A: no header and no injected property. In a supporting browser, false also denotes no expressed preference, but that does not make injected false identical to unsupported-native absence. This follows the technical distinction in the [W3C GPC specification](https://www.w3.org/TR/gpc/) and [implementation guide](https://w3c.github.io/gpc/explainer.html); no legal inference is made. Keep a proposed 20-site three-condition sensitivity study separate (60 extra visits), because API-support detection is a real difference from the production pilot.

Primary UA is frozen ordinary Chromium Linux, matching the research browser's major version, with standard automation/headless operation retained. No stealth patches, CAPTCHA solving, access recovery, navigator.webdriver changes or challenge circumvention. The identified production bot encountered challenges on 100/922 and access denial on 51/922 across either lane. There is no randomized UA comparison, so the cause is unknown. Propose a separate 20-site UA sensitivity subset, four fresh visits/site (baseline/GPC under Chromium and bot UA, randomized blocks): 80 visits. These are optional and not mixed into the 4,200-visit primary/A-A run.

## Cost and provenance

See `cost_estimate.md` for formulas, caps and alternatives. Calibration reuses local original evidence, apart from a bounded read-only central contact-history query. No production setting, schema, scanner, feature or deployment is changed. Production scores and response labels are not research endpoints. The sample source is the public [Tranco V349N list](https://tranco-list.eu/list/V349N/1000000), generated September 29, 2026; [Tranco](https://tranco-list.eu/) provides immutable identifiers to support reproducibility.
''')
write('sampling_method.md',f'''# Frozen sampling and randomization

Source: Tranco **V349N**, generated September 29, 2026, aggregate August 31–September 29; [permanent reference](https://tranco-list.eu/list/V349N/1000000). Seed: `{m['seed']}`. Source top-million CSV SHA-256: `{m['sourceSha256']}`. The download of the full-list endpoint was interrupted only after more than two million complete ranks; the first 1,000,000 contiguous ranks were retained and verified individually. The source file is local and frozen; its completeness does not depend on the interrupted tail. This transport detail is retained rather than claiming a complete full-list download.

Normalize with frozen tldts/public suffix data, private suffixes enabled; retain the smallest rank per registrable domain. Exclude invalid or duplicate registrable domains **before** sampling ({m['excludedBeforeSelection']} rows), never using reachability or CertScore observations. The rank boundaries are `{m['edges']}`: first 1–1,000, then 19 approximately logarithmic bands to 1,000,000. Every band has at least 50 eligible domains. Sort candidates within each band by SHA-256(seed|sample|domain), choose 50; this deterministic pseudo-random priority rule is recorded in `freeze-sample.ts`. No outcome information enters selection. Distinct labels domain-separate each later randomization.

Sample URL: `https://<registrable-domain>/`, empty path/query/fragment, no credentials. No www/HTTP fallback, alternate path or failed-site replacement. Retain original/effective URLs and redirects internally. Cross-registrable-domain redirects and document drift limit paired interpretation; they remain in the intention-to-measure denominator. A ranking includes infrastructure/nonlanding domains; their failure is part of the design, not grounds for replacement.

For each block, independently shuffle each band's 50 sites using the block-specific hash label and assign 25 AB, 25 BA. Across 1,000 sites there are exactly 500 AB and 500 BA in each block. Generate visit IDs and all condition/order rows before collection. Select five A/A sites per band (100 total) by an independent label; each has a separate baseline/baseline pair. Select the 24-site validation pilot by a separate hash priority across all selected sites, not by effects. A 50-site blinded audit sample uses another seed label. Pilot and audit membership are not selected for successful capture.

The 24 pilot assignments include two active contact cooldowns: preserve them as not contacted, with no replacements. The within-study repeated visits are an explicitly planned experiment; pre-study blocked/do-not-contact states remain in force. All 1,000 selected sites remain in the final intention-to-measure denominator even if every visit fails. This is a rank-stratified public-frame sample, not a sample of production customers or all websites on the internet.

Unequal band populations imply unequal inclusion probabilities; sample_frame.csv records N_h and 50/N_h. Report band-stratified and design-weighted frame summaries separately from unweighted sample summaries. Attrition after selection is not cured by weights; no general-web prevalence inference is permitted.
''')
write('study_protocol.md','''# Controlled GPC protocol v1

Status: prespecified design; execution freeze requires matching image/config/source hashes and passing fixtures. No full study is authorized. Pilot evidence is validation only and never merged with confirmatory study observations.

## Design

1,000 frozen Tranco registrable domains × two independent paired blocks × two visits = 4,000 primary visits. An independently selected 100-domain A/A subset adds 200 visits. Condition A is uninjected native GPC absence; B is Sec-GPC: 1 plus the shared verified window-navigator injector. Every visit launches a fresh browser process and nonpersistent context. One exact requested URL per domain, no user interactions, no authentication, no forms, no clicks and no recovery navigation.

Order is balanced AB/BA per band and block. Minimum spacing is 60 seconds after the prior within-pair visit terminates; block 2 starts at least 15 minutes after block 1 terminates for that site. The A/A block follows the same minimum block spacing. Actual elapsed spacing is retained and deviations are flagged. At most one browser visit per domain and two active visits globally. All timing continues to apply after checkpoint resume.

## Fixed observations

Anchor post-commit time to the main-frame CDP loader's lifecycle init timestamp, converted through CDP monotonic/wall-time correspondence; retain loader, frame, URL hash, raw timestamp basis and receipt time. No inferred commit from DOM readiness or network quiet. If binding cannot be established, retain a failure. Start one continuous request capture before navigation. Retain nested half-open [commit, commit+h) windows at 1, 5 and 10 seconds in that same visit. Do not stop a successful visit early for quiet. Navigation limit 30 seconds, total browser visit 50 seconds, external worker timeout 60 seconds. Drift to another document invalidates the affected comparison; never reset the window to rescue it.

Snapshot browser-context cookies, per-frame local/session storage and semantic GPP state at the same three endpoints; preserve scheduled/start/end times and document identity. Endpoint scheduling lag >250 ms is an explicit limitation; snapshot duration and mid-read changes remain visible. Unknown/unreadable state is never zero/unchanged. Continuous storage writes, IndexedDB and cache state are not claimed complete by this version; unsupported coverage remains explicit. Cookie identities include name/domain/path/partition; values are hashed. Storage is keyed by origin/type/key hash with value hashes. Distinguish snapshots from actual newly created cookies/writes.

## Delivery and completeness

Read actual Sec-GPC request headers and navigator values, not just configured injection. Baseline must have neither header nor injected property; GPC must have header 1 and true readback. Keep frame counts, failed reads and worker inventory. Window init scripts do not establish worker-startup delivery: any encountered worker is a full-treatment limitation. No worker injection retrofit, stealth, browser-security bypass or condition-dependent retries.

Record every browser-observed HTTP attempt, timing, response/failure/completion, source/effective URL identities, safe endpoint, classification provenance and original request identity. Resolve classification using the canonical vendor resolver; preserve unresolved/ambiguous third-party traffic. Tracker services are vendor/product/purpose identities, not companies. Recompute aggregate windows and identity additions/removals offline from retained requests. Hard bounded caps (20,000 requests, 20 MiB observed page transfer per visit) create explicit overflow/coverage failure, not silently truncated complete data. Endpoint transport/worker/OOPIF completeness requires fixture/manual audit before launch; a passed internal hash alone does not prove browser capture completeness.

## Frozen runtime and egress

frozen_config.json records exact executable version, Playwright, user agent, viewport 1366×900, locale en-US, language en-US,en;q=0.9, timezone America/Los_Angeles, Linux architecture, immutable image digest, source Git SHA plus research bundle SHA, canonical resolver, PSL package/file hashes, protocol version, caps and timing. Browser binary mismatches abort. TLS errors are not ignored. The primary UA is one ordinary Chromium UA; retain navigator.webdriver and ordinary headless behavior. Standard public-network guards remain active in both conditions.

Use the existing AWS California proxy via an isolated research runtime; production function/code/environment is untouched. Retain egress identity and configuration; infrastructure region does not prove every website geolocates the visitor identically. No provisioned/reserved capacity. Recheck proxy/image parity before full launch. Proposed UA and false-baseline sensitivity subsets are separate, optional protocols, not automatically launched by primary commands.

## Restart, missingness and isolation

Append durable started/terminal checkpoints per unique visit ID. Terminal visits are never repeated. An interrupted/uncertain invocation is preserved as such and is not automatically replayed: a network timeout cannot establish that the remote browser never ran. Only an independently proven pre-dispatch infrastructure rejection may be retried once under a versioned attempt ID after an operator records proof; v1 defaults to no automatic retries. No outcome-based rescue or site replacement.

Internal raw artifacts, URLs, cookie/storage hashes, source pointers and contacts live under private/. Shared exports contain pseudonymous site/visit IDs, aggregate measurements, completeness flags and provenance. Store checksums before independent analysis; preserve all failures. No database report, production normalized concern, score or feature consumes research output. A methodological defect invalidates the pilot version; fixes require a new freeze and pilot run ID and discarding affected pilot as research evidence.
''')
write('preregistration.md','''# Prespecification v1 (local; not externally registered)

Question: What observable changes occur in tracking and privacy state when GPC is introduced under controlled repeated browsing conditions?

Freeze sampling/randomization and this analysis plan before any public pilot measurement. The 24-site pilot tests mechanics and attrition, not hypotheses; exclude every pilot observation from the final study. If measurement behavior changes after the pilot, increment protocol and capture version and regenerate a fresh pilot run namespace. Keep the original sample and all intended sites; do not replace sites based on pilot effects.

Primary endpoints at 10 s are paired GPC minus baseline: (1) classified tracker-service count, (2) classified tracker-request count, (3) advertising/marketing services, (4) advertising/marketing requests, (5) analytics/replay services, (6) analytics/replay requests, (7) total third-party request count. Preserve service identity removals/additions. Existing CertScore response labels are optional descriptive context only, never the main endpoint or an honoring estimate.

Eligibility, failures, fixed windows, randomization, sequencing and retries are specified in study_protocol.md. Unknown is missing, not zero. All selected sites contribute to intention-to-measure attrition. Primary complete-pair analysis reports exact coverage and both block-specific and domain-averaged differences. Cookie/storage and 1/5-second differences, paired semantic state, rank/CMP strata, order effects and repeatability are prespecified secondary analyses. No post-hoc subgroup screening or selective endpoint promotion.

No primary null-hypothesis significance declarations are planned. Estimate effect sizes with 95% domain-cluster bootstrap intervals (10,000 draws, fixed independent analysis seed), stratified by sampling band and with both visits/blocks kept together. Intervals describe the eligible measured frame under selection; they do not establish general-web prevalence. If confirmatory p-values are later desired, register a separate amendment before full collection and adjust the seven-endpoint family; do not add tests after seeing the full results.

Record freeze files and hashes in freeze_manifest.json, including protocol, analysis plan, randomization, sample, runner/image/runtime and dictionary. Human validation adjudication remains a separate named evidence review; no model-generated labels are called human review.
''')
write('analysis_plan.md','''# Prespecified analysis plan

The offline analysis skeleton reads immutable visit JSON, verifies artifact/config identity, and creates paired results only when both planned conditions/order positions exist and both 10-second windows are complete and document-bound. A/A remains separate. Failed/missing visits remain in the intention-to-measure table. No imputation of zeros and no replacement or arbitrary latest-success selection.

Primary seven outcomes are fixed in preregistration.md. At every endpoint, report valid-pair n, baseline/GPC mean and median, delta mean/median/range/quantiles, decrease/unchanged/increase fractions, baseline-positive fraction and both-zero fraction. Identity sets permit additions/removals even when counts are equal. Analyze each block separately, then average the two paired differences per domain only for the explicitly reported two-block-complete subset; report single-block coverage separately.

A/A: compute second minus first for the same seven outcomes, empirical absolute-difference distribution and sign proportions. Compare GPC-pair magnitudes with A/A variability descriptively; never label an individual effect causal merely because it exceeds an A/A quantile. Repeatability: paired-difference scatter, sign agreement and rank correlation between blocks, plus exact identity-set overlap. Missing blocks remain reported as missing. Do not use canary repeats as public-site repeatability.

Order: within each block, report delta distributions for randomized AB and BA assignments; estimate their mean contrast with domain-cluster resampling. Do not condition ordering on access success or state. Rank: report all 20 prespecified strata and design-weighted summaries using band population/50; display sparse groups without significance claims. CMP: report only groups with >=30 valid domain pairs; pool smaller groups as descriptive other, with denominators. Missing CMP is not no CMP. No provider rankings based on tiny successful subsets.

Semantic outcomes are analyzed only when both snapshots support the same API/section and are stable/readable at the matched endpoint. Show unknown/unsupported/not-ready separately and tabulate recorded preference transitions against request changes; do not infer state from traffic or infer effects from retained state alone. Cookie/storage snapshot comparisons have their own completeness and time-lag gates, separate from network completeness.

Bootstrap: 10,000 resamples of domains within the 20 design strata, retaining their joint blocks/conditions; fixed seed `certscore-gpc-analysis-v1-2026`. Report percentile intervals for means and direction rates, weighted and unweighted separately. No primary p-values. Precision/attrition and selection assumptions accompany every interval. General-web prevalence and legal classifications are outside the estimand.

The supplied analyze_study.py produces an auditable initial paired table and summary; its named endpoint tuple is frozen. Extend plotting/bootstrap implementation under tests before the full launch, without changing outcomes or eligibility after observing full-study data.
''')
write('validation_plan.md','''# Blinded validation and pilot acceptance

Run local positive and negative fixtures, plus A/A identical-condition fixtures, failed navigation, document replacement, delayed request beyond one second, header/navigator mismatch, overflow, pending request, unreadable storage, worker/frame limitations and semantic-state fixtures. Assert actual server-observed header and native baseline property behavior on the pinned browser. Fixtures do not contact public tracker endpoints; routed synthetic traffic is isolated and never production evidence.

The public pilot is the independent preselected 24-site subset. Two contact-cooldown sites remain not contacted; never replace them. Execute the exact frozen primary/A-A conditions, 1/5/10 s windows and 15-minute block spacing. Mechanistic validation does not require a desirable GPC effect. Preserve every access failure, interrupted invocation and incomplete window. Check no duplicate visit IDs, exact planned order, fresh process/context IDs, matching code/image/browser/egress, valid document binding, actual header/readback evidence, complete window hashes, endpoint timing and identical offline output on replay.

Before full launch a named human reviews the 50-site frozen audit sample independently of observed effects; for pilot review use its intersection and an independently hash-selected subset of pilot sites if the intersection is too small. No selection on effect magnitude. Generate packets with randomized X/Y visit labels, omit configured condition, GPC header/value and derived deltas from taxonomy/cookie/semantic reviewers; assign delivery proof to a separate reviewer because it inherently reveals condition. Blindness is scope-specific, not falsely claimed for the delivery reviewer. Keep the private unblinding key separate.

For each packet retain original source hash, anonymous visit ID, request evidence, classification rule references, document/timing binding, cookie identity and storage completeness, API/version/readiness and relevant semantic fields. Reviewer records name, UTC time, evidence-only attestation, correctness decisions, rationale, uncertainty and references in adjudication_log.csv. A second reviewer adjudicates disagreements without silently replacing initial labels. Model output is not independent human review.

Launch gates: exact runtime/image parity; local fixtures all pass; randomized order/spacing and no duplicate execution; no eligible window with dropped/unverified request sets; unknown semantics preserved; restart tests preserve uncertain attempts; private/public separation verified; independent review completed with all critical binding/delivery defects resolved; cost/capacity and full-run authorization explicit. An unresolved critical measurement defect blocks launch even if the pilot has interesting effects. Access attrition itself is reported, not repaired by changing the selected sample.
''')
write('cost_estimate.md','''# Cost and capacity estimate

All amounts are USD estimates, not measured bills. Existing production resources are unchanged. No model calls, provisioned concurrency or extra action lanes. Pricing references: [AWS Lambda](https://aws.amazon.com/lambda/pricing/), [EC2 data transfer](https://aws.amazon.com/ec2/pricing/on-demand/#Data_Transfer), [S3](https://aws.amazon.com/s3/pricing/), [ECR](https://aws.amazon.com/ecr/pricing/). Verify the account/region's effective tier before full launch; free-tier credits are not assumed.

| Component | Visits | Compute at 3 GiB × 25 s × $0.0000133334/GB-s (ARM planning rate) | 60-second envelope ceiling |
| --- | ---: | ---: | ---: |
| Primary | 4,000 | $4.00 | $9.60 |
| A/A | 200 | $0.20 | $0.48 |
| Optional false-baseline sensitivity | 60 | $0.06 | $0.14 |
| Optional UA sensitivity | 80 | $0.08 | $0.19 |
| Core total | 4,200 | $4.20 | $10.08 |
| All optional visits included | 4,340 | $4.34 | $10.42 |

Requests cost approximately $0.00084 for 4,200 Lambda invocations. At 5 MiB/site-visit, core response transfer is ~20.5 GiB; use $0.09/GB as a conservative proxy internet-transfer planning rate (~$1.85), but validate direction and same-region paths rather than double charging all traffic. At the 20 MiB/visit limit, plan ~82 GiB (~$7.40). Logs and evidence add storage/write/read charges; 1–5 MiB compressed/visit is ~4–21 GiB, roughly $0.10–$0.50/month at $0.023/GB-month, plus request/log costs. Research image storage at ~$0.10/GB-month is about $0.10–$0.30/month depending final size. Existing proxy capacity is shared, not newly provisioned; keep concurrency two and stop on proxy saturation rather than silently scaling it.

Reserve **$25 one-time for the 4,200-visit core study**, or **$30 including optional subsets**, and at most **$1/month retained evidence/image storage** pending measured pilot sizes and explicit retention choice. This is a budget proposal, not authorization. Lower-cost alternative: execute the same frozen container on existing local compute through an approved California proxy path; compute cost falls, but connectivity must preserve egress and security. Do not replace the California egress with local residential geography to save cost.

Pilot: 24 sites, 98 planned visits (96 primary plus one A/A pair), with two cooldown sites not contacted. Planned incremental compute is <$0.10, bounded worker-envelope compute <$0.24; expected proxy transfer ~$0.05–$0.10; query/logs/storage/image retention bring estimated incremental cost to **approximately $0.40, conservatively below $1 for this preparation/pilot month**. Read-only calibration extraction itself is approximately $0.02. This sub-$1 cost is disclosed under AGENTS.md; no >=$1 infrastructure/spend change or full study is launched without owner approval. If observed capacity/cost requires more, stop before exceeding the approved scope.

Two concurrent visits and 25-second average runtime require ~14.6 active compute-hours / ~7.3 wall-clock hours for 4,200 visits, plus scheduling/spacing and failures; plan 8–12 hours. The 15-minute per-domain block gap need not idle the whole fleet. Lambda retries are disabled; a client timeout is an uncertain attempt, not an automatic retry. Every attempted/failed visit consumes its budget and remains in the denominator. No selective rescue. Pilot measurements will update runtime, byte and artifact-size assumptions before launch readiness.
''')
print('Protocol/calibration documents written')
