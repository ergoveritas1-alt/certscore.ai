# Passive Cookiebot inventory capture

Local implementation only. No deployment or Options/Customize interaction.

The registered Cookiebot adapter now reads declaration cards already mounted
under the unique `#CybotCookiebotDialog` root and its exact details panel.
The panel may remain hidden. Both elements must remain attached to the same
document and retain their identities across the read. Missing, duplicate,
replaced or unrelated nodes cannot supply loaded inventory.

New evidence uses `certscore.cmp-basic-evidence.v2` with a versioned passive
source binding, completed document checkpoints, retained loaded records and
their exact declaration projection. V1 packets retain their original contract
and conclusions. The contract rejects foreign providers, stale document
tokens, missing source proof, mismatched manifests and altered declarations.

Loaded cards establish declarations, not visible disclosure, category choices
or complete inventory. They flow through the existing canonical assessment,
persisted typed projection, normalized concerns and CMP checklist. There are
no scoring changes or display-only fallbacks. The existing shared projection
preserves `cmp_loaded_inventory` attribution.

## Replay and verification

Historical assessment replay was unchanged. Offline replay of the retained
before-Options DOM recovered 61 cookie declarations with purposes and
durations, 17 service names and 87 cookie-name patterns.

The first fresh local EU-Ireland scan completed without passive inventory.
Its positive controls reached the passive-read scheduling point after visual
work. Scheduling now starts the same single read immediately after the
positive supplemental/adaptive typed result, overlapping subsequent semantic
and visual work. The existing 350 ms allowance remains unchanged.

The final fresh local scan was
`cookiebot-passive-local-r2-cookiebot-2cb5e81f-c01f-4f63-a3ea-b7fc22fac47e`.
Browser and HTTP egress independently matched `63.33.9.201`, verified as
Ireland. It retained 98 loaded records, 61 cookie declarations, 17 service
names and 87 cookie-name patterns. The entire passive basic read completed
in 171 ms. Six evidence workers ran; no preference worker or packet existed.

An in-memory replay removing only the new loaded inventory from that same
fresh evidence isolates these changes:

| Check | Without loaded inventory | With loaded inventory |
| --- | --- | --- |
| Services identified | Not assessed | Observed |
| Declared names compared with pre-consent snapshot | Not assessed | Observed |
| Cookie purpose and duration information | Not assessed | Observed |
| Observed names missing from declarations | Not assessed | Partially assessed |

Four of 13 checks remain unresolved in the final local report: prominence
(pixel-comparison allowance exhausted), categories (panel remained closed),
privacy-link access (no verified reachable link), and the partial
missing-declaration comparison. The first fresh run had eight unresolved
checks. Differences between visits also include client consent-record/expiry
coverage and the visual limitation; do not attribute every change to inventory
extraction. A bounded partial list never proves a declaration is missing.

## Checks and preservation

Contract, passive-capture, shared-capture, loaded-inventory, full CMP projector,
lane-ownership and disabled-preference regression tests passed. The saved
bundle fixture corpus passed from its package working directory. Contracts
and shared packages built; scanner-core and Lambda typechecks passed.

All 1,796 retained source files remained byte-identical. Both new contacts were
persisted under distinct idempotent run keys. The reviewed repository ledger
updates only Cookiebot and returns it to normal cooldown. Temporary SSH access
was removed and its tunnel stopped.

Artifacts: `/Users/benmasek/WC01/outputs/cookiebot-passive-local-2026-10-16/`.
Estimated incremental recurring cost is below $0.75/month at the expected
100,000-scan workload, with no new lanes, model calls, retries, waits or
retention policy. Bounded verification and operational helper spend is below
$1 total. Production remains unchanged, with the preference lane disabled.
