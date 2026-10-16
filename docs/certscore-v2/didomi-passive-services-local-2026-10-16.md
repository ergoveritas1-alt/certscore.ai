# Passive Didomi named-service capture

Local implementation and EU-Ireland verification, October 16, 2026. No
deployment or push, Options/Customize interaction, new lane, wait, retry, model
call, timeout increase, or historical report rewrite.

## Canonical source and assessment

The shared Didomi registry selects `didomi_required_vendors.v1`. The existing
consent-proof passive capture reads `Didomi.getRequiredVendors()` once only
when its documented readiness callback runs immediately for the current SDK.
An SDK that becomes ready later cannot perform a deferred read or reopen the
capture. No consent-state getter, consent string, visitor ID, storage value,
vendor disclosure URL, preferences opening or setter is used.

The read verifies exactly one `#didomi-host` and one registered notice under it,
then verifies the same root, notice, API and getter after extraction. These
checks occur in one atomic browser evaluation inside the existing 350 ms
passive allowance. The caller retains only a current exact-target, loader-bound
checkpoint. Other action sessions cannot supply this lane's service evidence.

Only explicit configured vendor IDs and literal names are retained. Conflicting
or duplicate IDs, accessors, missing names, domains and unsafe labels remain
unresolved. Markup is rejected rather than parsed into a resource-loading
document. The reader inspects at most 100 of 10,000 declared source records and
retains at most 16,000 characters. Source accounting and truncated/partial
coverage remain explicit. Vendor purposes and vendor-wide maximum cookie ages
do not become cookie declarations or selectable category controls.

New evidence uses `certscore.cmp-basic-evidence.v4` with a typed
`sdkServiceInventory`, exact name projection and source binding. Contracts reject
foreign providers, stale tokens, unbound checkpoints, altered names, missing
readiness and borrowed cookie inventories. New assessments use
`independent_cmp_basic_facts.v7`; historical source hashes and v1/v2/v3 semantics
are unchanged. Service names pass through canonical assessment, typed persistence,
normalized concerns, concern policy and the shared CMP checklist. Row references
retain `didomi_required_vendors.v1/record:N` provenance. The source is loaded
configuration evidence, not proof of visible disclosure, individual controls or
complete coverage. No scoring rule or weight changed.

Primary reference:
https://developers.didomi.io/cmp/web-sdk/reference/api#getrequiredvendors.
The exact distributed SDK bytes, URL and SHA-256 are retained as a separate
engineering reference, not a scan-evidence replacement.

## Replay and fresh verification

Read-only replay of
`didomi-registration-local-didomi-0ba3ad24-abef-4552-a726-189d0e379863`
was unchanged. That bundle does not retain vendor names; historical telemetry
counts cannot manufacture them.

The first fresh scan exposed the distributed SDK's post-initialization
`didomiOnReady = {stub: true, push(callback)}` wrapper. The reader now supports
that verified immediate-ready form alongside compatible startup arrays, without
waiting or invoking a getter on late readiness. The associated fixture was
corrected to restore a deliberately replaced global accessor between cases.

Final scan:
`didomi-services-passive-local-didomi-50c71a32-cbf6-4957-a7ba-6c65b9cf54c3`,
target `https://www.didomi.io/`. Browser and HTTP egress both verified
`63.33.9.201`, country IE, AWS eu-west-1. All six evidence workers completed;
no preference worker or packet existed. Passive source extraction retained
25 distinct named vendors from 26 inspected source records, with one unresolved
record. It did not claim complete inventory.

The services row changed from **Not assessed to Observed**. An in-memory
comparison removing only the new source from the same fresh bundle changed
only that criterion, confirming one check resolved by the implementation.

The historical total was six unresolved checks and the final fresh total is
also six: the fresh visual-prominence check became Incomplete while services
became Observed. The remaining five Not assessed criteria are categories,
privacy-link access, both cookie declaration comparisons, and cookie information.
The visual failure is separate and was not converted to a result or used to
trigger another scan. Both fresh reports remain separate from the originals.

## Validation, preservation and cost

- 126 focused capture, contract, canonical projection and Didomi action
  regression tests passed. Contracts, shared, scanner-core and web TypeScript
  checks passed; the calibration registry passed.
- All 2,187 preserved files retained their SHA-256 hashes. Fresh bundle and
  manifest sizes/hashes were verified before separate local materialization;
  no customer report was written to the database.
- Successful central contact-history exports preceded both canonical selections,
  with the owner-requested cooldown exceptions recorded. Contacts were persisted
  with separate idempotent run keys ending `a10fc2ed` and `50c71a32`. The reviewed
  manual ledger update changes only Didomi and restores its cooldown.
- Both temporary Ireland tunnels were stopped and their SSH ingress removed.
- Disclosed incremental compute and bounded storage estimate: below $0.50/month
  at 100,000 scans, with verification and operational helpers below $1 total.
  No standing capacity or retention-policy change.

Artifacts:
`/Users/benmasek/WC01/outputs/didomi-services-passive-local-2026-10-16/`.
See `fresh-round2-comparison.json`, `fresh-round2-ablation.json`, `verification.json`,
the immutable fresh bundles and the test logs. Existing unrelated preference
observer and Consentmanager category edits were preserved.
