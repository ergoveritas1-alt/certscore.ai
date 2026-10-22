# CertScore.ai vendor coverage — October 22, 2026

Owner-authorized local implementation and retained-evidence replay. No Options panels, live visits, deployment or production report rewrite.

## Observation and classification

New cookie classifications use `certscore.cookie-purpose.v6`. The exact-name rules and primary references are retained in `packages/certscore-vendor-resolver/src/vendor-cookie-coverage.ts`. They cover Clarity, TikTok, HubSpot analytics and preference cookies, Adobe Analytics/Marketo, FullStory, Klaviyo, Yandex Metrica, Pinterest, Mixpanel, Snap, Heap and Reddit. Canonical provider attribution reuses the existing entity/vendor/service IDs. No vendor-wide non-essential inference is permitted. FullStory `fs_cid` and HubSpot preference identities are consent-state cookies, separated from tracking cookies. Ambiguous generic names, security cookies and unsupported identities remain unknown. Version 5 and earlier purpose policies retain their historical meaning.

The legacy Hotjar help article still returns 404. The documentation dependency was resolved through source-only verification of Hotjar's own loader and the exact vendor module it references. The local, unreleased v6 table now includes numeric-site-scoped `_hjSessionUser_<site_id>` and `_hjSession_<site_id>` as non-essential session-replay cookies, using the existing canonical Hotjar entity. Other `_hj` names, survey/preference state, wildcard declarations and placeholders are not promoted. The same module supports exact endpoint attribution for `https://events.hotjar.io/`, allowing already-observed successful traffic to reach the existing California potential-risk assessment. Neither cookie identity nor collector recognition establishes sale/sharing purpose. See `hotjar-coverage-verification-2026-10-22.md` for source hashes, scope and replay results. Historical v5 and older purpose policies remain unchanged.

`canonical_collection_endpoint.v8` excludes Clarity `/tag/` and Meta configuration downloads from collection roles even when fetched without script suffixes. It explicitly identifies bounded Snap, Reddit and HubSpot ad collector paths. Exact canonical endpoint attribution remains a separate requirement. No configuration/library download becomes a qualifying collection request.

## Bounded request inspection

New generic POST proof uses `bounded_ca_request_proof.v4`. Reviewed form/flat-JSON metadata and previously URL-only Criteo/Magnite identifiers are supported within the same body, field and identifier limits. Criteo exact collector recognition no longer requires its visitor identifier to occur in the URL; positive identity qualification still requires a supported nonempty field. Existing LinkedIn specialized encoded proof retains its v3 contract and inflation/field checks. Unsupported nested/batched JSON, duplicate fields, unknown privacy fields, truncated payloads and missing header proof remain explicit limitations.

Collection-proof selection now includes canonically classified analytics/replay collectors as well as advertising collectors, within the same 48 inspections and 32 retained proofs. This improves additional-recipient discovery; it does not turn unresolved analytics purposes into fully qualified CA sale/sharing activity. Potential-risk findings and full qualification remain separate and recipients remain deduplicated across GPC and Reject. No unsupported new full-purpose vendor rule is inferred from a vendor name.

## EU retained evidence interpretation

New `after_reject_nonessential_presence.v2-vendor-coverage` assessments may classify a positively retained, correctly timed cookie snapshot using the v6 purpose rules. Original packet bytes, hashes, names, domains, identities, value hashes, path completion and ancestry proof are preserved; no cookie write or missing observation is synthesized. Existing classified non-essential presence remains usable when ownership is unresolved. Explicit contradictory essentiality is not silently replaced. Canonical entity grouping uses the documented cookie provider when available, with the existing 30-point family schedule.

New observations flow through persisted typed assessment -> normalized concern -> concern policy -> unified finding/checklist -> scoring and downstream presentation. GDPR-ePrivacy scoring version is v23. Historical presence v1 assessments and v22 effects retain their original treatment; new v2 effects cannot be applied under v22. Customer evidence continues to omit deduction explanations.

## Verification and budgets

Replay covers all 122 earlier and 47 later scan records with 359 main/worker/packet integrity checks. Additional post-Reject EU effects were confirmed through canonical findings/checklists: 6 earlier scans (+32 aggregate points), 1 later scan (+15). No additional CA deductions qualify from retained evidence. This does not establish the absence of missed live recipients: discarded bodies and missing response/signal/source proof cannot be recovered.

No additional browser work, Options opening, request/header reads, retries, waits, model calls or larger workers. Existing capture/compute windows and retention limits are unchanged. Estimated incremental classification/proof metadata below $0.50/month at 100,000 scans and 30-day retention; disclosed before proceeding. Typed fields retain hashes/classifications, not raw identifiers or payloads.
