# CertScore.ai public guides and sample report review

Reviewed locally on November 11, 2026. No deployment or live scan was performed.

## Changes

- `/sample-report` now redirects to the configured retained real sample report. It no longer competes with that report through an illustrative report layout. Reading the route does not create a scan. The redirect is temporary so the retained sample can change. The redirecting route is excluded from the sitemap.
- The shared guide template leads with investigation examples and a practical evidence → owner → change → retest handoff. Background/coverage and technical JSON are available in closed disclosures. Free scan and real sample report links remain prominent.
- Rewrote the RTB/cookie-syncing, session replay, pre-consent third-party cookie, Reject testing and consent-audit checklist guides around concrete investigation and remediation steps.
- Shortened the cookie law, banner and privacy-policy guide introductions and added official source links.
- The California page now ends with a practical review handoff. The GDPR page links directly to official legislation and current UK guidance, keeping UK PECR separate from EU law.
- Updated modification dates only for substantively revised pages. Original research dates and focused comparison pages are retained.

## Primary-source check

This pass verifies the evergreen claims used in the edited pages and the principal CMP comparisons. It is not an exhaustive legal review of every jurisdiction, historical research statistic or finding-reference entry.

| Topic | Source checked | Editorial conclusion |
| --- | --- | --- |
| GDPR consent, transparency and privacy by design | [Official GDPR text](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng), [EDPB consent guidelines](https://www.edpb.europa.eu/documents/guideline/guidelines-052020-on-consent-under-regulation-2016679_en) | Retain qualified review framing and distinguish observation from legal conclusions. |
| EU device storage/access | [Consolidated ePrivacy Directive, Article 5(3)](https://eur-lex.europa.eu/eli/dir/2002/58/2009-12-19/eng) | Consent requirements have exceptions; avoid saying every cookie needs consent. |
| UK storage/access | [ICO guidance](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/) | Replaced old guidance link. The current guidance records finalisation on April 29, 2026 and covers applicable exceptions. |
| California opt-out and GPC | [California Attorney General CCPA guidance](https://www.oag.ca.gov/privacy/ccpa) | Covered-business and sale/sharing scope remain explicit; do not equate all traffic with a violation. |
| GPC signal mechanics | [GPC specification](https://w3c.github.io/gpc/) | Keep the distinction between delivering a signal and proving a site's response. |
| Consent Mode | [Google Consent Mode concepts](https://developers.google.com/tag-platform/security/concepts/consent-mode), [implementation guidance](https://developers.google.com/tag-platform/security/guides/consent) | Basic and advanced behavior differ. Default/update configuration and network activity should be investigated separately. |
| Cookiebot capabilities | [Cookiebot cookie scripts overview](https://www.cookiebot.com/en/cookie-scripts/) | Vendor describes consent dialogs, scanning and cookie declarations. CertScore.ai comparison stays complementary, without claiming a CMP cannot block tracking. |
| OneTrust capabilities | [OneTrust Consent Management](https://www.onetrust.com/products/consent-management/) | Vendor describes inventories, regional banners, preferences, consent records and script/blocking controls. Preserve the distinction between managing choices and reviewing observed behavior. |

## Verification

- TypeScript check passed.
- 66 focused marketing/security/SEO tests passed.
- Scoped diff whitespace check passed.
- Chrome verified `/sample-report` redirects to the retained local report and renders its real executive overview and evidence.
- Chrome verified the revised cookie law and Reject guides. At 390 px, the cookie law guide has no horizontal overflow; both CTAs are visible, background and JSON disclosures start closed, and the background disclosure opens correctly.
- The standard Turbopack dev command encountered existing workspace resolution/runtime errors. The local preview was restarted with `pnpm exec next dev --port 3000` using the existing webpack configuration; report and guide routes returned successfully.

No scanner policies, acquisition budgets, production flags or historical report evidence were changed for this work.
