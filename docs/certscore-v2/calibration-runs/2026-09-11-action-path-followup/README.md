# September 11 action-path follow-up contact record

Run key: `action-path-followup-20260911-paired-ie-v1`.

The owner-authorized localhost comparison made six full scans across three exact
public targets through verified AWS Ireland egress: two scans each for Blick,
Mackolik and PestPac. ErgoVeritas was excluded. The existing cooldown waiver
applied; blocked, do-not-calibrate and manual holds remained enforced. No no-go
outcomes or retries occurred.

`ledger.json` is the reviewed generated per-run candidate, containing three
cooldown entries. It does not replace or expand the canonical 51-target ledger,
whose SHA-256 remains
`eed7b6ef163659195fcfc439f9685c133071064bdf0541b0f468139e90134b9e`.

All six actual contacts were persisted using the idempotent run key. A fresh
central export verified each domain's latest contact timestamp and completed
outcome. Central contact timestamps use scan start; the generated repository
candidate conservatively uses scan completion. Root review checked both against
the six recorded attempts, per-domain counts, no-go status, candidate byte equality
and canonical ledger preservation. The tunnel and exact temporary SSH rule were
removed and independently verified absent.

Evidence is retained under `artifacts/action-path-followup-20260911/`.
See the [follow-up report](../../consent-action-followup-20260911.md) for results
and limitations. This record is bookkeeping, not a production-rate claim.
