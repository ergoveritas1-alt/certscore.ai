# CertScore.ai action confirmation follow-up — November 13, 2026

Owner scope: localhost verification, review all 34 retained unconfirmed paths, Accept and Reject regression tests, unchanged budgets, exclude ergoveritas.com, no deployment. The SITS hold remains intact.

## Findings and implementation

The initial four localhost full scans all produced ready reports. OLX confirmed both actions, without the earlier element-handle worker crash. TransIP completed both action captures but did not confirm its unsupported Iubenda receipt. Flickr and Sanity did not join Reject because their first-layer inventories did not recognize a visible German Reject label. This is separate from a worker exception or a proven failed click.

Both retained geometry artifacts contain the exact label `Nicht wesentliche Cookies ablehnen` in the Osano consent dialog. The shared classifier recognized neither observation nor action usage. Added that exact German phrase to the canonical label registry v29. This changes recognition in both paths without adding a recipe, changing authorization, or claiming consent registration. Six regression cases cover Accept, Reject and unrelated labels for both usages; the two Reject cases fail before and pass after the change.

Expanded the retained projection regression fixture from eight to all 34 checksum-verified unconfirmed packets (22 Accept, 12 Reject). All still retain their original click, capture and unknown registration semantics. Historical records are not rewritten. A successful click, completed capture or diagnostic receipt must not fabricate a confirmed execution.

## Confirmation support review

No new semantic confirmation adapter is justified by these retained packets alone. The complete per-path inventory appears below. Existing canonical confirmation remains enabled where its proof requirements are met, as demonstrated by both OLX paths.

Iubenda is the strongest candidate for further support: TransIP retains boolean facts for purposes 1–5, and the hashed paths match those documented fields. However, diagnostic capture omits other fields and does not bind the complete applicable configuration. Iubenda documents additional purposes, TCF, and other scopes. A receipt-only five-category decoder would silently assume those scopes away. Before enabling support, retain a bounded, source-bound configuration witness in the existing read, then validate exact receipt identity, complete scope and fresh write/readback through a typed decision proof. Do not reinterpret old diagnostic-only records.

Primary source reviewed: [Iubenda advanced configuration and API guide](https://www.iubenda.com/en/help/1205-how-to-configure-your-cookie-solution-advanced-guide-2/), sections on per-purpose consent, additionalPurposes and getPreferences. Documentation review is not a target-site scan.

For OneTrust, review retained SDK identities and lifecycle evidence before extending exact source pins; do not relax document binding or silently remove unmatched categories. For generic/custom CMP paths, obtain reviewed complete state semantics and configuration binding first. For Sanity, preserve mixed/opposite states and require a fresh saved-event witness.

## Retained cohort

| Site | Action | Retained diagnostic reasons |
| --- | --- | --- |
| starbucks.com | accept | no_registered_complete_decision |
| gwu.edu | accept | no_registered_complete_decision |
| gwu.edu | reject | no_registered_complete_decision |
| olo.com | accept | sdk_unreviewed, group_universe_incomplete |
| olo.com | reject | sdk_unreviewed, group_universe_incomplete |
| unicef.org | accept | no_registered_complete_decision |
| unicef.org | reject | no_registered_complete_decision |
| colorado.edu | accept | no_registered_complete_decision |
| www.gov.uk | accept | no_registered_complete_decision |
| www.gov.uk | reject | no_registered_complete_decision |
| lww.com | accept | sdk_document_changed, group_universe_incomplete |
| lww.com | reject | sdk_document_changed, group_universe_incomplete |
| dollartree.com | accept | category_hierarchy_unsupported, group_universe_incomplete |
| elsevier.es | accept | no_fresh_decision, no_registered_complete_decision, configuration_missing |
| kuleuven.be | accept | sdk_document_changed, group_universe_incomplete |
| arte.tv | accept | receipt_format_unsupported, no_registered_complete_decision |
| arte.tv | reject | receipt_format_unsupported, no_registered_complete_decision |
| uliege.be | accept | no_registered_complete_decision |
| uliege.be | reject | no_registered_complete_decision |
| mym.fans | accept | receipt_format_unsupported, no_registered_complete_decision |
| mym.fans | reject | receipt_format_unsupported, no_registered_complete_decision |
| heylink.me | accept | sdk_unreviewed, group_universe_incomplete |
| blackline.com | accept | sdk_document_changed, group_universe_incomplete |
| nobelprize.org | accept | sdk_unreviewed, group_universe_incomplete |
| shell.com | accept | no_registered_complete_decision |
| shell.com | reject | no_registered_complete_decision |
| parallels.com | accept | sdk_unreviewed, group_universe_incomplete |
| ultahost.com | accept | no_registered_complete_decision |
| ultahost.com | reject | receipt_format_unsupported, no_registered_complete_decision |
| transip.eu | accept | receipt_missing, receipt_format_unsupported |
| transip.eu | reject | receipt_missing, receipt_format_unsupported |
| sanity.io | accept | opposite_or_mixed_decision |
| sanity.io | reject | api_saved_event_unverified |
| c6gj-static.net | accept | no_registered_complete_decision |

## Verification artifacts and costs

Private run receipts, canonical packets, local report checks and per-path review: `artifacts/action-confirmation-followup-20261113/`. Each live contact is persisted centrally with an idempotent run key and merged into the repository contact ledger. The registry check passed; selection used the owner’s cooldown waiver.

No scan/action budget, memory configuration, deployment, historical record, scoring policy or retention period changed. The classifier literal and offline tests introduce no recurring infrastructure cost. Existing local full-scan work remains within the authorized verification scope.

## Final localhost results

Six full localhost scans, four initial plus two classifier follow-ups, produced six ready reports. This is targeted regression verification, not a representative population benchmark.

| Site | Accept | Reject | Form/image evidence |
| --- | --- | --- | --- |
| OLX, initial | Confirmed, packet ready 6,929 ms | Confirmed, packet ready 5,603 ms | One post-Accept form and one available image retained |
| TransIP, initial | Click/capture completed, unconfirmed | Click/capture completed, unconfirmed | No post-Accept form observed |
| Flickr, initial/follow-up | Click completed; request capture truncated, unconfirmed | Initial passive barrier; after classifier fix clicked/captured, packet ready 14,476 ms, unconfirmed | Three report images retained from other capture scope; post-Accept forms limited by document/frame changes |
| Sanity, initial/follow-up | Initial packet retained with two forms; follow-up packet missing at join deadline | Initial passive barrier; after classifier fix clicked/captured, packet ready 14,202 ms, unconfirmed | Initial two post-Accept images unavailable; four other report form snapshots survive in both runs |

The follow-up report inventories positively observe Reject for both Flickr and Sanity. No worker exception is reported on those Reject paths. Their unknown registration remains factual: Flickr configuration/groups are unverified; Sanity lacks the fresh saved-event witness.

Sanity follow-up Accept is an unresolved reliability result, not a clean pass. Its retained worker checkpoint contains only observation_started. The coordinator recorded 20,996 ms elapsed from invocation and exhausted its unchanged 6,000 ms post-passive join allowance. No Accept packet or dispatch checkpoint was retained. These artifacts do not locate the stalled operation or prove a completed click, and they do not justify blaming form finalization. Do not increase the budget or fabricate a packet. Next investigation should localize startup/navigation/resolution/finalization with bounded checkpoints before changing behavior.

The report-level form snapshots above must not be presented as post-Accept images where the action packet is missing or says unavailable. No forms were submitted.

Validation: 88 classifier tests (including six retained German cases), 72 action reliability tests (including the expanded 35-test cohort suite), and six consent decoder tests passed. The two German Reject cases failed before the fix. Contracts and scan-core builds, scan-core typecheck, calibration registry validation and diff whitespace checks passed. The new six cases are included in test:action-retained-reliability for future runs.

No semantic decoder was added: the 34 historical paths remain unconfirmed. This is an explicit evidence limitation, not a claim that their sites failed to register consent. The exact-label fix improves eligible path recognition; it cannot establish semantic registration by itself.
