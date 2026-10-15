# Consent visual review reliability

Local implementation approved by the product owner on October 15, 2026.
Deployment is not authorized by this approval.

## Verified paired-image review

An image that passes `verifiedPairedScreenshot` may finish its existing safety
review inside a four-second absolute finalization window. This replaces the
two-second allowance only for that verified paired image. Other representative
consent images retain two seconds; ordinary images retain 75 milliseconds.
Local verification uses the same request and expected original-byte hash.

The original target, loader, first-layer control, inspection, geometry, viewport,
500 ms capture-skew, original-file and byte-integrity requirements remain in
force. AX/native controls additionally require `ax_backend_dom_binding.v1`.
Eligibility verification cannot consume another image's existing allowance.
The classifier request timeout, concurrency and file limits are unchanged.
There is no retry, additional model call or later result refresh.

Only a completed safe classification may retain or serve an image. Sensitive,
failed, timed-out or unverifiable reviews remain withheld. Late completion cannot
reopen a finalized packet. A safety decision does not establish control
availability, consent registration, prominence or a score effect.

## Native accessibility binding

The existing accessibility capture may corroborate at most 12 visible button/link
records with `DOM.describeNode`, inside a shared 50 ms optional allowance and the
existing outer AX deadline. Use the exact AX backend node, require matching
returned backend identity and an element node, and retain only bounded native
tag and source/document identity metadata. Do not retain returned attributes,
values or text. Duplicate backend identities are not eligible.

One unavailable node does not erase another completed verified read. Missing,
invalid or late native reads keep their original `ax-node` representation.
The loaded document must remain bound throughout capture. Typed observation
validation rejects control/tag/selector or document-binding drift. Historical
packets without this proof are not upgraded on read. This observation proof
does not authorize an Accept, Reject or preference action.

## Capture overlap

An isolated consent-proof session with a complete document and already observed
Accept, Reject and Options controls may prepare its existing screenshot and
geometry packet while the existing passive request gate finishes. No new capture
or wait is introduced. Capture before that gate completes is labelled
`dom_content_loaded`, not `network_idle`.

Missing or unresolved controls still await the passive gate before the final
inventory checkpoint. Every path awaits the original gate before final evidence
freeze. Existing loading, navigation/frame-change, geometry and safety checks
remain independent. Evidence facts and their actual capture times are retained;
the overlap is not evidence of consent or a basis for an absence conclusion.

## Budget and scope

The owner explicitly approved up to $15/month incremental cost for this local
proposal at 100,000 scans/month with 4 GB workers. Up to two additional seconds
of eligible pending-image review is approximately $13.34/month at conservative
compute rates. The optional native-binding allowance adds at most approximately
$0.34/month at that volume. Small proof metadata and recovered screenshot storage
remain bounded; the planning estimate assumes typical viewport images and 30-day
retention, not every image at the maximum file limit.

Fresh verification uses the existing Ireland proxy, with incremental diagnostics
estimated below $1 total and no new standing capacity. Future production rollout
must separately confirm costs, the complete release gate and owner deployment
authorization. Preserve existing reports and safety decisions.
