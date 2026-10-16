# Production preference lane disabled

The owner authorized disabling the Options/Customize lane in production while
preserving Accept, Reject and passive capture. The guarded repository script
`scripts/disable-cmp-preference-lane.ts --apply --out <audit.json>` changed only
`CERTSCORE_CMP_PREFERENCE_INSPECTION_ENABLED` to `0`, using Lambda revision
guards and verifying every other environment value and the image URI.

All six primary/inventory functions in eu-west-1, eu-central-1 and us-west-1
were updated successfully. Accept and Reject flags remain `1`. The immutable
scanner image remains `sha256:864d567e3ef7678f511add8c8808caae2373cb2843f64e5cc027936d33632ab7`.
No scanner image, web application, scoring rule or historical report changed.
The canonical deployment script keeps the preference flag off, and regional
parity verification now checks that setting.

Three fresh synthetic verification scans ran on the production Lambda
functions against the authorized owned canary `https://ergoveritas.com/testar1.html`:

| Region | Scan ID | Evidence workers | Accept / Reject |
| --- | --- | --- | --- |
| eu-central-1 | cmp-disabled-production-eu-central-1-dd23673a-394c-4ef4-adb6-f740a71f7dd4 | 6 | Joined / Joined |
| eu-west-1 | cmp-disabled-production-eu-west-1-0d06c1db-8217-4fe6-9535-e43a93c6f9e1 | 6 | Joined / Joined |
| us-west-1 | cmp-disabled-production-us-west-1-ac5393ab-12b7-4bda-afd5-8c581094fa47 | 6 | Joined / Joined |

Each scan completed consent-proof, runtime, policy, GPC, Accept and Reject
workers. Retained coordinator timing identifies all six completed workers;
there is no preference timing, outcome or evidence packet. Each canonical
bundle was verified against its retained byte length and SHA-256. Passive CMP
evidence remains present. Regional scanner parity and three focused
configuration regression tests passed.

Audit artifacts are in
`/Users/benmasek/WC01/outputs/cmp-preference-disabled-production-2026-10-16/`.
Estimated verification spend is below $0.10 total. Recurring cost increase is
$0; future scans avoid preference worker compute and new preference artifacts.

## Next target: passive Cookiebot loaded inventory

An offline replay of retained DOM from before Options was clicked recovered
61 cookie declarations with purposes and durations, 17 services, and 87
cookie-name patterns. The source SHA-256 is
`cbc789d52dc735aca7a8962506648a3215214ea1f3492a959bc8582c5d90ddb5`.
This replay made no public requests and performed no clicks.

The current passive adapter has no Cookiebot loaded-inventory reader, and the
passive contract deliberately disallows panel-loaded declaration evidence.
A supported extension therefore needs a versioned, document-bound passive
loaded-inventory contract and capture, followed by the existing canonical
assessment and projection. Do not simply copy preference evidence into the
passive packet or relax its validators.

Candidate gains are service identities, cookie purpose/duration information,
and the factual declared-versus-observed name comparison. Preserve attribution
as already-loaded declarations, rather than visible disclosure. The retained
inventory is truncated with unresolved records, so it cannot prove completeness
or establish a missing declaration. No fresh reduction count or score change
is claimed. Implementation of this next target is pending.
