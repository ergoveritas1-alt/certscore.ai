# CertScore.ai finding-specific applicability guidance

Local implementation, October 24, 2026. No deployment, scan, operator lookup,
external enrichment, flag change, or historical evidence rewrite.

## Presentation contract

`apps/web/lib/scans/finding-applicability-registry.ts` contains 46 editorial
entries covering 54 distinct projected finding identities. Coverage includes all
38 existing regulatory-review topics (39 jurisdiction contexts), plus California
collection review, post-Reject collection, GPP inconsistency, grouped accessibility,
CMS advisories, hidden outbound links and unexpected form destinations. Existing
accessibility presentation groups receive the same accessibility guidance.

Resolution uses exact finding ID plus review mode. The privacy-notice identity
has separate California and EU entries. Unknown and unsupported-mode identities
retain a neutral fallback. An entry does not make a finding eligible, promote it,
change its status, or select a score. The regulatory ranking catalog and canonical
pipeline are unchanged.

Each collapsed Applicability panel contains:

1. **When this matters:** the duty or technical review specific to the finding.
2. **What to check:** two concise checks about its activity, purpose, control,
   recipient, disclosure or relevant exception.
3. **Scope to confirm:** the remaining jurisdiction/coverage question and primary
   sources. Guidance review date is editorial metadata, not a scan assessment date.

The compact v2 presentation removes the repeated “From this scan” summary and
its component prop; the original finding summary remains above the panel. Checks
are shortened across all 46 entries, with tighter padding and spacing. Source
links, scope conditions and native disclosure controls remain intact. This copy
and layout revision adds no recurring cost and reduces the served content.

Applicability, Related enforcement, Affected pages and Observed pages share native
keyboard-accessible disclosures with plus/minus indicators, outlined click targets,
focus styles and desktop Show/Hide details labels. Top-finding headers and evidence
tools have visible outlined expansion affordances. The alternate report variant
uses the same registry and applicability component. No “Not assessed” header badge.

## Source and maintenance rules

The registry supplies conditional guidance, not a determination of the operator’s
legal status or legal compliance. Existing scan evidence is not reclassified.
Sources include the [CPPA regulations](https://cppa.ca.gov/regulations/),
[CCPA coverage FAQ](https://www.cppa.ca.gov/faq.html),
[GDPR](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng),
[ePrivacy](https://eur-lex.europa.eu/eli/dir/2002/58/2009-12-19/eng),
[EDPB consent guidance](https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-052020-consent-under-regulation-2016679_en),
[EDPB individual-rights guidance](https://www.edpb.europa.eu/sme/be-compliant/respect-individuals-rights_en),
[EDPB DPO guidance](https://www.edpb.europa.eu/sme/be-compliant/data-protection-officer_en),
and W3C/DOJ accessibility resources linked in the resolver.

Article/topic mappings were checked against the existing reviewed regulatory
catalog and primary guidance. EUR-Lex returned a bot challenge during this review;
its primary-law links remain references rather than a claim of a fresh full-text
retrieval. Technical security entries refer readers to the finding’s retained
advisory/destination evidence instead of assigning a regulatory obligation.

Update entries when adding a major projected finding or changing relevant law;
update the registry version and review date when substantively revising guidance.
Tests fail when a regulatory topic lacks an entry. Do not use fuzzy ID matching,
raw policy-text inference, company-size estimates, scan region, or technology
presence to decide legal coverage. Operator enrichment remains deferred.
Keep future effective dates and historical legal assessments separate; this
registry does not replace the canonical legal-framework-validity registry.

## Cost estimate

No new capture, database fields, persisted evidence, paid API/model use or capacity.
Local tests and previews invoke no AWS services. Future serving cost is limited to
extra static code/text and report HTML. Initial v1 gzip sizes (before compaction): registry source 8,318
bytes; eight largest applicability panels 3,162 bytes; all 46 panels together
10,706 bytes. These measurements conservatively include complete panels rather
than subtracting the previous generic guidance; they are not production bundle
measurements.

At 100,000 report views/month, using a planning allowance of $0.15/GB, registry
plus all panels represents about $0.29/month of transfer. Allowing duplicate
serialized report content, supporting styles/code and small rendering overhead,
budget **below $0.75/month** (typical eight-panel reports lower). This is below the
$1/month approval threshold; no new paid service or provisioned resource is added.
Re-estimate before introducing enrichment, persistence or materially larger content.

## Validation

- 14 focused registry/component tests: every mapped identity/mode, exact fallback,
  specialized entries, source metadata, no repeated scan summary, unchanged
  finding data, score values, ranking and existing evidence order.
- 38 existing regulatory selection, California priority, checklist and summary
  regression tests passed.
- Web TypeScript check passed.
- Local SSR preview of real report components, compiled Tailwind styles and offline
  Chromium: native Enter/Space expansion, independent nested disclosures, visible
  state cues, desktop layout and 390px mobile layout without horizontal overflow.
- Preview uses explicitly labelled illustrative observations; no live site was scanned.

### Compact v2 validation

The 14 focused registry/component tests and web typecheck passed after the compact
revision. The updated GPC, pre-consent cookie and accessibility comparison uses the
real components; offline Chromium verified independent keyboard expansion and a
390px responsive layout without horizontal overflow. No deployment.
