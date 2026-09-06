# Structured consent evidence policy

Approved by the product owner on September 5, 2026. Assessment contract: 2.1.
Evidence policy: `structured_control_evidence.v1`.

## Authority and safety

Retained DOM/accessibility inventory and geometry are factual control evidence.
Their existing document identity, visibility, actionability, coverage,
inaccessible-frame, and no-go checks remain authoritative. Screenshot display
safety is independent. A missing/withheld image does not erase verified A/R/O;
an available image cannot supply missing structured observations or prove absence.

The scanner still captures same-session visual evidence and uses the existing
fail-closed safety gate. No unsafe image is exposed, no discarded image is
reconstructed, and no image is rebound to another document or control snapshot.
Geometry evidence references its retained JSON, not a withheld image as its sole
proof. A stable partial inventory may bind to completed same-document geometry
for 2.1 assessment; scanner-side legacy screenshot binding remains unchanged.

The canonical flow remains retained evidence → assessment → persisted typed
projection → normalized concerns → concern policy → checklist/unified findings
→ report and score. There is no display fallback or new scoring rule.
Control recognition is not successful consent registration: Accept/Reject lanes
still require separate authorization, a verified actionable control, a completed
action and the existing semantic registration/post-action evidence invariants.

## Version and persistence

New assessments emit `artifactVersion` and provenance `contractVersion` 2.1,
explicit `evidencePolicy`, and bounded `visualEvidence` (status, artifact refs,
reason codes). Visual metadata and the policy participate in source hashing.
Structured coverage excludes screenshot availability. The 2.1 schema rejects
missing policy/visual metadata, mixed versions, and complete assessments with
unknown A/R/O or invalid document/coverage status.

The reader also accepts 2.0 without rewriting its states. No bulk backfill or
scan is performed. Normal canonical rematerialization uses the new version and
cache identity, preserving original retained inputs. JSON persistence preserves
version, evidence refs, source hash and separate visual status.

## Verification and resource impact

Regression coverage includes withheld/missing images, unchanged structured
results across visual statuses, screenshot-only input, Accept-only complete
inventory, partial inventories, document mismatches, legacy reads, schema
invariants, and persistence → policy → checklist → score parity.
Existing visual-safety and action-lane regressions remain required.

Local verification passed 369 focused regression tests, the contracts build,
and the web TypeScript check. An in-memory replay of retained scan
`95c6a49e-e27c-4691-ab1c-7c689461db0c` produced complete structured coverage:
Accept observed; Reject and Options not observed; representative visual withheld
with its original safety-deadline reason. This is passive control inventory,
not verified Accept-path success. No scan, report republish, backfill, or deployment
was performed.

No new browser/model/service calls, timeout increases, provisioned capacity, or
deployment changes. Added bounded visual/policy metadata is typically under
1 KiB per assessment; estimated incremental storage is below $1/month for
100,000 retained assessments without a capacity-tier change. No paid calls were
made for verification; tests and retained replay are local.
The replay's additional policy/visual metadata measured 232 bytes.

## Loading-document negative-evidence guard

The DOM inventory retains `documentReadyState` in the same browser evaluation
as its controls. An empty inventory while `loading` remains partial, including
after same-session geometry recovery; it cannot establish absence. Visible
controls remain eligible through the existing structured proof without waiting
for document completion. Inspection/geometry timestamps are not banner-appearance
timestamps when the canonical surface is unknown or not observed.

This is additive retained evidence, not a screenshot dependency or a new wait.
The bounded field adds approximately 35 bytes per observation (well below
$1/month at 100,000 scans). Legacy packets remain readable.
