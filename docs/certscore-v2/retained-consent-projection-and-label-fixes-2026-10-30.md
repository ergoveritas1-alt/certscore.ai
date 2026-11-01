# CertScore.ai retained consent projection and label fixes — October 30, 2026

The owner authorized local implementation using retained fixtures and focused
tests. No deployment, new scans or increased capture budgets are authorized.

Public evidence projection `pulse-public-v6` reads a validated, scan-bound
canonical consent assessment before compatibility summaries or checklist
fallbacks. It preserves observed, verified not-observed and unknown independently
for Accept, Reject and Options, and exposes bounded inspection status, reasons,
references, assessment version and source hash. An invalid canonical assessment
cannot fall back to positive legacy controls. Existing auxiliary evidence fields
remain available; canonical control fields take precedence. Checklist verdicts,
customer binary summaries, action eligibility and scores retain their separate
policies.

Dollar General's retained assessment is limited overall but has complete
per-control inspections. Its verified Reject `not_observed` now exports as false
with complete A/R/O inventory instead of becoming null through the Review signal
checklist fallback. Its retained checklist remains Partial concern / Review
signal. The fixture contains the original assessment and public checklist rows,
with scan identity and source receipt hash. Replaying all twelve retained
assessments preserves eleven unknown Reject states and Dollar General's known
negative result. Stored reports and audit snapshots are not rewritten.

Canonical label registry `consent-control-label-registry.v25` adds six exact,
consent-context-bound observation aliases from retained geometry:

| Original site | Label | Intent |
| --- | --- | --- |
| Dolby | Reject Non-Necessary | Reject |
| Rijksmuseum | Nee, liever niet | Reject |
| Pigu | Tęsti be sutikimo | Reject |
| Pigu | Valdyti sutikimus | Options |
| Matas | Nødvendige | Reject, necessary-only |
| Matas | Tilpas | Options |

The fixtures retain original candidate geometry, labels, classifier metadata and
source hashes. These aliases grant no action credit. Existing visibility,
document binding, source verification, inspection completeness, canonical
concern/policy flow and capture limits continue to apply. No retrospective
classification, finding or score materialization is performed.

Validation: 168 focused tests pass across the classifier, consent assessment,
inspection, public evidence helper and Pulse projection suites. Contract types
and the focused public projection/test dependency graph pass TypeScript checks.
Tests cover missing context, altered/informational/negated wording, conflicting
labels, action usage, malformed/wrong-scan/unbound/no-go assessments, unknown
preservation, retained auxiliary evidence and checklist independence.

This local change adds $0 recurring infrastructure or paid API/model usage and
does not add browser work. No deployment or production verification was run.
Dashboard source pins and metric contracts remain unchanged; a future refreshed
production export has an explicit v6 source identity and must pass the existing
schema/source review gate before audit publication. Do not silently repin.
