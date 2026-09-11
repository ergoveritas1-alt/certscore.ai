# September 11 action semantic validation contact record

Run key: `action-semantic-completion-20260911-paired-ie-v1`.

The owner-authorized localhost comparison contacted ten exact public targets
through verified AWS Ireland egress. Nineteen scans completed: two each for nine
domains and one for Freenet, whose second scan was skipped after a no-go result.
ErgoVeritas was excluded. The explicit user cooldown waiver applied to selection;
blocked, do-not-calibrate and manual holds remained enforced.

`ledger.json` is the reviewed generated per-run candidate, covering these ten
targets only. It does not replace or expand the canonical 51-target repository
ledger. Actual central contact records were persisted with the idempotent run key;
the repeated contacts use the canonical per-domain contact sequencing. Freenet
is blocked; nine other entries return to cooldown.

Root review checked the 19 verified attempt records, per-domain counts, generated
candidate byte equality, no-go disposition and canonical ledger preservation.
The temporary proxy tunnel and exact SSH rule were removed and verified absent.

Evidence and contact summary are retained under
`artifacts/action-path-review-20260911-14h/implementation/final-validation/`.
See [the validation report](../../consent-action-ireland-validation-20260911.md)
for the matched outcome comparison and the release hold. This contact record
is bookkeeping, not a completion-rate or release-quality claim.
