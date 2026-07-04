import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRuntimeInventoryGroupRows,
  buildTrackerInventoryRows,
} from "./runtime-inventory-projection";

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
  assert.equal(adobeRow?.priority, "medium");
  assert.equal(adobeRow?.party, "3rd");
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
  assert.equal(akamaiRow?.priority, "contextual");
  assert.equal(akamaiRow?.party, "—");
});

test("keeps Google ID-sync evidence from overwriting CEE domain-owner attribution", () => {
  const rows = buildTrackerInventoryRows({
    domains: ["hit.gemius.pl", "squid.gazeta.pl", "pubads.g.doubleclick.net"],
    firstPartyDomain: "wyborcza.pl",
    preConsentVendors: ["Google"],
    resolvedVendors: [],
    sessionReplayVendors: [],
    trackerVendors: [
      {
        beforeConsent: true,
        confidence: 0.97,
        detectionSource: "id_sync",
        observedVia: ["request"],
        scriptHost: "hit.gemius.pl",
        vendorCategory: "advertising",
        vendorName: "Google",
      },
      {
        beforeConsent: true,
        confidence: 0.96,
        detectionSource: "id_sync",
        observedVia: ["request"],
        scriptHost: "squid.gazeta.pl",
        vendorCategory: "advertising",
        vendorName: "Google",
      },
      {
        beforeConsent: true,
        confidence: 0.96,
        detectionSource: "request",
        observedVia: ["request"],
        scriptHost: "pubads.g.doubleclick.net",
        vendorCategory: "advertising",
        vendorName: "Google Ads",
      },
    ] as never,
    topObservedEntities: [],
    unresolvedHosts: [],
  });

  const groupedRows = buildRuntimeInventoryGroupRows({ cookieRows: [], trackerRows: rows });
  const gemiusRow = groupedRows.find((row) => row.type === "tracker" && row.vendor === "Gemius");
  const agoraRow = groupedRows.find((row) => row.type === "tracker" && row.vendor === "Agora");
  const googleAdsRow = groupedRows.find((row) => row.type === "tracker" && row.vendor === "Google Ads");

  assert.equal(gemiusRow?.purpose, "Audience measurement");
  assert.equal(gemiusRow?.confidence, "high");
  assert.deepEqual(gemiusRow?.syncedIdentifiers, ["Google"]);
  assert.equal(agoraRow?.party, "—");
  assert.equal(agoraRow?.syncedIdentifiers?.[0], "Google");
  assert.equal(googleAdsRow?.purpose, "Advertising");
  assert.equal(googleAdsRow?.confidence, "high");
});

test("treats publisher-owned support domains as first-party entity infrastructure", () => {
  const bildRows = buildTrackerInventoryRows({
    domains: ["a.bildstatic.de"],
    firstPartyDomain: "bild.de",
    preConsentVendors: [],
    resolvedVendors: [],
    sessionReplayVendors: [],
    trackerVendors: [],
    topObservedEntities: [{ category: "unknown", label: "a.bildstatic.de", requestCount: 12 }],
    unresolvedHosts: ["a.bildstatic.de"],
  });
  const wyborczaRows = buildTrackerInventoryRows({
    domains: ["static.im-g.pl", "bi.im-g.pl", "bis.gazeta.pl", "biv.gazeta.pl"],
    firstPartyDomain: "wyborcza.pl",
    preConsentVendors: [],
    resolvedVendors: [],
    sessionReplayVendors: [],
    trackerVendors: [],
    topObservedEntities: [
      { category: "unknown", label: "static.im-g.pl", requestCount: 4 },
      { category: "unknown", label: "bis.gazeta.pl", requestCount: 3 },
    ],
    unresolvedHosts: ["bi.im-g.pl", "biv.gazeta.pl"],
  });

  assert.deepEqual(bildRows, []);
  assert.deepEqual(wyborczaRows, []);
});

test("separates cookie names from domains in grouped runtime inventory", () => {
  const groupedRows = buildRuntimeInventoryGroupRows({
    cookieRows: [
      {
        category: "unknown",
        cookieName: "_sp_su",
        domain: ".bild.de",
        evidenceGrade: "medium",
        firstObservedAtMs: 80,
        initiatorDomain: "cdn.privacy-mgmt.com",
        initiatorUrl: "https://cdn.privacy-mgmt.com/wrapper.js?google_gid=123",
        initiatorVendor: "Google",
        nonEssential: false,
        party: "first_party",
        setAtMs: 80,
        setMethod: "document_cookie",
        timingEvidence: "initial_cookie_snapshot",
      },
      {
        category: "unknown",
        cookieName: "optanonconsent",
        domain: ".bild.de",
        evidenceGrade: "medium",
        firstObservedAtMs: 90,
        initiatorDomain: "cdn.cookielaw.org",
        initiatorVendor: "OneTrust",
        nonEssential: false,
        party: "first_party",
        setAtMs: 90,
        setMethod: "document_cookie",
        timingEvidence: "initial_cookie_snapshot",
      },
    ] as never,
    trackerRows: [],
  });

  const sourcepointRow = groupedRows.find((row) => row.type === "cookie" && row.vendor === "Sourcepoint");
  const oneTrustRow = groupedRows.find((row) => row.type === "cookie" && row.vendor === "OneTrust");

  assert.deepEqual(sourcepointRow?.cookieNames, ["_sp_su"]);
  assert.deepEqual(sourcepointRow?.domains, ["bild.de"]);
  assert.deepEqual(sourcepointRow?.syncedIdentifiers, ["Google"]);
  assert.deepEqual(oneTrustRow?.cookieNames, ["optanonconsent"]);
  assert.deepEqual(oneTrustRow?.domains, ["bild.de"]);
  assert.ok(groupedRows.every((row) => row.domains.every((domain) => !row.cookieNames.includes(domain))));
});

test("normalizes publisher-owned cookie domains to first-party entity context", () => {
  const groupedRows = buildRuntimeInventoryGroupRows({
    cookieRows: [
      {
        category: "unknown",
        cookieName: "bwGuidv3",
        domain: "squid.gazeta.pl",
        evidenceGrade: "medium",
        firstObservedAtMs: 100,
        initiatorDomain: "squid.gazeta.pl",
        initiatorUrl: "https://squid.gazeta.pl/pixel?google_gid=123",
        initiatorVendor: "Google",
        nonEssential: true,
        party: "third_party",
        setAtMs: 100,
        setMethod: "response_header",
        timingEvidence: "initial_cookie_snapshot",
      },
    ] as never,
    firstPartyDomain: "wyborcza.pl",
    trackerRows: [],
  });

  const agoraRow = groupedRows.find((row) => row.type === "cookie" && row.vendor === "Agora");

  assert.equal(agoraRow?.party, "first_party");
  assert.equal(agoraRow?.priority, "contextual");
  assert.deepEqual(agoraRow?.domains, ["squid.gazeta.pl"]);
  assert.deepEqual(agoraRow?.syncedIdentifiers, ["Google"]);
});

test("does not inherit Google vendor from initiator context onto unrelated cookie domains", () => {
  const groupedRows = buildRuntimeInventoryGroupRows({
    cookieRows: [
      {
        category: "unknown",
        cookieName: "SERVERID",
        domain: "salesmanago.pl",
        evidenceGrade: "medium",
        firstObservedAtMs: 100,
        initiatorDomain: "googleads.g.doubleclick.net",
        initiatorUrl: "https://googleads.g.doubleclick.net/pagead/id",
        initiatorVendor: "Google",
        nonEssential: true,
        party: "third_party",
        setAtMs: 100,
        setMethod: "response_header",
        timingEvidence: "initial_cookie_snapshot",
      },
      {
        category: "unknown",
        cookieName: "__rppl_uid",
        domain: "rp.pl",
        evidenceGrade: "medium",
        firstObservedAtMs: 120,
        initiatorDomain: "googleads.g.doubleclick.net",
        initiatorUrl: "https://googleads.g.doubleclick.net/pagead/id",
        initiatorVendor: "Google",
        nonEssential: true,
        party: "first_party",
        setAtMs: 120,
        setMethod: "document_cookie",
        timingEvidence: "initial_cookie_snapshot",
      },
    ] as never,
    firstPartyDomain: "rp.pl",
    trackerRows: [],
  });

  const salesmanagoRow = groupedRows.find((row) => row.type === "cookie" && row.domains.includes("salesmanago.pl"));
  const gremiRow = groupedRows.find((row) => row.type === "cookie" && row.cookieNames.includes("__rppl_uid"));

  assert.equal(salesmanagoRow?.vendor, "Salesmanago");
  assert.equal(salesmanagoRow?.syncedIdentifiers?.[0], "Google");
  assert.equal(gremiRow?.vendor, "Gremi Media");
  assert.equal(gremiRow?.party, "first_party");
  assert.equal(gremiRow?.syncedIdentifiers?.[0], "Google");
});
