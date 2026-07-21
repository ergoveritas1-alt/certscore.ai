import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCookieDisclosureGapEvidence,
  buildRuntimeCookieInventory,
  classifyRuntimeCookieCategory,
  getRuntimeCookiePrimaryProvider,
  isEligibleNonEssentialPreconsentStorageRow,
  isFunctionalCookieExcludedFromTrackingEvidence
} from "./runtime-cookie-evidence";
import {
  buildRuntimeCookiePriorityGroups,
  getRuntimeCookieReviewPriority
} from "./runtime-cookie-priority";

test("classifies expanded non-essential cookie families", () => {
  assert.equal(classifyRuntimeCookieCategory("_vwo_uuid_v2", ".example.com"), "advertising");
  assert.equal(classifyRuntimeCookieCategory("analytics_session_id", ".example.com"), "analytics");
  assert.equal(classifyRuntimeCookieCategory("_hjSession_123", ".example.com"), "session_replay");
  assert.equal(classifyRuntimeCookieCategory("__cf_bm", ".example.com"), "necessary");
  assert.equal(classifyRuntimeCookieCategory("_cfuvid", ".hsforms.com"), "necessary");
  assert.equal(classifyRuntimeCookieCategory("c_code", "nvidia.com"), "geolocation");
  assert.equal(classifyRuntimeCookieCategory("bm_sv", ".nvidia.com"), "necessary");
  assert.equal(classifyRuntimeCookieCategory("bm_mi", "nvidia.com"), "necessary");
  assert.equal(classifyRuntimeCookieCategory("geo_country", ".troweprice.com"), "necessary");
  assert.equal(classifyRuntimeCookieCategory("trp-country", ".troweprice.com"), "necessary");
  assert.equal(classifyRuntimeCookieCategory("trp-language", ".troweprice.com"), "necessary");
  assert.equal(classifyRuntimeCookieCategory("cto_bundle", ".criteo.com"), "advertising");
  assert.equal(classifyRuntimeCookieCategory("cto_bundle"), "advertising");
  assert.equal(classifyRuntimeCookieCategory("demdex", ".demdex.net"), "dmp");
  assert.equal(classifyRuntimeCookieCategory("dpm"), "dmp");
  assert.equal(classifyRuntimeCookieCategory("aam", ".webmd.com"), "dmp");
  assert.equal(classifyRuntimeCookieCategory("IDE"), "advertising");
  assert.equal(classifyRuntimeCookieCategory("_twpid", ".nvidia.com"), "advertising");
  assert.equal(classifyRuntimeCookieCategory("rlas3"), "advertising");
  assert.equal(classifyRuntimeCookieCategory("cookielawinfo-checkbox-analytics"), "consent_management");
  assert.equal(classifyRuntimeCookieCategory("s_ecid"), "analytics");
  assert.equal(classifyRuntimeCookieCategory("QSI_HistorySession"), "session_replay");
  assert.equal(classifyRuntimeCookieCategory("KRTBCOOKIE_452", ".pubmatic.com"), "advertising");
  assert.equal(classifyRuntimeCookieCategory("tuuid", ".bidswitch.net"), "advertising");
  assert.equal(classifyRuntimeCookieCategory("QSI_ReplaySession_Info_ZN_abc", ".qualtrics.com"), "session_replay");
  assert.equal(classifyRuntimeCookieCategory("FCCDCF", ".daily.co.jp"), "necessary");
  assert.equal(classifyRuntimeCookieCategory("_gcl_au", ".daily.co.jp"), "advertising");
  assert.equal(classifyRuntimeCookieCategory("AMP_abc123", ".medal.tv"), "analytics");
  assert.equal(classifyRuntimeCookieCategory("AMP_MKTG_abc123", ".medal.tv"), "advertising");
  assert.equal(classifyRuntimeCookieCategory("ld_anonymous_user_key", ".medal.tv"), "personalization");
});

test("Medal snapshot cookies keep presence-only timing and canonical providers", () => {
  const inventory = buildRuntimeCookieInventory({
    hybridRuntimeEvidence: {
      cookieWriteObservations: ["AMP_abc123", "AMP_MKTG_abc123", "ld_anonymous_user_key"].map((cookieName) => ({
        beforeConsent: true,
        category: "Security",
        cookieName,
        domain: "medal.tv",
        nonEssential: false,
        setAtMs: null,
        setMethod: "browser_snapshot"
      }))
    }
  });
  const rows = new Map(inventory.rows.map((row) => [row.cookieName, row]));

  assert.equal(getRuntimeCookiePrimaryProvider(rows.get("AMP_abc123")!), "Amplitude");
  assert.equal(getRuntimeCookiePrimaryProvider(rows.get("AMP_MKTG_abc123")!), "Amplitude");
  assert.equal(getRuntimeCookiePrimaryProvider(rows.get("ld_anonymous_user_key")!), "LaunchDarkly");
  assert.equal(rows.get("AMP_abc123")?.category, "analytics");
  assert.equal(rows.get("AMP_MKTG_abc123")?.category, "advertising");
  assert.equal(rows.get("ld_anonymous_user_key")?.category, "personalization");
  for (const row of rows.values()) {
    assert.equal(row.setAtMs, null);
    assert.equal(row.timingEvidence, "initial_cookie_snapshot");
    assert.equal(row.nonEssential, true);
    assert.equal(isEligibleNonEssentialPreconsentStorageRow(row), false);
    assert.equal(getRuntimeCookieReviewPriority(row), "review_needed");
  }
});

test("Daily cookies separate proven writes, snapshot presence, and Funding Choices consent state", () => {
  const inventory = buildRuntimeCookieInventory({
    hybridRuntimeEvidence: {
      cookieWriteObservations: [
        {
          beforeConsent: true,
          cookieName: "daily-ppid",
          domain: "www.daily.co.jp",
          nonEssential: false,
          setAtMs: 3_530,
          setMethod: "set_cookie_header"
        },
        {
          beforeConsent: true,
          category: "advertising",
          cookieName: "id5",
          domain: "id5-sync.com",
          nonEssential: false,
          setAtMs: 12_259,
          setMethod: "set_cookie_header"
        },
        ...["_gcl_au", "_ga", "_gid", "_ga_TF2974TV1H", "FCCDCF"].map((cookieName) => ({
          cookieName,
          domain: "daily.co.jp",
          firstObservedAtMs: 15_429,
          nonEssential: true,
          setMethod: "browser_snapshot"
        }))
      ]
    }
  });
  const rows = new Map(inventory.rows.map((row) => [row.cookieName, row]));

  assert.equal(rows.get("daily-ppid")?.category, "unknown");
  assert.equal(rows.get("id5")?.nonEssential, false);
  assert.equal(isEligibleNonEssentialPreconsentStorageRow(rows.get("id5")!), false);
  for (const name of ["_gcl_au", "_ga", "_gid", "_ga_TF2974TV1H", "FCCDCF"]) {
    assert.equal(rows.get(name)?.setAtMs, null, name);
    assert.equal(rows.get(name)?.timingEvidence, "periodic_cookie_snapshot", name);
  }
  assert.equal(rows.get("_gcl_au")?.category, "advertising");
  assert.equal(getRuntimeCookiePrimaryProvider(rows.get("FCCDCF")!), "Google Funding Choices");
  assert.equal(rows.get("FCCDCF")?.nonEssential, false);
});

test("separates a proven Branch cookie write from late Google and WisePops snapshot presence", () => {
  const inventory = buildRuntimeCookieInventory({
    hybridRuntimeEvidence: {
      cookieWriteObservations: [
        {
          beforeConsent: true,
          category: "unknown",
          cookieName: "_s",
          domain: "app.link",
          nonEssential: false,
          party: "third_party",
          setAtMs: 25309,
          setMethod: "set_cookie_header",
          sourceRequestUrl: "https://app.link/_r"
        },
        {
          category: "analytics",
          cookieName: "_ga",
          domain: "ifit.com",
          firstObservedAtMs: 26951,
          nonEssential: true,
          party: "first_party",
          setMethod: "browser_snapshot"
        },
        {
          category: "analytics",
          cookieName: "wisepops_visitor",
          domain: "ifit.com",
          firstObservedAtMs: 26951,
          nonEssential: true,
          party: "first_party",
          setMethod: "browser_snapshot"
        }
      ]
    }
  });
  const rows = new Map(inventory.rows.map((row) => [row.cookieName, row]));

  assert.equal(getRuntimeCookiePrimaryProvider(rows.get("_s")!), "Branch Deep Linking and Attribution");
  assert.equal(getRuntimeCookiePrimaryProvider(rows.get("wisepops_visitor")!), "WisePops");
  assert.equal(rows.get("_ga")?.setAtMs, null);
  assert.equal(rows.get("_ga")?.timingEvidence, "periodic_cookie_snapshot");
  assert.equal(isEligibleNonEssentialPreconsentStorageRow(rows.get("_s")!), false);
  assert.equal(inventory.beforeConsentRows.length, 1);
});

test("Aruba cookies use cookie-specific ownership and reject unrelated Cloudflare inheritance", () => {
  const inventory = buildRuntimeCookieInventory({
    hybridRuntimeEvidence: {
      cookieWriteObservations: [
        {
          beforeConsent: true,
          cookieName: "CMSCsrfCookie",
          domain: "www.aruba.it",
          initiatorVendor: "Cloudflare",
          nonEssential: false,
          setAtMs: 3364,
          sourceRequestUrl: "https://www.aruba.it/"
        },
        {
          beforeConsent: true,
          cookieName: "CMSPreferredCulture",
          domain: "www.aruba.it",
          initiatorVendor: "Cloudflare",
          nonEssential: false,
          setAtMs: 3364,
          sourceRequestUrl: "https://www.aruba.it/"
        },
        {
          beforeConsent: true,
          cookieName: "cf_clearance",
          domain: ".aruba.it",
          nonEssential: false,
          setAtMs: 3919
        },
        {
          beforeConsent: true,
          cookieName: "cookiesession1",
          domain: "managehosting.aruba.it",
          initiatorVendor: "Cloudflare",
          nonEssential: false,
          setAtMs: 3829,
          sourceRequestUrl: "https://managehosting.aruba.it/"
        }
      ]
    }
  });
  const rows = new Map(inventory.rows.map((row) => [row.cookieName, row]));

  assert.equal(getRuntimeCookiePrimaryProvider(rows.get("CMSCsrfCookie")!), "Kentico Xperience CMS");
  assert.equal(getRuntimeCookiePrimaryProvider(rows.get("CMSPreferredCulture")!), "Kentico Xperience CMS");
  assert.equal(getRuntimeCookiePrimaryProvider(rows.get("cf_clearance")!), "Cloudflare");
  assert.equal(rows.get("cookiesession1")?.initiatorVendor, null);
  assert.notEqual(getRuntimeCookiePrimaryProvider(rows.get("cookiesession1")!), "Cloudflare");
  assert.equal([...rows.values()].some(isEligibleNonEssentialPreconsentStorageRow), false);
});

test("canonical security-cookie classification overrides stale advertising flags", () => {
  const inventory = buildRuntimeCookieInventory({
    hybridRuntimeEvidence: {
      cookieWriteObservations: [{
        beforeConsent: true,
        category: "advertising",
        cookieName: "_cfuvid",
        domain: ".forms.example.test",
        nonEssential: true,
        party: "third_party"
      }]
    }
  });

  assert.equal(inventory.rows[0]?.category, "necessary");
  assert.equal(inventory.rows[0]?.nonEssential, false);
  assert.equal(inventory.rows[0]?.essentiality, "essential");
  assert.equal(getRuntimeCookiePrimaryProvider(inventory.rows[0]!), "Cloudflare");
  assert.equal(getRuntimeCookieReviewPriority(inventory.rows[0]!), "contextual");
});

test("IMOU redirect-hop load-balancer cookies remain first-party necessary context", () => {
  const cookieNames = ["AWSALBTG", "AWSALBTGCORS", "AWSALBAPP-0", "AWSALBAPP-1", "AWSALBAPP-2", "AWSALBAPP-3"];
  const inventory = buildRuntimeCookieInventory({
    hybridRuntimeEvidence: {
      navigationSummary: {
        requestedUrl: "https://imoulife.com/",
        redirectChain: ["https://imoulife.com/", "https://www.imou.com/"],
        finalUrl: "https://www.imou.com/"
      },
      cookieWriteObservations: cookieNames.map((cookieName) => ({
        beforeConsent: true,
        category: "necessary",
        cookieName,
        domain: "imoulife.com",
        nonEssential: false,
        setAtMs: 1_258,
        sourceRequestUrl: "https://imoulife.com/",
        thirdParty: true
      }))
    }
  });

  assert.equal(inventory.rows.length, 6);
  for (const row of inventory.rows) {
    assert.equal(row.category, "necessary", row.cookieName);
    assert.equal(row.nonEssential, false, row.cookieName);
    assert.equal(row.party, "first_party", row.cookieName);
    assert.equal(getRuntimeCookiePrimaryProvider(row), "AWS Elastic Load Balancing", row.cookieName);
    assert.equal(getRuntimeCookieReviewPriority(row), "contextual", row.cookieName);
    assert.equal(isEligibleNonEssentialPreconsentStorageRow(row), false, row.cookieName);
  }
});

test("classifies named measurement identifiers and leaves unknown identifiers unclassified", () => {
  const inventory = buildRuntimeCookieInventory({
    hybridRuntimeEvidence: {
      cookieWriteObservations: [
        { cookieName: "_dd_s", domain: ".example.test", category: "unknown", nonEssential: false },
        { cookieName: "_zitok", domain: ".example.test", category: "unknown", nonEssential: false },
        { cookieName: "ebEventToTrack", domain: ".example.test", category: "unknown", nonEssential: false },
        { cookieName: "stableId", domain: ".example.test", category: "unknown", nonEssential: false },
        { cookieName: "unresolved_identifier", domain: ".example.test", category: "unknown", nonEssential: false },
      ]
    }
  });
  const rows = new Map(inventory.rows.map((row) => [row.cookieName, row]));
  for (const name of ["_dd_s", "_zitok", "ebEventToTrack", "stableId"]) {
    assert.equal(rows.get(name)?.category, "analytics");
    assert.equal(rows.get(name)?.essentiality, "unknown");
    assert.equal(rows.get(name)?.nonEssential, false);
  }
  assert.equal(getRuntimeCookiePrimaryProvider(rows.get("_dd_s")!), "Datadog");
  assert.equal(getRuntimeCookiePrimaryProvider(rows.get("_zitok")!), "ZoomInfo");
  assert.equal(getRuntimeCookiePrimaryProvider(rows.get("ebEventToTrack")!), "Eventbrite");
  assert.equal(getRuntimeCookiePrimaryProvider(rows.get("stableId")!), "Eventbrite");
  assert.equal(rows.get("unresolved_identifier")?.category, "unknown");
  assert.equal(rows.get("unresolved_identifier")?.essentiality, "unknown");
  assert.equal(rows.get("unresolved_identifier")?.nonEssential, false);
});

test("repairs Life.ru Yandex cookie ownership without borrowing Bombora, OpenX, or Quantcast", () => {
  const inventory = buildRuntimeCookieInventory({
    hybridRuntimeEvidence: {
      navigationSummary: { finalUrl: "https://life.ru/" },
      cookieWriteObservations: [
        {
          beforeConsent: true,
          cookieName: "pi",
          domain: "yandex.ru",
          initiatorUrl: "https://yandex.ru/ads/system/header-bidding.js",
          initiatorVendor: "Bombora Visitor Insights",
          setAtMs: 4311,
          setMethod: "set_cookie_header",
          thirdParty: true,
        },
        ...["_ym_uid", "_ym_d", "_ym_isad", "_ymab_param"].map((cookieName) => ({
          cookieName,
          domain: "life.ru",
          firstObservedAtMs: 10875,
          setMethod: "browser_snapshot",
        })),
      ],
    },
  });

  const rows = new Map(inventory.rows.map((row) => [row.cookieName, row]));
  assert.equal(rows.get("pi")?.initiatorVendor, "Yandex Ads / Metrica");
  assert.equal(getRuntimeCookiePrimaryProvider(rows.get("pi")!), "Yandex");
  for (const cookieName of ["_ym_uid", "_ym_d", "_ym_isad", "_ymab_param"]) {
    const row = rows.get(cookieName);
    assert.equal(row?.category, "analytics", cookieName);
    assert.equal(row?.timingEvidence, "periodic_cookie_snapshot", cookieName);
    assert.equal(row?.setAtMs, null, cookieName);
    assert.equal(getRuntimeCookiePrimaryProvider(row!), "Yandex Metrica", cookieName);
  }
});

test("surfaces Segment anonymous storage as non-essential analytics evidence", () => {
  const inventory = buildRuntimeCookieInventory({
    hybridRuntimeEvidence: {
      cookieWriteObservations: [{
        beforeConsent: true,
        category: "unknown",
        cookieName: "ajs_anonymous_id",
        domain: ".example.test",
        nonEssential: true,
        party: "first_party"
      }]
    }
  });

  assert.equal(inventory.rows[0]?.category, "analytics");
  assert.equal(inventory.rows[0]?.nonEssential, true);
  assert.equal(getRuntimeCookiePrimaryProvider(inventory.rows[0]!), "Segment");
  assert.equal(getRuntimeCookieReviewPriority(inventory.rows[0]!), "medium");
});

test("attributes canonical Google and OneTrust cookies without borrowed initiators", () => {
  const inventory = buildRuntimeCookieInventory({
    hybridRuntimeEvidence: {
      cookieWriteObservations: [
        { beforeConsent: true, category: "advertising", cookieName: "_gcl_au", domain: ".example.test", nonEssential: true, party: "first_party", initiatorVendor: "Unrelated CDN" },
        { beforeConsent: true, category: "consent_management", cookieName: "OptanonConsent", domain: ".example.test", nonEssential: true, party: "first_party", initiatorVendor: "Unrelated CDN" },
        { beforeConsent: true, category: "necessary", cookieName: "JSESSIONID", domain: ".example.test", nonEssential: true, party: "first_party" }
      ]
    }
  });
  const byName = new Map(inventory.rows.map((row) => [row.cookieName, row]));
  assert.equal(getRuntimeCookiePrimaryProvider(byName.get("_gcl_au")!), "Google");
  assert.equal(getRuntimeCookieReviewPriority(byName.get("_gcl_au")!), "high");
  assert.equal(getRuntimeCookiePrimaryProvider(byName.get("OptanonConsent")!), "OneTrust");
  assert.equal(byName.get("OptanonConsent")?.nonEssential, false);
  assert.equal(byName.get("JSESSIONID")?.nonEssential, false);
});

test("deduplicates cookie domain formatting and keeps periodic browser snapshots untimed", () => {
  const inventory = buildRuntimeCookieInventory({
    hybridRuntimeEvidence: {
      cookieWriteObservations: [
        {
          beforeConsent: true,
          category: "security",
          cookieName: "cf_clearance",
          domain: "example.test",
          firstObservedAtMs: 100,
          setAtMs: 100,
          setMethod: "set_cookie_header"
        },
        {
          beforeConsent: true,
          category: "security",
          cookieName: "cf_clearance",
          domain: ".example.test",
          firstObservedAtMs: 12000,
          setAtMs: 12000,
          setMethod: "browser_snapshot"
        },
        {
          beforeConsent: true,
          category: "analytics",
          cookieName: "_ga",
          domain: ".example.test",
          firstObservedAtMs: 12001,
          setAtMs: 12001,
          setMethod: "browser_snapshot"
        }
      ]
    }
  });
  assert.equal(inventory.rows.filter((row) => row.cookieName === "cf_clearance").length, 1);
  const ga = inventory.rows.find((row) => row.cookieName === "_ga");
  assert.equal(ga?.domain, "example.test");
  assert.equal(ga?.setAtMs, null);
  assert.equal(ga?.firstObservedAtMs, 12001);
  assert.equal(ga?.timingEvidence, "periodic_cookie_snapshot");
});

test("keeps DoubleClick and Google Analytics cookie names as representative storage anchors", () => {
  const inventory = buildRuntimeCookieInventory({
    hybridRuntimeEvidence: {
      cookieWriteObservations: [
        {
          beforeConsent: true, category: "advertising", cookieName: "test_cookie", domain: "doubleclick.net",
          firstObservedAtMs: 2013, setAtMs: 2013, setMethod: "set_cookie_header", timingEvidence: "before_consent_cookie_write"
        },
        ...["_ga", "_gid", "_gat"].map((cookieName, index) => ({
          beforeConsent: true, category: "analytics", cookieName, domain: ".example.test",
          firstObservedAtMs: 12000 + index, setAtMs: 12000 + index, setMethod: "browser_snapshot"
        }))
      ]
    }
  });
  const groups = buildRuntimeCookiePriorityGroups(inventory.rows);
  const advertising = groups.find((row) => row.purpose === "Advertising");
  const analytics = groups.find((row) => row.purpose === "Analytics");
  assert.deepEqual(advertising?.cookieNames, ["test_cookie"]);
  assert.equal(advertising?.firstSeenMs, 2013);
  assert.deepEqual(analytics?.cookieNames, ["_ga", "_gid", "_gat"]);
});

test("filters consent security and infrastructure cookies from tracking evidence", () => {
  assert.equal(isFunctionalCookieExcludedFromTrackingEvidence("OptanonConsent", ".webmd.com"), true);
  assert.equal(isFunctionalCookieExcludedFromTrackingEvidence("OptanonAlertBoxClosed", ".webmd.com"), true);
  assert.equal(isFunctionalCookieExcludedFromTrackingEvidence("geo_country", ".troweprice.com"), true);
  assert.equal(isFunctionalCookieExcludedFromTrackingEvidence("trp-country", ".troweprice.com"), true);
  assert.equal(isFunctionalCookieExcludedFromTrackingEvidence("trp-language", ".troweprice.com"), true);
  assert.equal(isFunctionalCookieExcludedFromTrackingEvidence("CookieConsent", ".example.com"), true);
  assert.equal(isFunctionalCookieExcludedFromTrackingEvidence("euconsent-v2", ".example.com"), true);
  assert.equal(isFunctionalCookieExcludedFromTrackingEvidence("notice_preferences", ".example.com"), true);
  assert.equal(isFunctionalCookieExcludedFromTrackingEvidence("__cf_bm", ".example.com"), true);
  assert.equal(isFunctionalCookieExcludedFromTrackingEvidence("_cfuvid", ".hsforms.com"), true);
  assert.equal(isFunctionalCookieExcludedFromTrackingEvidence("bm_sv", ".nvidia.com"), true);
  assert.equal(isFunctionalCookieExcludedFromTrackingEvidence("bm_mi", "nvidia.com"), true);
  assert.equal(isFunctionalCookieExcludedFromTrackingEvidence("BIGipServerpool", ".example.com"), true);
  assert.equal(isFunctionalCookieExcludedFromTrackingEvidence("akaalb_usp-google", "www.sbtech.com"), true);
  assert.equal(isFunctionalCookieExcludedFromTrackingEvidence("_ga", ".example.com"), false);
});

test("rates pre-consent tag-management and marketing-automation cookies as medium priority", () => {
  assert.equal(
    getRuntimeCookieReviewPriority({
      category: "Tag management",
      cookieName: "_dc_gtm_UA-123",
      domain: ".example.com",
      evidenceGrade: "high",
      firstObservedAtMs: 250,
      initiatorDomain: "www.googletagmanager.com",
      initiatorUrl: "https://www.googletagmanager.com/gtm.js?id=GTM-ABC123",
      initiatorVendor: "Google Tag Manager",
      nonEssential: true,
      party: "third_party",
      responseUrl: null,
      setAtMs: 250,
      setMethod: "document_cookie",
      sourceRequestUrl: "https://www.googletagmanager.com/gtm.js?id=GTM-ABC123",
      timingBasis: "before_consent",
      timingEvidence: "before_consent_cookie_write"
    }),
    "medium",
  );
  assert.equal(
    getRuntimeCookieReviewPriority({
      category: "Marketing automation",
      cookieName: "__kla_id",
      domain: ".example.com",
      evidenceGrade: "high",
      firstObservedAtMs: 300,
      initiatorDomain: "static.klaviyo.com",
      initiatorUrl: "https://static.klaviyo.com/onsite/js/klaviyo.js",
      initiatorVendor: "Klaviyo",
      nonEssential: true,
      party: "third_party",
      responseUrl: null,
      setAtMs: 300,
      setMethod: "document_cookie",
      sourceRequestUrl: "https://static.klaviyo.com/onsite/js/klaviyo.js",
      timingBasis: "before_consent",
      timingEvidence: "before_consent_cookie_write"
    }),
    "medium",
  );
});

test("groups NVIDIA region and Akamai bot cookies as contextual inventory", () => {
  const inventory = buildRuntimeCookieInventory({
    hybridRuntimeEvidence: {
      cookieWriteObservations: [
        {
          category: "Unknown",
          beforeConsent: true,
          cookieName: "c_code",
          domain: "nvidia.com",
          initiatorVendor: "Akamai Bot Manager / Edge",
          setAtMs: 947
        },
        {
          category: "Unknown",
          beforeConsent: true,
          cookieName: "bm_sv",
          domain: ".nvidia.com",
          setAtMs: 1468
        }
      ]
    }
  });
  const groups = buildRuntimeCookiePriorityGroups(inventory.rows);
  const regionCookie = groups.find((row) => row.vendor === "nvidia.com");
  const akamaiCookie = groups.find((row) => row.vendor === "Akamai Bot Manager / Edge");

  assert.equal(regionCookie?.purpose, "Functional");
  assert.equal(regionCookie?.priority, "contextual");
  assert.equal(akamaiCookie?.purpose, "Security");
  assert.equal(akamaiCookie?.priority, "contextual");
});

test("does not display retained Akamai unknown cookie rows as review-level unknown", () => {
  const groups = buildRuntimeCookiePriorityGroups([
    {
      category: "Unknown",
      cookieName: "ak_bmsc",
      domain: ".nvidia.com",
      evidenceGrade: null,
      firstObservedAtMs: 7761,
      initiatorDomain: null,
      initiatorUrl: null,
      initiatorVendor: "Akamai Bot Manager / Edge",
      nonEssential: false,
      party: "first_party",
      responseUrl: null,
      setAtMs: 7761,
      setMethod: "browser_snapshot",
      sourceRequestUrl: null,
      timingBasis: "browser_snapshot",
      timingEvidence: "before_consent_cookie_write"
    }
  ]);

  assert.equal(groups[0]?.vendor, "Akamai Bot Manager / Edge");
  assert.equal(groups[0]?.purpose, "Security");
  assert.equal(groups[0]?.priority, "contextual");
});

test("builds cookie inventory with initiator provenance and before-consent timing", () => {
  const inventory = buildRuntimeCookieInventory({
    hybridRuntimeEvidence: {
      cookieWriteObservations: [
        {
          beforeConsent: true,
          cookieInitiatorDomain: "connect.facebook.net",
          cookieInitiatorUrl: "https://connect.facebook.net/fbevents.js",
          cookieInitiatorVendor: "Meta Pixel",
          cookieName: "_fbp",
          cookieSetMethod: "document_cookie",
          domain: ".example.com",
          responseUrl: "https://connect.facebook.net/fbevents.js",
          setAtMs: 120
        },
        {
          cookieName: "__cf_bm",
          cookieSetMethod: "http_header",
          domain: ".example.com",
          setAtMs: 180
        }
      ],
      timelineMarkers: {
        consentBannerDetectedMs: 300
      },
      unmatchedCookieNames: ["_fbp"]
    },
    runtimeArtifacts: {
      initial_cookie_domains: [".example.com"],
      initial_cookie_names: ["_ga"]
    }
  });

  assert.deepEqual(inventory.beforeConsentCookieNames, ["_fbp", "__cf_bm"]);
  assert.deepEqual(inventory.nonEssentialCookieNames, ["_fbp", "_ga"]);
  assert.deepEqual(inventory.unmatchedCookieNames, ["_fbp"]);
  assert.equal(inventory.rows.find((row) => row.cookieName === "_fbp")?.initiatorUrl, "https://connect.facebook.net/fbevents.js");
  assert.equal(inventory.rows.find((row) => row.cookieName === "_fbp")?.responseUrl, "https://connect.facebook.net/fbevents.js");
});

test("cookie provider attribution prefers cookie source host over unrelated initiator vendor", () => {
  const inventory = buildRuntimeCookieInventory({
    hybridRuntimeEvidence: {
      cookieWriteObservations: [
        {
          beforeConsent: true,
          category: "unknown",
          cookieName: "_gh_sess",
          domain: "github.com",
          initiatorVendor: "Contentful Assets",
          sourceRequestUrl: "https://github.com/features/packages",
          thirdParty: false
        },
        {
          beforeConsent: true,
          category: "unknown",
          cookieName: "ctf_cookie",
          domain: "images.ctfassets.net",
          initiatorVendor: "Contentful Assets",
          sourceRequestUrl: "https://images.ctfassets.net/example/asset.js",
          thirdParty: true
        }
      ]
    }
  });
  const githubCookie = inventory.rows.find((row) => row.cookieName === "_gh_sess");
  const contentfulCookie = inventory.rows.find((row) => row.cookieName === "ctf_cookie");

  assert.ok(githubCookie);
  assert.ok(contentfulCookie);
  assert.equal(getRuntimeCookiePrimaryProvider(githubCookie), "GitHub");
  assert.equal(getRuntimeCookiePrimaryProvider(contentfulCookie), "Contentful Assets");
  assert.equal(buildRuntimeCookiePriorityGroups([githubCookie])[0]?.vendor, "GitHub");
});

test("normalizes initial-cookie sentinel timestamps as unknown timing values", () => {
  const inventory = buildRuntimeCookieInventory({
    hybridRuntimeEvidence: {
      cookieWriteObservations: [
        {
          beforeConsent: true,
          cookieName: "adEdition",
          cookieSetMethod: "http_header",
          domain: "app.mps.vsnt.net",
          setAtMs: -1
        }
      ]
    }
  });

  const row = inventory.beforeConsentRows.find((entry) => entry.cookieName === "adEdition");
  assert.ok(row);
  assert.equal(row.setAtMs, null);
  assert.equal(row.firstObservedAtMs, null);
  assert.equal(row.timingEvidence, "before_consent_cookie_write");
});

test("normalizes retained first-party analytics pre-consent cookie evidence", () => {
  const inventory = buildRuntimeCookieInventory({
    hybridRuntimeEvidence: {
      preconsentCookieEvidence: [
        {
          beforeConsent: true,
          category: "analytics",
          cookieInitiatorDomain: ".example.com",
          cookieInitiatorVendor: "Google Analytics",
          cookieName: "_ga",
          cookiePartyType: "first_party",
          cookieSetMethod: "initial_cookie_snapshot",
          domain: ".example.com",
          evidenceGrade: "moderate",
          timingBasis: "initial_cookie_snapshot_with_visible_cmp",
          timingEvidence: "initial_cookie_snapshot_with_visible_cmp"
        }
      ]
    }
  });

  const row = inventory.rows.find((entry) => entry.cookieName === "_ga");
  assert.ok(row);
  assert.equal(row.category, "analytics");
  assert.equal(row.initiatorVendor, "Google Analytics");
  assert.equal(row.party, "first_party");
  assert.equal(row.timingEvidence, "initial_cookie_snapshot");
  assert.equal(row.timingBasis, "initial_cookie_snapshot");
  assert.equal(row.evidenceGrade, "moderate");
});

test("builds cookie disclosure gap evidence from runtime and policy inventory", () => {
  const inventory = buildRuntimeCookieInventory({
    hybridRuntimeEvidence: {
      cookieWriteObservations: [
        {
          cookieName: "_ga",
          domain: ".example.com",
          thirdParty: false
        },
        {
          cookieName: "_fbp",
          cookieInitiatorVendor: "Meta Pixel",
          domain: ".example.com",
          thirdParty: true
        },
        {
          cookieName: "__cf_bm",
          domain: ".example.com",
          thirdParty: false
        }
      ]
    }
  });

  const evidence = buildCookieDisclosureGapEvidence({
    cookiePolicyUrl: "https://example.com/cookie-policy",
    disclosures: [{ cookie_name: "_ga", provider: "Google", purpose: "analytics" }],
    inventory
  });

  assert.deepEqual(evidence.runtime_cookie_names, ["_ga", "_fbp", "__cf_bm"]);
  assert.deepEqual(evidence.disclosed_cookie_names, ["_ga"]);
  assert.deepEqual(evidence.unmatched_cookie_names, ["_fbp"]);
  assert.deepEqual(evidence.unmatched_cookie_vendors, ["Meta"]);
  assert.equal(evidence.unmatched_cookie_count, 1);
  assert.equal(evidence.unmatched_third_party_cookie_count, 1);
});

test("hydrates unmatched cookies from generic runtime policy reconciliation evidence", () => {
  const inventory = buildRuntimeCookieInventory({
    hybridRuntimeEvidence: {
      cookieWriteObservations: [
        {
          cookieName: "_ga",
          domain: ".example.com",
          thirdParty: false
        },
        {
          cookieName: "_fbp",
          domain: ".example.com",
          thirdParty: true
        }
      ],
      runtimePolicyReconciliations: [
        {
          findingId: "cookie_disclosure_gap",
          signalKey: "privacy.cookie_runtime_disclosure_gap_detected",
          subjectKind: "cookie",
          unmatchedRuntimeItems: [
            {
              cookieName: "_fbp",
              domain: ".example.com",
              thirdParty: true,
              vendor: "Meta Pixel"
            }
          ]
        }
      ]
    }
  });

  assert.deepEqual(inventory.unmatchedCookieNames, ["_fbp"]);
  assert.equal(inventory.unmatchedRows[0]?.cookieName, "_fbp");
  assert.equal(inventory.unmatchedRows[0]?.party, "third_party");
});
