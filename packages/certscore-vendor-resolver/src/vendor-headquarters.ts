/** Reviewed company reference data, never observed network or transfer evidence. */
export const VENDOR_HEADQUARTERS_VERSION = "certscore-vendor-headquarters-2026-09-07-v3";

export type VendorHeadquartersReference = Readonly<{
  entity: string;
  entityScope: "named_entity" | "regional_entity" | "legacy_entity";
  status: "verified" | "unverified";
  headquartersCountry: string | null;
  checkedAt: string;
  registryVersion: string;
  sources: ReadonlyArray<Readonly<{ url: string; title: string }>>;
  note: string;
}>;

const checkedAt = "2026-09-07";
const verified = (entity: string, headquartersCountry: string, url: string, title: string, note: string): VendorHeadquartersReference => ({
  entity, entityScope: "named_entity", status: "verified", headquartersCountry, checkedAt,
  registryVersion: VENDOR_HEADQUARTERS_VERSION, sources: [{ url, title }], note,
});
const unverified = (entity: string, entityScope: VendorHeadquartersReference["entityScope"], url: string, title: string, note: string): VendorHeadquartersReference => ({
  entity, entityScope, status: "unverified", headquartersCountry: null, checkedAt,
  registryVersion: VENDOR_HEADQUARTERS_VERSION, sources: [{ url, title }], note,
});

export const VENDOR_HEADQUARTERS_REFERENCES: ReadonlyArray<VendorHeadquartersReference> = [
  verified("Adobe Inc.", "US", "https://www.adobe.com/about-adobe/contact/offices.html", "Adobe office locations", "Corporate headquarters listed in San Jose, California."),
  verified("Google LLC", "US", "https://about.google/intl/ar_ALL/our-story/", "Google company history", "Google identifies Mountain View, California as its headquarters. This does not identify a customer's regional Google contracting entity or Alphabet's headquarters."),
  verified("LiveRamp Holdings, Inc.", "US", "https://investors.liveramp.com/investor-resources/investor-faqs", "LiveRamp investor FAQs", "Investor FAQs identify San Francisco, California as company headquarters."),
  verified("Taboola.com Ltd.", "US", "https://investors.taboola.com/node/9666/pdf", "Taboola 2024 New York workplace announcement", "Company announcement identifies New York headquarters. Headquarters country is distinct from incorporation country."),
  verified("Criteo SA", "FR", "https://filecache.investorroom.com/mr5ir_criteo/2296/download/7_Definitive_Proxy_Statement_2025.pdf", "Criteo 2025 proxy statement", "The filing identifies Paris headquarters for Criteo S.A.; this record does not establish the headquarters of a successor entity."),
  verified("OneTrust, LLC", "US", "https://www.onetrust.com/about-us/all-locations/", "OneTrust global offices", "OneTrust lists its US headquarters in Atlanta separately from its global hubs."),
  verified("Amplitude, Inc.", "US", "https://www.amplitude.com/contact", "Amplitude contact and offices", "Company headquarters listed in San Francisco; Amsterdam is separately identified as EMEA headquarters."),
  verified("Cloudflare, Inc.", "US", "https://www.cloudflare.com/about-overview/", "About Cloudflare", "San Francisco is explicitly marked as headquarters; regional offices are listed separately."),
  verified("Meta Platforms, Inc.", "US", "https://www.sec.gov/Archives/edgar/data/1326801/000162828026003942/meta-20251231.htm", "Meta 2025 Form 10-K", "Corporate headquarters listed in Menlo Park, California. This record is for Meta Platforms, Inc., not Meta Platforms Ireland Limited."),
  verified("FullStory, Inc.", "US", "https://www.fullstory.com/strong-1h-growth-fueled-by-continued-upmarket-expansion/", "Fullstory company growth announcement", "Company announcement identifies Atlanta, USA headquarters and separate regional teams."),
  verified("LinkedIn Corporation", "US", "https://www.linkedin.com/company/linkedin", "LinkedIn official company profile", "LinkedIn's own profile identifies Sunnyvale, California headquarters. This is LinkedIn's headquarters, not its parent Microsoft's or a regional affiliate's."),
  verified("Microsoft Corporation", "US", "https://www.microsoft.com/en-us/about/office-locations", "Microsoft office locations", "Microsoft identifies Redmond, Washington as its global headquarters; this does not identify a regional contracting entity."),
  verified("Mixpanel, Inc.", "US", "https://mixpanel.com/legal/app-store-privacy-details/", "Mixpanel developer privacy guidance", "Mixpanel identifies San Francisco headquarters separately from its EU team."),
  verified("Amazon.com, Inc.", "US", "https://www.sec.gov/Archives/edgar/data/1018724/000101872426000004/amzn-20251231.htm", "Amazon 2025 Form 10-K", "The filing identifies corporate headquarters in Washington and Virginia, both in the United States. This does not establish the headquarters of AWS or regional Amazon entities."),
  verified("HubSpot, Inc.", "US", "https://ir.hubspot.com/resources/investor-faqs", "HubSpot investor FAQs", "Investor FAQs explicitly identify corporate headquarters in Cambridge, Massachusetts."),
  verified("Comscore, Inc.", "US", "https://www.comscore.com/About", "About Comscore", "Comscore explicitly identifies headquarters in Reston, Virginia, USA."),
  verified("Usercentrics A/S", "DK", "https://support.cookiebot.com/hc/en-us/articles/4411887256850-Company-information", "Cookiebot company information", "Cookiebot explicitly identifies Usercentrics A/S as headquartered in Denmark. This is distinct from Usercentrics GmbH and its German offices."),
  verified("The Trade Desk, Inc.", "US", "https://www.sec.gov/Archives/edgar/data/1671933/000167193326000014/ttd-20251231.htm", "The Trade Desk 2025 Form 10-K", "The filing identifies Ventura, California headquarters separately from its Nevada incorporation."),
  { ...verified("Functional Software, Inc.", "US", "https://sentry.io/astro-assets/resources/legal/International-Data-Transfers-With-Sentry-2024-01-19.pdf", "Sentry international data transfer assessment", "Sentry explicitly identifies United States headquarters, separately from its US and German product infrastructure. Functional Software, Inc. is its registered company name."), sources: [
    { url: "https://sentry.io/astro-assets/resources/legal/International-Data-Transfers-With-Sentry-2024-01-19.pdf", title: "Sentry international data transfer assessment" },
    { url: "https://www.sentry.help/en/articles/14831190-help-center-privacy-policy", title: "Sentry registered company identity" },
  ] },
  verified("Akamai Technologies, Inc.", "US", "https://www.akamai.com/why-akamai/contact-us", "Akamai contact and headquarters", "Akamai identifies Cambridge, Massachusetts, United States headquarters, separately from global operations."),
  { ...verified("Yandex LLC", "RU", "https://yandex.com/company/contacts/moscow", "Yandex Moscow head office", "Yandex identifies its Moscow head office. The entity-specific contact page separately identifies Yandex LLC headquarters in Russia; do not substitute the former Dutch parent or its successor."), sources: [
    { url: "https://yandex.com/company/contacts/moscow", title: "Yandex Moscow head office" },
    { url: "https://nic.yandex.com/contact/", title: "Yandex LLC entity-specific headquarters" },
  ] },
  verified("Magnite, Inc.", "US", "https://investor.magnite.com/static-files/9a1c0a0d-f838-4afc-a0c9-b430e78243ba", "Magnite 2025 Form 10-K", "The February 2026 filing identifies corporate headquarters in New York, New York, separately from other offices and data centers."),
  verified("Reddit, Inc.", "US", "https://www.sec.gov/Archives/edgar/data/1713445/000171344526000062/redditinc10-k2025.pdf", "Reddit 2025 Form 10-K", "The filing identifies principal executive offices in San Francisco, California, separately from Delaware incorporation."),
  verified("Lotame Solutions, Inc.", "US", "https://www.lotame.com/contact-us/", "Lotame global offices and headquarters", "Lotame explicitly labels its Columbia, Maryland office as headquarters, separately from its international offices."),
  verified("New Relic, Inc.", "US", "https://newrelic.com/about/contact-us", "New Relic contact and offices", "New Relic explicitly identifies San Francisco HQ, separately from its regional offices."),
  { ...verified("Marfeel Solutions, S.L.", "ES", "https://www.marfeel.com/privacy/partner-agreement", "Marfeel partner agreement", "The agreement identifies the principal place of business in Barcelona, Spain. Its tax identifier B65651259 matches the exact entity in the website ownership notice, despite the agreement's singular spelling of Solution."), sources: [
    { url: "https://www.marfeel.com/privacy/partner-agreement", title: "Marfeel principal place of business" },
    { url: "https://www.marfeel.com/privacy/conditions-of-use", title: "Marfeel Solutions legal identity" },
  ] },
  { ...verified("OpenX Technologies, Inc.", "US", "https://www.linkedin.com/company/openx", "OpenX official company profile", "OpenX identifies Pasadena, California headquarters. Its marketplace privacy policy identifies OpenX Technologies, Inc. as the provider; unrelated OpenX brands and regional entities are separate."), sources: [
    { url: "https://www.linkedin.com/company/openx", title: "OpenX official headquarters profile" },
    { url: "https://www.openx.com/privacy-center/marketplace-privacy-policy/", title: "OpenX marketplace legal identity" },
  ] },
  { ...verified("Index Exchange Inc.", "CA", "https://www.linkedin.com/company/index-platform/", "Index Exchange official company profile", "The company's profile identifies Toronto, Ontario headquarters. Its offices page separately labels New York commercial headquarters; that functional office is not substituted for company HQ."), sources: [
    { url: "https://www.linkedin.com/company/index-platform/", title: "Index Exchange company headquarters" },
    { url: "https://www.indexexchange.com/careers/", title: "Index Exchange global and commercial offices" },
  ] },
  verified("Siteimprove A/S", "DK", "https://careers.siteimprove.com/our-locations/", "Siteimprove company locations", "Siteimprove explicitly identifies Denmark as home to its headquarters in the Copenhagen section. US offices are listed separately."),
  { ...verified("Webflow, Inc.", "US", "https://hr.linkedin.com/company/webflow-inc-/", "Webflow official company profile", "Webflow identifies San Francisco, California headquarters. Its terms establish the Webflow, Inc. identity; remote employees and regional affiliates do not change this company reference."), sources: [
    { url: "https://hr.linkedin.com/company/webflow-inc-/", title: "Webflow official headquarters profile" },
    { url: "https://webflow.com/legal/terms", title: "Webflow legal identity" },
  ] },
  verified("Wingify Software Pvt. Ltd.", "IN", "https://www.linkedin.com/company/wingify", "Wingify official company profile", "Wingify's own profile identifies Delhi, India headquarters. This is not a reference for a US affiliate or the headquarters of its investors."),
  verified("Automattic Inc.", "US", "https://automattic.com/press/", "Automattic company press facts", "Automattic explicitly lists its legal name and San Francisco headquarters while describing a fully distributed workforce. This is company reference data, not an assertion that staff or hosting are located there."),
  { ...verified("Sourcepoint Technologies, Inc.", "US", "https://www.linkedin.com/company/sourcepoint-technologies-inc/", "Sourcepoint official company profile", "Sourcepoint's current company profile identifies New York headquarters; its services notice identifies Sourcepoint Technologies, Inc. Do not substitute the Paris HQ of acquirer Didomi."), sources: [
    { url: "https://www.linkedin.com/company/sourcepoint-technologies-inc/", title: "Sourcepoint official headquarters profile" },
    { url: "https://sourcepoint.com/privacy-notice/", title: "Sourcepoint services legal identity" },
  ] },
  verified("ZoomInfo Technologies LLC", "US", "https://lei.bloomberg.com/leis/view/254900NOX7TLOJ3WS309", "ZoomInfo Technologies LLC issuer LEI record", "The issued, fully corroborated LEI record for this exact LLC identifies a Vancouver, Washington headquarters address and a separate Delaware legal address. Record updated June 2, 2026; this does not inherit the public parent's headquarters."),
  verified("TrustArc Inc.", "US", "https://trustarc.com/wp-content/uploads/2025/07/TRUSTe-2025-DataPrivacyFramework-Annual-Report.pdf", "TrustArc 2025 annual program report", "TrustArc's own company description identifies California headquarters. Referencing this report for HQ does not establish a customer's transfer mechanism or certification."),
  { ...verified("Vimeo, Inc.", "US", "https://investors.vimeo.com/static-files/a8243f5d-1a58-49ed-a333-3e4ed9a73485", "Vimeo September 2025 Form 8-K", "The filing identifies Vimeo, Inc. principal executive offices in New York, consistent with its current company profile. Do not substitute an acquirer's headquarters."), sources: [
    { url: "https://investors.vimeo.com/static-files/a8243f5d-1a58-49ed-a333-3e4ed9a73485", title: "Vimeo principal executive offices" },
    { url: "https://www.linkedin.com/company/vimeo/", title: "Vimeo official headquarters profile" },
  ] },
  verified("Chartbeat, Inc.", "US", "https://www.linkedin.com/company/chartbeat/", "Chartbeat official company profile", "Chartbeat's current profile names Chartbeat, Inc. and identifies Austin, Texas headquarters. Older third-party New York descriptions are not used."),
  verified("Didomi SAS", "FR", "https://www.didomi.io/blog/meet-a-didomian-julie-quintard-marketing-director", "Didomi company interview and headquarters", "Didomi's current company interview explicitly describes Paris headquarters, separately from an employee's Montreal location. This is not Sourcepoint's headquarters."),
  { ...verified("Trustpilot A/S", "DK", "https://www.trustpilot.com/about", "About Trustpilot", "Trustpilot identifies Copenhagen headquarters; its January 2026 platform privacy policy names Trustpilot A/S. The listed international offices and parent entities are separate."), sources: [
    { url: "https://www.trustpilot.com/about", title: "Trustpilot company headquarters" },
    { url: "https://corporate.trustpilot.com/legal/for-businesses/privacy-policy/jan-2026", title: "Trustpilot A/S platform identity" },
  ] },
  verified("Tealium, Inc.", "US", "https://tealium.com/contact/", "Tealium headquarters and offices", "Tealium identifies San Diego, California US headquarters and lists its international offices separately."),
  verified("Wistia, Inc.", "US", "https://wistia.com/jobs", "Wistia careers and headquarters", "Wistia explicitly identifies Cambridge, Massachusetts HQ, separately from remote work locations."),
  { ...verified("Ketch Kloud, Inc.", "US", "https://www.ketch.com/about", "About Ketch", "Ketch's company timeline identifies its San Francisco HQ. Its current terms identify Ketch Kloud, Inc.; the postal mailbox alone is not the basis for this HQ reference."), sources: [
    { url: "https://www.ketch.com/about", title: "Ketch company headquarters" },
    { url: "https://www.ketch.com/terms-of-service", title: "Ketch Kloud legal identity" },
  ] },
  verified("Osano, Inc.", "US", "https://www.osano.com/hubfs/ai-information.html", "Osano official company facts", "Osano's published company facts explicitly identify Osano, Inc. and Austin, Texas headquarters."),
  verified("Pinterest, Inc.", "US", "https://www.sec.gov/Archives/edgar/data/1506293/000150629326000060/finalars030826.pdf", "Pinterest 2025 Form 10-K", "The filing identifies principal executive offices in San Francisco, California. Incorporation and regional Pinterest entities are separate."),
  verified("Spotify AB", "SE", "https://www.spotify.com/kr-en/about-us/contact/", "Spotify headquarters and regional entities", "Spotify explicitly labels Spotify AB in Stockholm, Sweden as Spotify HQ, separately from Spotify USA, Inc. and other regional entities."),
  { ...verified("Blockthrough Inc.", "CA", "https://ca.linkedin.com/company/blockthrough", "Blockthrough official company profile", "Blockthrough's profile identifies Toronto, Ontario headquarters, consistent with its company site. The acquisition by eyeo does not make eyeo's headquarters this provider's HQ."), sources: [
    { url: "https://ca.linkedin.com/company/blockthrough", title: "Blockthrough official headquarters profile" },
    { url: "https://blockthrough.com/team/", title: "Blockthrough company and ownership context" },
  ] },
  unverified("OpenJS Foundation", "named_entity", "https://openjsf.org/contact", "OpenJS Foundation contact information", "The foundation identifies a Wilmington, Delaware mailing address, not headquarters. Do not inherit Linux Foundation headquarters or infer HQ from hosted projects or CDN locations."),
  unverified("CookieYes Limited", "named_entity", "https://www.cookieyes.com/terms-and-conditions/", "CookieYes company terms", "The terms identify the exact UK entity and its Milton Keynes address, but do not identify headquarters. Registration and contact location alone are insufficient."),
  unverified("ID5 Technology, Inc.", "named_entity", "https://id5.io/legal/agreements/v1.2%20ID5%20ID%20Agreement%20-%20Embedded%20Platform.pdf", "ID5 December 2025 agreement", "The reviewed official agreement identifies ID5 Technology Limited in London, a different entity from the detected Inc. identity. Do not transfer that location to this entity; its HQ remains unverified."),
  unverified("Fonticons, Inc.", "named_entity", "https://origin.fontawesome.com/", "Font Awesome company information", "The site names Fonticons, Inc. and lists several team locations, but does not designate headquarters. Team locations and distribution infrastructure do not establish corporate HQ."),
  unverified("Amazon Web Services, Inc.", "named_entity", "https://aws.amazon.com/legal/marketingentities/", "AWS legal entities", "AWS lists this entity at a Seattle address, but the reviewed page does not explicitly establish its headquarters. Do not inherit Amazon.com headquarters or the Luxembourg HQ of AWS Europe."),
  unverified("PubMatic, Inc.", "named_entity", "https://www.sec.gov/Archives/edgar/data/1422930/000142293026000010/pubm-20251231.htm", "PubMatic 2025 Form 10-K", "The current filing marks the principal executive office address not applicable. A Redwood City contact address and older headquarters descriptions are insufficient to verify a current headquarters."),
  unverified("Volentio JSD Limited", "named_entity", "https://www.jsdelivr.com/documents/data-processing-agreement.pdf", "jsDelivr data processing agreement", "The agreement identifies Volentio JSD Limited as the jsDelivr operator, but does not verify headquarters. Its CDN sponsors and their server locations are separate."),
  unverified("UNPKG (operator unverified)", "named_entity", "https://www.unpkg.com/", "UNPKG official project information", "UNPKG explicitly states it is not affiliated with or supported by npm. This project label is not a verified corporate entity; headquarters remains unknown."),
  unverified("Hotjar Ltd", "legacy_entity", "https://help.hotjar.com/hc/en-us/articles/36819964438545-Hotjar-is-merging-into-Contentsquare-Billing-and-Legal-changes", "Hotjar entity merger and billing changes", "Hotjar says its Malta entity merged into Contentsquare on July 1, 2025 and billing moved to regional Contentsquare entities. The legacy detected identity does not establish current provider headquarters."),
  unverified("Segment.io, Inc.", "legacy_entity", "https://docs-resources.prod.twilio.com/documents/Segment_VAT_GST_FAQ.pdf", "Twilio Segment dissolution FAQs", "Twilio says Segment.io, Inc. was to dissolve into Twilio at the end of 2022. Do not substitute Twilio headquarters for this legacy detected entity."),
  unverified("TikTok Technology Limited", "regional_entity", "https://www.tiktok.com/legal/page/global/terms-of-service-research-api/en", "TikTok regional contracting entities", "The official terms identify this Irish regional entity and its registered office. A registered office does not independently verify headquarters; do not substitute TikTok's global or parent-company locations."),
  unverified("X Corp.", "named_entity", "https://x.com/en/tos", "X Terms of Service", "The terms identify a registered office in Bastrop, Texas, but do not explicitly establish headquarters. Regional X entities are separate counterparties."),
];

// Exact legal-entity matches only. Never strip regional suffixes, follow parent
// companies, infer from IP/ASN, or fetch company pages while a scan runs.
const byEntity = new Map(VENDOR_HEADQUARTERS_REFERENCES.map(reference => [reference.entity, reference]));
export function resolveCanonicalVendorHeadquarters(entity: string | null | undefined): VendorHeadquartersReference | null {
  return entity ? byEntity.get(entity) ?? null : null;
}
