# OneTrust passive cookie inventory extraction

Local implementation and one fresh EU-Ireland verification on October 16, 2026.
No deployment, push, Options interaction, extra browser lane, new model call,
retry or timeout increase. Historical reports and scoring policy are unchanged.

## Supported source mismatch

The prior report retained 65 cookie names, zero purposes and 20 durations.
It included an Options inspection and did not retain the raw configuration.
Read-only replay preserves its original conclusions; missing fields cannot be
recovered retrospectively.

OneTrust's public SDK 202604.2.0 reads cookie-level lowercase `description`.
Our adapter read uppercase `Description` only. The SDK's `getDuration` reads
`Length` in days and `DurationType` (1, 7, 30, 365) as the display-unit divisor.
Our adapter retained session lifetimes and explicit-unit `Lifespan`, but missed
those persistent-lifetime fields. The public published configuration referenced
by the historical network capture independently confirms this shape. It is an
engineering reference, not a reconstruction of that historical browser session.

Sources:
- https://developer.onetrust.com/onetrust/docs/javascript-api
- https://cdn.cookielaw.org/scripttemplates/202604.2.0/otBannerSdk.js

## Canonical fix

The shared OneTrust reader now retains the explicit cookie description, preserving
legacy uppercase descriptions. Conflicting aliases remain unresolved. Host,
vendor and category descriptions never fill a missing cookie purpose.

Persistent duration extraction requires `IsSession: false`, a finite bounded
strictly parsed nonnegative `Length`, and a recognized numeric `DurationType`.
Exact multiples use the specified display unit; other values retain exact days
without SDK rounding. Session cookies remain Session. Zero-length cookies use
only an explicitly available configured SDK short-duration label; otherwise the
duration remains unknown. Numeric `Lifespan` strings alone do not establish units.

New producer diagnostics use `onetrust_loaded_configuration.v4`. Passive packets
retain the same version marker, source, loader binding and existing evidence
limits. Historical v1/v2/v3 diagnostics stay readable. The single documented
`GetDomainData()` call, 100-record shared allowance, 80-service ceiling, 64-group
bound and 240-character detail bounds are unchanged. This source does not prove
visible disclosure, functioning category controls or complete declarations.

The existing typed basic capture flows through verified bundle materialization,
canonical CMP assessment, persisted consent projection, normalized concerns,
concern policy and shared report projection. There is no UI repair or new score
rule. Inferred cookie purposes remain separate from declared descriptions.

## Replay and fresh verification

| Evidence | Names | Purposes | Durations |
| --- | ---: | ---: | ---: |
| Historical report, preserved | 65 | 0 | 20 |
| Published-configuration fixture with old extractor | 65 | 0 | 20 |
| Same configuration fixture with fixed extractor | 65 | 62 | 54 |
| Fresh passive EU-Ireland capture | 65 | 62 | 54 |

Fresh scan: `onetrust-passive-inventory-local-onetrust-6caf3bef-30c1-4205-96d0-bebe556dda70`.
Browser and HTTP egress both verified 63.33.9.201, Ireland, AWS eu-west-1.
The local code ran through the existing Ireland proxy. All six expected workers
completed; the preference lane was disabled and no preference packet was produced.
Accept and Reject remained separate authorized workers.

The page received a successful main document and substantive consent evidence.
Cloudflare signals left access classified `continue_with_diagnostics`, with no
blocking frame challenge. This is a useful bounded diagnostic, not proof of
provider-wide reliability or a fully unrestricted site visit.

Cookie information remains Partially assessed: three descriptions and eleven
persistent durations are still absent from the bounded source. Several lifetimes
are zero with no short-duration label available from the public getter. No values
were invented to complete the row. Unresolved CMP checks remain 5 of 13, with
zero whole checks resolved: prominence, category controls, privacy-link access,
complete missing-declaration comparison and cookie information. The historical
visit had Options enabled; the fresh visit reaches this coverage passively.

## Validation, preservation and cost

130 focused tests passed across shared extraction, passive capture, contract,
canonical assessment/projection and preference compatibility. Tests cover alias
conflicts, malformed numeric values/units, exact duration conversion, missing
fields, cookie/host distinction, one getter call, zero clicks, document drift,
partial status, typed persistence and score-neutral projection. Contracts,
scanner-core and web TypeScript checks passed. Historical replay output is
byte-identical and all 315 preserved source artifact hashes are unchanged.
Fresh bundle and manifest bytes were verified against terminal SHA-256/size
metadata before separate local materialization. No customer report was persisted.

A successful central all-channel history export and canonical target selection
preceded the owner-requested cooldown exception. The contact was persisted using
idempotent key `onetrust-passive-inventory-local-2026-10-16-6caf3bef`; the reviewed
repository ledger candidate changes only OneTrust and restores normal cooldown.
Temporary Ireland SSH access was removed and the tunnel stopped.

There is no increase to maximum payload, browser/model calls, lane count,
retention policy or capacity. More populated bounded cookie text is estimated
below $0.50/month at 100,000 scans/month, assuming 10% OneTrust share, one-year
retention and multiple retained projections. The one-time verification and ledger
helpers are estimated below $1 total. No recurring service was introduced.

Artifacts: `/Users/benmasek/WC01/outputs/onetrust-passive-inventory-local-2026-10-16/`.
Key files are `comparison.json`, `configuration-fixture-replay.json`,
`preservation.json`, `fresh/egress.json`, and `fresh/onetrust/cmp-projection.json`.
