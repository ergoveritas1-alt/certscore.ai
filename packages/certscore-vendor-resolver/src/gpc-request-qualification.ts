import {collectionBodyPrivacySignals} from "./collection-request-body";
import { isAdvertisingIdentityValue } from "./advertising-identifiers";
import type { GpcBoundedObservation } from "@certscore/contracts";
import { decodeGppRequest, type GppRequestContext } from "./gpp-request-decoder";

/** Deterministic protocol observations for California choice assessment. These
 * are request roles and declared processing signals, not a sale/sharing verdict.
 * Only existing retained URLs are inspected; no cookie/payload value is emitted.
 */
export const GPC_REQUEST_QUALIFICATION_POLICY = "gpc_sale_sharing_evidence.v5" as const;
export type GpcRequestQualification = Omit<NonNullable<GpcBoundedObservation["requests"]["advertisingCollectionQualification"]>["rows"][number], "evidenceId">;

export function inspectGpcRequestQualification(rawUrl: string, context: GppRequestContext & { allowLinkedInWa?: boolean; linkedInHeaderIdentifier?: boolean; linkedInWaBodyIdentifier?:boolean } = {}, bodyFields?: URLSearchParams): GpcRequestQualification {
  const result: GpcRequestQualification = { policyVersion:"ca_sale_sharing_qualification.v3", activity: "unresolved", basis: "endpoint_or_identity_unresolved", processingSignals: [], gpp: decodeGppRequest(new URLSearchParams()) };
  let url: URL;
  try { url = new URL(rawUrl); } catch { return result; }
  if (rawUrl.length > 16384 || url.protocol !== "https:" || url.username || url.password || url.port || url.hash) return result;
  const q = new URLSearchParams(url.searchParams);
  for (const [key,value] of bodyFields ?? []) q.append(key,value);
  const fields = [...q];
  if (fields.length > 256) return result;
  const { hostname: host, pathname: path } = url;
  const one = (key: string) => { const values = q.getAll(key); return values.length === 1 ? values[0] : undefined; };
  // Only closed visitor-identifier fields count. Publisher/account IDs, random,
  // correlator, session/page IDs, screen dimensions and body field names do not.
  const identifier = (...keys: string[]) => keys.some(key => isAdvertisingIdentityValue(key, one(key)));
  const flag = (key: string, signal: GpcRequestQualification["processingSignals"][number]) => {
    if (!q.has(key)) return;
    const value = one(key);
    if (value === "1") result.processingSignals.push(signal);
    else if (value !== "0") result.processingSignals.push("privacy_signal_invalid");
  };
  const google = /(?:^|\.)(?:google\.com|google-analytics\.com|doubleclick\.net|googlesyndication\.com)$/.test(host);
  if (google) {
    flag("rdp", "google_rdp"); flag("npa", "google_npa"); flag("ltd", "google_limited_ads");
  }
  if (/^(?:www\.)?facebook\.com$/.test(host) && /^\/tr\/?$/.test(path)) {
    for (const key of ["dpo", "data_processing_options"]) if (q.has(key)) {
      const value = one(key);
      if (value && /^(?:LDU|\["LDU"\])$/i.test(value)) result.processingSignals.push("meta_ldu");
      else if (value !== "[]") result.processingSignals.push("privacy_signal_invalid");
    }
  }
  // IAB US Privacy v1: character 3 is sale opt-out. A declared restriction
  // makes this event review-only; it does not establish that GPC was honored.
  if (q.has("us_privacy")) {
    const value = one("us_privacy");
    if (!value || !/^1[YN-]{3}$/.test(value)) result.processingSignals.push("privacy_signal_invalid");
    else if (value[2] === "Y") result.processingSignals.push("us_privacy_sale_opt_out");
  }
  result.gpp = decodeGppRequest(q, context);
  if (!["not_present", "decoded"].includes(result.gpp.status)) result.processingSignals.push("gpp_unresolved");
  if (result.gpp.status === "decoded") {
    if (result.gpp.sections.some(section => section.saleOptOut === 1 || section.sharingOptOut === 1 || section.targetedAdvertisingOptOut === 1)) result.processingSignals.push("gpp_opt_out");
    if (result.gpp.sections.some(section => section.serviceProviderMode === 1)) result.processingSignals.push("gpp_service_provider");
    if (result.gpp.requestSignals === "conflicting" || result.gpp.cmpComparison === "same_time_conflicting") result.processingSignals.push("privacy_signal_conflict");
  }
  if(collectionBodyPrivacySignals(url,q))result.processingSignals.push("privacy_signal_invalid");
  result.processingSignals = [...new Set(result.processingSignals)];
  const role = (activity: GpcRequestQualification["activity"], basis: GpcRequestQualification["basis"]) => Object.assign(result, { activity, basis });

  if (host === "stats.g.doubleclick.net" && path === "/g/collect" && one("v") === "2" &&
    /^G-[A-Z0-9]+$/.test(one("tid") ?? "") && identifier("cid")) return role("identified_advertising_collection", "google_advertising_feature_identifier");
  if (host === "cm.g.doubleclick.net" && path === "/pixel" && one("google_nid")) return role("identity_sync", "google_cookie_matching");
  if (google && /^\/pagead\/1p-user-list\/[0-9]+\/?$/.test(path) && identifier("cid", "auid")) return role("audience_collection", "google_remarketing_audience");
  if (google && (/^\/pagead\/(?:viewthroughconversion|conversion|1p-conversion)\/[0-9]+\/?$/.test(path) || path === "/measurement/conversion") &&
    identifier("cid", "auid", "gacid", "gclid")) return role("identified_advertising_collection", "google_advertising_conversion_identifier");
  // Generic GPT/AdSense impressions, pagead/id, zrt HTML and configuration
  // downloads do not establish identity transfer or cross-context use.
  if (host === "px.ads.linkedin.com" && (/^\/collect\/?$/.test(path) || context.allowLinkedInWa === true && /^\/wa\/?$/.test(path)) && (identifier("li_adsId", "li_adsid", "li_fat_id") || context.allowLinkedInWa === true && (context.linkedInHeaderIdentifier === true || /^\/wa\/?$/.test(path)&&context.linkedInWaBodyIdentifier===true)))
    return role("identified_advertising_collection", "linkedin_ads_identifier");
  if (host === "px.ads.linkedin.com" && context.allowLinkedInWa === true && /^\/wa\/?$/.test(path) &&
    bodyFields?.getAll("hem").length === 1 && !url.searchParams.has("hem") && identifier("hem"))
    return role("identified_advertising_collection", "linkedin_hashed_email");
  if (/^(?:www\.)?facebook\.com$/.test(host) && /^\/tr\/?$/.test(path) && one("id") && one("ev") && identifier("ud[em]", "ud[ph]"))
    return role("identified_advertising_collection", "meta_advanced_matching_identifier");
  if (/^(?:www\.)?facebook\.com$/.test(host) && /^\/tr\/?$/.test(path) && one("id") && one("ev") && identifier("fbp", "fbc", "external_id"))
    return role("identified_advertising_collection", "meta_pixel_identifier");
  // Source-reviewed pixel events require an exact collector, publisher/event
  // routing and a supported visitor identifier. Metadata-only endpoints and
  // publisher IDs alone do not establish identified advertising collection.
  if(host==="analytics.tiktok.com"&&/^\/api\/v2\/pixel\/?$/.test(path)&&one("pixel_code")&&one("event")&&identifier("ttp","ttclid"))
    return role("identified_advertising_collection","tiktok_pixel_identifier");
  if(host==="ct.pinterest.com"&&/^\/v3\/?$/.test(path)&&one("tid")&&one("event")&&identifier("epik","external_id"))
    return role("identified_advertising_collection","pinterest_tag_identifier");
  if(host==="tr.snapchat.com"&&/^\/p\/?$/.test(path)&&one("pid")&&one("ev")&&identifier("u_c1"))
    return role("identified_advertising_collection","snap_pixel_identifier");
  if(host==="alb.reddit.com"&&/^\/rp(?:\.gif)?$/.test(path)&&one("id")&&one("event")&&identifier("uuid","click_id"))
    return role("identified_advertising_collection","reddit_pixel_identifier");
  if (host === "bat.bing.com" && path === "/action/0" && identifier("vid", "msclkid"))
    return role("identified_advertising_collection", "microsoft_uet_identifier");
  if (host === "dpm.demdex.net" && path === "/id" && identifier("d_cid", "d_cid_ic", "d_uuid"))
    return role("identity_sync", "adobe_identity_mapping");
  if (/^gum(?:\.[a-z]+)?\.criteo\.com$/.test(host) && /^\/fpm\/(?:init|sid)$/.test(path) && identifier("first_party_id"))
    return role("identity_sync", "criteo_first_party_identity");
  if (host === "s.amazon-adsystem.com" && path === "/iu3" && one("d")) return role("identity_sync", "amazon_identity_sync");
  if (/^image[0-9]+\.pubmatic\.com$/.test(host) && path === "/AdServer/UCookieSetPug" && (one("p") || one("publisherId")))
    return role("identity_sync", "pubmatic_cookie_sync");
  if (host === "match.adsrvr.org" && path === "/track/rid" && one("ttd_pid")) return role("identity_sync", "trade_desk_identity_mapping");
  if (host === "bcp.crwdcntrl.net" && path === "/6/map" && one("xcid")) return role("identity_sync", "lotame_profile_mapping");
  if (host === "rtb.openx.net" && path === "/esp" && one("rid") === "esp") {
    try { if (["https:", "http:"].includes(new URL(one("url") ?? "").protocol)) return role("identity_sync", "openx_identity_resolution"); } catch { /* Not a page URL. */ }
  }
  if (host === "fastlane.rubiconproject.com" && path === "/a/api/fastlane.json" && identifier("eid_pubcid.org", "eid_sharedid.org", "eid_id5-sync.com", "eid_liveramp.com"))
    return role("identified_advertising_collection", "magnite_bid_user_identifier");
  return result;
}
