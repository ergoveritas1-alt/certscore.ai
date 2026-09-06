# Canonical service-purpose v1

Implemented locally on September 5, 2026. No deployment or re-scan.

## Contract and ownership

Every rule in `packages/certscore-vendor-resolver` declares `servicePurpose`.
The bounded vocabulary lives in the contracts package; the rule registry is
the sole source of product-to-purpose mappings. The resolver version is
`certscore-vendor-resolver-2026-09-05-service-purpose-v1`.

This field describes a service's role. It does not establish actual tracking,
cookie necessity, consent, legal status, or a scoring deduction. Existing
technical `purpose`, legacy policy categories, evidence, timestamps, confidence,
and concern-policy inputs remain unchanged.

| Service | Request and iframe purpose |
| --- | --- |
| Google Maps embed | Embedded maps |
| Facebook Page Plugin | Social media embed |
| Google Fonts | Font delivery |
| BST DSGVO Cookie | Consent management |

The registry audit covered 334 rules and resolved the 18 known-purpose rules
whose legacy display category was Unknown. Genuine unknown-purpose records
remain Unknown. Precise product identity is required; entity or hostname
ownership alone cannot borrow another service's purpose. Ambiguous identities
remain unresolved. Multiple signatures of one service must agree.

## Projection and compatibility

- New resolver observations retain the bounded `servicePurpose` field.
- Old retained observations may omit it. Canonical identity lookup resolves
  their service description without inventing observations or rewriting bundles.
- Shared inventory projection applies the description after existing priority,
  evidence-category, and grouping decisions. Cookie-specific purposes are kept.
- Recognized iframe endpoints use the same purpose as corresponding requests.
  Unknown iframe endpoints retain generic Embedded content context, not an
  inferred tracking purpose. Iframe-only evidence does not create a request row.
- The existing cookies/trackers API uses the same request purposes and retains
  its existing resource scope; it does not add iframe rows to that API version.
- Materialization cache version v15 prevents reuse of the previous projection.

## Verification and cost

Shared runtime fixtures cover contract round-tripping, old bundles without the
field, and request/iframe consistency. Completeness tests cover all 334 rules;
priority/evidence invariance is checked with and without request counts.
Report, API, normalized-concern, and score regression suites pass, as do contract,
resolver, scanner-core, and web type checks. Retained scan
`95c6a49e-e27c-4691-ab1c-7c689461db0c` was replayed read-only: Maps requests
at 9,330 ms and its iframe at 10,875 ms both resolve to Embedded maps; Facebook
requests at 9,331 ms and its iframe at 10,875 ms resolve to Social media embed.

No added model calls, external requests, intentional capture waits, or retention
duration. Added bounded metadata and deterministic lookup overhead are estimated
below $1/month at 100,000 typical scans with 30-day retention, disclosed before
implementation under the repository's below-$1 pre-approval rule. This is an
estimate, not a measured infrastructure bill.
