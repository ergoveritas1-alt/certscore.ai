import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRuntimeInventoryGroupRows,
  buildTrackerInventoryRows,
  deriveInventoryMacroCategory,
  isInventoryDisplayHostname,
} from "./runtime-inventory-projection";

test("derives Fable macro categories without replacing detailed purposes", () => {
  assert.equal(deriveInventoryMacroCategory({ purpose: "Advertising", priority: "high", vendor: "Meta Pixel" }), "Advertising");
  assert.equal(deriveInventoryMacroCategory({ purpose: "Session replay", priority: "medium", vendor: "Microsoft Clarity" }), "Analytics");
  assert.equal(deriveInventoryMacroCategory({ purpose: "Security", priority: "contextual", vendor: "Cloudflare" }), "Essential");
  assert.equal(deriveInventoryMacroCategory({ purpose: "Tag management", priority: "medium", vendor: "Google Tag Manager" }), "Functional");
  assert.equal(deriveInventoryMacroCategory({ purpose: "CDN", priority: "contextual", vendor: "jQuery CDN" }), "Essential");
  assert.equal(deriveInventoryMacroCategory({ purpose: "CDN", priority: "contextual", vendor: "Instagram CDN" }), "Functional");
  assert.equal(deriveInventoryMacroCategory({ purpose: "Unknown", priority: "review_needed", vendor: "unresolved.example" }), "Unknown");
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
  assert.equal(adobeRow?.party, "3rd");
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
  const adobe = groupedRows.find((row) => row.type === "tracker" && row.vendor === "Adobe Audience Manager / Experience Cloud");
  const akamai = groupedRows.find((row) => row.type === "tracker" && row.vendor === "Akamai mPulse");
  const amazon = groupedRows.find((row) => row.type === "tracker" && row.vendor === "Amazon Ads");

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

test("projects a Taboola apex-domain cookie as advertising instead of unknown", () => {
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
  assert.equal(taboola?.macroCategory, "Advertising");
  assert.equal(taboola?.priority, "high");
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
  const akamaiRow = groupedRows.find((row) => row.type === "tracker" && row.vendor === "Akamai Bot Manager / Edge");

  assert.equal(akamaiRow?.purpose, "Security");
  assert.equal(akamaiRow?.macroCategory, "Essential");
  assert.equal(akamaiRow?.priority, "contextual");
  assert.equal(akamaiRow?.party, "—");
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
  const googleAnalytics = groupedRows.find((row) => row.type === "tracker" && row.vendor === "Google Analytics");
  const cloudflare = groupedRows.find((row) => row.type === "tracker" && row.vendor === "Cloudflare Bot Management");
  const quantcastChoice = groupedRows.find((row) => row.type === "tracker" && row.vendor === "Quantcast Choice CMP");
  const permutive = groupedRows.find((row) => row.type === "tracker" && row.vendor === "Permutive");
  const didomi = groupedRows.find((row) => row.type === "tracker" && row.vendor === "Didomi CMP");
  const iubenda = groupedRows.find((row) => row.type === "tracker" && row.vendor === "Iubenda CMP");

  assert.deepEqual(googleAnalytics?.domains, ["region1.google-analytics.com"]);
  assert.deepEqual(cloudflare?.domains, []);
  assert.deepEqual(quantcastChoice?.domains, []);
  assert.deepEqual(permutive?.domains, []);
  assert.deepEqual(didomi?.domains, []);
  assert.deepEqual(iubenda?.domains, []);
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
  assert.deepEqual(sourcepointRow?.domains, ["bild.de"]);
  assert.equal(sourcepointRow?.macroCategory, "Essential");
  assert.deepEqual(sourcepointRow?.syncedIdentifiers, ["Google"]);
  assert.deepEqual(oneTrustRow?.cookieNames, ["optanonconsent"]);
  assert.deepEqual(oneTrustRow?.domains, ["bild.de"]);
  assert.equal(oneTrustRow?.macroCategory, "Essential");
  assert.ok(groupedRows.every((row) => row.domains.every((domain) => !row.cookieNames.includes(domain))));
});

test("treats publisher-owned related domains as first-party infrastructure", () => {
  const rows = buildTrackerInventoryRows({
    domains: ["a.bildstatic.de"], firstPartyDomain: "bild.de", preConsentVendors: [], resolvedVendors: [], sessionReplayVendors: [],
    trackerVendors: [], topObservedEntities: [{ category: "unknown", label: "a.bildstatic.de", requestCount: 12 }], unresolvedHosts: ["a.bildstatic.de"]
  });
  assert.deepEqual(rows, []);
});
