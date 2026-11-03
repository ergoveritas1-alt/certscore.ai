# CertScore.ai CNN CMP capture and canonical verification

Local implementation only. No push, package publication, deployment, production
configuration change, production database access or historical rewrite is part
of this work. The owner separately authorized CNN rescans and subsequently
approved read-only retrieval of only the consent-proof and GPC artifacts for
scan `a2ec0032-c192-45f7-ab99-327662565074`.

## Confirmed capture defect and correction

A real local CNN visit displayed its own “Legal Terms and Privacy” dialog with
one “Agree” control before the registered CMP scope/API was available. The old
readiness helper treated any observed control as enough to consume the single
passive CMP-details read. That read returned `registered_scope_unavailable`;
OneTrust was identified later in the same visit.

The existing read is now reserved until one of these existing observations is
available: a typed first-layer choice pair (Reject plus Accept or Manage/Save); observed controls
with a registered CMP DOM marker; a registered configuration API root; or the
existing late-inspection fallback with direct CMP recognition. The choice-pair
path preserves early DOM-only CMP captures, including Termly. No new
browser read, getter, listener, retry, wait, adapter, lane or deadline is added.
The capture independently rechecks its actual scope, supported API and original
document binding. Readiness never supplies a finding or legal conclusion.

## Actual CNN results

Evidence and sanitized receipts are under
`outputs/cnn-direct-verification-2026-11-02/`. Newly captured sensitive originals
stay in private local scratch directories referenced by the receipts. They are
not public report artifacts. Original core bytes remain immutable.

The direct visit before the scheduling correction retained no basic CMP packet.
The direct visit after it retained 29 cookie declarations and one privacy link
in one 130 ms passive read. These are separate live visits, so their elapsed
times are not a controlled performance comparison.

The initial canonical consent-proof visit used `runScan`, not a synthetic report
fixture. It completed in 8,618 ms with usable coverage, available screenshots,
OneTrust and 29 declarations in an 11,207-byte CMP packet. After the screenshot
transport optimization below, the final canonical visit completed in 8,978 ms
with usable coverage, two available screenshots and the same 29 declarations
in an 11,213-byte packet. Each receipt records the implementation hashes.
The packet joins
the original geometry, observation and DOM snapshot through their own document
identity. The original canonical bundle is strictly parsed and checked against
its recorded byte length and SHA-256 before local materialization.

The actual original evidence passes through materialized consent assessment,
JSON hydration, normalized concerns and concern policy, unified findings,
shared CMP projection, strict public schema, API/JSON display export and the
shared web component. Its rows include 29 cookie names, 22 retained purposes,
22 retained durations and 49 configured categories. Configured categories are
not claimed to be verified selectable controls. Cookie information remains
partially assessed. The final visit has five not-assessed checks: services,
privacy-link presence, privacy-link access, consent-decision recording and
after-choice implementation. They require their own retained proof; neither
CMP identity nor loaded cookie configuration supplies it. No unknown is converted
into a pass, finding or deduction for presentation purposes. Different live
visits can retain different first-layer completeness; the earlier visit had
seven not-assessed checks.

The 390 px and 1,280 px local browser reviews use these actual projected facts.
Enter/Space expansion and document overflow checks pass, with only exact
fixture-backed localhost pages and bundled logos allowed through interception.
No external request or page error occurred in this review. A six-page internal,
unscored CMP appendix excerpt was also generated through the existing shared PDF
renderer and visually reviewed. It is not a complete six-lane report or evidence
of changed production behavior. The five unresolved checks remain unresolved.

## GPC and paired-state boundary

Independent canonical local GPC-off and GPC-on CNN visits retained verified
actual signal delivery. Both terminal semantic observations reported
`api_unavailable`. The existing production-observation builder verifies the
new local source bytes and produces a completed bounded observation with
`semanticProbe=unavailable` and unknown sale/sharing states. Completion is not
honoring. No state is inferred from the loaded OneTrust inventory.

The existing local worker-envelope builder is replayed separately over these
new captures, labelled explicitly as local emulation, with its own new receipt.
It does not replace or relabel the immutable core originals as AWS artifacts.
The matched activity projection is measured. The strict internal impact remains
insufficient evidence because its retained request sets do not verify fully.
The public paired CMP-state packet stays omitted under the unchanged gates.
Local egress was not verified as California; browser locale/timezone is not
geographic proof. This is not a population-coverage claim.

The separately authorized fresh California public scan is
`a2ec0032-c192-45f7-ab99-327662565074`. Its live report still has a failed or
placeholder screenshot and `semanticProbe=not_ready`. Its consent lane reports
representative access but degraded execution; the policy lane received 403.
Bounded read-only AWS metadata shows a normal Lambda completion at 43.1 seconds,
using at most 1,957 MB of 3,008 MB. It does not establish the screenshot failure's
precise cause; no Lambda out-of-memory or timeout conclusion is supported by
that receipt. This run uses deployed code and cannot verify unpublished fixes.
The public CMP export correctly has no audit when the live report is stopped at
the capture-limitation page; missing export fields are not empty CMP evidence.

## Authorized original-artifact diagnosis

The owner granted the narrow exception for this scan's two lanes. Eight exact
objects were read: both original manifests and canonical bundles, the consent
geometry/timing/resource diagnostics and the GPC resource diagnostic. Original
S3 metadata and the manifest-bound auxiliary sizes/SHA-256 values verify. No
baseline, policy or coordinator artifact was retrieved; no original was rewritten.
Originals remain in a mode-0700 private local directory, with mode-0600 files.
Only sanitized summaries and internal evaluation outputs are retained publicly
within the local workspace. The one-off object reads/transfer are estimated below
$0.01; they introduce no recurring service or configured capacity.

The GPC source establishes one successful synchronous callback with supported
section 7 in the inventory. Its diagnostics explicitly report
`cmp_status_not_loaded` and `signal_status_not_ready`, observed 9,010 ms after
that visit's own document commit. Thus this AWS result is `not_ready`, not absent
API, malformed callback or verified current sale/sharing state. The updated
bounded producer projects these exact, source-bound readiness facts in a separate
internal evaluation without changing the historical report. No claim is made
about when readiness subsequently changed or why CNN had not initialized it.
The retained diagnostics do not preserve the exact non-ready status strings or
distinguish every underlying cause; they establish that the required `loaded`
and `ready` values were not returned. A strict public API optional-field replay
also passes with the original assessment status, policy, request facts, activity
comparison and source pair unchanged. The new readiness field was added only
to a separate internal evaluation payload, never the historical response.

The consent source records repeated screenshot transaction/viewport timeouts,
not page/context closure. Its geometry access read is unknown despite HTTP 200;
the document remained interactive, and it lacks bound complete controls. The
earlier HTTP-status retention fix alone cannot repair this scan. Its single basic
CMP read also returned `registered_scope_unavailable`, corroborating the separate
scheduling defect reproduced locally.

Screenshot capture can reuse the consent page's already-attached network/document
CDP session. It now does so for the existing consent screenshot checkpoints,
avoiding repeated session acquisition within each unchanged transaction deadline.
The screenshot helper never detaches this borrowed session. Existing view/surface
fallbacks remain; missing sessions retain the previous owned-session path. A
timeout cannot write late pixels or detach document/network observers. Original
CDP acquisition failures are now retained when the transaction exhausts its budget.
The report's existing no-go description mentions page/context closure only when
that error was actually retained. Finding/status/score gates remain unchanged.

This optimization is locally verified, including actual CNN pixels and canonical
materialization. It has not been deployed or verified on the AWS Linux/proxy
runtime, and does not prove every future screenshot timeout eliminated. Additional
adapters, extended waits, privacy actions and forced On/Off values remain excluded.

## Verification and cost

Affected core suites: 48 passed, zero failed/skipped. Screenshot ownership,
fallback, timeout and late-write tests: six passed. Focused materializer tests:
two passed, preserving the existing no-go decision. The earlier canonical
assessment, shared projection and UI suites passed 90 tests. The full safe local
preflight against `6a9d197a207765ea958059d6ee2f2b2fdd94aa07` passed: 6,088
test executions, zero failed/skipped, including the runtime-graph regressions.
The separate real disposable PostgreSQL run passed all three tests with zero
skips; its private loopback cluster was stopped and removed. The MCP release-asset
guard passed using exactly one approved metadata GET, without downloading the
asset. Exact commands and receipts are under `aws-original-review/preflight`.
The screenshot regression file is included in existing CMP predeploy coverage.
Contracts/API/SDK/MCP builds, affected package typechecks, contract regeneration
and drift checks, final actual-CNN canonical/web reviews and `git diff --check`
pass. Regeneration left source files unchanged. Earlier preflight receipts are
not exact-final-state passes; the final source snapshot is `source-state.json`.

The measured added compact sizes for the final CNN visit are: CMP packet 11,213
bytes; materialized assessment 11,189; normalized concerns 12,085; public CMP audit
11,258. These use the same newly captured evidence with optional CMP-basic facts
omitted in memory as the control, never a rehashed historical source. Local
assessment/concern/public-projection medians were 4.57 ms with those facts and
2.30 ms without; these are local processing measurements, not Lambda timings.

The earlier **$0.95/month estimate was too low**: six existing assessment aliases
are retained through the two root names and both hybrid names. They add 67,134
bytes to runtime JSON, plus about 12,085 bytes of normalized concerns per scan.
One combined conservative estimate is now **$2/month at 100,000 scans and 30-day
retention**, assuming every scan gains the CNN-sized packet. This models roughly
8 GB of extra database JSON plus the small GPC metadata, two retained packet
copies, a PDF reserve, transfer and a 20 ms/scan CPU reserve. Budget assumptions
are $0.125/GB-month for database storage, $0.03/GB-month for objects and $0.12/GB
for transfer, with rounding reserve; these are costing assumptions, not current
AWS price quotations. No production population coverage or Lambda savings are
claimed. No configured infrastructure or paid-service allocation is changed.

The owner explicitly approved the combined allowance of up to **$2/month** at
100,000 scans and 30-day retention after the measured duplication was disclosed.
This supersedes the earlier estimates and authorizes neither deployment nor
infrastructure/configuration changes. The lower-cost alternative presented was
to hold the capture restoration from release rather than discard useful evidence
or reduce existing capture quality.

Compatible consumers must precede new producer packets through the repository's
AWS workflows when deployment is separately authorized. Historical reports and
the global projection version remain unchanged; no repair/backfill is triggered.
