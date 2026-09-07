# Unknown-purpose opportunity assessment — September 7, 2026

Read-only sample of 750 evenly spaced JSON filenames from 31,192 evidence files on the mounted Mac mini share; 737 distinct target hostnames; no read failures. This is a historical convenience sample, not a random current-production cohort or the current full-site inventory. Public projections are bounded and omit some original runtime evidence. No scans, paid APIs, database writes, or production rules were added.

## Measured opportunity

- 6,742 retained cookie/storage rows, of which 3,410 had unknown/unclassified purpose.
- Deduplicating unknown cookies by target hostname and exact cookie name yields 3,009 site/name pairs and 2,000 distinct names.
- 1,635 names (81.8%) occur on only one sampled site. Broad manual research has poor expected returns.
- 86 names recur on at least five sites, covering 668 site/name pairs (22.2% of unknown-cookie pairs). This is a research ceiling, not safely classifiable coverage.
- Replaying existing canonical vendor and cookie-knowledge lookups identifies non-unknown purpose candidates for 124 previously unknown cookie site/name pairs (4.1%). Historical artifacts retain their original categories; this does not establish a current pipeline defect.
- A shortlist of 14 names covers 153 site/name pairs across 87 sites: at most 5.1% of the sampled unknown-cookie pairs, before documentation and evidence-context gates.

## Shortlist (research candidates only)

| Cookie name | Distinct sites |
| --- | ---: |
| `FCCDCF` | 24 |
| `_rdt_uuid` | 13 |
| `everest_g_v2` | 13 |
| `everest_session_v2` | 11 |
| `_twpid` | 12 |
| `_twsid` | 8 |
| `__utma` | 8 |
| `__utmb` | 8 |
| `__utmc` | 8 |
| `__utmz` | 8 |
| `__utmt` | 7 |
| `notice_behavior` | 9 |
| `RT` | 10 |
| `_tt_enable_cookie` | 14 |

## Recommendation

Do one small, evidence-bound cookie-family pass and investigate why currently known patterns remain unknown in fresh canonical outputs before expanding the registry. Skip a broad registry sweep, paid data subscription, and per-scan semantic lookups. Generic session/language/country names must not be promoted based on names alone. Microsoft label-only ambiguities also need retained product/endpoint evidence, not a company-wide purpose.

Official Reddit Ads API documentation explicitly identifies `_rdt_uuid` as the first-party Pixel cookie: https://ads-api.reddit.com/docs/v3/operations/Post%20Conversion%20Events . Adobe documents its advertising cookies at https://experienceleague.adobe.com/en/docs/core-services/interface/data-collection/cookies/advertising . These support focused research; the entire shortlist is not verified.

Third-party lists may help discover candidates, but primary vendor documentation and retained context should establish accepted rules. Do not bulk-import Tracker Radar data: its repository describes a noncommercial data license (https://github.com/duckduckgo/tracker-radar). No licensing or paid-data integration has been initiated.

Local diagnostic inputs and replay: `.codex-tmp/purpose-audit/sample.py`, `sample.json`, `replay.ts`, `replay.json`. Replay strips URL queries/fragments and never retains cookie values. Source request URLs are research context only, not automatically proof of cookie setter identity. No category, evidence, scoring, or historical record was changed. Incremental recurring cost: $0.

## Implemented focused pass — September 7, 2026

Added 11 exact cookie names across six documented families to the canonical
cookie knowledge base. No report-only classification fallback or scanner
invocation was added. The existing scanner already resolves canonical knowledge
into typed cookie events, and the full-site inventory projects that retained
purpose. Fresh local Chromium capture verifies both an existing `_ga` mapping
and new mappings through this path. Historical projected rows are not rewritten.

| Names | Purpose | Required context / limitation | Primary source checked September 7 |
| --- | --- | --- | --- |
| `__utma`, `__utmb`, `__utmc`, `__utmt`, `__utmz` | Analytics | Exact names only; no broad `__utm*` rule | [Google's cookie table](https://business.safety.google/adscookies/) lists each name, Analytics, and Google Analytics. |
| `FCCDCF` | Consent management | Functionality of Funding Choices; essentiality remains unknown and presence does not prove a decision | [Google's cookie table](https://business.safety.google/adscookies/) lists the exact name, Functionality, and Funding Choices. |
| `everest_g_v2`, `everest_session_v2` | Advertising | Direct `everesttech.net` domain/setter context | [Adobe Advertising cookies](https://experienceleague.adobe.com/en/docs/core-services/interface/data-collection/cookies/advertising) |
| `_rdt_uuid` | Advertising | Direct `reddit.com` or `redditstatic.com` domain/setter context; an ancestor alone is insufficient | [Reddit conversion-events API](https://ads-api.reddit.com/docs/v3/operations/Post%20Conversion%20Events) identifies the first-party Pixel cookie. |
| `notice_behavior` | Consent management | Regional consent-experience configuration; essentiality stays unknown, not proof of consent | [TrustArc Tealium integration](https://trustarchelp.zendesk.com/hc/en-us/articles/53286405811091-CCM-Advanced-Tealium-iQ-Integration) |
| `RT` | Analytics | Direct `go-mpulse.net` domain/setter context; generic `RT` stays unknown | [Akamai mPulse cookie documentation](https://techdocs.akamai.com/mpulse-boomerang/docs/cookies) |

Google's rows are embedded in the source HTML of its official table even when
text-only browsing does not expose the dynamically filtered results. The checked
HTML was retained in the local diagnostic folder. No third-party cookie database
was imported.

Deferred `_tt_enable_cookie`, `_twpid`, and `_twsid`: reviewed sources did not
supply sufficiently clear primary documentation for those exact names during
this bounded pass. Generic session, language and country keys, Microsoft
product ambiguities, and remaining one-off patterns are unchanged.

### Replay and checks

The same sample now produces 220 supported cookie/site matches versus 124 before,
an increase of 96 (3.2% of 3,009 previously unknown site/name pairs). This is a
historical reference replay, not a measured reduction in fresh production
reports. A site/name pair may have multiple domains or occurrences: two pairs
have both supported and still-unresolved contexts, so the unresolved count
falls by 94, not 96. Context-limited Reddit/mPulse matches were not credited from
source-request URLs or ancestor links; only the sample's cookie domain was used
for cookie-knowledge replay.

All 161 resolver tests, 6 capture/projection tests (including fresh Chromium),
and 40 web cookie-evidence tests passed. Negative cases cover lookalike domains,
unsupported name variants, absent setter context and ancestor-only evidence.
Consent configuration cookies keep unknown essentiality. Existing finding and
score policies are unchanged; eligible new observations use the existing
canonical pipeline.

The change is local and requires the normal AWS release before production scans
use the expanded knowledge. No public-site scan, paid API, database rewrite or
recurring job was started. Runtime work is six extra bounded pattern checks per
cookie within the existing process; no added network calls or capacity. Estimated
incremental compute/bundle cost is below $0.01/month at 100,000 scans/month.
