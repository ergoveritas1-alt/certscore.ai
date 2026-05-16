export type SampleFindingJson = {
  findingId: string;
  label: string;
  sourceLabel: string;
  payload: Record<string, unknown>;
};

const accessibilityRiskScore = {
  "example_type": "positive",
  "scan_id": "a0f2621b-a25f-4392-8be6-b1ce09d43e8a",
  "domain": "chime.com",
  "requested_url": "https://chime.com",
  "final_url": "https://chime.com/",
  "created_at": "2026-03-26T22:35:06.747Z",
  "scanned_at": "2026-03-26T22:35:52.641Z",
  "finding_id": "accessibility_risk_score",
  "finding_label": "Representative accessibility barriers detected",
  "section": "Accessibility",
  "confidence": "good",
  "direct_vs_inferred": "direct",
  "surface_priority": 72,
  "appeared_in_executive_summary": true,
  "regulatory_lanes": [],
  "normalized_concern_ids": ["eligible"],
  "concern_policy_rule_ids": ["accessibility.wcag_contrast_failures_count"],
  "evidence": {
    "counts": {
      "count": 1,
      "representativeAxeExampleCount": 1,
      "representativeAxePageCount": 1,
      "representativeAxeRuleCount": 1
    },
    "evidence_snippets": [
      "Axe example: color-contrast/color on https://chime.com/; selector footer > p; nodes 1; impact Low-vision users may struggle to read text or distinguish controls.; severity high; help: Elements must meet minimum color contrast ratio thresholds.",
      "Representative axe examples: 1 rule across 1 page; max impact: Low-vision users may struggle to read text or distinguish controls.."
    ],
    "vendors": [],
    "request_domains": [],
    "request_samples": [],
    "cookie_samples": [],
    "consent_summary": {
      "preconsent_tracking_detected": false,
      "banner_present": false,
      "reject_all_present": false
    },
    "fingerprinting_or_device_signals": {
      "fingerprinting_vendor_detected": false,
      "device_signal_vendor_detected": null
    },
    "policy_anchors": [],
    "runtime_anchors": [],
    "conflict_bridge": null
  },
  "coverage_flags": ["partial_scan", "blocked", "incomplete_pages"],
  "coverage_limitation_evidence": {
    "coverageFlags": ["partial_scan", "blocked", "incomplete_pages"],
    "coverageLevel": "limited_partial",
    "explanation": "Scan coverage limitations may have prevented full page-text evidence capture.",
    "finalUrl": "https://chime.com/",
    "homepageHttpStatus": null,
    "runtimeSignalsRetained": {
      "cookieCount": 1,
      "preconsentEvidenceUrlCount": 0,
      "requestDomainSamples": [],
      "scriptTagCount": 0,
      "thirdPartyRequestCount": 0,
      "trackerVendorSamples": []
    }
  },
  "known_limitations": [
    "Scan coverage issue: partial_scan",
    "Scan coverage issue: blocked",
    "Scan coverage issue: incomplete_pages"
  ],
  "selection_reason": "Surfaced finding with strong support. Mapped to executive finding accessibility_risk_score (good, direct). Evidence richness score: 9."
} satisfies Record<string, unknown>;

const preConsentTrackingDetected = {
  "example_type": "positive",
  "scan_id": "e54bf2cf-ce6a-4bea-915a-07c82eb0eb5d",
  "domain": "fxvipsignals.com",
  "requested_url": "https://fxvipsignals.com/",
  "final_url": "https://fxvipsignals.com/",
  "created_at": "2026-04-22T19:37:42.568Z",
  "scanned_at": "2026-04-22T19:41:54.236Z",
  "finding_id": "pre_consent_tracking_detected",
  "finding_label": "Tracking started before consent",
  "section": "Privacy & Tracking",
  "confidence": "strong",
  "direct_vs_inferred": "direct",
  "surface_priority": 100,
  "appeared_in_executive_summary": true,
  "regulatory_lanes": [],
  "normalized_concern_ids": ["eligible"],
  "concern_policy_rule_ids": ["privacy.preconsent_tracking_detected"],
  "evidence": {
    "counts": {
      "firstRequestMs": 1137,
      "firstThirdPartyRequestMs": 3405,
      "firstCookieSeenMs": 0,
      "total_cookie_count": 55,
      "total_vendor_count": 5,
      "total_request_count": 151,
      "total_tracker_count": 5,
      "third_party_cookie_count": 43,
      "third_party_request_count": 63,
      "preconsent_violation_count": 6
    },
    "evidence_snippets": [
      "privacy.preconsent_tracking_detected",
      "Google Tag Manager",
      "Google Analytics",
      "Meta Pixel",
      "privacy.tracking_before_consent_detected",
      "www.googletagmanager.com",
      "Policy claim only_necessary_cookies_before_choice conflicts with runtime observation analytics_vendor_fired_pre_consent.",
      "AdRoll",
      "Tapad",
      "Targeting360",
      "reCAPTCHA Enterprise",
      "The Trade Desk",
      "www.google-analytics.com",
      "d.adroll.com",
      "tapad.com",
      "bidswitch.net",
      "script_host:www.googletagmanager.com",
      "script_host:www.google-analytics.com"
    ],
    "vendors": [
      "Google Tag Manager",
      "Google Analytics",
      "Meta Pixel",
      "AdRoll",
      "Tapad",
      "Targeting360",
      "reCAPTCHA Enterprise",
      "The Trade Desk",
      "DoubleClick"
    ],
    "request_domains": [],
    "request_samples": [],
    "cookie_samples": [],
    "consent_summary": {
      "cmp_vendor": "TrustArc",
      "preconsent_tracking_detected": true,
      "banner_present": false,
      "reject_all_present": false
    },
    "fingerprinting_or_device_signals": {
      "fingerprinting_vendor_detected": false,
      "device_signal_vendor_detected": null
    },
    "policy_anchors": [],
    "runtime_anchors": [],
    "conflict_bridge": null
  },
  "coverage_flags": ["partial_scan", "incomplete_pages"],
  "known_limitations": ["Scan coverage issue: partial_scan", "Scan coverage issue: incomplete_pages"],
  "selection_reason": "Surfaced finding with strong support. Mapped to executive finding pre_consent_tracking_detected (strong, direct). Evidence richness score: 170."
} satisfies Record<string, unknown>;

const rejectTrackingPersistsAfterReject = {
  "example_type": "positive",
  "domain": "abc.com",
  "requested_url": "https://abc.com",
  "finding_id": "reject_tracking_persists_after_reject",
  "finding_label": "Non-essential tracking continued after reject",
  "section": "Privacy & Tracking",
  "confidence": "good",
  "direct_vs_inferred": "direct",
  "evidence_source": "prod-refresh corpus 2026-04-29",
  "evidence_summary": "Scan ID: 6375819a-dc84-4da8-8eba-0a415059255f, vendors: Adobe Analytics + Google Ads, confidence: good, direct evidence",
  "verification_method": "Kimi-reviewed runtime artifact",
  "verified_at": "2026-04-30"
} satisfies Record<string, unknown>;

const rtbCookieSyncObserved = {
  "example_type": "positive",
  "scan_id": "de34f407-7f3f-4ea0-b598-c8874f431e63",
  "domain": "www.betterment.com",
  "requested_url": "https://betterment.com/",
  "final_url": "https://www.betterment.com/",
  "created_at": "2026-04-29T15:48:39.215Z",
  "scanned_at": "2026-04-29T15:49:46.818Z",
  "finding_id": "rtb_cookie_sync_observed",
  "finding_label": "RTB cookie sync observed",
  "section": "Vendors & Requests",
  "confidence": "strong",
  "direct_vs_inferred": "direct",
  "surface_priority": 94,
  "appeared_in_executive_summary": true,
  "regulatory_lanes": [],
  "normalized_concern_ids": ["eligible"],
  "concern_policy_rule_ids": [],
  "evidence": {
    "counts": {
      "third_party_request_count": 210,
      "rtb_cookie_sync_domain_count": 15,
      "third_party_request_domain_count": 95
    },
    "evidence_snippets": [
      "Adobe Audience Manager",
      "Bidswitch",
      "DoubleClick",
      "DoubleClick / Floodlight",
      "Index Exchange",
      "LiveRamp",
      "OpenX",
      "PubMatic",
      "Rubicon Project",
      "The Trade Desk",
      "TripleLift",
      "adsmeasurement.com",
      "alb.reddit.com",
      "amplify.outbrain.com",
      "analytics-ipv6.tiktokw.us",
      "analytics.google.com",
      "analytics.tiktok.com",
      "api.hubapi.com",
      "api.segment.io",
      "app.hubspot.com",
      "b2bjsstore.s3.us-west-2.amazonaws.com",
      "browser.sentry-cdn.com",
      "c.amazon-adsystem.com",
      "cdn.ketchjs.com",
      "cdn.mxpnl.com",
      "cdn.segment.com",
      "cdnjs.cloudflare.com",
      "cm.g.doubleclick.net",
      "cm.teads.tv",
      "collector-35199.us.tvsquared.com",
      "collector-55161.us.tvsquared.com",
      "connect.facebook.net",
      "ct.pinterest.com",
      "cta-service-cms2.hubspot.com",
      "d.adroll.com",
      "d2hrivdxn8ekm8.cloudfront.net",
      "dpm.demdex.net",
      "dsum-sec.casalemedia.com",
      "eb2.3lift.com",
      "f.hubspotusercontent20.net",
      "fast.wistia.com",
      "global.ketchcdn.com",
      "googleads.g.doubleclick.net",
      "grsm.io",
      "i.pretected.com",
      "ib.adnxs.com",
      "idsync.rlcdn.com",
      "image2.pubmatic.com",
      "insight.adsrvr.org",
      "jadserve.postrelease.com",
      "js.hs-analytics.net",
      "js.hs-banner.com",
      "js.hsadspixel.net",
      "js.hubspot.com",
      "js.partnerstack.com",
      "match.adsrvr.org",
      "maxcdn.bootstrapcdn.com",
      "ml314.com",
      "mpp.vindicosuite.com",
      "no-cache.hubspot.com",
      "p.teads.tv",
      "partnerlinks.io",
      "perf-na1.hsforms.com",
      "perf.hsforms.com",
      "ping.pdst.fm",
      "pippio.com",
      "pixel-config.reddit.com",
      "pixel.rubiconproject.com",
      "pixel.tapad.com",
      "pixelads.yahoo.com",
      "ps.eyeota.net",
      "pubads.g.doubleclick.net",
      "px.adentifi.com",
      "px.ads.linkedin.com",
      "px.mountain.com",
      "s.adroll.com",
      "s.amazon-adsystem.com",
      "s.pinimg.com",
      "s.yimg.com",
      "sc-static.net",
      "script.hotjar.com",
      "secure.adnxs.com",
      "segment.prod.bidr.io",
      "static.hotjar.com",
      "stats.g.doubleclick.net",
      "storage.googleapis.com",
      "sync.outbrain.com",
      "sync.taboola.com",
      "tags.srv.stackadapt.com",
      "tags.w55c.net",
      "tk0x1.com",
      "tr.outbrain.com",
      "tr.snapchat.com",
      "tte-prod.telemetry.vaultdcr.com",
      "ttip-ipv4-prod.telemetry.vaultdcr.com",
      "ttip-ipv6-prod.telemetry.vaultdcr.com",
      "tvspix.com",
      "us-u.openx.net",
      "wave.outbrain.com",
      "www.facebook.com",
      "www.google-analytics.com",
      "www.google.com",
      "www.googletagmanager.com",
      "www.nextinsure.com",
      "www.redditstatic.com",
      "x.bidswitch.net"
    ],
    "vendors": [
      "Adobe Audience Manager",
      "Bidswitch",
      "DoubleClick",
      "DoubleClick / Floodlight",
      "Index Exchange",
      "LiveRamp",
      "OpenX",
      "PubMatic",
      "Rubicon Project",
      "The Trade Desk",
      "TripleLift"
    ],
    "request_domains": [],
    "request_samples": [],
    "cookie_samples": [],
    "consent_summary": {
      "preconsent_tracking_detected": true,
      "banner_present": true,
      "reject_all_present": false
    },
    "fingerprinting_or_device_signals": {
      "fingerprinting_vendor_detected": false,
      "device_signal_vendor_detected": null
    },
    "policy_anchors": [],
    "runtime_anchors": [
      "Runtime vendors: Adobe Audience Manager, Bidswitch, DoubleClick, DoubleClick / Floodlight, Index Exchange"
    ],
    "conflict_bridge": null
  },
  "coverage_flags": ["partial_scan", "incomplete_pages"],
  "known_limitations": [
    "Scan coverage issue: partial_scan",
    "Scan coverage issue: incomplete_pages",
    "Runtime signals were retained before or during limited page coverage."
  ],
  "selection_reason": "Surfaced finding with strong support. Evidence richness score: 148."
} satisfies Record<string, unknown>;

const sessionRecordingServicesDetected = {
  "example_type": "positive",
  "scan_id": "0f1782a7-4a5c-4e29-98ce-672830bbaa63",
  "domain": "www.google.com",
  "requested_url": "https://www.google.com",
  "final_url": "https://www.google.com/",
  "created_at": "2026-03-30T00:59:42.069Z",
  "scanned_at": "2026-03-30T01:01:03.193Z",
  "finding_id": "session_recording_services_detected",
  "finding_label": "Session recording services detected",
  "section": "Privacy & Tracking",
  "confidence": "good",
  "direct_vs_inferred": "direct",
  "surface_priority": 89,
  "appeared_in_executive_summary": true,
  "regulatory_lanes": ["CCPA/CPRA", "COPPA"],
  "normalized_concern_ids": ["eligible"],
  "concern_policy_rule_ids": [
    "privacy.session_replay_runtime_detected",
    "privacy.session_replay_runtime_vendors",
    "commerce.session_replay_tool_detected"
  ],
  "evidence": {
    "counts": {},
    "evidence_snippets": [
      "tracker_vendor:Hotjar",
      "vendor_category:session_replay",
      "matched_signature:hotjar",
      "collection_endpoint:unknown",
      "tracker_confidence:0.95",
      "Hotjar"
    ],
    "vendors": [],
    "request_domains": [],
    "request_samples": [],
    "cookie_samples": [],
    "consent_summary": {
      "cmp_vendor": "TrustArc",
      "preconsent_tracking_detected": true,
      "banner_present": false,
      "reject_all_present": false
    },
    "fingerprinting_or_device_signals": {
      "fingerprinting_vendor_detected": false,
      "device_signal_vendor_detected": null
    },
    "policy_anchors": [],
    "runtime_anchors": [],
    "conflict_bridge": null
  },
  "coverage_flags": [],
  "coverage_limitation_evidence": null,
  "known_limitations": [],
  "selection_reason": "Surfaced finding with strong support. Mapped to executive finding session_recording_services_detected (good, direct). Evidence richness score: 10. Scan completed without coverage issues."
} satisfies Record<string, unknown>;

const thirdPartyCookiePreConsent = {
  "example_type": "positive",
  "domain": "marketwatch.com",
  "requested_url": "https://marketwatch.com",
  "finding_id": "third_party_cookie_pre_consent",
  "finding_label": "Tracking cookies set before consent",
  "section": "Cookies & Storage",
  "confidence": "good",
  "direct_vs_inferred": "direct",
  "evidence_source": "tmp/auto-next20a cookies-before-consent.json",
  "evidence_summary": "icu@.adnxs.com, TDID@.adsrvr.org, ad-id@.amazon-adsystem.com, cto_bundle@.criteo.com, demdex@.demdex.net, IDE@.doubleclick.net",
  "verification_method": "Kimi-reviewed runtime artifact",
  "verified_at": "2026-04-30"
} satisfies Record<string, unknown>;

const PRE_CONSENT_TRACKING_SAMPLE: SampleFindingJson = {
  findingId: "pre_consent_tracking_detected",
  label: "Tracking started before consent",
  sourceLabel: "Production finding corpus, 2026-04-28",
  payload: preConsentTrackingDetected
};

const THIRD_PARTY_COOKIE_SAMPLE: SampleFindingJson = {
  findingId: "third_party_cookie_pre_consent",
  label: "Tracking cookies set before consent",
  sourceLabel: "Verified production scan corpus, 2026-04-30",
  payload: thirdPartyCookiePreConsent
};

const REJECT_TRACKING_SAMPLE: SampleFindingJson = {
  findingId: "reject_tracking_persists_after_reject",
  label: "Non-essential tracking continued after reject",
  sourceLabel: "Verified production scan corpus, 2026-04-30",
  payload: rejectTrackingPersistsAfterReject
};

const RTB_COOKIE_SYNC_SAMPLE: SampleFindingJson = {
  findingId: "rtb_cookie_sync_observed",
  label: "RTB cookie sync observed",
  sourceLabel: "Production finding corpus, 2026-04-29",
  payload: rtbCookieSyncObserved
};

const SESSION_REPLAY_SAMPLE: SampleFindingJson = {
  findingId: "session_recording_services_detected",
  label: "Session recording services detected",
  sourceLabel: "Production finding corpus, 2026-04-29",
  payload: sessionRecordingServicesDetected
};

const ACCESSIBILITY_SAMPLE: SampleFindingJson = {
  findingId: "accessibility_risk_score",
  label: "Representative accessibility barriers detected",
  sourceLabel: "Production finding corpus, 2026-04-29",
  payload: accessibilityRiskScore
};

export function getGuideSampleFindings(input: { path?: string; title: string }): SampleFindingJson[] {
  const haystack = `${input.path ?? ""} ${input.title}`.toLowerCase();

  if (haystack.includes("accessibility")) {
    return [ACCESSIBILITY_SAMPLE];
  }

  if (haystack.includes("session-replay") || haystack.includes("session replay")) {
    return [SESSION_REPLAY_SAMPLE];
  }

  if (haystack.includes("rtb") || haystack.includes("cookie syncing")) {
    return [RTB_COOKIE_SYNC_SAMPLE];
  }

  if (haystack.includes("third-party-cookie") || haystack.includes("third-party cookie") || haystack.includes("cookie checker")) {
    return [THIRD_PARTY_COOKIE_SAMPLE, PRE_CONSENT_TRACKING_SAMPLE];
  }

  if (haystack.includes("consent") || haystack.includes("cmp") || haystack.includes("tracking before")) {
    return [PRE_CONSENT_TRACKING_SAMPLE, REJECT_TRACKING_SAMPLE, THIRD_PARTY_COOKIE_SAMPLE];
  }

  return [];
}
