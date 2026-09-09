# Retained service-origin audit

Local scan: `b5a21136-cb84-4a1a-9cfe-22a7a71fe777`.

Read-only audit verified all 11 retained child-page graphs (11,167,879 evidence bytes). No new scan, external lookup, persistence, or deployment was performed. This excludes the separately retained homepage graph.

| Service | Retained request occurrences | Linked to another named service |
| --- | ---: | ---: |
| Google Fonts | 53 | 4 (YouTube) |
| Google Static Assets | 4 | 3 (Maps) |
| Facebook Static Assets | 196 | 84 (Facebook Page Plugin) |

These are event counts, not distinct resource identities or findings. Same-integration Facebook identities are grouped later by the presentation layer.

Of the 49 font occurrences without a different named-service ancestor, 35 had retained parser links from the site's document and 11 had parser links from a Google Fonts resource. Three had neither graph matches nor retained node references. Document membership alone is not loading ancestry; these counts report actual parser edges separately. The font-to-font cases need a complete document-bound ancestry check before labeling their ultimate origin as the site itself.

The named-service lookup currently stops at different canonical vendors/products. It does not represent the site itself as an integration parent. Consequently, many 'unattributed' rows reflect a missing site-origin presentation category rather than missing scanner evidence. Do not attach these to YouTube merely because other font resources came from YouTube.

The local report now selects every retained child-page graph, instead of only first pages of displayed resource rows. Existing checksum/provenance verification and bounded summary caching remain in place. Production retains its original read budget. The local change uses local database/artifact storage and has no incremental paid-service cost ($0/month). Production-wide expansion requires an estimate of artifact-read and compute cost and owner approval if the expected increase reaches $1/month.

Reproduce with the local environment using `scripts/diagnostics/audit-service-origins.ts`; it refuses nonlocal artifact storage and scans not marked as local. The script emits only aggregate counts and ancestor hostnames, not raw evidence or query values.

Next targeted improvement: retain an explicit, verified site-document loading origin alongside named-service origins, through the same graph/provenance path. Keep font-to-font chains, iframe origins, multiple origins, and missing graph references distinct. No scanner expansion is justified by this sample alone.

## Site-origin implementation

Added a site-document origin only when every matched resource node has a direct loading chain to the exact retained page document. Document membership, inferred edges, missing node references, nested frames, and incomplete chains do not establish that origin. Named-service ancestry remains separate. Site and embedded occurrences are grouped separately only when the aggregated resource's event/page coverage is fully accounted for.

Re-running the audit classified 35 font occurrences as site-loaded and preserved four YouTube-linked occurrences. Eleven font-to-font chains and three unmatched occurrences remain unresolved. The report projection exposed two fully accounted-for font resource identities as an independent Google Fonts service, labeled `Loaded directly by site`; other identities still fail closed where aggregated coverage is incomplete. This does not imply that all 35 events become separately displayed rows. Expanded child-page reads remain local-only; no new scanner work, external calls, or deployment.
