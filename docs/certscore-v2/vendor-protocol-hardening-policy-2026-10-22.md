# CertScore.ai bounded vendor protocol hardening

Owner-authorized local implementation, October 22, 2026. No Options panels, live website reruns, model calls, deployment, production writes or historical report rewrite.

## Canonical observations

Canonical resolver v14 and collection-endpoint v10 identify exact TikTok `/api/v2/pixel` and reviewed subpaths, Pinterest `/v3/`, Snap `/p`, and Klaviyo's documented event/profile collectors. Existing canonical entity/vendor/service IDs are preserved. Pinterest `ct.html` is an identity bootstrap; its monitoring endpoint is support telemetry. Neither becomes a collection finding from a successful resource load alone. Host lookalikes, unrelated paths, script/configuration downloads and unknown collectors remain separate evidence.

New bounded California request proof v5 is additive to v1-v4. Both GPC and Reject call the same canonical decoder. Reviewed envelopes include TikTok's event/context tree, Snap's bounded request batches, Pinterest's selected event/partner-data fields, Reddit's scalar request fields and mirrored SDK routing parameters, and documented legacy Klaviyo form-encoded/base64 JSON plus modern client-event trees. Unverified envelopes, including TikTok event batches and the synthetic HubSpot advertising `/collect` payload, remain unsupported. HubSpot's retrieved advertising SDK delegates to downstream platform pixels; its loader or configuration does not establish a separate HubSpot collection event.

The duplicate-safe bounded JSON reader rejects decoded duplicate keys, prototype keys, invalid JSON, excessive nesting and field overflow. It is shared with the existing LinkedIn decoder, preserving its source and format rules. New formats do not relax the 32,768-byte body limit, depth-eight limit, 128-member/field limit, 16-entry reviewed batch limit, eight retained identifier digests, 48 candidate inspections or 32 retained detailed proofs. No raw visitor identifiers, request bodies or headers are added to retention. These bounds prevent new unbounded parsing work.

Verified visitor fields are hashed only on their exact carrier: Reddit `uuid`/`click_id`, TikTok `ttp`/`ttclid`, Snap `u_c1`, and Pinterest `epik` (plus its existing supported `external_id` field). Routing/publisher IDs and event names are not visitor IDs. Identifiers and purpose are distinct observed facts.

## Supported California roles

Closed identified-advertising recipes require an exact reviewed event collector, publisher and event routing, and a supported transmitted visitor identity. TikTok metadata subpaths do not satisfy the main pixel-event recipe. Snap batch routing and identity must originate in the same event; separate incomplete entries cannot be combined. One supported positive event is sufficient to identify the recipient once. Reddit's SDK copies `id`, `event` and `click_id` into both the URL and form; only equal single copies of those reviewed routing fields are normalized. Conflicts, repeated privacy declarations and duplicates in unrelated protocols remain unsupported.

Explicit request-local vendor processing restrictions are retained conservatively, including independently readable reviewed root/event declarations when unrelated metadata is unsupported. An unsupported partial read does not create a new prerequisite for otherwise eligible GPC URL evidence. Unsupported semantics never become an IAB opt-out assertion or a claim of compliance. GPP/US Privacy, known restrictions, successful response, signal delivery, source/document/request ancestry and applicable completed-choice requirements remain enforced. NPA alone remains context; a cookie match is not added as a prerequisite. Missing supplemental body/header capture does not become a new GPC URL-proof prerequisite. Unknown purpose can support only the approved potential-risk tier when its independent collection requirements are met.

New basis values are `tiktok_pixel_identifier`, `pinterest_tag_identifier`, `snap_pixel_identifier` and `reddit_pixel_identifier`. Canonical API schemas, OpenAPI and SDK types are generated from the shared schema; no SDK version was published. New local materializations use cache generation v38. Historical persisted qualifiers and assessments retain their original basis and score policy. Explicit offline replay does not alter their retained source bytes or stored production reports.

## Scoring and capture budgets

The existing typed retained assessment -> persisted projection -> normalized concern -> concern policy -> unified finding/checklist -> score flow remains authoritative. Full California recipients are unioned across GPC, Reject and applicable explicit opt-out evidence once under the 47-point cap. Potential-risk recipients exclude full recipients and retain their 7/11/13/15 scale and mixed-family headroom. GPP remains a separate five-point family. EU Reject presence remains independent of California purpose and identifiers. Customer reports remain free of deduction explanations.

No lane, wait, retry, timeout, inspection/header-read count, worker size, browser visit, model call or retention period is added. Additional parsing and metadata stay within existing capture allowances. Expected incremental processing plus retained metadata is below $1/month at 100,000 scans, including below $0.50/month for bounded metadata retention. Local decoder timings are diagnostic measurements, not AWS billing or latency guarantees. Source verification downloads are read-only vendor documentation/SDK retrievals; downloaded SDKs are never executed.

## Replay result and limits

All 122 earlier and 47 subsequent scan records were replayed against a pre-hardening baseline taken from the then-current local source. The 359 original merged/GPC/Reject artifact integrity checks passed. Typed projections were JSON-round-tripped and verified on read before canonical concern/finding projection. Both cohorts have zero additional CA and zero additional EU deductions from this pass. Two more successful TikTok request rows qualify for potential-risk evidence on `uoguelph.ca`; its recipient was already counted, so there is no extra recipient or point effect.

The recognized supported collector inventory contains 105 scan/recipient/path pairs: 86 have canonical assessment rows, 18 lack retained successful-response proof, and one successful Google pair at Acuity Brands lacks verified GPC main-document/signal binding following a retained 403 navigation. These are inventory diagnostics, not an estimate of overall false negatives or proof that the unassessed sites honor a choice. Historical missing bodies and response/binding facts cannot be reconstructed. Missing detailed supplemental proof is not a new scoring gate.

Squadhelp's earlier failed packet retains only bounded diagnostic codes; its exact original invariant cannot be recovered. The separately authorized successful follow-up remains valid, but does not establish that the intermittent cause was repaired. This pass adds closed body/identity invariant codes for future diagnostics without public contact or rejected-value logging.

Sources, protocol matrix, all scan rows, coverage limitations, tests and source hashes are retained under `artifacts/vendor-hardening-2026-10-22/`. Synthetic protocol fixtures demonstrate code behavior; they are not observed website findings.
