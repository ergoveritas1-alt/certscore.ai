# Bounded form screenshots after an unconfirmed Accept click

On October 9, 2026, the owner approved extending the existing two-image masked
After Accept capture to completed Accept clicks whose consent registration is
unconfirmed. The conservative incremental estimate is up to **$20/month per
100,000 newly affected scans**, including capture, safety review and retained
evidence. This is separate from earlier approved registered-Accept capture costs.
The alternative was retaining structured fields without additional screenshots.

`certscore.post_accept_form_snapshots.v7` retains factual `after_accept_click`
pixels, the original dispatch/deadline, exact-target hash and same-document
loader proof. It has no registration timestamp or late-form extension. The
existing inventory/ref namespace remains compatible with retained Accept-lane
references; the outer capture phase supplies the explicit after-click meaning.
Historical v1–v6 records retain their registered-consent semantics.

Capture starts only after a uniquely authorized Accept click has completed and
registration remains unconfirmed. It overlaps the remainder of the original
action window, uses at most two masked images and the existing safety reviewer,
and adds no lane, invocation, retry or deadline extension. Layout recapture is
disabled on this branch. Cancellation, navigation, an expired deadline, absent
reviewer or failed safety review cannot expose image bytes. Forms are never
submitted. The existing first-layer Accept visibility gate still applies.

The retained packet and persisted metadata validate the control, exact target,
completed click, authorized document and dispatch-anchored capture bounds.
Shared report/API form rows say **After Accept click** and preserve fields and
image follow-up URLs. They do not confirm consent, generate findings or change
scores. Retrieval verifies original inventory/image hashes and bytes, then
independently reconciles any document-bound terminal field enrichment; an
enriched row's field timestamp/session is not mistaken for its original pixels.

Local deterministic browser verification captured two reviewed images despite
a two-second unsuccessful confirmation within a three-second action window.
The entered value was masked, the scoped privacy notice was retained, and no
form was submitted. The same packet produced two retrievable shared report/API
rows without registration or post-Accept activity promotion. Withholding, hung
review, navigation, changed provenance and malformed clocks fail closed.
Artifacts are under `artifacts/after-click-form-images-20261009/`.

No fresh public-site scan, production deployment or Mac mini bot restart was
performed for this verification. Deterministic tests establish the bounded
capture and delivery behavior, not live-site screenshot yield or production
latency. The previous live-report browser interaction signoff remains open.

## Uniform masked-image check (local, not deployed)

The October 9 follow-up reproduced a retained FreeImages/iStock form crop that
was only a 640×21 solid gray strip. Safety approval did not establish that the
image contained visible form detail. Shared capture now checks the final masked,
bounded JPEG before safety review. If every color channel is exactly uniform,
it retains `unavailable` / `no_visible_context` without bytes. This applies to
pre-consent, registered Accept and completed unconfirmed Accept-click captures.
Small images and low-contrast detail are not rejected by a dimension or variance
threshold. Nonuniform pixels still require the existing safety review; this is
not a general semantic image-quality assessment.

Both new local reproduction tests failed against the previous implementation
because it returned `available`. Verification after the change passed 25 shared
capture tests, five unconfirmed Accept tests, 20 registered Accept tests, 573
contract tests and 13 focused web projection/retrieval/export tests. Contract,
scan-core and web typechecks passed. The after-click integration retains both
form rows, serves only the useful image, preserves unconfirmed registration and
submits no forms.

The structured form inventory, field count, phase, provenance, consent conclusions
and scoring are unchanged. Shared report/API rows keep the form and the retained
snapshot reason; image follow-up cannot serve unavailable bytes. Historical
images remain unchanged. There is no new banner or disclaimer, browser capture,
retry, lane, timeout extension, model call or live-site test.

The local maximum-size (640×960) image-check benchmark measured 8.86 ms at p95
over 100 warmed samples. Two checks at 100,000 scans, assuming three GB of worker
and one GB of coordinator compute at $0.0000166667/GB-second, estimate $0.12;
the conservative incremental budget is below $0.50 per 100,000 scans, before
savings from skipped safety reviews. This is below the $1/month approval
threshold at that volume and was disclosed before implementation. The benchmark
is local, not a production latency measurement.

The new reason is additive to the shared snapshot enum. For a future release,
deploy and verify WC01 readers before scanner producers so an older strict
reader cannot reject a packet containing the new reason. No deployment is
authorized by this verification step.
