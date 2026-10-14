# OneTrust named-service capture — local fix, October 14, 2026

No deployment or fresh public scan was requested or performed.

## Repair

The existing `OneTrust.GetDomainData()` read now retains explicit service names
from three SDK-backed sources:

- `Groups[].VendorServices[]`: `CustomVendorServiceId` + `ServiceName`.
- `GeneralVendors[]`: `VendorCustomId` + `Name`, only when linked by an inspected
  group's `GeneralVendorsIds`.
- `Groups[].Hosts[]`: `HostId` + an explicit, non-domain `DisplayName`.

Nested `SubGroups` share the original bounded group inspection. Bare domains,
URLs, cookie names, unlinked/global vendor lists and registry-based guesses do
not establish a CMP service identity. Duplicate conflicting IDs remain unresolved.
Labels are bounded, sanitized text; cookie values and consent strings are not
returned. This is a list of named services, not a service-control functionality test.

The preference worker previously discarded OneTrust service names even if its
reader supplied them. It now retains `serviceNames` and inspected-source accounting
in the existing `declarationCoverage` contract. Complete and checkpoint-bound
partial captures follow the existing typed assessment -> persisted consent
projection -> normalized concern / concern policy -> shared report pipeline.
Cookie declaration completeness stays false; service names cannot prove a
complete cookie inventory. Document changes invalidate names and their coverage.

`onetrust_loaded_configuration.v2` distinguishes the new capture revision.
Historical v1 packets remain readable without manufactured names or changed proof.
The passive consent-proof basic capture reuses this same reader and already
retained service-name field.

## Bounds and cost

One existing browser evaluation and one existing getter call. No new browser,
visit, click, fetch, loop polling, wait, retry, model call, deadline or retention
limit. The shared allowance is 100 cookie/service records, with at most 80 service
records to preserve at least 20 cookie slots on vendor-heavy tenants. With fewer
services, the remaining allowance is available to cookies. Nested groups share
64 slots; vendor indexing is capped at 100. Overflow stays explicit and partial.
This replaces the previous per-group host loops and does not increase the maximum
retained inventory content. Counts describe inspected identities; a truncated
capture never claims the configured total is complete.

No infrastructure or paid-call increase. Small source-accounting/name metadata
on sparse captures is estimated below $0.01/month at 100,000 scans and remains
within the previously approved bounded metadata/storage envelope; no additional
budget is introduced. Large inventories have a lower maximum content allowance
than the former 100-cookie plus per-group host traversal.

## Verification and IKEA limitation

Local tests cover explicit service/vendor/host labels, nested groups, HTML labels,
conflicts, bare-domain exclusions, unlinked vendors, oversized/cyclic inputs,
shared bounds, cookie headroom, document drift and retained partial checkpoints.
A loopback-only Options fixture verifies that names reach the canonical assessment,
normalized concerns and report as Observed with no scoring effects. It exercises
one Options click and no Accept/Reject/Save action. The passive fixture verifies
one getter call and the existing 350 ms opportunistic slice.

The original IKEA producer bundle for scan
`3da7c991-da4f-406b-9b3a-ed551490298a` was replayed with SHA-256 verification.
Its saved v1 configuration evidence contains no service identities or raw
configuration, so those names cannot be recovered retrospectively. Its service
criterion remains Not assessed. Local fixtures establish the repaired mechanism;
they do not establish which named-service fields IKEA exposes on a future visit.
A separately authorized fresh capture is needed for live IKEA confirmation.

Provider sources:
[documented getter](https://developer.onetrust.com/onetrust/docs/javascript-api),
[OneTrust's distributed SDK](https://cdn.cookielaw.org/scripttemplates/202507.1.0/otBannerSdk.js).
Only the existing getter is used by the scanner; no new provider API is called.
Ignored verification artifacts: `artifacts/onetrust-services-20261014/`.
