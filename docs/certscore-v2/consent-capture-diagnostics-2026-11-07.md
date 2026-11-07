# CertScore.ai shared consent-control capture diagnostics

The November 7 owner-approved local change explains the existing bounded final
geometry refresh for Accept, Reject and Options. It does not change capture
timing, recognition, action dispatch, control conclusions, findings or scoring.

`consent_capture_diagnostic.v1` records the refresh outcome, attempt flag,
duration and outer-gate skip reason. It carries the inventory and retained
geometry timestamps, their signed difference only when document binding
matches, and the original observation ID and loader token. Missing geometry,
unmatched documents and a finalization path that never reached the refresh
stage remain explicit. No browser read is added to collect these diagnostics.

The diagnostic travels inside the typed consent observation in the original
canonical bundle. The WC01 materializer accepts it only from the latest exact
canonical observation with matching ID, time and document. It is retained in
`ConsentControlAssessment.coverage.captureDiagnostic` and included in the
assessment source hash through its original observation. The existing bounded
audit query already selects the complete coverage object. No new query, task,
transport field, metric identity or historical reconstruction is required.

The field is optional and independently versioned. Existing assessments retain
their stored source hashes, versions and conclusions. A missing historical
diagnostic means unavailable. It never means a refresh was skipped or a control
was absent. Diagnostics cannot supply proof for any control conclusion. Positive
observations remain independent of unrelated incomplete inspections, and each
negative still requires its existing control-specific completeness evidence.

## Verification

Local tests cover all three control states for each intent, historical
round-trip behavior, wrong observation/time/document binding, malformed diagnostic
metadata, same-URL document replacement and the existing single-refresh caps.
Browser fixtures block external requests. The local-only retained review tool
re-reads hash-verified exports and generation-bound assessments, and rejects
changed bytes, duplicate IDs, generation conflicts and unsupported negatives.

The November 7 retained cohort contains 51 reportable rows at the original
08:49:19 Pacific cutoff. All 153 Accept/Reject/Options comparisons agree.
Accept and Reject each have 5 observed, 30 not observed and 16 unknown. Options
has 3 observed, 31 not observed and 17 unknown. All 51 historical diagnostics
remain unavailable. These are consistency results, not independent site ground
truth or measured precision/recall. Four customer evidence summaries explicitly
remain unavailable, separately from the retained first-layer state comparison.

Run the same bounded, local-only review with:

```sh
TSX_TSCONFIG_PATH=tsconfig.base.json node --import tsx scripts/review-retained-consent-controls.ts DASHBOARD_JSON LA_DATE NEW_OUTPUT_JSON
```

## Live diagnostic authorization and cost

The owner subsequently authorized verification rescans and explicitly waived
cooldowns for this investigation. The selected sample is at most four passive
local consent-proof scans with the existing standard 35-second module bound,
one per site, no privacy actions, policy/model calls, AWS scanner invocations,
region switching or automatic reruns. Existing explicit contact holds and
blocked-target states still apply. Central history and all attempted contacts
are recorded using the existing ledger workflow and the owner waiver.

All four authorized scans completed locally. The reviewer inspected retained
screenshots and geometry without additional site visits. Linkfire (`lnk.to`)
retained explicit Accept, Decline and Cookies settings on the matching geometry
proof screenshot, and all three assessments are observed. Its later screenshot
does not erase the earlier verified controls.

StaseraInTV retained geometry 7,828 ms before the final inventory. Its geometry
records 16 frames, 12 captured, and unstable frame coverage. The existing
refresh was ineligible and not attempted. The retained frame count independently
fails the current refresh eligibility cap. A later read alone is therefore not
an established solution; no frame cap was raised.

Go.dev retained current geometry and the visible notice controls “Learn more.”
and “Okay”. The latter has no canonical semantic match, leaving all three
intents unresolved. This identifies a semantic-review case, without establishing
that acknowledgment grants consent or that a hidden refusal route exists.

Phys.org returned an HTTP 400 security-block page. The retained access assessment
is `access_no_go`; all three controls remain unknown. The contact ledger records
that no-go independently of the local scanner's terminal completed status.
No retry or region/identity switch occurred.

These four visits establish useful diagnostic coverage and preserve the known
positive example. They do not establish improved population detection accuracy,
a same-environment production comparison or causation by the November 6 rollout.
The initial v1 diagnostic's generic `ineligible` outcome still requires the
existing structural coverage facts to identify the particular inner prerequisite.
The original captures are retained unchanged.

Local testing adds no recurring infrastructure cost. After a separately
authorized release, bounded diagnostic metadata in existing records is estimated
below $0.10/month at 100,000 scans, allowing roughly 1 KB per diagnostic in four
retained copies. This is a conservative planning estimate, not measured billing.
The separate one-time central ledger read/write pair is estimated at $0.06.

No production deployment, flag change, historical rewrite or new dashboard
publication is part of this implementation. Release adoption requires the
existing scanner/web rollout and reviewed audit source gates. Detailed source,
test, parity and live receipts are retained under
`outputs/consent-capture-diagnostics-2026-11-07/`.

## Frame prioritization follow-up

The refresh diagnostic can now carry an optional eligibility blocker for the
retained candidate or the live refresh prerequisites. Earlier diagnostics
remain readable without that field. A reported blocker describes the first
failed check and is independent of the control assessment.

Geometry capture keeps the main document first and ranks registered CMP domains
ahead of registry URL hints. URL hints use the frame origin and path. Query
strings and fragments alone do not raise priority. The cap remains 12 frames,
including the main document. Omitted frames keep structural coverage limited.

A controlled 16-frame fixture recovered a Reject control in a late CMP frame
ahead of query-only decoys. When that control was removed, Reject remained
unknown. A separately labeled set of synthetic notices also verified the
existing treatment of ambiguous acknowledgment, explicit acceptance, refusal,
and settings wording. These are local fixture results. Production impact
requires measurement on fresh scans after release.

## Local late geometry trial

For an otherwise eligible stale empty packet over the frame cap, a local
opt-in can use the existing final geometry slot to seek visible first-layer
controls. The same loader, current screenshot, frame stability checks,
12-frame cap, and 1,100 ms read budget apply. Only verified limited geometry
with a positive control can replace the older artifact. The scanner leaves the
DOM inventory partial and never uses this path to establish absence.

The StaseraInTV follow-up exercised this path. The read finished in 57 ms with
no visible consent controls. The earlier artifact remained retained and Reject
stayed unknown. The trial retained 12 of 18 frames. The preceding run retained
12 of 16 and skipped the final read. See the receipts under
`outputs/stasera-late-geometry-2026-11-07/`.

## Release boundary and master item

Keep `privacy.control_observation.presence[control=reject]` and its Accept
and Options siblings. Each describes first-layer presence under the canonical
inspection contract. Refresh eligibility and timing belong to the
observation-bound `coverage.captureDiagnostic` record. They are retained for
investigation and do not create a second presence item, report finding, or
dashboard measure.

The release candidate includes bounded frame ranking and diagnostic retention
in the scanner and WC01 materializer. The overflow refresh remains an explicit
local opt-in. Its one live trial verified that the read can run; it left all
three control assessments unknown. Run the canonical clean-commit deployment
preflight against the live revision at release time.
