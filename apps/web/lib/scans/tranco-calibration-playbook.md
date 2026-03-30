# Tranco Calibration Playbook

Use the Tranco list as a sampling frame for real certscore scans, not as a raw "scan everything" queue.

## Goal

Find generic surfacing-engine and canonical-object weaknesses by scanning a broad, reproducible set of public-facing domains, then clustering the resulting failures by shape.

## Workflow

1. Triage the Tranco list into scan-worthy public-facing domains.
2. Build a stratified queue across rank bands and site shapes.
3. Run real scans.
4. Compare:
   - retained evidence
   - repaired family packets
   - unified findings
   - independent live read
5. Classify each mismatch by failure shape.
6. Fix only the generic pattern in the concern pipeline, repair layer, or unified-finding promotion.
7. Re-scan the same domain.
8. Verify transfer on another domain with the same shape.

## Failure shapes

- false positive from guessed or redirected path
- missing real legal or support surface
- wrong off-domain attribution
- weak evidence supporting a technically correct finding
- route-family miss such as `.html`, `/about/...`, legal-hub, localized legal pages
- short-circuit or snapshot state contradicting stronger retained evidence

## Root-cause layers

- scanner acquisition
- discovery retention
- concern normalization
- concern policy
- family-packet repair
- unified finding promotion
- evidence ranking or presentation

## Outputs

The Tranco triage script emits:

- `candidate_domains.csv`
- `calibration_queue.csv`
- `calibration_ledger_seed.csv`
- `triage_summary.txt`

Use the queue for real scans and the ledger as the calibration record of truth.
