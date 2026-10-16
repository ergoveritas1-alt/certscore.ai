# Passive Consentmanager inventory capture, local verification

Implemented locally on October 16, 2026. Not deployed or pushed. Existing reports
and scores were not rewritten.

## Change

The canonical Consentmanager registry now names an exact already-mounted cookie
table under `#cmpbox`: `.cmpcookiesdescrbox table.cmpcookietbl`. The existing
consent-proof passive capture can read it without opening it. This uses the
existing 350 ms opportunistic allowance, with no new lane, wait, retry, model
call, network request, or preference interaction.

The public `display_cookielist` SDK template supplies the reviewed structural
selectors and field classes. The reader retains cookie names, explicit storage
types, vendor names, expiry text, and an immediately associated description.
Sample-value and domain columns are not collected. It never accesses private
`window.cmpmngr` state or invokes `showCookies`, `showScreenAdvanced`, or another
SDK command. A declaration table that is not loaded stays unavailable.

Binding requires one root and one table in the same document, stable element
identity before and after reading, and the existing loader-bound checkpoint.
Nested, ambiguous or malformed tables fail closed. Abbreviated cookie names are
discarded; storage types are not guessed. Reads retain at most 100 detailed
records and 16,000 characters, with bounded traversal and explicit partial
coverage. A table without explicit cookie types cannot create cookie identities.

New passive records use `certscore.cmp-basic-evidence.v3`,
`consentmanager_passive_loaded_inventory.v1`, and
`consentmanager_loaded_declarations.v1`. Historical v1/v2 packets retain their
meaning. The previous Cookiebot preference contract cannot borrow this source.
No source claims a full configured inventory. These facts follow the existing
typed assessment, persisted projection, normalized concern, concern policy and
unified CMP checklist path. CMP inventory checks remain score-neutral.

## Replay and fresh result

The retained Consentmanager bundle was replayed first. Its assessment did not
change. Offline replay of its partial retained DOM excerpt produced no inventory
and no network requests. A partial excerpt does not establish full-page absence.

The fresh local scan was
`consentmanager-passive-local-consentmanager-5e637660-e509-4492-b877-245bd255c18b`,
targeting `https://www.consentmanager.net/`. Browser and HTTP egress were both
verified as `63.33.9.201`, Ireland, through the existing AWS eu-west-1 proxy.
All six required/enabled lanes completed. There was no Options lane or preference
evidence packet. Passive controls and privacy-link capture completed; two
category controls and a reachable privacy link were retained. No usable
already-loaded declaration table was available.

| Unresolved check | Before | Fresh run |
| --- | --- | --- |
| Accept / Reject prominence | Incomplete | Incomplete |
| Named services | Not assessed | Not assessed |
| Declared cookies compared with capture | Not assessed | Not assessed |
| Captured cookies compared with declarations | Not assessed | Not assessed |
| Cookie information | Not assessed | Not assessed |

**Resolved: 0 of 5.** All 13 projected CMP row states were unchanged. The four
inventory checks need declaration evidence that this initial visit did not
provide. The remaining visual check is a separate screenshot-review limitation.
The public SDK loads cookie declarations on demand; this implementation does not
trigger that loading. Further site-specific passive retries are not supported by
these results.

## Verification and preservation

- 137 focused capture, contract, canonical projection and regression tests passed.
- Contracts, scan-core, shared and web TypeScript checks passed.
- Calibration registry validation passed. Central contact history was exported
  successfully before canonical target selection, with the owner-requested
  cooldown exception recorded. The contact was persisted with idempotent key
  `consentmanager-passive-local-2026-10-16-5e637660`; only this target's reviewed
  manual ledger entry was updated.
- All 755 previously retained files in the preservation manifest kept their
  SHA-256 hashes. Fresh results were materialized in a separate local artifact
  directory without writing a customer report to the database.
- Temporary SSH ingress was removed and the Ireland tunnel stopped.
- Estimated incremental compute and bounded evidence storage: below $0.75/month
  at 100,000 scans; this local verification was below $1 total. No new capacity
  or retention policy was introduced. The estimate was disclosed before work.

Evidence and logs:
`/Users/benmasek/WC01/outputs/consentmanager-passive-local-2026-10-16/`, especially
`comparison.json`, `verification.json`, the replay artifacts and test logs.
Public SDK reference bytes and hashes are retained separately from scan evidence.
Existing unrelated Termly/Consentmanager preference edits were left in place.
