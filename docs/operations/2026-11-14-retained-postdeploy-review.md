# CertScore.ai retained post-deployment corrections

Local only; no deployment, live scans, production writes or recurring cost increase.
Source: artifacts/daily-scan-audit/runs/20261114T160623Z-scheduled-v10,
creation interval after 2026-11-13T23:38:36Z through 2026-11-14T16:08:47Z.
133 hash-verified exports, 99 reportable, 34 no-go; four failed attempts lack exports.

## Corrections

Leiden scan 02c70240-c2b3-402d-99d7-75233b670b28 retained
/async/spotlightcarousel as an identity-sync request. Anchor the producer's
sync path pattern and both downstream promotion checks at token boundaries.
Regression includes the retained redacted URL and an explicitly synthetic generic
content-ID variant; original query values are not reconstructed.

Care bd4c00ae-7d56-4d4d-9d67-c9d01675e8f7 and Bologna
d9af96c9-1dde-4497-ac5d-f5d93fa25040 retained zero after-click requests,
positive storage and unconfirmed registration. Shared finding copy now distinguishes
cookies/services, click completion and registration without changing eligibility.
Transport checklist headings are neutral check names rather than assertions of success.
The historical-framework heading explicitly requests context review. Tagesschau's
original complete policy bytes are not locally available; current public court-history
wording does not establish obsolete current guidance. No historical finding is rewritten.

## Confirmation investigation

Among 99 reportable exports: Accept has 23 observations, 20 completed clicks,
17 completed windows and five confirmed decisions. Reject has 13 observations,
10 clicks, nine completed windows and four confirmed decisions.

- Care: sdk_document_changed and configuration_malformed on both actions;
  baseline configuration is unverifiable. Stable terminal document diagnostics
  do not establish that the SDK retained its original binding.
- 2k.com and ChargePoint: sdk_unreviewed/group_universe_incomplete; JW Player:
  category_hierarchy_unsupported/group_universe_incomplete. These require
  reviewed adapter/configuration support, not weaker confirmation gates.
- Taboola Reject, Audible and Virgin Media O2 Accept: receipt_format_unsupported.
  The sanitized export does not contain enough original receipt bytes to design
  or validate a new decoder safely.
- BetterHelp: configuration_missing. DataHive, Figshare, IZA, Webglobe and
  Bologna retain no_registered_complete_decision. This does not distinguish a
  genuinely absent decision from an unsupported representation.
- Frameo and Rock Paper Shotgun retain control/label or early termination limits;
  keep these separate from clicked-but-unconfirmed decisions.

Several unsuccessful initial confirmation loops ran 35–73 passes. More waiting
is not demonstrated to solve schema/configuration/binding failures. Preserve
existing deadlines and source proof. Next implementation should use already-retained
original packets/configuration witnesses to build provider-specific offline fixtures;
missing bytes remain a limit, not permission for a new visit.

Google Analytics request attribution now requires a request-local endpoint anchor;
cookie carriage alone cannot attribute first-party scripts or carousel XHRs to Google.
Retained collection proof plus an exact Analytics collection path preserves the
first-party server-tagging endpoint. Cookie observations retain their attribution.

## Original-source search follow-up

Searched local WC01 artifacts/outputs for Care, Taboola, 2k and Bologna scan
identities, inspected the current audit intake and older November 13 original
packet archive, and checked relevant WS01 and temporary artifact filenames.
The separate CertScore-archives directory contains an October branch archive;
the home artifacts directory contains store assets. The expected
/Volumes/miniben/CertScore mount is unavailable. No AWS reads or new site contacts
were made. The current matches are public exports, intake arrays, privacy-form
receipts and derived dashboard data, not original action/configuration bodies.
The older archive belongs to different scan identities and is not substituted.

The current intake's priorityEvidence arrays retain execution, timing and packet
hashes, but do not carry the receipt/configuration bodies. Public availability
summaries retain counts and value-proof counts, not the original values. Care's
Reject summary retains six initial receipt observations, five limited, with
truncation; its configuration_malformed/sdk_document_changed reasons remain
unresolved. Bologna's zero retained observations cannot establish receipt absence.

Added fixtures for all 18 unconfirmed public action summaries in this cohort,
verifying their containing export bytes against the cache manifest before
extraction. Fixture provenance explicitly distinguishes the verified export hash
from the referenced original packet hash. Added 20 regression cases plus ran the
three existing receipt-availability tests: 23 passed. These prevent availability
metadata being promoted to confirmation and preserve truncation/zero-observation
semantics. No semantic decoder or confirmation behavior was changed: available
local evidence does not justify one. Next needed input is the original packet
matching each referenced SHA-256, plus its source-bound configuration witness;
this is an evidence-availability limit, not a diagnosed production decoder bug.
