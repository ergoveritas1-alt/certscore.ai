# CertScore.ai opt-out export and audit coverage

The November 1 audit showed unavailable public opt-out evidence as `0/N`.
Its retained assessments already contain 14 observed first-layer opt-out
controls, separately bound to their original report generations. The public
reader mapped only Accept, Reject and Options, and the public projection did
not export an opt-out presence boolean.

The dashboard now shows **Not exported** for wholly unavailable public
v4/v5/v10 opt-out series. It places **Opt-out control presence · retained
assessment** beside the public row in Controls. This is a presentation change;
historical states, sources, denominators, aggregates and CSV values are preserved.

Future public exports use `pulse-public-v11`. The canonical first-layer
projection adds `privacyOptOutControlObserved`, independent
`privacyOptOutControlInventoryComplete`, and `controlInspection.privacyOptOut`.
Existing assessment source hash/version and scan/document binding are preserved.
Only a validated, same-scan, matched-document, non-no-go canonical assessment
can supply the new facts. Legacy raw fields cannot supply them. First-layer
observed controls map to true; verified absence maps to false; incomplete or
deeper-layer evidence maps to null. Opt-out coverage does not alter A/R/O
inventory completeness. No assessment, finding, score or action policy changes.

The audit reader accepts the exact v11/v27 pair. Positive first-layer facts need
pre-interaction capture; negatives additionally need the opt-out-specific
complete inspection. Missing facts stay unavailable. Other public versions retain
their previous meanings, including raw opt-out label rows. Public and retained
assessments never overwrite one another. Version boundaries suppress mixed
rates and cross-version deltas.

Control presence, policy routes/instructions and execution verification remain
distinct. The earlier 40/100 route/instruction replay is a different metric and
cohort from the 14 first-layer positives in this audit; neither proves successful
opt-out execution. This change adds no route/instruction metric by relabeling
controls and adds no execution metric by inferring success.

Verification uses focused projection-to-audit regressions, original retained
snapshot and export hashes, a fresh dashboard from the saved cache, unchanged
row/day/source reconciliation, and file-only desktop/mobile/filter/chart/CSV
validation. The prior snapshot and source pins remain retained. The activation
records the owner-authorized pin changes explicitly. Production acquisition,
checkpoints, issue/release ledgers, schedule and model configuration are unchanged.

Local implementation, replay and refresh add **$0 cloud spend**. If deployed,
the added bounded export fields are estimated below **$0.50/month** at 100,000
scans, 30-day retention, two stored copies and one full-export read per scan.
This is a conservative planning allowance, not cloud billing: at under 6 KB per
export, storage at $0.15/GB-month and transfer at $0.12/GB plus $0.02 CPU/read
allowance total under $0.30/month. Actual retained replay byte growth is recorded
in the run receipt: 686 snapshots reviewed, 685 paired with saved exports,
all 14 positives preserved, and 444 verified negatives / 222 unknowns / five
unavailable projections. The unpaired original export stays unavailable. The
five rejected canonical projections do not acquire a fallback. Measured added
fields average 316 bytes and peak at 602 bytes across 680 valid projections;
the 6 KB model is a planning cushion, not a schema byte cap.
There are no new browser visits, capture waits, actions,
SDK calls, model calls or provisioned resources. Deployment is not performed.
