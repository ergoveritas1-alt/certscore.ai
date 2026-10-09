# Local live paired geometry calibration

No deployment or baseline promotion. This is a passive consent-proof module benchmark, not an Accept/Reject action test, full six-lane scan, WC01 report projection, or production end-to-end latency measurement. Product changes remain local.

## Protocol and provenance

Luna selected the benchmark protocol and reviewed evidence on a model-assisted basis. Fresh central all-channel exports and the canonical registry/selector passed. The owner’s existing repeat authorization waived cooldown only; holds, blocked/do-not-calibrate states, no-go restrictions and the platform exclusion remained enforced. No retries, failure replacements, region/identity changes, consent clicks or form submissions occurred.

The primary sample contains ten role-stratified sites, five baseline-first and five candidate-first, with at most two different domains running concurrently. Each source/site uses one fresh isolated headless Chromium session, ConsentCheckBot HTTP identity, native Chromium navigator, en-IE / Europe-Dublin, existing local California egress, viewport-first screenshots and a 30-second module deadline. The existing deterministic audit-holdout policy remains unchanged.

Each frozen source manifest covers 785 files and is verified before and after visits. Baseline is the exact previous working scanner before the timing fix, not the deployed release. Every other source file is identical between snapshots, including the current v13 classifier; the new helper is present but unused by baseline. External dependencies are shared through the existing node_modules tree. Intermediate geometry writes are copied without altering their bytes or relabeling final proof; serialization occurs identically in both versions and files are flushed after module completion.

Baseline source-manifest SHA-256: `dae5f846cba43d2608f6c4d678a193fcb3ae9f5d7bbde6df69ed9ff54a6bbc79`.
Candidate source-manifest SHA-256: `69d894a3c040e54d2e7893bd7e8dcbfdcd34a9ec62b90d494fd12f9c6d980731`.
Primary protocol SHA-256: `21eb891c18376614a38a4533fce44a136995c9994fe054cd40fccec1030f5faa`.

## Primary rotating sample

| Site | Baseline module | Candidate module | Change | A/R/O and inventory parity |
| --- | ---: | ---: | ---: | --- |
| theguardian.com | 11.174 s | 9.083 s | -2.091 s | Matched |
| fullstory.com | 6.309 s | 6.380 s | +0.071 s | Matched |
| cloudflare.com | 21.228 s | 21.162 s | -0.066 s | Matched |
| hubspot.com | 7.927 s | 9.031 s | +1.104 s | Matched |
| progressive.com | 13.411 s | 13.442 s | +0.031 s | Matched |
| homedepot.com | 13.790 s | 13.780 s | -0.010 s | Matched |
| usa.gov | 10.467 s | 10.458 s | -0.009 s | Matched |
| spotify.com | 8.570 s | 8.667 s | +0.097 s | Matched |
| caltech.edu | 10.522 s | 10.590 s | +0.068 s | Matched |
| healthline.com | 19.034 s | 19.057 s | +0.023 s | Matched |

All 20 public visits completed, yielding ten usable pairs, with no skipped replacement or no-go result. A/R/O, capture status, inventory outcome and unresolved-decision state matched in every pair. Typed observation and screenshot rows validate. All 20 final geometry screenshot pointers exist and match the retained screenshot URL/loader identity. The owned direct-consent canary passed A/R/O in both versions and is outside the public denominator.

**Paired candidate-minus-baseline latency: median +27 ms; p95/max +1,104 ms.** These meet this module’s +500 ms median / +2,000 ms p95 regression thresholds. At ten pairs p95 is the maximum sample delta, not a stable population estimate. The prior broader three-session A/R retention cohort is not superseded by this narrower passive-only timing result.

This cohort shows no broad latency benefit. FullStory and HubSpot had positive paired A/R/O geometry but already observed controls before the adaptive gate. Guardian and Spotify used stable-partial exits with privacy/opt-out affordances but no positive A/R/O geometry. Thus **0/10 primary sites clearly exercised the newly fixed positive-paired timing path**. Do not turn this stratified sample into a production occurrence-rate estimate.

Visual review found ordinary pages rather than access challenges. FullStory shows Accept and Deny Non-Essential; HubSpot shows Accept All, Decline All and Manage Cookies, with partial/unresolved status retained. Guardian’s privacy overlay varied between visits; Guardian/Spotify privacy affordances do not establish high-confidence A/R/O absence. Healthline’s “Your Privacy Rights” launcher remains an ambiguous retained candidate in both versions, not a new timing regression or verified first-layer A/R/O absence. These are model-assisted observations, not independently human-adjudicated accuracy labels.

## Separate targeted positive control

Luna recommended one Segment pair because earlier retained evidence had the specific positive-geometry/incomplete-timing-flag delay. A fresh central export and canonical restricted selector confirmed eligibility under the cooldown-only waiver. It ran candidate first, then baseline, sequentially and without retries. It is excluded from the ten-site sample and its timing distribution.

| Segment | Baseline | Candidate | Change |
| --- | ---: | ---: | ---: |
| Consent-proof module | 18.824 s | 11.256 s | −7.568 s |

Luna’s final Segment review passed: the paired/final proof image bytes are identical across both versions (SHA-256 `d584575651d58ec2602f0e8c7b630430554fcd49550d5c41970d40470f36e441`), showing Accept, Opt-Out and More Info. No scroll recovery was needed. Both visits retain A/R/O = true/false/false, `complete_with_controls`, no unresolved decision, positive paired settled geometry, and the later dedicated proof screenshot with exact document binding. The current quoted privacy alias is already recognized on both sides. Baseline continues through the 18-second incomplete-proof safety exit. Candidate records stability checks at 6 and 8 seconds, then the stable-partial timing exit at 10 seconds. The earlier proof satisfies timing readiness without completing or skipping the dedicated diagnostic. This reproduces the targeted delay and supports a case-specific improvement; one pair cannot establish general speed or frequency.

## Contact accounting and remaining gates

There are 24 attempted passive lane contacts: 20 primary public, two owned and two targeted Segment. Each public domain was contacted once per source. Central persistence uses separate idempotent keys for the primary+owned run and targeted Segment. The reviewed repository ledger changes only the 11 contacted public URLs; owned history remains in the central ledger and artifact record. No unrelated or artificial selection-exclusion state is merged into the repository ledger.

Artifacts are under `artifacts/ar-paired-geometry-live-20261009/`: source manifests/snapshots, registry/history exports, canonical selections, protocol/source-verification records, all raw scanner outputs and intermediate geometry versions, screenshots and hashes, analysis/review summaries, and contact-persistence logs. The initial runner import failure occurred before any scanner started and is retained as `precontact-run-import-error.log`; it produced no contact.

The local fixture and this live positive control verify the geometry-readiness fix, while the rotating sample passes the passive-module latency preservation gate. Full release acceptance still requires the applicable broader A/R retention/runtime and scan-to-report readiness checks; this run does not prove action success, report-publication latency, full production evidence parity, or human-adjudicated accuracy. No source baseline is promoted and no deployment is authorized by these diagnostic results alone.

No recurring infrastructure or scanner-model cost was added. All browser work ran locally. One-time AWS history/contact bookkeeping is conservatively estimated below $0.20 for this complete diagnostic, within the repository’s below-$1 preapproval.
