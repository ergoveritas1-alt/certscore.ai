# Observed control report policy

Policy: `observed_control_report.v2` (supersedes v1's complete-inspection or confirmed-surface summary gate)

Owner approval: September 27, 2026 for local development; production deployment authorized September 27, 2026.

On October 5, 2026, the owner required binary control summaries on usable visits
even when retained inspection is limited and surface presence is unresolved.
The v2 reporting convention implements that instruction; it does not change
assessment conclusions, consent-action authorization, findings or scoring.

## Meaning and canonical path

The customer summary shows Accept, Reject and Options as **Observed** or
**Not observed**. Not observed means the control was not identified during the
retained visit. It is not proof the website lacks that control.

The shared projector consumes a schema-valid, scan-bound retained
ConsentControlAssessment. It requires matched document identity and complete or
limited inspection coverage. Surface presence need not be confirmed and overall
inspection need not be complete. Known no-go, blocked,
error/loading, inaccessible and blank-page conditions suppress the summary.
Missing, malformed or unavailable assessments also suppress it. These visits must not become
three negative controls. Page usability comes from canonical retained assessment
facts, not a model reviewer or screenshot-only interpretation.

On eligible visits, canonical observed maps to Observed; other states map to
Not observed in this report summary. There is no per-control uncertainty badge or
inspection limitation paragraph. This mapping is a reporting convention, not a
probability model. It does not claim a measured probability above 50%.

New canonical report packets retain the summary with policy version, scan ID,
assessment version and source hash. The shared canonical-report accessor applies
the same versioned projection to historical retained assessments. It does not
rewrite their states, versions or evidence. Report components consume this
projection rather than classifying raw labels or DOM themselves.

## Independent evidence and scoring

Internal unknown and limited states remain available for diagnostics. The
summary must never be consumed to create absence findings, score deductions,
consent registration or interaction authorization. Those continue through the
original typed assessment, normalized concerns, concern policy and unified
findings. A missing screenshot alone does not invalidate structured evidence.

After Accept and After Reject sections require the matching summary control to
be observed. A completed action in another session does not override that gate.
Retain the action evidence independently under its original contract.

## Recognition improvements

Label registry v7 adds exact, consent-context-bound observation phrases for
necessary-only choices, cookie preferences, privacy settings and Traditional
Chinese accept-and-close. A settings link with retained ARIA button role can
support passive Options observation when its destination is unverified and its
label is directly recognized in consent context. Known document navigation still
fails the existing options destination check.

These rules are observation-only. Action label matching and navigation proof are
not broadened. Paid refusal, sale/share opt-out, dismissal and contextual
acknowledgment keep their separate existing definitions; no new generic
acknowledgment-to-Accept rule is introduced.

The 100-scan Luna/Sol review supplied diagnostic leads, not human ground truth or
calibrated probabilities. Its failed exploratory holdout rule is not integrated.
Future probability claims need adjudicated labels and a fresh held-out cohort.

## Cost and verification

No additional scan, lane, wait, model/API call or infrastructure is introduced.
The small persisted summary adds approximately 350 bytes per scan: about 35 MB
per 100,000 scans before database overhead. Estimated incremental storage is
under $0.10/month at that volume; retention and database allocation affect the
actual amount.

Regression coverage checks source-state preservation, document/scan binding,
unusable-visit omission, binary UI rendering, matching action visibility,
observation-only classifier behavior and passive geometry capture. Scoring
regressions remain separate from report-label tests.
