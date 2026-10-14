# Five-site local evidence verification

The owner requested five diverse fresh local scans, fixes where needed, and a
second fresh scan of the same sites. Exactly ten scans completed. No deployment,
push, production scan or additional retry was performed.

## Selection and contact history

The canonical registry check and central all-channel contact-history export
passed. The canonical selector chose Ars Technica, Patagonia, Drupal, AT&T and
Sentry from a diverse publisher/commerce/CMS/telecom/SaaS pool. Initial selection
excluded blocked and retired domains and respected the SITS contact hold. The
owner's explicit two-pass diagnostic request was recorded as a bounded cooldown
exception. The second pass was the requested unchanged-protocol recheck, including
the two first-pass access-limited outcomes; no CAPTCHA was solved and no region or
identity was changed to bypass access restrictions. Both rounds were recorded with
separate idempotent central-ledger keys and reviewed repository ledger candidates.
Future selection continues to exclude blocked/retired domains.

Historical owner-requested SITS contacts had previously broken registry validation
because SITS is outside the rotating inventory. An explicit `contactOnlyUrls`
ledger field now preserves that history without making it selectable. Unknown
entries still fail validation, history must reference a recorded HTTPS contact,
and history-only entries remain excluded even with a cooldown override. Merge and
outcome recording preserve this field. No global hold or selection policy was removed.

## Fresh reports

| Site | Initial scan | Verification scan | Verified outcome |
| --- | --- | --- | --- |
| Ars Technica | `75fb1f2e-e6b9-424d-bdde-0ad5974bb87f` | `f93bab26-e522-46b5-b5f3-5435e3b5b32e` | Offscreen fixed Fides notice no longer counts as a displayed banner. Second WCAG audit explicitly limited by changing frames. |
| Patagonia | `8f35c143-b914-41cc-8d03-5187a43db6b8` | `a9409464-ad5d-41f0-90f3-4ff5c61fe700` | Both visits returned an unavailable page; no score or substantive findings. |
| Drupal | `9ede8f7f-872a-47c5-a62f-36a23f8f34b5` | `eef72482-d72b-407d-9543-ce8bd7575d96` | Both visits returned a CAPTCHA; no score or substantive findings. |
| AT&T | `c04a3d29-ad97-4e94-ab5a-c017b4f4bcac` | `b3a9d0db-2969-44cd-a08c-69a44d704e55` | One SVG-label issue and three manual-review checks retained in both passes. CMP coverage remains limited. |
| Sentry | `4cb9e97a-7cbb-4d72-9d7a-fa61eebf9965` | `bc2fd49d-13d7-48c6-b3b5-f30ca91bc688` | ARIA command-name and keyboard-scroll issues retained in both passes, one element each. Two additional checks need manual review. |

Each report is available at `http://localhost:3000/scan/<scan-id>`. These are local
simulated sharded runs using the local network path, not production regional
egress verification. Totals ranged from 12.3 to 22.7 seconds; capture deadlines,
lanes and service-call policy were not increased. Live counts and policy discovery
can vary across visits. These five sites did not retain a usable Accept/Reject
pair, so they do not add live prominence validation beyond the earlier SITS run.

## Fixes and verification

Full-document consent recovery previously treated a fixed privacy notice
translated outside the viewport as visible. The existing ancestor-visibility
inspection now excludes positive-size fixed panels outside their viewport, while
preserving zero-size positioning wrappers. Genuine in-flow below-fold controls
and controls within scrollable consent panels retain their existing recovery.
This is an upstream observation fix; no display fallback or synthetic evidence was
added. Ars changed from an incorrectly observed banner/Close control to a completed
empty consent inventory, which flows through the retained assessment and canonical
report projection.

Negative CMP rows also exposed misleading wording: the Reject row could say an
option was available while its status was Not observed, and the absent-banner row
used insufficient-evidence wording. The shared CMP projection now describes its
existing negative statuses explicitly. The same correction covers negative privacy
link rows. Assessment statuses, provenance and scoring policy are unchanged by
this wording repair.

Ars's second accessibility audit retained `frames_changed` after embedded content
changed during the audit. Its results remain withheld and counts stay unknown,
not zero. The report and shared evidence recap now show the explicit reason. This
does not change the audit scope, relax document/frame binding, add findings or
rerun the audit. AT&T and Sentry each retained all 62 evaluated rules and full
element counts with bounded examples: 21 matches / 9 examples and 72 / 10,
respectively. Required audit work remained ahead of optional form visuals.

All ten original producer bundles verified against terminal SHA-256 metadata;
fresh scan IDs are unique. Applicable shared CMP exports match report statuses,
service names and retained audit counts. Withheld screenshot paths remain absent;
available paired-image bytes are checked when applicable. Browser review confirmed
all five verification reports, including explicit unscored access limitations and
the actual corrected CMP/accessibility wording. Full receipts, exports, source
checks, comparison assertions and browser screenshots are ignored local artifacts
under `artifacts/evidence-diversity-20261014/`.

Focused geometry/recovery tests (18), ledger tests (8), canonical consent/CMP
projection tests, accessibility rendering and shared evidence export tests pass.
The final combined report/canonical group passes 49 tests. Scanner build, final web
typecheck, registry validation and diff checks pass. Initial test-harness mistakes
around access-limited report unions and unknown audit counts were corrected by
rechecking retained scans, without additional public contact.

Estimated one-time test and bookkeeping cost is below $1. No new paid calls,
browser lanes, waits, storage service or retention period were introduced. The
small fixed-ancestor geometry check runs inside the existing inventory bounds;
any positive compute delta is estimated below $0.10/month at 100,000 scans, with
skipped hidden-surface work expected to offset it. This is a five-site diagnostic,
not the repository's larger scanner-release calibration gate or an all-CMP
coverage claim.
