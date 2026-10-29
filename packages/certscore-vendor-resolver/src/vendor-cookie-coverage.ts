/** Exact documented cookie identities. No broad vendor-prefix classification. */
export const VENDOR_COOKIE_COVERAGE = [
 {pattern:/^_cl(?:ck|sk)$/,vendor:"Microsoft",product:"Microsoft Clarity",category:"session_replay",source:"https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-cookies"},
 {pattern:/^_ttp$/,vendor:"TikTok",product:"TikTok Pixel",category:"advertising",source:"https://business-api.tiktok.com/portal/docs/send-tiktok-cookie-ttp/v1.3"},
 {pattern:/^(?:hubspotutk|__hstc|__hssc|__hssrc)$/,vendor:"HubSpot",product:"HubSpot Analytics",category:"analytics",source:"https://knowledge.hubspot.com/privacy-and-consent/what-cookies-does-hubspot-set-in-a-visitor-s-browser"},
 {pattern:/^__hs_(?:opt_out|do_not_track|initial_opt_in|cookie_cat_pref)$/,vendor:"HubSpot",product:"HubSpot Banner",category:"consent_management",source:"https://knowledge.hubspot.com/privacy-and-consent/what-cookies-does-hubspot-set-in-a-visitor-s-browser"},
 {pattern:/^_mkto_trk$/,vendor:"Adobe",product:"Adobe Marketo Engage Munchkin",category:"analytics",source:"https://experienceleague.adobe.com/en/docs/marketo-developer/marketo/javascriptapi/leadtracking/lead-tracking"},
 {pattern:/^(?:AMCV_[A-Fa-f0-9]+(?:@|%40)AdobeOrg|s_ecid)$/,vendor:"Adobe",product:"Adobe Analytics / Experience Cloud",category:"analytics",source:"https://experienceleague.adobe.com/en/docs/core-services/interface/data-collection/cookies/analytics"},
 {pattern:/^fs_(?:uid|lua)$/,vendor:"FullStory",product:"FullStory",category:"session_replay",source:"https://help.fullstory.com/hc/en-us/articles/360020829513-Why-Fullstory-uses-First-Party-Cookies"},
 {pattern:/^fs_cid$/,vendor:"FullStory",product:"FullStory",category:"consent_management",source:"https://help.fullstory.com/hc/en-us/articles/360020829513-Why-Fullstory-uses-First-Party-Cookies"},
 {pattern:/^__kla_id$/,vendor:"Klaviyo",product:"Klaviyo",category:"analytics",source:"https://help.klaviyo.com/hc/en-us/articles/360034666712"},
 {pattern:/^_ym_(?:uid|d|isad|fa|ucs)$/,vendor:"Yandex",product:"Yandex Metrica",category:"analytics",source:"https://yandex.com/support/metrica/en/general/cookie-usage"},
 {pattern:/^(?:_pin_unauth|_pinterest_ct_ua)$/,vendor:"Pinterest",product:"Pinterest Tag",category:"advertising",source:"https://help.pinterest.com/en-gb/business/article/pinterest-tag-parameters-and-cookies"},
 {pattern:/^mp_[a-f0-9]{32}_mixpanel$/,vendor:"Mixpanel",product:"Mixpanel",category:"analytics",source:"https://github.com/mixpanel/mixpanel-js/blob/master/src/mixpanel-persistence.js"},
 {pattern:/^_scid$/,vendor:"Snap",product:"Snap Pixel",category:"advertising",source:"https://developers.snap.com/marketing-api/Conversions-API/Parameters"},
 {pattern:/^_hp2_id\.[0-9]{1,20}$/,vendor:"Heap",product:"Heap Analytics",category:"analytics",source:"https://developers.heap.io/docs/using-identify"},
 {pattern:/^_rdt_uuid$/,vendor:"Reddit",product:"Reddit Pixel",category:"advertising",source:"https://ads-api.reddit.com/docs/v3/operations/Post%20Conversion%20Events"},
 // Verified from the vendor loader -> pinned legacy module, not a blanket _hj prefix.
 // HJ_SESSION_USER persists the generated user identity; HJ_SESSION stores the
 // session identity and sampling/recording flags. Neither proves active recording.
 {pattern:/^_hj(?:SessionUser|Session)_[0-9]{1,20}$/,vendor:"Hotjar",product:"Hotjar",category:"session_replay",source:"https://script.hotjar.com/modules.96a30129fbe7c16f762f.js"},
] as const;


/** C3 exact identities introduced in v7; v6 retains the table above unchanged. */
export const C3_COOKIE_COVERAGE = [
 {pattern:/^fundraiseup_stat$/,vendor:"Fundraise Up",product:"Fundraise Up",category:"analytics",source:"https://fundraiseup.com/docs/cookies/"},
 {pattern:/^fundraiseup_cid$/,vendor:"Fundraise Up",product:"Fundraise Up",category:"security",source:"https://fundraiseup.com/docs/cookies/"},
 {pattern:/^nmstat$/,vendor:"Siteimprove",product:"Siteimprove Analytics",category:"analytics",source:"https://help.siteimprove.com/support/solutions/articles/80000863908-siteimprove-analytics-cookies"},
 {pattern:/^szcib$/,vendor:"Siteimprove",product:"Siteimprove Analytics",category:"consent_management",source:"https://help.siteimprove.com/support/solutions/articles/80000863908-siteimprove-analytics-cookies"},
 {pattern:/^SC_ANALYTICS_GLOBAL_COOKIE$/,vendor:"Sitecore",product:"Sitecore Experience Analytics",category:"analytics",source:"https://doc.sitecore.com/xp/en/developers/103/platform-administration-and-architecture/cookies-used-by-sitecore.html"},
 {pattern:/^SC_TRACKING_CONSENT$/,vendor:"Sitecore",product:"Sitecore Experience Analytics",category:"consent_management",source:"https://doc.sitecore.com/xp/en/developers/103/platform-administration-and-architecture/cookies-used-by-sitecore.html"},
] as const;

export function cookieCoverageForPolicy(version: string | undefined) {
 return ["certscore.cookie-purpose.v7", "certscore.cookie-purpose.v8"].includes(version ?? "") ? [...VENDOR_COOKIE_COVERAGE, ...C3_COOKIE_COVERAGE]
  : version === "certscore.cookie-purpose.v6" ? VENDOR_COOKIE_COVERAGE : [];
}
