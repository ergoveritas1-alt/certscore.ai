import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBrowserExtensionRequestInventoryRows,
  buildReportSurfaceVendorProjection,
  buildRuntimeInventoryGroupRows,
  buildSanitizedRequestEvidenceRows,
  buildTrackerInventoryGroupRows,
  suppressUnsupportedCmpAliasRows,
  buildTrackerInventoryRows,
  classifyInventoryEvidence,
  deriveInventoryMacroCategory,
  deriveRuntimeInventoryPresentationState,
  getInventoryGroupRowRenderKey,
  getTrackerConsentReviewPriority,
  isInventoryDisplayHostname,
  isTimedPreConsentInventoryRow,
} from "./runtime-inventory-projection";

test("projects an empty inventory message only when canonical coverage is not limited", () => {
  assert.deepEqual(
    deriveRuntimeInventoryPresentationState({
      groupedRowCount: 0,
      runtimeCoverageLimited: false,
      scanCompleted: true
    }),
    {
      status: "empty",
      message: "No retained cookies or trackers were detected for this scan."
    }
  );

  assert.deepEqual(
    deriveRuntimeInventoryPresentationState({
      groupedRowCount: 0,
      runtimeCoverageLimited: true,
      scanCompleted: true
    }),
    {
      status: "insufficient_evidence",
      message: "Cookie and tracker inventory was not available because retained runtime coverage was incomplete."
    }
  );
});

test("retained canonical inventory rows take precedence over a coverage limitation", () => {
  assert.deepEqual(
    deriveRuntimeInventoryPresentationState({
      groupedRowCount: 2,
      runtimeCoverageLimited: true,
      scanCompleted: true
    }),
    { status: "retained", message: null }
  );
});

test("projects bounded request-level evidence without retaining parameter or cookie values", () => {
  const rows = buildSanitizedRequestEvidenceRows({
    requestPurposeClassificationConfidence: [{
      cookieNamesSent: ["session-id"],
      essentiality: "unknown",
      hostname: "ads.example.test",
      identifierParameterNames: ["client_id"],
      initiatorUrl: "https://cdn.example.test/app.js?secret=value",
      method: "POST",
      pathSample: "/collect",
      responseCookieNamesSet: ["ad-id"],
      responseObserved: true,
      responseStorageAttempted: true,
      vendor: "Example Ads",
    }],
  });

  assert.deepEqual(rows, [{
    cookieNamesSent: ["session-id"],
    essentiality: "unknown",
    hostname: "ads.example.test",
    identifierParameterNames: ["client_id"],
    initiatorUrl: "https://cdn.example.test/app.js",
    method: "POST",
    path: "/collect",
    responseCookieNamesSet: ["ad-id"],
    responseObserved: true,
    responseStorageAttempted: true,
    vendor: "Example Ads",
  }]);
});

test("projects bounded BX01 request inventory without treating unresolved hosts as violations", () => {
  const rows = buildBrowserExtensionRequestInventoryRows({
    browserExtensionRequestInventory: [
      {
        attributionStatus: "resolved",
        category: "consent_management",
        confidence: 0.96,
        firstSeenMs: 7,
        hostname: "cdn.cookielaw.org",
        preConsent: true,
        product: "OneTrust CMP",
        regulatoryRelevance: ["consent"],
        requestCount: 6,
        vendor: "OneTrust"
      },
      {
        attributionStatus: "unresolved",
        category: "unresolved_host",
        confidence: null,
        firstSeenMs: 18,
        hostname: "cdn.pricespider.com",
        preConsent: true,
        product: null,
        regulatoryRelevance: [],
        requestCount: 4,
        vendor: null
      }
    ]
  });
  const groupedRows = buildRuntimeInventoryGroupRows({ cookieRows: [], trackerRows: rows });
  const oneTrust = groupedRows.find((row) => row.canonicalEntity === "OneTrust, LLC");
  const priceSpider = groupedRows.find((row) => row.type === "tracker" && row.vendor === "cdn.pricespider.com");

  assert.equal(oneTrust?.purpose, "Cookie compliance");
  assert.equal(oneTrust?.priority, "contextual");
  assert.equal(oneTrust?.type === "tracker" ? oneTrust.requestCount : null, 6);
  assert.equal(priceSpider?.purpose, "Unresolved Host");
  assert.equal(priceSpider?.priority, "review_needed");
  assert.equal(priceSpider?.type === "tracker" ? priceSpider.requestCount : null, 4);
});

test("creates unique render keys for repeated vendor-purpose inventory rows", () => {
  const baseRow = {
    confidence: "high" as const,
    cookieNames: ["uid"],
    domains: ["criteo.com"],
    firstSeenMs: 120,
    macroCategory: "Advertising" as const,
    party: "third_party" as const,
    priority: "high" as const,
    purpose: "Advertising",
    type: "cookie" as const,
    vendor: "Criteo"
  };
  const rows = [baseRow, { ...baseRow, cookieNames: ["cto_bundle"] }, { ...baseRow }];
  const keys = rows.map(getInventoryGroupRowRenderKey);

  assert.equal(new Set(keys).size, rows.length);
});

test("keeps untimed request-only rows out of the pre-consent inventory", () => {
  const base = {
    category: "consent_management",
    confidence: 0.99,
    domains: ["consent.cookiebot.eu"],
    label: "Cookiebot",
    observedVia: ["request"],
    party: "third_party" as const,
    preConsent: true,
    requestCount: 1,
    source: "runtime",
    vendorDisplayCategory: "Cookie compliance"
  };

  assert.equal(isTimedPreConsentInventoryRow({ ...base, cookieNames: [], firstSeenMs: null }), false);
  assert.equal(isTimedPreConsentInventoryRow({ ...base, cookieNames: [], firstSeenMs: 3346 }), true);
  assert.equal(isTimedPreConsentInventoryRow({ ...base, cookieNames: ["CookieConsent"], firstSeenMs: null }), true);
});

test("derives Fable macro categories without replacing detailed purposes", () => {
  assert.equal(deriveInventoryMacroCategory({ purpose: "Advertising", priority: "high", vendor: "Meta Pixel" }), "Advertising");
  assert.equal(deriveInventoryMacroCategory({ purpose: "Session replay", priority: "medium", vendor: "Microsoft Clarity" }), "Analytics");
  assert.equal(deriveInventoryMacroCategory({ purpose: "Security", priority: "contextual", vendor: "Cloudflare" }), "Essential");
  assert.equal(deriveInventoryMacroCategory({ purpose: "Tag management", priority: "medium", vendor: "Google Tag Manager" }), "Functional");
  assert.equal(deriveInventoryMacroCategory({ purpose: "CDN", priority: "contextual", vendor: "jQuery CDN" }), "Essential");
  assert.equal(deriveInventoryMacroCategory({ purpose: "CDN", priority: "contextual", vendor: "Instagram CDN" }), "Functional");
  assert.equal(deriveInventoryMacroCategory({ purpose: "Embedded media", priority: "medium", vendor: "Example Player" }), "Functional");
  assert.equal(deriveInventoryMacroCategory({ purpose: "Unknown", priority: "medium", vendor: "unresolved.example" }), "Review");
  assert.equal(deriveInventoryMacroCategory({ purpose: "Unknown", priority: "review_needed", vendor: "unresolved.example" }), "Review");
});

test("projects canonical embedded players without reclassifying them as analytics", () => {
  const rows = buildTrackerInventoryRows({
    domains: ["player.vimeo.com"],
    firstPartyDomain: "example.com",
    preConsentVendors: ["Vimeo"],
    resolvedVendors: ["Vimeo"],
    sessionReplayVendors: [],
    trackerVendors: [],
    topObservedEntities: [{
      category: "unknown",
      label: "player.vimeo.com",
      requestCount: 2,
    }],
    unresolvedHosts: [],
  });
  const groupedRows = buildRuntimeInventoryGroupRows({ cookieRows: [], trackerRows: rows });
  const player = groupedRows.find((row) => row.rawProducts.includes("Vimeo Embedded Player"));

  assert.equal(player?.purpose, "Embedded media");
  assert.equal(player?.observedRecordCount, 1);
  assert.equal(player?.macroCategory, "Functional");
  assert.equal(player?.priority, "medium");
  assert.deepEqual(player?.regulatoryRelevance, [
    "embedded_content",
    "media_delivery",
    "third_party_runtime",
  ]);
});

test("keeps incompatible products from one legal entity in distinct inventory rows", () => {
  const groupedRows = buildRuntimeInventoryGroupRows({
    cookieRows: [],
    trackerRows: [
      {
        category: "analytics",
        confidence: 0.99,
        domains: ["www.google-analytics.com"],
        firstSeenMs: 100,
        label: "Google Analytics",
        observedVia: ["request"],
        party: "third_party",
        preConsent: true,
        regulatoryRelevance: ["analytics", "audience_measurement"],
        requestCount: 1,
        source: "fixture",
      },
      {
        category: "authentication",
        confidence: 0.99,
        domains: ["accounts.google.com"],
        firstSeenMs: 150,
        label: "Google Sign-in",
        observedVia: ["request"],
        party: "third_party",
        preConsent: true,
        regulatoryRelevance: ["authentication"],
        requestCount: 1,
        source: "fixture",
      },
    ],
  });
  const googleRows = groupedRows.filter((row) => row.canonicalEntity === "Google LLC");

  assert.equal(googleRows.length, 2);
  assert.deepEqual(googleRows.map((row) => row.observedRecordCount), [1, 1]);
  assert.deepEqual(
    googleRows.map((row) => [row.rawProducts[0], row.purpose]).sort(),
    [
      ["Google Analytics", "Audience measurement"],
      ["Google Sign-in", "Authentication"],
    ],
  );
});

test("keeps context-dependent runtime activity out of Essential evidence without a necessity basis", () => {
  const base = {
    macroCategory: "Essential" as const,
    priority: "contextual" as const,
    purposes: [] as string[]
  };

  assert.equal(classifyInventoryEvidence({ ...base, purpose: "Payment processors" }), "Contextual");
  assert.equal(classifyInventoryEvidence({ ...base, purpose: "Authentication" }), "Contextual");
  assert.equal(classifyInventoryEvidence({ ...base, purpose: "Consent management" }), "Contextual");
  assert.equal(classifyInventoryEvidence({ ...base, purpose: "Necessary" }), "Essential");
  assert.equal(classifyInventoryEvidence({ ...base, purpose: "Security" }), "Essential");
});

test("keeps risk and review classifications ahead of contextual macro categories", () => {
  assert.equal(classifyInventoryEvidence({
    macroCategory: "Functional",
    priority: "medium",
    purpose: "Tag management",
    purposes: []
  }), "Non-essential");
  assert.equal(classifyInventoryEvidence({
    macroCategory: "Review",
    priority: "review_needed",
    purpose: "Unknown",
    purposes: []
  }), "Review");
});

test("classifies pre-consent audience measurement as high-risk tracker evidence", () => {
  assert.equal(
    deriveInventoryMacroCategory({ purpose: "Audience measurement", priority: "medium", vendor: "Publisher analytics" }),
    "Analytics"
  );
  assert.equal(getTrackerConsentReviewPriority({
    category: "analytics",
    confidence: 0.94,
    domains: ["cdn.publisher-analytics.example"],
    firstSeenMs: 2160,
    label: "Publisher Analytics",
    observedVia: ["script"],
    party: "third_party",
    preConsent: true,
    regulatoryRelevance: ["analytics", "audience_measurement"],
    requestCount: 1,
    source: "runtime requests",
    vendorDisplayCategory: "Analytics"
  }), "high");
});

test("scores composite tracker purposes by their highest recognized pre-consent risk", () => {
  const hubSpotPriority = getTrackerConsentReviewPriority({
    category: "analytics",
    confidence: 0.95,
    domains: ["js-eu1.hs-analytics.net", "js-eu1.hs-banner.com"],
    firstSeenMs: 1690,
    label: "HubSpot",
    observedVia: ["request"],
    party: "third_party",
    preConsent: true,
    regulatoryRelevance: [],
    requestCount: 1,
    source: "runtime requests",
    vendorDisplayCategory: "Analytics, Marketing automation, Cookie compliance"
  });
  const leadfeederPriority = getTrackerConsentReviewPriority({
    category: "analytics",
    confidence: 0.95,
    domains: ["sc.lfeeder.com"],
    firstSeenMs: 3190,
    label: "Leadfeeder",
    observedVia: ["request"],
    party: "third_party",
    preConsent: true,
    regulatoryRelevance: [],
    requestCount: 1,
    source: "runtime requests",
    vendorDisplayCategory: "Analytics, Audience measurement"
  });

  assert.equal(hubSpotPriority, "medium");
  assert.equal(leadfeederPriority, "high");
});

test("keeps unresolved composite tracker purposes at review priority", () => {
  assert.equal(getTrackerConsentReviewPriority({
    category: "unknown",
    confidence: 0.8,
    domains: ["unresolved.example"],
    firstSeenMs: 1000,
    label: "Unresolved vendor",
    observedVia: ["request"],
    party: "third_party",
    preConsent: true,
    regulatoryRelevance: [],
    requestCount: 1,
    source: "runtime requests",
    vendorDisplayCategory: "Unknown, Unclassified"
  }), "review_needed");
});

test("projects Adobe Launch host as tag management instead of unknown tracker", () => {
  const rows = buildTrackerInventoryRows({
    domains: ["assets.adobedtm.com"],
    firstPartyDomain: "nvidia.com",
    preConsentVendors: ["assets.adobedtm.com"],
    resolvedVendors: [],
    sessionReplayVendors: [],
    trackerVendors: [],
    topObservedEntities: [
      {
        category: "unknown",
        label: "assets.adobedtm.com",
        requestCount: 2,
      },
    ],
    unresolvedHosts: [],
  });

  const groupedRows = buildRuntimeInventoryGroupRows({ cookieRows: [], trackerRows: rows });
  const adobeRow = groupedRows.find((row) => row.type === "tracker" && row.vendor === "Adobe");

  assert.equal(adobeRow?.purpose, "Tag Management");
  assert.equal(adobeRow?.macroCategory, "Functional");
  assert.equal(adobeRow?.priority, "medium");
  assert.equal(adobeRow?.party, "third_party");
});

test("projects canonical hostless vendor labels with known purposes and categories", () => {
  const rows = buildTrackerInventoryRows({
    domains: [],
    firstPartyDomain: "example.com",
    preConsentVendors: ["Adobe Audience Manager / Experience Cloud", "Amazon Ads"],
    resolvedVendors: ["Adobe Audience Manager / Experience Cloud", "Akamai mPulse", "Amazon Ads"],
    sessionReplayVendors: [],
    trackerVendors: [],
    topObservedEntities: [],
    unresolvedHosts: [],
  });

  const groupedRows = buildRuntimeInventoryGroupRows({ cookieRows: [], trackerRows: rows });
  const adobe = groupedRows.find((row) => row.canonicalEntity === "Adobe Inc.");
  const akamai = groupedRows.find((row) => row.canonicalEntity === "Akamai Technologies, Inc.");
  const amazon = groupedRows.find((row) => row.canonicalEntity === "Amazon.com, Inc.");

  assert.deepEqual(
    [adobe, akamai, amazon].map((row) => [row?.purpose, row?.macroCategory, row?.priority, row?.confidence]),
    [
      ["Advertising", "Advertising", "high", "high"],
      ["Performance monitoring", "Analytics", "contextual", "high"],
      ["Advertising measurement", "Advertising", "high", "high"],
    ],
  );
  assert.equal(adobe?.attributionEvidence?.matchedOn, "vendor_label");
  assert.equal(akamai?.attributionEvidence?.matchedOn, "vendor_label");
  assert.equal(amazon?.attributionEvidence?.matchedOn, "vendor_label");
});

test("projects an untimed Taboola snapshot as advertising with review-only write timing", () => {
  const groupedRows = buildRuntimeInventoryGroupRows({
    cookieRows: [{
      category: "unknown",
      cookieName: "sp",
      domain: "taboola.com",
      evidenceGrade: "medium",
      firstObservedAtMs: null,
      initiatorDomain: null,
      initiatorUrl: null,
      initiatorVendor: null,
      nonEssential: true,
      party: "third_party",
      setAtMs: null,
      setMethod: "cookie_snapshot",
      timingEvidence: "initial_cookie_snapshot",
    }] as never,
    firstPartyDomain: "example.com",
    trackerRows: [],
  });
  const taboola = groupedRows.find((row) => row.type === "cookie" && row.vendor === "Taboola");

  assert.equal(taboola?.purpose, "Advertising");
  assert.equal(taboola?.observedRecordCount, 1);
  assert.equal(taboola?.macroCategory, "Advertising");
  assert.equal(taboola?.priority, "review_needed");
  assert.equal(taboola?.confidence, "high");
  assert.equal(taboola?.attributionEvidence?.matchedOn, "domain");
});

test("keeps first-party Akamai security tracker inventory contextual", () => {
  const rows = buildTrackerInventoryRows({
    domains: [],
    firstPartyDomain: "nvidia.com",
    preConsentVendors: ["Akamai Bot Manager / Edge"],
    resolvedVendors: [],
    sessionReplayVendors: [],
    trackerVendors: [
      {
        beforeConsent: true,
        confidence: 0.9,
        detectionSource: "vendor resolver",
        matchedCookieNames: ["bm_mi"],
        attributionSignatures: ["cookie_name_match"],
        observedVia: ["cookie"],
        scriptHost: "nvidia.com",
        vendorCategory: "security",
        vendorName: "Akamai Bot Manager / Edge",
      },
    ] as never,
    topObservedEntities: [],
    unresolvedHosts: [],
  });

  const groupedRows = buildRuntimeInventoryGroupRows({ cookieRows: [], trackerRows: rows });
  const akamaiRow = groupedRows.find((row) => row.canonicalEntity === "Akamai Technologies, Inc.");

  assert.equal(akamaiRow?.purpose, "Security");
  assert.equal(akamaiRow?.macroCategory, "Essential");
  assert.equal(akamaiRow?.priority, "contextual");
  assert.equal(akamaiRow?.party, "first_party");
});

test("filters cookie names and cookie-domain tokens out of tracker display domains", () => {
  const rows = buildTrackerInventoryRows({
    domains: ["region1.google-analytics.com", "_ga", ".seel.com", "__cf_bm"],
    firstPartyDomain: "seel.com",
    preConsentVendors: ["Google Analytics", "Cloudflare Bot Management"],
    resolvedVendors: [],
    sessionReplayVendors: [],
    trackerVendors: [
      {
        beforeConsent: true,
        confidence: 0.95,
        detectionSource: "vendor resolver",
        scriptHost: "region1.google-analytics.com",
        vendorCategory: "analytics",
        vendorName: "Google Analytics",
      },
      {
        beforeConsent: true,
        confidence: 0.93,
        detectionSource: "vendor resolver",
        matchedCookieNames: ["__cf_bm"],
        attributionSignatures: ["cookie_name_match"],
        scriptHost: "__cf_bm",
        vendorCategory: "security",
        vendorName: "Cloudflare Bot Management",
      },
      {
        beforeConsent: true,
        confidence: 0.93,
        detectionSource: "vendor resolver",
        scriptHost: ".seel.com",
        vendorCategory: "analytics",
        vendorName: "Google Analytics",
      },
      {
        beforeConsent: true,
        confidence: 0.93,
        detectionSource: "vendor resolver",
        scriptHost: "qc005",
        vendorCategory: "cmp",
        vendorName: "Quantcast Choice CMP",
      },
      {
        beforeConsent: true,
        confidence: 0.93,
        detectionSource: "vendor resolver",
        scriptHost: "permutive-consent",
        vendorCategory: "advertising",
        vendorName: "Permutive",
      },
      {
        beforeConsent: true,
        confidence: 0.93,
        detectionSource: "vendor resolver",
        scriptHost: "didomi",
        vendorCategory: "cmp",
        vendorName: "Didomi CMP",
      },
      {
        beforeConsent: true,
        confidence: 0.93,
        detectionSource: "vendor resolver",
        scriptHost: "iubenda",
        vendorCategory: "cmp",
        vendorName: "Iubenda CMP",
      },
    ] as never,
    topObservedEntities: [],
    unresolvedHosts: ["_ga_jkt0kkxlxe", "qc005", "didomi", "iubenda", "permutive-consent", ".osano-cm-window__dialog"],
  });

  const groupedRows = buildRuntimeInventoryGroupRows({ cookieRows: [], trackerRows: rows });
  const googleAnalytics = groupedRows.find((row) => row.canonicalEntity === "Google LLC");
  const cloudflare = groupedRows.find((row) => row.canonicalEntity === "Cloudflare, Inc.");
  const quantcastChoice = groupedRows.find((row) => row.type === "tracker" && row.vendor === "Quantcast Choice CMP");
  const permutive = groupedRows.find((row) => row.type === "tracker" && row.vendor === "Permutive");
  const didomi = groupedRows.find((row) => row.type === "tracker" && row.vendor === "Didomi CMP");
  const iubenda = groupedRows.find((row) => row.type === "tracker" && row.vendor === "Iubenda CMP");

  assert.deepEqual(googleAnalytics?.domains, ["region1.google-analytics.com"]);
  assert.deepEqual(cloudflare?.domains, []);
  assert.equal(quantcastChoice, undefined);
  assert.equal(permutive, undefined);
  assert.equal(didomi, undefined);
  assert.equal(iubenda, undefined);
  assert.equal(groupedRows.some((row) => row.type === "tracker" && row.vendor === "_ga_jkt0kkxlxe"), false);
  assert.equal(isInventoryDisplayHostname("_ga"), false);
  assert.equal(isInventoryDisplayHostname(".seel.com"), false);
  assert.equal(isInventoryDisplayHostname("__cf_bm"), false);
  assert.equal(isInventoryDisplayHostname("qc005"), false);
  assert.equal(isInventoryDisplayHostname("didomi"), false);
  assert.equal(isInventoryDisplayHostname("iubenda"), false);
  assert.equal(isInventoryDisplayHostname("permutive-consent"), false);
  assert.equal(isInventoryDisplayHostname(".osano-cm-window__dialog"), false);
  assert.equal(isInventoryDisplayHostname("region1.google-analytics.com"), true);
});

test("deduplicates tracker inventory rows by vendor host and purpose", () => {
  const rows = buildTrackerInventoryRows({
    domains: ["snap.licdn.com"],
    firstPartyDomain: "example.com",
    preConsentVendors: ["LinkedIn Insight Tag"],
    resolvedVendors: [],
    sessionReplayVendors: [],
    trackerVendors: [
      {
        beforeConsent: true,
        confidence: 0.95,
        detectionSource: "vendor resolver",
        scriptHost: "snap.licdn.com",
        vendorCategory: "advertising",
        vendorName: "LinkedIn Insight Tag",
      },
      {
        beforeConsent: true,
        confidence: 0.85,
        detectionSource: "vendor resolver",
        scriptHost: "snap.licdn.com",
        vendorCategory: "advertising",
        vendorName: "LinkedIn Insight Tag",
      },
    ] as never,
    topObservedEntities: [],
    unresolvedHosts: [],
  });

  const groupedRows = buildRuntimeInventoryGroupRows({ cookieRows: [], trackerRows: rows })
    .filter((row) => row.type === "tracker" && row.vendor === "LinkedIn");

  assert.equal(groupedRows.length, 1);
  assert.deepEqual(groupedRows[0]?.domains, ["snap.licdn.com"]);
  assert.equal(groupedRows[0]?.purpose, "Advertising");
  assert.equal(groupedRows[0]?.macroCategory, "Advertising");
});

test("deduplicates product aliases while retaining their raw domains and cookies", () => {
  const groupedRows = buildTrackerInventoryGroupRows([
    {
      attributionEvidence: {
        signatureId: "twitter_pixel_request",
        matchedOn: "request_pattern",
        matchedValue: "t.co/i/adsct"
      },
      category: "advertising",
      confidence: 0.95,
      cookieNames: ["personalization_id"],
      domains: ["t.co"],
      firstSeenMs: 210,
      label: "Twitter Pixel",
      observedVia: ["request"],
      party: "third_party",
      preConsent: true,
      requestCount: 1,
      source: "vendor resolver"
    },
    {
      attributionEvidence: {
        signatureId: "x_analytics_request",
        matchedOn: "domain",
        matchedValue: "analytics.twitter.com"
      },
      category: "advertising",
      confidence: 0.9,
      cookieNames: ["guest_id_ads"],
      domains: ["analytics.twitter.com"],
      firstSeenMs: 220,
      label: "X/Twitter",
      observedVia: ["script"],
      party: "third_party",
      preConsent: true,
      requestCount: 2,
      source: "runtime requests"
    }
  ]);

  assert.equal(groupedRows.length, 1);
  assert.equal(groupedRows[0]?.vendor, "X/Twitter");
  assert.deepEqual(groupedRows[0]?.rawProducts, ["Twitter Pixel", "X/Twitter"]);
  assert.deepEqual(groupedRows[0]?.attributionSignatures, ["twitter_pixel_request", "x_analytics_request"]);
  assert.deepEqual(groupedRows[0]?.domains, ["t.co", "analytics.twitter.com"]);
  assert.deepEqual(groupedRows[0]?.cookieNames, ["personalization_id", "guest_id_ads"]);
});

test("consolidates common runtime aliases and suppresses unsupported CMP identities", () => {
  const rows = suppressUnsupportedCmpAliasRows([
    {
      category: "consent_management", confidence: 0.96, domains: ["cmp.inmobi.com"], firstSeenMs: 1039,
      label: "InMobi Choice CMP", observedVia: ["request"], party: "third_party", preConsent: true,
      requestCount: 4, source: "runtime", cookieNames: []
    },
    {
      category: "consent_management", confidence: 0.93, domains: [], firstSeenMs: null,
      label: "Quantcast Choice CMP", observedVia: ["resolver"], party: "unknown", preConsent: true,
      requestCount: null, source: "vendor resolver", cookieNames: []
    },
    {
      category: "session_replay", confidence: 0.95, domains: ["www.clarity.ms"], firstSeenMs: 1044,
      label: "Microsoft", observedVia: ["request"], party: "third_party", preConsent: true,
      requestCount: 1, source: "runtime", cookieNames: []
    },
    {
      category: "session_replay", confidence: 0.95, domains: ["i.clarity.ms"], firstSeenMs: 1050,
      label: "Microsoft Clarity", observedVia: ["request"], party: "third_party", preConsent: true,
      requestCount: 4, source: "runtime", cookieNames: []
    },
    {
      category: "infrastructure", confidence: 0.9, domains: ["cdn.jsdelivr.net"], firstSeenMs: 1018,
      label: "jsDelivr", observedVia: ["script"], party: "third_party", preConsent: true,
      requestCount: 1, source: "runtime", cookieNames: []
    },
    {
      category: "infrastructure", confidence: 0.92, domains: ["cdn.jsdelivr.net"], firstSeenMs: 1018,
      label: "jsDelivr CDN", observedVia: ["request"], party: "third_party", preConsent: true,
      requestCount: 1, source: "resolver", cookieNames: []
    },
    {
      category: "advertising", confidence: 0.95, domains: ["securepubads.g.doubleclick.net"], firstSeenMs: 1018,
      label: "Google Publisher Tag", observedVia: ["script"], party: "third_party", preConsent: true,
      requestCount: 1, source: "runtime", cookieNames: []
    },
    {
      category: "advertising", confidence: 0.96, domains: ["securepubads.g.doubleclick.net"], firstSeenMs: 2013,
      label: "Google Ads / DoubleClick", observedVia: ["request", "cookie"], party: "third_party", preConsent: true,
      requestCount: 2, source: "resolver", cookieNames: ["test_cookie"]
    }
  ]);
  assert.equal(rows.some((row) => row.label === "Quantcast Choice CMP"), false);
  const grouped = buildTrackerInventoryGroupRows(rows);
  assert.equal(grouped.filter((row) => row.vendor === "Microsoft Clarity").length, 1);
  assert.equal(grouped.filter((row) => row.vendor === "jsDelivr CDN").length, 1);
  const googleAds = grouped.filter((row) => row.vendor === "Google Ads / DoubleClick");
  assert.equal(googleAds.length, 1);
  assert.deepEqual(googleAds[0]?.rawProducts, ["Google Publisher Tag", "Google Ads / DoubleClick"]);
  assert.deepEqual(googleAds[0]?.cookieNames, ["test_cookie"]);
});

test("separates cookie names from domains and preserves canonical ownership", () => {
  const groupedRows = buildRuntimeInventoryGroupRows({
    cookieRows: [
      {
        category: "unknown", cookieName: "_sp_su", domain: ".bild.de", evidenceGrade: "medium",
        firstObservedAtMs: 80, initiatorDomain: "cdn.privacy-mgmt.com", initiatorUrl: "https://cdn.privacy-mgmt.com/wrapper.js?google_gid=123",
        initiatorVendor: "Google", nonEssential: false, party: "first_party", setAtMs: 80, setMethod: "document_cookie", timingEvidence: "initial_cookie_snapshot"
      },
      {
        category: "unknown", cookieName: "optanonconsent", domain: ".bild.de", evidenceGrade: "medium",
        firstObservedAtMs: 90, initiatorDomain: "cdn.cookielaw.org", initiatorVendor: "OneTrust",
        nonEssential: false, party: "first_party", setAtMs: 90, setMethod: "document_cookie", timingEvidence: "initial_cookie_snapshot"
      }
    ] as never,
    firstPartyDomain: "bild.de",
    trackerRows: []
  });

  const sourcepointRow = groupedRows.find((row) => row.type === "cookie" && row.vendor === "Sourcepoint");
  const oneTrustRow = groupedRows.find((row) => row.type === "cookie" && row.vendor === "OneTrust");
  assert.deepEqual(sourcepointRow?.cookieNames, ["_sp_su"]);
  assert.equal(sourcepointRow?.observedRecordCount, 1);
  assert.deepEqual(sourcepointRow?.domains, ["bild.de"]);
  assert.equal(sourcepointRow?.macroCategory, "Essential");
  assert.deepEqual(sourcepointRow?.syncedIdentifiers, ["Google"]);
  assert.deepEqual(oneTrustRow?.cookieNames, ["optanonconsent"]);
  assert.equal(oneTrustRow?.observedRecordCount, 1);
  assert.deepEqual(oneTrustRow?.domains, ["bild.de"]);
  assert.equal(oneTrustRow?.macroCategory, "Essential");
  assert.ok(groupedRows.every((row) => row.domains.every((domain) => !row.cookieNames.includes(domain))));
});

test("does not project canonically owned OpenAI hosts beside a contaminated ZoomInfo row", () => {
  const rows = buildTrackerInventoryRows({
    domains: ["bzrcdn.openai.com", "js.zi-scripts.com", "ws.zoominfo.com"],
    firstPartyDomain: "example.test",
    preConsentVendors: ["ZoomInfo WebSights"],
    resolvedVendors: ["ZoomInfo WebSights", "OpenAI advertising measurement"],
    sessionReplayVendors: [],
    trackerVendors: [{
      beforeConsent: true,
      confidence: 0.95,
      detectionSource: "resolver",
      matchedHostnames: ["bzrcdn.openai.com", "js.zi-scripts.com", "ws.zoominfo.com"],
      scriptHost: "bzrcdn.openai.com",
      vendorCategory: "analytics",
      vendorName: "ZoomInfo WebSights"
    } as never],
    topObservedEntities: [],
    unresolvedHosts: []
  });
  const zoomInfo = rows.find((row) => row.label === "ZoomInfo");
  assert.ok(zoomInfo);
  assert.deepEqual(zoomInfo.domains.sort(), ["js.zi-scripts.com", "ws.zoominfo.com"]);
});

test("suppresses label-only ad-tech aliases attached to concrete Yandex evidence", () => {
  const rows = buildTrackerInventoryRows({
    domains: ["yandex.ru", "mc.yandex.ru"],
    firstPartyDomain: "life.ru",
    preConsentVendors: ["Yandex Metrica", "Bombora Visitor Insights", "OpenX", "Quantcast Measure"],
    resolvedVendors: [],
    sessionReplayVendors: [],
    trackerVendors: [
      {
        beforeConsent: true,
        detectionSource: "local_v2_dag_runtime",
        matchedUrls: ["https://mc.yandex.ru/watch/34662240"],
        attributionSignatures: ["yandex_metrica_webvisor_runtime"],
        scriptHost: "mc.yandex.ru",
        vendorCategory: "analytics",
        vendorName: "Yandex Metrica",
      },
      ...["Bombora Visitor Insights", "OpenX", "Quantcast Measure"].map((vendorName) => ({
        beforeConsent: true,
        detectionSource: "local_v2_dag_runtime",
        matchedHostnames: ["yandex.ru"],
        attributionSignatures: ["canonical_product_label"],
        scriptHost: "yandex.ru",
        vendorCategory: "advertising",
        vendorName,
      })),
    ] as never,
    topObservedEntities: [],
    unresolvedHosts: [],
  });

  assert.ok(rows.some((row) => row.label === "Yandex Metrica"));
  assert.equal(rows.some((row) => /Bombora|OpenX|Quantcast/.test(row.label)), false);
});

test("preserves publisher-owned cross-site infrastructure as cross-site same-entity context", () => {
  const rows = buildTrackerInventoryRows({
    domains: ["a.bildstatic.de"], firstPartyDomain: "bild.de", preConsentVendors: [], resolvedVendors: [], sessionReplayVendors: [],
    trackerVendors: [], topObservedEntities: [{ category: "unknown", label: "a.bildstatic.de", requestCount: 12 }], unresolvedHosts: ["a.bildstatic.de"]
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.siteRelationship, "cross_site");
  assert.equal(rows[0]?.entityRelationship, "same_entity");
});

test("attributes Amazon-owned advertising and media hosts to the amazon.de entity", () => {
  const rows = buildTrackerInventoryRows({
    domains: ["aax-eu.amazon-adsystem.com", "m.media-amazon.com"],
    firstPartyDomain: "amazon.de",
    preConsentVendors: ["Amazon Ads"],
    resolvedVendors: ["Amazon Ads", "Amazon Media CDN"],
    sessionReplayVendors: [],
    trackerVendors: [{
      beforeConsent: true,
      confidence: 0.94,
      detectionSource: "canonical_vendor_resolver",
      matchedHostnames: ["aax-eu.amazon-adsystem.com"],
      scriptHost: "aax-eu.amazon-adsystem.com",
      vendorCategory: "advertising",
      vendorName: "Amazon Ads"
    } as never],
    topObservedEntities: [{
      category: "infrastructure",
      label: "m.media-amazon.com",
      requestCount: 4
    }],
    unresolvedHosts: []
  });

  const amazonAds = rows.find((row) => row.domains.includes("aax-eu.amazon-adsystem.com"));
  assert.equal(amazonAds?.label, "Amazon");
  assert.equal(amazonAds?.party, "third_party");
  assert.equal(amazonAds?.siteRelationship, "cross_site");
  assert.equal(amazonAds?.entityRelationship, "same_entity");
  assert.equal(rows.some((row) => row.domains.includes("m.media-amazon.com")), true);
});

test("canonical report vendor projection consolidates Amazon products and owned hosts to one vendor", () => {
  const projection = buildReportSurfaceVendorProjection({
    rawThirdPartyDomains: ["aax-eu.amazon-adsystem.com"],
    resolvedVendorNames: ["Amazon Ads", "Amazon Media CDN"],
    topObservedEntities: [
      { category: "advertising", label: "Amazon Ads", requestCount: 1 },
      { category: "infrastructure", label: "m.media-amazon.com", requestCount: 4 }
    ],
    unresolvedVendorHosts: ["aax-eu.amazon-adsystem.com"],
    vendorCategoryCounts: { advertising: 1, infrastructure: 1 }
  });

  assert.deepEqual(projection.execSummary.resolvedVendorNames, ["Amazon"]);
  assert.deepEqual(projection.execSummary.topObservedEntities, [{
    category: "advertising",
    label: "Amazon",
    requestCount: 5
  }]);
  assert.deepEqual(projection.execSummary.unresolvedVendorHosts, []);
  assert.deepEqual(projection.evidenceInventory.resolvedVendorNames, ["Amazon Ads", "Amazon Media CDN"]);
});

test("preserves literal Daily raw hosts and applies multi-label PSL party classification", () => {
  const rows = buildTrackerInventoryRows({
    domains: [],
    firstPartyDomain: "www.daily.co.jp",
    preConsentVendors: [],
    resolvedVendors: [],
    sessionReplayVendors: [],
    trackerVendors: [],
    topObservedEntities: [
      { category: "unknown", label: "i.daily.jp", requestCount: 34 },
      { category: "analytics", label: "region1.analytics.google.com", requestCount: 2 }
    ],
    unresolvedHosts: []
  });
  const byLabel = new Map(rows.map((row) => [row.label, row]));

  assert.deepEqual(byLabel.get("i.daily.jp")?.domains, ["i.daily.jp"]);
  assert.equal(byLabel.get("i.daily.jp")?.party, "third_party");
  assert.deepEqual(byLabel.get("region1.analytics.google.com")?.domains, ["region1.analytics.google.com"]);
  assert.equal(byLabel.get("region1.analytics.google.com")?.party, "third_party");
});

test("deduplicates Daily vendor aliases while retaining product labels", () => {
  const grouped = buildTrackerInventoryGroupRows([
    ...["Teads", "Teads Video Advertising"].map((label) => ({
      category: "advertising", confidence: 0.98, cookieNames: [], domains: ["a.teads.tv"], firstSeenMs: 3_465,
      label, observedVia: ["request"], party: "third_party" as const, preConsent: true,
      requestCount: 1, source: "runtime", syncedIdentifiers: []
    })),
    ...["Microsoft", "Microsoft Clarity"].map((label) => ({
      category: "session_replay", confidence: 0.98, cookieNames: [], domains: ["i.clarity.ms"], firstSeenMs: 5_013,
      label, observedVia: ["request"], party: "third_party" as const, preConsent: true,
      requestCount: 1, source: "runtime", syncedIdentifiers: []
    })),
    ...["ID5", "ID5 Identity"].map((label) => ({
      category: "advertising", confidence: 0.98, cookieNames: ["id5"], domains: ["id5-sync.com"], firstSeenMs: 11_859,
      label, observedVia: ["request", "cookie"], party: "third_party" as const, preConsent: true,
      requestCount: 1, source: "runtime", syncedIdentifiers: []
    }))
  ]);

  assert.equal(grouped.length, 3);
  assert.deepEqual(grouped.find((row) => row.vendor === "Teads Video Advertising")?.rawProducts.sort(), ["Teads", "Teads Video Advertising"]);
  assert.deepEqual(grouped.find((row) => row.vendor === "Microsoft Clarity")?.rawProducts.sort(), ["Microsoft", "Microsoft Clarity"]);
  assert.deepEqual(grouped.find((row) => row.vendor === "ID5 Identity")?.rawProducts.sort(), ["ID5", "ID5 Identity"]);
});
