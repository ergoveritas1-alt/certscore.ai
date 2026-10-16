# CMP details presentation, local only

The report and detailed-evidence export use **CMP details** as the section title for recognized providers, observed consent banners without a recognized provider, and complete visits with no observed banner. The section title is normalized when reading earlier `cmp_details_experience.v1` metadata, without changing the saved metadata.

- A recognized provider keeps its canonical name and supported CMP criteria.
- A consent banner with no recognized provider says `Provider: Not identified`. It is called a custom banner only when the retained provider label explicitly says `Custom consent banner`, `Custom consent mechanism`, or `Custom CMP`.
- A complete visit with no identified CMP or observed banner says `No CMP identified. No consent banner observed on this visit.` The 13 retained checks remain in the export while the compact report view omits their empty disclosure.
- Incomplete or blocked capture says the determination could not be made. It does not assert absence.

This is a presentation change. It does not alter consent assessments, criterion statuses, normalized concerns, findings, scores, or report persistence. Incremental infrastructure cost: $0 per month. No new browser session, model call, storage retention, or deployment is involved.

The local browser examples are under `/Users/benmasek/WC01/outputs/cmp-details-unified-local-2026-10-16/`. Cookiebot and Hugging Face are regenerated from retained EU-Ireland diagnostics. The explicit custom implementation case is a labeled synthetic fixture. The original reports remain unchanged.
