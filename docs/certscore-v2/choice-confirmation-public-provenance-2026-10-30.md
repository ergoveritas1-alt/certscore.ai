# CertScore.ai choice-confirmation provenance — October 30, 2026

After the retained first-layer projection and six observation-label fixes, the
next priority is choice confirmation. The October 29 sample contains 26
unconfirmed and one aborted initial Accept registrations among 39 completed
clicks, and 14 unconfirmed initial Reject registrations among 23 completed
clicks. Existing CMP runtime/readiness/receipt repairs remain rollout-held and
already integrated locally. Reimplementing them or relaxing confirmation rules
is not supported by those counts.

A concrete remaining gap is public confirmation provenance. The API and Pulse
returned execution status while omitting retained initial/terminal distinction
and diagnostic stage facts. The shared canonical stage engine already supplies
these facts. Existing retained benchmarks separately contain nine terminal-only
confirmations; those are historical evidence, not new gains from this change.

The optional `confirmation` field now carries
`choice_confirmation_summary.v1`, source packet SHA-256, initial registration
status, initial decision verification, terminal verification, notification
acknowledgment, category check and bounded diagnostic reasons. It consumes the
existing validated source-hash projection and canonical stage engine. Null
verification/acknowledgment remains unavailable. A notification or completed
click never supplies a consent decision. Malformed, wrong-action, wrong-target
or expired terminal proof cannot generate this summary. Public first-layer
eligibility still gates both action paths.

The public API contracts and OpenAPI describe the optional field. Both normal
results and limited Accept results preserve it; raw terminal packets, state
hashes and payloads are not added to the public response. Initial status,
finding eligibility, scores, operational execution and stored historical
records remain independent. No underlying receipt, category, source-binding,
capture, runtime or confirmation policy changes.

Retained Accept (autoplus.fr) and Reject (catonetworks.com) fixtures were derived
through canonical projectors from SHA-verified local original packets. Both
retain unconfirmed initial registration and verified terminal decisions.
Tests verify those distinct stages through API and Pulse serialization, keeping
initial status unconfirmed and production-projectable false. Negative tests
cover missing source hashes, wrong action/target and late terminal reads.

Validation: 135 focused tests pass across API summaries, scan-resource behavior,
Pulse projection, API/OpenAPI contract and canonical stage-engine tests. API
contract and focused web/test dependency-graph typechecks pass.

Local paid usage is $0. No new cloud task, model/API call, scan, public visit,
privacy action, deployment or budget increase was performed. Estimated future
marginal serialization/response overhead is below $0.01/month at 100,000 scans,
within the existing small-cost envelope; no recurring service or retention is
added. This estimate is not a production billing measurement.

The unreleased `pulse-public-v6` candidate also contains the preceding consent
projection fix. The new summary has its own explicit version. Audit dashboard
pins, metrics and historical snapshots remain unchanged. Consuming the new
summary in published audit metrics requires the existing source/contract review
and validation gate; this implementation does not silently repin or publish.
No live confirmation-rate improvement is claimed. Source-bound review of the
remaining readiness, category and receipt blockers remains the next runtime
step before a separately authorized rollout.
