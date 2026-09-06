# Canonical registry attribution v1

This deterministic upgrade does not change concern-policy thresholds or introduce
new scoring rules. It improves which identified service those policies receive.
Descriptive service purpose remains separate from observed resource type, tracking
evidence, necessity, consent, and legal conclusions.

## Single-resource resolution

`resolveCanonicalVendor(input)` is the canonical selector when a consumer needs
one product for one observed resource. It returns `resolved`, `ambiguous`, or
`unrecognized`. Endpoint signatures, context-bound cookie signatures, and runtime
signatures outrank cookie-name-only and hostname-only matches. Different services
with equally strong signatures remain ambiguous; neither registry array position
nor an uncalibrated confidence number may break that tie.

`resolveVendorObservations(inputs)` remains the multi-observation evidence API.
It retains all matching signatures and their evidence references. Do not replace
it with a single winner when processing a batch of independent resources.
Conversely, do not take `[0]` or sort by confidence to assign one product.

The actual URL authority takes precedence over a supplied display hostname for
requests and embeds. Cookie Domain remains its separate storage scope. An
initiator ancestor alone cannot satisfy a context-bound cookie signature; direct
host or setter evidence is required. Generic Microsoft identity cookie knowledge
uses the same Bing/Clarity host scope as the existing vendor rule, so the knowledge
fallback cannot undo that guard. Distinctive first-party cookie signatures retain
their existing supported behavior.

Report category lookup now uses precise canonical identities and aliases rather
than vendor substring lists. Endpoint evidence cannot fall back to a separate
report-specific vendor host list after an ambiguous/unrecognized registry result.
Existing WC01 priority policy remains downstream. Invalid attribution may now
remain unknown rather than incorrectly contributing a vendor-specific finding;
this is not a new deduction, exemption, or consent policy.

## Stable identity and provenance

Every rule has frozen opaque entity, vendor, and service IDs. Initial identifiers
were seeded once from the existing identities and checked into the rule literals;
they are not computed from labels at runtime. Preserve IDs when names or aliases
change. Distinct services owned by the same company retain different service IDs.
These IDs are registry identities, not proof of a site's legal controller.

Existing `observationId` and event/reference behavior is unchanged. Request and
iframe observations can share a service ID without being duplicates or proof of
a causal parent–child relationship.

New observations retain a bounded `registryAttribution` packet: contract version,
resolver version, three stable IDs, matched rule IDs, and match kind. The shared
contract rejects malformed IDs, unsupported versions, unknown properties, and
overlong/duplicate rule lists. It contains no new URLs, cookie values, or DOM text.
Materialization carries this packet forward. Legacy packets can omit it; do not
invent the registry version under which historical evidence was captured. A
current replay may carry current provenance alongside untouched legacy evidence.

## Review governance

`getCanonicalVendorRegistryManifest()` exposes the same rules for maintenance;
it is not another classification registry. The 334 imported rules are explicitly
`legacy_unreviewed`: their existing confidence values are not newly calibrated,
and this migration does not claim independent human or source review.

The checked-in identity baseline protects the existing rule IDs and identity
mapping. New rules outside that baseline require reviewer identity, review date,
and HTTPS source references, alongside focused positive and negative matching
tests. Retiring or merging an identity needs an explicit migration of the baseline
and affected retained-fixture expectations; never recycle a retired ID. A label
rename alone must not change the baseline IDs.

Documentary review of the legacy corpus, broader cookie collision calibration,
and operational wiring of the existing unknown-candidate queue remain subsequent
work. No recurring job, live scan, DNS lookup, or paid/model service was added.

## Verification and cost

Shared fixtures exercise retained contract parsing, legacy compatibility, and
request/iframe identity. Regression tests cover UET vs generic Microsoft matching,
Floodlight vs generic DoubleClick matching, unresolved overlapping signatures,
spoofed hosts, cookie-context collisions, report projection, and existing policy.

The only recurring cost increase is small provenance metadata in existing
artifacts/projections. Budget estimate: below $1/month at 100,000 typical scans,
roughly 20 services per scan, and 30-day retention, including multiple copies.
There are no additional intentional waits, requests, browser sessions, model calls,
or provisioned resources. Deployment and live recalibration are not part of this
change.
