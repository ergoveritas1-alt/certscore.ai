# CertScore.ai Complianz complete-category receipt interpretation

Owner authorization: implement shared Complianz receipt interpretation, starting
with University of Silesia; use retained evidence and helpful live checks. No
deployment. The owner previously waived public-site cooldown; contact holds,
central contact history, exact-target authorization and action budgets remain.

## Evidence and interpretation

The retained University of Silesia premium/multisite runtime and NfieldMR/NIPO
free runtime both write separate `cmplz_preferences`, `cmplz_statistics` and
`cmplz_marketing` category cookies. `functional` is always allowed. A separate
`consented_services` receipt can override categories. Banner dismissal and policy
IDs are metadata. Both reviewed writers skip unchanged category writes.

`complianz_complete_categories.v1` requires:

- The existing canonical classifier and authorized unique first-layer control,
  with that control inside Complianz's banner/button container.
- Already-loaded same-frame configuration with the exact four-category universe,
  canonical `cmplz_` prefix and explicitly disabled TCF. No inferred defaults.
- Exactly one current cookie per category, functional cookie and services cookie;
  all five share domain, path and partition scope. Functional must explicitly be
  `allow`; the services cookie must explicitly be empty.
- All three optional category writes after the action, within the existing
  retained write bound, matching the current values. Each original setter
  assignment must parse to the same exact cookie identity and value hash in the
  same document. Reject already retains these bounded assignments; Accept now
  retains them ephemerally for Complianz writes only, at the same 96-write cap.
- Typed decision evidence carrying configuration, document/cookie identity
  hashes, complete category states and exact fresh-write timestamps. Initial
  and terminal confirmation preserve the same proof through canonical packet
  validation and report projection.

All three allow values mean granted; all three deny values mean denied. Mixed
choices, TCF configurations, missing/service-specific receipts, custom prefixes,
new/partial categories, ambiguous identities, rejected/deletion writes and stale
state do not confirm the requested decision. Individual Complianz cookies can
never decode as an all-purpose decision, including through registered-key paths.

No new named action recipe, SDK invocation, Options opening, request, wait or
capture-window increase is introduced. A selector prefilter limits the bounded
pre-action ancestry read to Complianz candidates; it is not itself binding proof.
Loaded configuration piggybacks on the existing write snapshot. A recognized
category candidate reuses one browser-cookie read per confirmation pass.

Historical packets are not rewritten or retrospectively confirmed. A retained
runtime replay establishes protocol behavior, not a missing historical
configuration read or current production readiness. Site loading/control
resolution remains separate from receipt interpretation.

## Cost and validation record

The bounded processing, conditional pre-action ancestry read and retained proof
are estimated below $0.50/month at 100,000 scans, with unchanged absolute budgets
and no additional paid model calls. Six local public verification contacts have
a conservative $0.60 one-time allowance. Public contacts use the canonical
central/manual ledgers; no production scan records or regional egress claim.

The immutable run record is:
`/Users/benmasek/WC01/artifacts/daily-scan-audit/runs/20261028T203430Z-manual-complianz-receipt-interpretation`.
It retains source hashes, public runtime replay, focused and broad checks,
prototype and final candidate separation, complete contact outcomes and final
summary. Product changes remain local and undeployed.

Final validation: 645 consent-action tests, including 40 focused Complianz cases; 55 action-contract tests; 15 release-selection tests; and scanner typecheck passed. All 1,466 historical registrations remained unchanged. Retained runtime replay passed for both reviewed
variants. The final University of Silesia Reject and NfieldMR/NIPO Accept
visits completed with verified decisions. Two earlier Silesia loading/control
failures remain retained and unresolved.
