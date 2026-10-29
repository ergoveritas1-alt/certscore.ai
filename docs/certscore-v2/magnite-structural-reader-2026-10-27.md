# CertScore.ai Magnite structural reader — October 27, 2026

The owner requested the next implementation step after the bounded diagnostics identified four member-limit and two depth-limit outcomes. The local change uses the proposed full-validation alternative. No scan, deployment, model call or paid cloud helper was run.

## Change and explicit limits

Only the exact HTTPS Magnite POST collector at fastlane.rubiconproject.com/a/api/prebid-exchange.json receives the new magnite_json_structure.v1 policy: 256 members shared with query fields and maximum depth 10. The generic reader remains at 128 members and depth 8. Both retain the 32,768-byte cap. Existing per-array limits, the 48-inspection/32-proof caps, header reads, scan deadlines, worker sizes and all action boundaries remain unchanged.

This is an explicit Magnite-only structural allowance. It does not reinterpret the old limits or skip unrelated metadata. The entire bounded JSON input is traversed, decoded duplicate keys and unsafe object keys are rejected, and the existing strict endpoint field schema still applies. Unknown publisher-routing shapes remain unsupported.

New captures carry bounded_ca_request_proof.v14, bounded_ca_body_diagnostic.v4-magnite and the structural policy marker. Expanded limit counters carry bounded_json_limit_context.v2-magnite, stopping at member attempt 257 or depth 11. The old counter version retains its 129/9 bounds. Validation rejects new profile metadata relabeled as old proof/diagnostic versions or attached to another endpoint/method. Every v14 proof records processing coverage.

The partial privacy reader uses the larger allowance only when explicitly requested by the exact POST capture. Existing callers retain the old default. Positively observed request-local restrictions remain visible when unrelated metadata is unsupported; a partial read does not establish complete body coverage.

The existing Magnite activity qualifier, GPC and post-Reject policies recognize the new proof version. Supported endpoint routing, same-request identity, successful response, original source/document binding, delivered GPC or applicable completed Reject and processing/GPP gates remain independent. No scoring weights, recipient union, 47-point cap, EU rules or GPP family changed.

Header framing/encoding that supersedes a structural-limit outcome now clears the obsolete limit context as well as its reason, keeping the retained diagnostic consistent with the final body status.

## Meaningful verification

A synthetic three-impression body with twelve banner formats per impression exceeds the old shared member limit but passes the new allowance and unchanged field schema. It retains an exact auction/identity witness and reaches the canonical finding/scoring pipeline. This fixture represents supported structures; it is not a reconstruction of the six historical publisher requests.

Adversarial tests verify exact member/query/depth/UTF-8 byte boundaries, malformed/truncated JSON, late escaped duplicates, unsafe keys, invalid GPP, sale opt-out, conflicting identity mirrors, absent signal, failed response, unknown routing, header overrides, historical policy reads and other-endpoint/non-POST exclusions. Unknown deep routing may move from limited to unsupported, preserving any independently read known privacy restriction; it never becomes approved by structural allowance alone.

1,666 relevant tests pass: contracts 801, vendor resolver 247, core/policy 207, review engine 79, report adapter 258, API contracts 33 and SDK 41. Seven package typechecks, strict changed-test typechecks and generated contract parity pass. The broad integration tests initially exposed v13-only post-Reject recognition; that canonical consumer now recognizes v14 and the full affected suite passed again. An initial union-shaped diagnostic schema exceeded TypeScript declaration inference limits; a single strict versioned object with runtime legacy-bound refinements preserved the same validation without changing unrelated schemas.

Retained replay verifies 88 unchanged proof objects: 53 older proofs from twelve sealed parent/worker files, thirteen Index proofs and twenty-two prior Magnite-run proofs. Three prior Magnite-run observations replay identically. The older Index observation retains the previously documented GPP-detail-preservation difference for two rows, with unchanged stored objects, qualification and processing signals. No historical artifact was rewritten. Twenty-nine old/new generic parser cases preserve acceptance and limit reasons.

A descriptive local microbenchmark ran 2,000 measured iterations per reader/case after warmup. The new profile's maximum sampled parser call was below 0.3 ms; the near-byte-cap p95 was approximately 0.096 ms. These results measure parser calls on this Mac, not full capture or production Lambda latency, and are not a production performance guarantee.

## Remaining verification

The six original publisher bodies were not retained. Their hashes and closed diagnostics cannot establish whether they fit 256 members/depth 10 or the strict field allowlist. Their retained bodies remain limited and their activity remains unresolved; no historical witnesses were fabricated or upgraded.

A further owner-authorized, ledger-selected live validation can now test the specific new reader against ordinarily issued requests. Before that visit, fresh central contact history and the canonical selector are still mandatory. Do not recontact held/blocked targets, retry no-go results, switch identity/region or use diagnostic CDP candidates as canonical response proof. No such visit was made in this implementation step.

## Cost and preserved state

Estimated incremental parsing/metadata cost after a future deployment remains below $0.50/month at 100,000 scans, disclosed before implementation. Local tests/replay add no recurring cloud cost and initiate no paid service or model usage. No deployment or production flag changed.

Daily checkpoint, issues, release watch, model-transition ledger, audit prompt, automation TOML, daily cost ledger and published dashboard pointers are preserved. This manual run does not advance scheduled audit inventory, enter the Mac mini dashboard cohort or close production issues. Product changes remain local alongside earlier uncommitted work.

Artifacts: /Users/benmasek/WC01/artifacts/daily-scan-audit/runs/20261027T204859Z-manual-magnite-structural-reader
