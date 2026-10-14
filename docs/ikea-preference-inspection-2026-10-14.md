# IKEA preference inspection follow-up — October 14, 2026

Local changes only. No deployment, production rewrite, new public-site contact or
fresh scan was performed. The saved IKEA report remains a historical result.

## What the retained evidence establishes

The preference packet for scan `b3aa4074-6fd8-440c-84b2-2a7e6aa99b8c` stopped
before Options was clicked:

- Duration: 4,962 ms of the existing 17,000 ms allowance.
- OneTrust recognized, registered `onetrust_preferences.v1` binding selected.
- Zero actions, no opened preference panel, no controls or declarations retained.
- Limitation: `preference_surface_binding_unavailable`; not a budget timeout.
- Original packet SHA-256:
  `4d6d2e65b43d8bcc05c104f8c3b26278332218e77ad07971279c90cfefe05006`.

The earlier IKEA packet `f9f5df51-c0e0-442d-8409-b4ef2a6aa01d` stopped with the
same generic limitation after 7,941 ms, also with zero actions. Both packets still
parse under the updated contract, without invented binding diagnostics or changed
assessments.

The previous guard required exactly one already-present hidden preference panel.
Its single generic error covered missing, duplicated and already-visible panels.
The retained packets do not distinguish those branches, so the exact IKEA panel
state cannot be established retrospectively.

The independent consent-proof capture retains the named button
`#onetrust-pc-btn-handler`, the label “Cookie settings, Opens the preference center
dialog”, and the `#onetrust-consent-sdk` vendor root. That evidence explains the
registered selectors; it does not supply the preference session's missing DOM or
prove that its root/panel had the same state.

OneTrust documents asynchronous banner/preference UI loading and the
`#onetrust-pc-sdk` panel identifier:
[loading sequence](https://developer.onetrust.com/onetrust/docs/server-side-rendering-performance-availability),
[preference panel identifier](https://developer.onetrust.com/onetrust/docs/display-preference-center).
Delayed/on-demand panel creation is a supported inspection case to handle, not a
proven diagnosis of this historical IKEA visit.

## Fix

Version the registered binding as `onetrust_preferences.v2`:

- Existing hidden panels still require the same connected node after the click.
- An absent registered panel can be inspected after the single authorized Options
  click only when its control belongs to one pre-existing registered OneTrust
  vendor root. Revalidate control selector, label, parent and exact document before
  dispatch.
- The exact registered panel must then be unique, visible, labelled with a
  dialog/region role, and inside that same connected root. Replaced roots, unrelated
  modals, panels outside the root, duplicates and document changes fail closed.
- No vendor opening API, second click, Save, Accept, checkbox change, navigation,
  retry or additional browser visit.
- Read only visible cookie tables. Closed sections remain outside inspected
  inventory and cannot be labelled as visible declarations.

Add bounded optional `cmp_surface_binding.v1` diagnostics: prior match count,
visibility, binding mode and outcome. Preserve historical diagnostics without
upgrading them. Missing, ambiguous, already-visible, parent-unbound, changed and
expired transitions can now be distinguished. Diagnostics alone do not establish
opening proof, controls, services or a positive criterion assessment.

The existing 17-second maximum, memory-adjusted 56 GB-second envelope and existing
join limit are unchanged. A newly successful inspection can use more of its
already-approved allowance; no extra allowance is added. Optional diagnostics add
roughly a few hundred bytes per packet, with estimated object-storage cost below
$0.01/month at 100,000 scans. No capacity or retention increase. If deployed later, the updated consumer schema
must accompany the producer diagnostics; this change is not being deployed now.

## Verification

- Seven observer tests, including a delayed on-demand panel and negative cases:
  missing parent, pre-existing duplicate/visible panel, replaced root, outside-root
  panel, duplicate new panel, wrong role, navigation, missing panel and timeout.
  One Options click maximum; no Save or Accept; closed-table declarations excluded.
- On-demand timeout fixtures run with the existing 3,600 ms allowance at 10,240 MB,
  with no deadline extension.
- 31 contract/known-CMP registry tests, including historical packet compatibility,
  bounded diagnostics and malformed-diagnostic rejection.
- 32 CMP assessment/projection tests, including proof that successful-looking
  diagnostics cannot promote an IKEA-style limited packet without actual retained
  controls/opening evidence.
- Scan-core build, web typecheck and whitespace validation.
- Both retained IKEA preference packets reviewed without changing original bytes.

### Owner-authorized fresh local verification

Fresh full scan `e5478fa0-d292-4e3f-8991-b72ba2d5de23` completed on October 14,
2026 at 18:50 UTC, with one canonical terminal result in 16,986 ms. Verified the
producer artifact SHA-256 and schema, persisted report and shared evidence export
criterion/status parity, accessibility counts, and withholding of unapproved
images. This local simulated-Lambda run is not proof of production EU egress.

Live preference verification did **not** succeed. The v2 recipe was selected,
but inspection returned at 8,337 ms with zero Options clicks, no controls or
declarations, and `surface_binding` / `priorMatches: 0` / `timed_out`. The packet
uses `preference_budget_exhausted`, but that reason also covers Playwright
`TimeoutError`; elapsed time does not establish exhaustion of the 17-second
absolute allowance. The retained diagnostics do not identify the exact failed
locator operation, so delayed panel creation is still not proven as the cause.

Banner and Reject remain Observed. Prominence is Not assessed: the geometry-proof
image review reached its finalization deadline with a 75 ms allowance and was
withheld; no visual comparison survived into the verified bundle. The independent
Reject lane also hit its existing eight-second tail limit. No missing evidence
was promoted or borrowed from a historical scan. Accessibility retained one
`list` violation affecting two elements plus two manual-review rule groups
(contrast: 46 elements; duplicate ARIA IDs: one). Eight representative examples
were retained across 49 observed nodes, with the other 41 explicitly accounted
for. UI and export retain the full counts.

The normal anonymous submission was rejected at 20/day before creation. The owner
then approved one local exception to 21. A dev-server memory restart interrupted
that admission before acceptance; submission-status and the unchanged quota count
confirmed no scan had been accepted. Reusing the same request ID created exactly
one scan, and source was immediately restored byte-for-byte to 20 before polling.
No production setting, capture budget, requester identity, or deployment changed.
Estimated one-time verification/contact-ledger cost remains below $0.10. No
second target scan was run. Historical assessments remain unchanged. The actual
contact was recorded in both the repository cooldown ledger and the central
all-channel ledger under idempotent key
`ikea-preference-verification-20261014`.

The full report is opened locally with CMP Details expanded. Remaining live
limitations must not be described as a successful deeper-preference verification.

Ignored review receipts and test logs: `artifacts/ikea-preferences-20261014/`.
