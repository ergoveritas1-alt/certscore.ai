import assert from "node:assert/strict";
import test from "node:test";
import { resolveEndpointGeography, resolveVendorDisplayCategory, resolveVendorObservations } from "./index.js";

test("resolves endpoint geography only from explicit host region tokens", () => {
  assert.deepEqual(
    resolveEndpointGeography({
      collectionEndpointObserved: true,
      hostname: "collector.us-east-1.amazonaws.com",
      thirdParty: true,
    }),
    {
      basis: ["host_only_endpoint_geography", "aws_region_hostname", "provider_region_catalog"],
      jurisdiction: "US",
      locationLabel: "AWS US East (N. Virginia)",
      precision: "provider_region",
      provider: "AWS",
      region: "us-east-1",
      status: "region_observed",
    },
  );
  assert.deepEqual(
    resolveEndpointGeography({
      collectionEndpointObserved: true,
      hostname: "stats.g.doubleclick.net",
      thirdParty: true,
    }),
    {
      basis: ["host_only_endpoint_geography", "no_explicit_region_in_hostname"],
      status: "unknown",
    },
  );
  assert.equal(
    resolveEndpointGeography({
      collectionEndpointObserved: false,
      hostname: "collector.us-east-1.amazonaws.com",
      thirdParty: true,
    }),
    undefined,
  );
});

test("resolves Google Analytics from collection endpoint and cookie", () => {
  const observations = resolveVendorObservations([
    {
      type: "request",
      url: "https://www.google-analytics.com/g/collect?v=2&tid=G-TEST",
    },
    {
      type: "cookie",
      cookieName: "_ga",
      hostname: "example.com",
    },
  ]);

  assert.equal(observations.some((item) => item.product === "Google Analytics"), true);
  assert.equal(
    observations.find((item) => item.product === "Google Analytics")?.purpose,
    "analytics",
  );
});

test("resolves Baidu Analytics and Cloudflare Web Analytics beacon endpoints", () => {
  const observations = resolveVendorObservations([
    {
      type: "script",
      url: "https://hm.baidu.com/hm.js?59317e5849f38e9ec82d03f6fb1a84d7",
      hostname: "hm.baidu.com",
    },
    {
      type: "script",
      url: "https://hm.baidu.com/hm.js?40da850f11b3ae73db643f7a577c2c60",
      hostname: "hm.baidu.com",
    },
    {
      type: "script",
      url: "https://static.cloudflareinsights.com/beacon.min.js",
      hostname: "static.cloudflareinsights.com",
    },
  ]);

  assertResolved(observations, "Baidu", "Baidu Analytics", "analytics");
  assertResolved(observations, "Cloudflare", "Cloudflare Web Analytics", "analytics");

  const baidu = observations.find((item) => item.product === "Baidu Analytics");
  assert.ok(baidu);
  assert.equal(baidu.regulatoryRelevance.includes("audience_measurement"), true);
  assert.deepEqual(baidu.matchedHostnames, ["hm.baidu.com"]);

  const cloudflareAnalytics = observations.find((item) => item.product === "Cloudflare Web Analytics");
  assert.ok(cloudflareAnalytics);
  assert.equal(cloudflareAnalytics.regulatoryRelevance.includes("performance_monitoring"), true);
  assert.equal(resolveVendorDisplayCategory(cloudflareAnalytics), "Analytics");
});

test("resolves non-essential vendors from bounded storage keys", () => {
  const observations = resolveVendorObservations([
    {
      evidenceId: "storage_google_ads",
      type: "cmp_runtime",
      storageKey: "_gcl_ls",
      sourceEventType: "storage_snapshot",
      sourceScanner: "pre_consent_runtime",
      scenario: "fresh_pre_consent",
      consentStateAtTime: "pre_consent",
      matchSource: "storage_key",
    },
    {
      evidenceId: "storage_permutive",
      type: "cmp_runtime",
      storageKey: "permutive-id",
      sourceEventType: "storage_snapshot",
      sourceScanner: "pre_consent_runtime",
      scenario: "fresh_pre_consent",
      consentStateAtTime: "pre_consent",
      matchSource: "storage_key",
    },
  ]);

  assertResolved(observations, "Google", "Google Ads / DoubleClick", "advertising");
  assertResolved(observations, "Permutive", "Permutive", "advertising");
  assert.equal(
    observations.every((item) =>
      item.matchSources.some((source) =>
        source.source === "storage_key" &&
        source.matchedField === "storage_key" &&
        source.consentStateAtTime === "pre_consent",
      ),
    ),
    true,
  );
});

test("adds structured match sources and evidence refs for source events", () => {
  const observations = resolveVendorObservations([
    {
      evidenceId: "net_ga_collect",
      type: "request",
      url: "https://www.google-analytics.com/g/collect?v=2&tid=G-TEST&cid=abc123",
      hostname: "www.google-analytics.com",
      sourceEventType: "network_request",
      sourceScanner: "pre_consent_runtime",
      scenario: "fresh_pre_consent",
      consentStateAtTime: "pre_consent",
      evidenceRef: {
        refId: "ref_net_ga_collect",
        eventId: "net_ga_collect",
        eventType: "network_request",
        url: "https://www.google-analytics.com/g/collect?v=2&tid=G-TEST&cid=abc123",
      },
    },
  ]);

  const observation = observations.find((item) => item.product === "Google Analytics");
  assert.ok(observation);
  assert.deepEqual(observation.matchedEvidenceIds, ["net_ga_collect"]);
  assert.equal(observation.matchedEvidenceRefs[0]?.eventId, "net_ga_collect");
  assert.equal(observation.matchSources.some((source) => source.source === "network_request"), true);
  assert.equal(observation.matchSources.some((source) => source.sourceEventId === "net_ga_collect"), true);
  assert.equal(
    observation.matchSources.some((source) =>
      source.matchedField === "url_pattern" &&
      source.matchedValueRedacted === "https://www.google-analytics.com/g/collect?[redacted_query]",
    ),
    true,
  );
});

test("does not classify Google Analytics collect endpoints as Clarity", () => {
  const observations = resolveVendorObservations([
    {
      type: "request",
      url: "https://region1.google-analytics.com/g/collect?v=2&tid=G-TEST&en=page_view",
    },
  ]);

  assert.equal(observations.some((item) => item.product === "Google Analytics"), true);
  assert.equal(observations.some((item) => item.product === "Microsoft Clarity"), false);
});

test("does not classify generic www.google.com collect endpoint as GA or Ads", () => {
  const observations = resolveVendorObservations([
    {
      type: "request",
      url: "https://www.google.com/collect?unknown=redacted",
      hostname: "www.google.com",
    },
  ]);

  assert.equal(observations.some((item) => item.product === "Google Analytics"), false);
  assert.equal(observations.some((item) => item.product === "Google Ads / DoubleClick"), false);
});

test("maps strong www.google.com pagead endpoint to Google Ads measurement", () => {
  const observations = resolveVendorObservations([
    {
      type: "request",
      url: "https://www.google.com/pagead/1p-conversion/12345",
      hostname: "www.google.com",
    },
  ]);

  assert.equal(observations[0]?.product, "Google Ads / DoubleClick");
  assert.equal(observations[0]?.purpose, "advertising");
});

test("keeps CMP classification separate from tracker classification", () => {
  const observations = resolveVendorObservations([
    {
      type: "script",
      url: "https://cdn.cookielaw.org/scripttemplates/otSDKStub.js",
    },
  ]);

  assert.equal(observations.length, 1);
  assert.equal(observations[0]?.vendor, "OneTrust");
  assert.equal(observations[0]?.purpose, "consent_management");
});

test("resolves Consentmanager CDN as consent management CMP", () => {
  const observations = resolveVendorObservations([
    {
      type: "script",
      url: "https://cdn.consentmanager.net/delivery/cmp.php?id=abc123",
      hostname: "cdn.consentmanager.net",
    },
  ]);

  assert.equal(observations.length, 1);
  const observation = observations[0];
  assert.ok(observation);
  assert.equal(observation.vendor, "Consentmanager");
  assert.equal(observation.product, "Consentmanager CMP");
  assert.equal(observation.purpose, "consent_management");
  assert.equal(resolveVendorDisplayCategory(observation), "Cookie compliance");
});

test("resolves CMP runtime probes from canonical registry markers", () => {
  const observations = resolveVendorObservations([
    {
      evidenceId: "cmp_global_onetrust",
      type: "cmp_runtime",
      globalName: "OneTrust",
      sourceEventType: "cmp_runtime_probe",
      sourceScanner: "pre_consent_runtime",
      scenario: "fresh_pre_consent",
      consentStateAtTime: "pre_consent",
      matchSource: "cmp_runtime_probe",
    },
    {
      evidenceId: "cmp_dom_usercentrics",
      type: "cmp_runtime",
      domSelector: "#usercentrics-root",
      sourceEventType: "cmp_runtime_probe",
      sourceScanner: "pre_consent_runtime",
      scenario: "fresh_pre_consent",
      consentStateAtTime: "pre_consent",
      matchSource: "cmp_runtime_probe",
    },
    {
      evidenceId: "cmp_storage_sourcepoint",
      type: "cmp_runtime",
      storageKey: "_sp_user_consent",
      sourceEventType: "storage_snapshot",
      sourceScanner: "pre_consent_runtime",
      scenario: "fresh_pre_consent",
      consentStateAtTime: "pre_consent",
      matchSource: "storage_key",
    },
  ]);

  assertResolved(observations, "OneTrust", "OneTrust CMP", "consent_management");
  assertResolved(observations, "Usercentrics", "Usercentrics CMP", "consent_management");
  assertResolved(observations, "Sourcepoint", "Sourcepoint CMP", "consent_management");
  assert.equal(
    observations.some((item) =>
      item.matchSources.some((source) => source.source === "cmp_runtime_probe"),
    ),
    true,
  );
});

test("does not identify a specific CMP vendor from generic CMP APIs alone", () => {
  const observations = resolveVendorObservations([
    {
      type: "cmp_runtime",
      globalName: "__tcfapi",
      sourceEventType: "cmp_runtime_probe",
      matchSource: "cmp_runtime_probe",
    },
    {
      type: "cmp_runtime",
      globalName: "__uspapi",
      sourceEventType: "cmp_runtime_probe",
      matchSource: "cmp_runtime_probe",
    },
  ]);

  assert.equal(observations.length, 0);
});

test("resolves session replay libraries by product-specific evidence", () => {
  const observations = resolveVendorObservations([
    {
      type: "script",
      url: "https://rs.fullstory.com/s/fs.js",
    },
  ]);

  assert.equal(observations[0]?.product, "FullStory");
  assert.equal(observations[0]?.purpose, "session_replay");
});

test("resolves Microsoft Clarity collection host without generic collect matching", () => {
  const observations = resolveVendorObservations([
    {
      type: "request",
      url: "https://n.clarity.ms/collect",
      hostname: "n.clarity.ms",
    },
    {
      type: "request",
      url: "https://f.clarity.ms/collect",
      hostname: "f.clarity.ms",
    },
  ]);

  assert.equal(observations.every((item) => item.product === "Microsoft Clarity"), true);
  assert.equal(observations.every((item) => item.purpose === "session_replay"), true);
  assert.equal(observations.some((item) => item.matchedHostnames.includes("f.clarity.ms")), true);
});

test("classifies Google Tag Manager as tag management", () => {
  const observations = resolveVendorObservations([
    {
      type: "script",
      url: "https://www.googletagmanager.com/gtm.js?id=GTM-ABC123",
    },
    {
      type: "script",
      url: "https://googletagmanager.com/gtm.js?id=GTM-XYZ987",
      hostname: "googletagmanager.com",
    },
  ]);

  const gtm = observations.find((item) => item.product === "Google Tag Manager");
  assert.ok(gtm);
  assert.equal(gtm.purpose, "tag_management");
  assert.equal(resolveVendorDisplayCategory(gtm), "Tag management");
});

test("classifies Adobe Launch host as tag management", () => {
  const observations = resolveVendorObservations([
    {
      type: "script",
      url: "https://assets.adobedtm.com/5d4962a43b79/96fada676f0e/launch-95431b44ee81.min.js",
      hostname: "assets.adobedtm.com",
    },
    {
      type: "script",
      url: "https://assets.adobedtm.com/5d4962a43b79/96fada676f0e/94bc53536e0e/EXea8a172518894e9e9d3a538770eec1ef-libraryCode_source.min.js",
      hostname: "assets.adobedtm.com",
    },
  ]);

  const launch = observations.find((item) => item.product === "Adobe Experience Platform Launch");
  assert.ok(launch);
  assert.equal(launch.vendor, "Adobe");
  assert.equal(launch.purpose, "tag_management");
  assert.equal(resolveVendorDisplayCategory(launch), "Tag management");
});

test("classifies LinkedIn Insight Tag, Ads Pixel, and cookies as advertising", () => {
  const observations = resolveVendorObservations([
    request("https://snap.licdn.com/li.lms-analytics/insight.min.js", "snap.licdn.com"),
    request("https://px.ads.linkedin.com/collect/?pid=123", "px.ads.linkedin.com"),
    {
      type: "cookie",
      cookieName: "li_sugr",
      hostname: ".linkedin.com",
    },
  ]);

  const insight = observations.find((item) => item.product === "LinkedIn Insight Tag");
  const adsPixel = observations.find((item) => item.product === "LinkedIn Ads Pixel");

  assert.ok(insight);
  assert.equal(insight.purpose, "advertising");
  assert.equal(resolveVendorDisplayCategory(insight), "Advertising");
  assert.ok(adsPixel);
  assert.equal(adsPixel.purpose, "advertising");
  assert.equal(resolveVendorDisplayCategory(adsPixel), "Advertising");
  assert.equal(insight.matchedCookieNames.includes("li_sugr"), true);
});

test("classifies HubSpot runtime families without collapsing consent tooling into marketing", () => {
  const observations = resolveVendorObservations([
    request("https://js.hsadspixel.net/fb.js", "js.hsadspixel.net"),
    request("https://js-eu1.hs-scripts.com/123456.js", "js-eu1.hs-scripts.com"),
    request("https://forms-eu1.hscollectedforms.net/collected-forms/v1/config/json", "forms-eu1.hscollectedforms.net"),
    request("https://api-eu1.hubapi.com/collector/v3/events", "api-eu1.hubapi.com"),
    request("https://js-eu1.hs-banner.com/banner.js", "js-eu1.hs-banner.com"),
    request("https://js-eu1.hs-analytics.net/analytics/123456.js", "js-eu1.hs-analytics.net"),
  ]);

  assertResolved(observations, "HubSpot", "HubSpot Ads Pixel", "advertising");
  assertResolved(observations, "HubSpot", "HubSpot Scripts", "analytics");
  assertResolved(observations, "HubSpot", "HubSpot Forms", "analytics");
  assertResolved(observations, "HubSpot", "HubSpot API", "analytics");
  assertResolved(observations, "HubSpot", "HubSpot Banner", "consent_management");
  assertResolved(observations, "HubSpot", "HubSpot Analytics", "analytics");

  const banner = observations.find((item) => item.product === "HubSpot Banner");
  const scripts = observations.find((item) => item.product === "HubSpot Scripts");
  const adsPixel = observations.find((item) => item.product === "HubSpot Ads Pixel");

  assert.ok(banner);
  assert.equal(resolveVendorDisplayCategory(banner), "Cookie compliance");
  assert.ok(scripts);
  assert.equal(resolveVendorDisplayCategory(scripts), "Marketing automation");
  assert.ok(adsPixel);
  assert.equal(resolveVendorDisplayCategory(adsPixel), "Advertising");

  const analytics = observations.find((item) => item.product === "HubSpot Analytics");
  assert.ok(analytics);
  assert.equal(resolveVendorDisplayCategory(analytics), "Analytics");
});

test("classifies PostHog EU assets and first-party PostHog cookies as product analytics", () => {
  const observations = resolveVendorObservations([
    request("https://eu-assets.i.posthog.com/static/array.js", "eu-assets.i.posthog.com"),
    {
      type: "cookie",
      cookieName: "ph_phc_project_posthog",
      hostname: ".example.com",
    },
  ]);

  const posthog = observations.find((item) => item.vendor === "PostHog");
  assert.ok(posthog);
  assert.equal(posthog.purpose, "analytics");
  assert.equal(posthog.regulatoryRelevance.includes("product_analytics"), true);
  assert.equal(posthog.matchedCookieNames.includes("ph_phc_project_posthog"), true);
  assert.equal(resolveVendorDisplayCategory(posthog), "Analytics");
});

test("classifies Akamai cookies as security not tracking", () => {
  const observations = resolveVendorObservations([
    {
      type: "cookie",
      cookieName: "akamai_generated_location",
      hostname: "www.example.com",
    },
  ]);

  assert.equal(observations[0]?.vendor, "Akamai");
  assert.equal(observations[0]?.purpose, "security");
});

test("resolves tvpixel as Data Plus Math / LiveRamp ad measurement", () => {
  const observations = resolveVendorObservations([
    {
      type: "request",
      url: "https://p.tvpixel.com/com.snowplowanalytics.snowplow/tp2",
      hostname: "p.tvpixel.com",
    },
  ]);

  assert.equal(observations[0]?.vendor, "LiveRamp");
  assert.equal(observations[0]?.product, "Data Plus Math / LiveRamp");
  assert.equal(observations[0]?.purpose, "advertising");
  assert.equal(observations[0]?.confidence >= 0.9, true);
});

test("leaves NBCU video infrastructure endpoint unmapped", () => {
  const observations = resolveVendorObservations([
    {
      type: "request",
      url: "https://video-ads-module.ad-tech.nbcuni.com/collect?module=video",
      hostname: "video-ads-module.ad-tech.nbcuni.com",
    },
  ]);

  assert.equal(observations.length, 0);
});

test("resolves specific adtech and analytics endpoints", () => {
  const observations = resolveVendorObservations([
    {
      type: "request",
      url: "https://dpm.demdex.net/id?d_orgid=example",
    },
    {
      type: "request",
      url: "https://dpm.demdex.net/ibs:dpid=19566&dpuuid=redacted",
    },
    {
      type: "request",
      url: "https://dpm.demdex.net/demconf.jpg?et:ibs%7cdata:dpid=19566",
    },
    {
      type: "request",
      url: "https://nbcu.demdex.net/event?d_event=imp",
    },
    {
      type: "request",
      url: "https://match.adsrvr.org/track",
    },
    {
      type: "request",
      url: "https://api.segment.io/v1/track",
    },
  ]);

  assert.equal(
    observations.some((item) => item.product === "Adobe Audience Manager / Experience Cloud"),
    true,
  );
  assert.equal(observations.some((item) => item.vendor === "The Trade Desk"), true);
  assert.equal(observations.some((item) => item.vendor === "Segment"), true);
});

test("resolves repeated advertising and measurement endpoint families", () => {
  const observations = resolveVendorObservations([
    request("https://ct.pinterest.com/v3/?event=pagevisit", "ct.pinterest.com"),
    request("https://analytics.tiktok.com/api/v2/pixel/track", "analytics.tiktok.com"),
    request("https://c.amazon-adsystem.com/e/dt", "c.amazon-adsystem.com"),
    request("https://match.adsrvr.org/track", "match.adsrvr.org"),
    request("https://gum.criteo.com/syncframe", "gum.criteo.com"),
    request("https://adobedc.demdex.net/id?d_orgid=example", "adobedc.demdex.net"),
    request("https://bcp.crwdcntrl.net/5/c=123", "bcp.crwdcntrl.net"),
    request("https://oajs.openx.net/w/1.0/pd", "oajs.openx.net"),
    request("https://pixel.rubiconproject.com/tap.php", "pixel.rubiconproject.com"),
    request("https://pixel-config.reddit.com/v2/config", "pixel-config.reddit.com"),
    request("https://pixel.tapad.com/idsync/ex/receive", "pixel.tapad.com"),
    request("https://sdk-api-v1.singular.net/api/v1/launch", "sdk-api-v1.singular.net"),
    request("https://idsync.rlcdn.com/365868.gif?partner_uid=redacted", "idsync.rlcdn.com"),
    request("https://api.rlcdn.com/api/identity/envelope?pid=13795", "api.rlcdn.com"),
    request("https://dsum-sec.casalemedia.com/rrum?ixi=1", "dsum-sec.casalemedia.com"),
    request("https://ssum.casalemedia.com/usermatch?s=205820", "ssum.casalemedia.com"),
    request("https://hbopenbid.pubmatic.com/translator?source=prebid", "hbopenbid.pubmatic.com"),
    request("https://beacon.taboola.com/?event=fraud-detection", "beacon.taboola.com"),
    request("https://pixel.adsafeprotected.com/services/pub?anId=8584", "pixel.adsafeprotected.com"),
    request("https://d.agkn.com/pixel", "d.agkn.com"),
    request("https://pix.revjet.com/pixel", "pix.revjet.com"),
    request("https://pixels.spotify.com/v1/ingest", "pixels.spotify.com"),
    request("https://events.brightline.tv/track", "events.brightline.tv"),
    request("https://tpsc-uw1.doubleverify.com/event.png?impid=redacted", "tpsc-uw1.doubleverify.com"),
    request("https://tps-dn-uw1.doubleverify.com/event.jpg?impid=redacted", "tps-dn-uw1.doubleverify.com"),
    request("https://px.ads.linkedin.com/db_sync?pid=10339", "px.ads.linkedin.com"),
    request("https://ara.paa-reporting-advertising.amazon/aat?event=PageView", "ara.paa-reporting-advertising.amazon"),
    request("https://prod.tahoe-analytics.publishers.advertising.a2z.com/logevent/putRecords?encoded=true", "prod.tahoe-analytics.publishers.advertising.a2z.com"),
    request("https://cms.quantserve.com/pixel/p-test.gif?idmatch=0", "cms.quantserve.com"),
    request("https://events.attentivemobile.com/ct-ev", "events.attentivemobile.com"),
  ]);

  assertResolved(observations, "Pinterest", "Pinterest Tag", "advertising");
  assertResolved(observations, "TikTok", "TikTok Pixel", "advertising");
  assertResolved(observations, "Amazon", "Amazon Ads", "advertising");
  assertResolved(observations, "The Trade Desk", "The Trade Desk", "advertising");
  assertResolved(observations, "Criteo", "Criteo", "advertising");
  assertResolved(observations, "Adobe", "Adobe Audience Manager / Experience Cloud", "advertising");
  assertResolved(observations, "Lotame", "Lotame", "advertising");
  assertResolved(observations, "OpenX", "OpenX", "advertising");
  assertResolved(observations, "Magnite", "Magnite / Rubicon", "advertising");
  assertResolved(observations, "Reddit", "Reddit Pixel", "advertising");
  assertResolved(observations, "Tapad", "Tapad", "advertising");
  assertResolved(observations, "Singular", "Singular Attribution", "advertising");
  assertResolved(observations, "LiveRamp", "LiveRamp", "advertising");
  assertResolved(observations, "Index Exchange", "Index Exchange", "advertising");
  assertResolved(observations, "PubMatic", "PubMatic", "advertising");
  assertResolved(observations, "Taboola", "Taboola", "advertising");
  assertResolved(observations, "Integral Ad Science", "Integral Ad Science", "advertising");
  assertResolved(observations, "TransUnion", "Neustar / AGKN", "advertising");
  assertResolved(observations, "RevJet", "RevJet", "advertising");
  assertResolved(observations, "Spotify", "Spotify Pixel", "advertising");
  const brightLine = observations.find((item) => item.vendor === "BrightLine" && item.product === "BrightLine");
  assert.ok(brightLine, "BrightLine should resolve");
  assert.equal(brightLine.purpose, "advertising");
  assert.equal(brightLine.confidence, 0.88);
  assertResolved(observations, "DoubleVerify", "DoubleVerify", "advertising");
  assertResolved(observations, "LinkedIn", "LinkedIn Ads Pixel", "advertising");
  assertResolved(observations, "Amazon", "Amazon Ads", "advertising");
  assertResolved(observations, "Quantcast", "Quantcast Measure", "advertising");
  assertResolved(observations, "Attentive", "Attentive", "analytics");
});

test("does not retain host-only static adtech URLs as advertising matched URLs", () => {
  const observations = resolveVendorObservations([
    request("https://cdn.taboola.com/static/thumbnails/story.png", "cdn.taboola.com"),
    request("https://cdn.taboola.com/libtrc/example/loader.js", "cdn.taboola.com"),
    request("https://www.facebook.com/tr?id=123&ev=PageView", "www.facebook.com"),
  ]);

  const taboola = observations.find((item) => item.vendor === "Taboola");
  assert.ok(taboola);
  assert.deepEqual(taboola.matchedUrls, [
    "https://cdn.taboola.com/libtrc/example/loader.js",
  ]);
  assert.equal(
    taboola.matchedEvidenceRefs.some((ref) => ref.url === "https://cdn.taboola.com/static/thumbnails/story.png"),
    false,
  );
  assert.equal(
    taboola.matchSources.some((source) =>
      source.matchedField === "hostname" &&
      source.matchedValueRedacted === "cdn.taboola.com"
    ),
    true,
  );

  const meta = observations.find((item) => item.vendor === "Meta");
  assert.ok(meta);
  assert.deepEqual(meta.matchedUrls, [
    "https://www.facebook.com/tr?id=123&ev=PageView",
  ]);
});

test("resolves Google ad traffic quality as security support not tracker purpose", () => {
  const observations = resolveVendorObservations([
    request("https://ep1.adtrafficquality.google/getconfig/sodar?sv=200&tid=gpt", "ep1.adtrafficquality.google"),
    request("https://ep1.adtrafficquality.google/pagead/sodar?id=sodar2", "ep1.adtrafficquality.google"),
  ]);

  assertResolved(observations, "Google", "Google Ad Traffic Quality", "security");
  assert.equal(
    observations.some((item) => ["analytics", "advertising", "session_replay"].includes(item.purpose)),
    false,
  );
});

test("resolves Sentry ingest endpoints as performance telemetry not advertising or analytics", () => {
  const observations = resolveVendorObservations([
    request("https://sentry.io/api/123/envelope/", "sentry.io"),
    request("https://assets.sentry.io/example.js", "assets.sentry.io"),
    request("https://o514642.ingest.us.sentry.io/api/514642/envelope/", "o514642.ingest.us.sentry.io"),
  ]);

  assertResolved(observations, "Sentry", "Sentry", "performance_monitoring");
  const sentry = observations.find((item) => item.vendor === "Sentry");
  assert.ok(sentry);
  assert.equal(sentry.regulatoryRelevance.includes("telemetry"), true);
  assert.equal(sentry.regulatoryRelevance.includes("diagnostics"), true);
  assert.equal(
    observations.some((item) => ["advertising", "analytics", "session_replay"].includes(item.purpose)),
    false,
  );
});

test("resolves CNN-style detected technologies from canonical registry sources", () => {
  const observations = resolveVendorObservations([
    request("https://accounts.google.com/gsi/client", "accounts.google.com"),
    request("https://js.stripe.com/v3", "js.stripe.com"),
    request("https://cdn.jsdelivr.net/npm/example/package.js", "cdn.jsdelivr.net"),
    request("https://cdn.optimizely.com/js/123456789.js", "cdn.optimizely.com"),
    request("https://experience.piano.io/xbuilder/experience/load", "experience.piano.io"),
    request("https://cdn.tinypass.com/api/tinypass.min.js", "cdn.tinypass.com"),
    request("https://cdn.cxense.com/cx.js", "cdn.cxense.com"),
    request("https://cdn.ml314.com/taglw.js", "cdn.ml314.com"),
    request("https://vi.ml314.com/Home/Index", "vi.ml314.com"),
    request("https://imasdk.googleapis.com/js/sdkloader/ima3.js", "imasdk.googleapis.com"),
    request("https://fonts.googleapis.com/css2?family=Inter", "fonts.googleapis.com"),
    request("https://securepubads.g.doubleclick.net/tag/js/gpt.js", "securepubads.g.doubleclick.net"),
    request("https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js", "pagead2.googlesyndication.com"),
    request("https://fls.doubleclick.net/activityi;src=123;type=abc;cat=def", "fls.doubleclick.net"),
    request("https://sb.scorecardresearch.com/b?c1=2&c2=123", "sb.scorecardresearch.com"),
    request("https://events.brightline.tv/collect?event=quartile", "events.brightline.tv"),
    {
      type: "cookie",
      cookieName: "__cf_bm",
      hostname: "piano.io",
    },
  ]);

  assertResolved(observations, "Google", "Google Sign-in", "infrastructure");
  assertResolved(observations, "Stripe", "Stripe.js", "security");
  assertResolved(observations, "jsDelivr", "jsDelivr CDN", "infrastructure");
  assertResolved(observations, "Optimizely", "Optimizely", "analytics");
  assertResolved(observations, "Piano", "Piano (Tinypass)", "infrastructure");
  assertResolved(observations, "Piano", "Cxense", "analytics");
  assertResolved(observations, "Bombora", "Bombora Visitor Insights", "advertising");
  assertResolved(observations, "Google", "Google Interactive Media Ads", "advertising");
  assertResolved(observations, "Google", "Google Fonts", "infrastructure");
  assertResolved(observations, "Google", "Google Publisher Tag", "advertising");
  assertResolved(observations, "Google", "Google AdSense", "advertising");
  assertResolved(observations, "Google", "DoubleClick Floodlight", "advertising");
  assertResolved(observations, "ScorecardResearch / Comscore", "ScorecardResearch", "analytics");
  const scorecardResearch = observations.find((item) => item.product === "ScorecardResearch");
  assert.equal(scorecardResearch?.confidence, 0.92);
  assert.equal(scorecardResearch?.regulatoryRelevance.includes("audience_measurement"), true);
  assert.equal(scorecardResearch?.regulatoryRelevance.includes("advertising_measurement"), true);
  const brightLine = observations.find((item) => item.vendor === "BrightLine" && item.product === "BrightLine");
  assert.ok(brightLine, "BrightLine should resolve");
  assert.equal(brightLine.purpose, "advertising");
  assert.equal(brightLine.confidence, 0.88);
  assert.equal(brightLine.regulatoryRelevance.includes("video_ad_measurement"), true);
  assert.equal(brightLine.regulatoryRelevance.includes("ad_event_tracking"), true);
  const pianoTinypass = observations.find((item) => item.vendor === "Piano" && item.product === "Piano (Tinypass)");
  assert.ok(pianoTinypass, "Piano (Tinypass) should resolve");
  assert.equal(pianoTinypass.confidence, 0.95);
  assert.equal(pianoTinypass.regulatoryRelevance.includes("paywall"), true);
  assert.equal(pianoTinypass.regulatoryRelevance.includes("cdn"), true);
  assert.equal(pianoTinypass.regulatoryRelevance.includes("script_delivery"), true);
  assertResolved(observations, "Cloudflare", "Cloudflare Bot Management", "security");
});

test("resolves DatoCMS and Mux image hosts as content infrastructure by default", () => {
  const observations = resolveVendorObservations([
    request("https://www.datocms-assets.com/12345/fixture-image.jpg?auto=format", "www.datocms-assets.com"),
    request("https://image.mux.com/abc123/thumbnail.jpg?time=1", "image.mux.com"),
  ]);

  assertResolved(observations, "DatoCMS", "DatoCMS Assets", "infrastructure");
  assertResolved(observations, "Mux", "Mux Image", "infrastructure");
  assert.equal(
    observations.every((item) => resolveVendorDisplayCategory(item) === "CDN"),
    true,
  );
  assert.equal(
    observations.some((item) => ["analytics", "advertising", "session_replay"].includes(item.purpose)),
    false,
  );
});

test("resolves gstatic shard hosts as contextual Google static asset infrastructure", () => {
  const observations = resolveVendorObservations([
    request("https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON", "t0.gstatic.com"),
    request("https://t1.gstatic.com/images?q=tbn:fixture", "t1.gstatic.com"),
    request("https://t2.gstatic.com/static/content.js", "t2.gstatic.com"),
  ]);

  assert.equal(observations.length, 1);
  const googleStatic = observations[0];
  assert.ok(googleStatic);
  assert.equal(googleStatic.vendor, "Google");
  assert.equal(googleStatic.product, "Google Static Assets");
  assert.equal(googleStatic.purpose, "infrastructure");
  assert.equal(resolveVendorDisplayCategory(googleStatic), "CDN");
  assert.deepEqual(googleStatic.matchedHostnames.sort(), ["t0.gstatic.com", "t1.gstatic.com", "t2.gstatic.com"]);
  assert.equal(googleStatic.regulatoryRelevance.includes("embedded_content"), true);
  assert.equal(googleStatic.regulatoryRelevance.includes("static_assets"), true);
});

test("resolves Klaviyo as marketing automation with high-confidence vendor identity", () => {
  const observations = resolveVendorObservations([
    request("https://static.klaviyo.com/onsite/js/klaviyo.js?company_id=abc123", "static.klaviyo.com"),
    request("https://a.klaviyo.com/client/subscriptions/?company_id=abc123", "a.klaviyo.com"),
    request("https://static-tracking.klaviyo.com/onsite/components/back-in-stock", "static-tracking.klaviyo.com"),
  ]);

  assertResolved(observations, "Klaviyo", "Klaviyo", "analytics");
  const klaviyo = observations.find((item) => item.vendor === "Klaviyo");
  assert.ok(klaviyo);
  assert.equal(klaviyo.confidence, 0.94);
  assert.equal(klaviyo.regulatoryRelevance.includes("marketing_automation"), true);
  assert.equal(klaviyo.regulatoryRelevance.includes("email_personalization"), true);
  assert.equal(resolveVendorDisplayCategory(klaviyo), "Marketing automation");
});

test("assigns canonical display categories for CNN-style technologies", () => {
  assert.equal(resolveVendorDisplayCategory({ vendor: "Google", product: "Google Sign-in", purpose: "infrastructure", regulatoryRelevance: ["authentication"] }), "Authentication");
  assert.equal(resolveVendorDisplayCategory({ vendor: "Stripe", product: "Stripe.js", purpose: "security", regulatoryRelevance: ["payment_processing"] }), "Payment processors");
  assert.equal(resolveVendorDisplayCategory({ vendor: "Cloudflare", product: "Cloudflare Bot Management", purpose: "security", regulatoryRelevance: ["bot_detection"] }), "Security");
  assert.equal(resolveVendorDisplayCategory({ vendor: "Piano", product: "Piano (Tinypass)", purpose: "infrastructure", regulatoryRelevance: ["personalization", "paywall", "cdn", "script_delivery"] }), "Personalisation");
  assert.equal(resolveVendorDisplayCategory({ vendor: "Piano", product: "Cxense", purpose: "analytics", regulatoryRelevance: ["personalization"] }), "Personalisation");
  assert.equal(resolveVendorDisplayCategory({ vendor: "Google", product: "Google Publisher Tag", purpose: "advertising", regulatoryRelevance: ["ad_delivery"] }), "Advertising");
  assert.equal(resolveVendorDisplayCategory({ vendor: "jsDelivr", product: "jsDelivr CDN", purpose: "infrastructure", regulatoryRelevance: ["cdn"] }), "CDN");
  assert.equal(resolveVendorDisplayCategory({ vendor: "OneTrust", product: "OneTrust CMP", purpose: "consent_management", regulatoryRelevance: ["consent"] }), "Cookie compliance");
  assert.equal(resolveVendorDisplayCategory({ vendor: "Optimizely", product: "Optimizely", purpose: "analytics", regulatoryRelevance: ["experimentation"] }), "A/B Testing");
  assert.equal(resolveVendorDisplayCategory({ vendor: "Quantcast", product: "Quantcast Measure", purpose: "advertising", regulatoryRelevance: ["audience_measurement"] }), "Advertising");
  assert.equal(resolveVendorDisplayCategory({ vendor: "ScorecardResearch / Comscore", product: "ScorecardResearch", purpose: "analytics", regulatoryRelevance: ["audience_measurement", "advertising_measurement"] }), "Analytics");
  assert.equal(resolveVendorDisplayCategory({ vendor: "BrightLine", product: "BrightLine", purpose: "advertising", regulatoryRelevance: ["video_ad_measurement", "ad_event_tracking"] }), "Advertising");
});

test("resolves BrightLine video ad measurement collector endpoints", () => {
  const observations = resolveVendorObservations([
    request("https://events.brightline.tv/beacon/impression", "events.brightline.tv"),
    request("https://collector.brightline.tv/measurement/video-quartile", "collector.brightline.tv"),
    request("https://cdn.brightline.tv/static/player.js", "cdn.brightline.tv"),
  ]);

  const brightLine = observations.find((item) => item.vendor === "BrightLine" && item.product === "BrightLine");
  assert.ok(brightLine, "BrightLine should resolve");
  assert.equal(brightLine.purpose, "advertising");
  assert.equal(brightLine.confidence, 0.88);
  assert.deepEqual(brightLine.matchedHostnames.sort(), ["collector.brightline.tv", "events.brightline.tv"]);
  assert.equal(brightLine.matchedHostnames.includes("cdn.brightline.tv"), false);
  assert.equal(brightLine.regulatoryRelevance.includes("video_ad_measurement"), true);
  assert.equal(brightLine.regulatoryRelevance.includes("ad_event_tracking"), true);
});

test("resolves Piano Tinypass cookie names including _pctx", () => {
  const observations = resolveVendorObservations([
    {
      type: "cookie",
      cookieName: "_pctx",
      hostname: "example.com",
    },
    {
      type: "cookie",
      cookieName: "_pcid",
      hostname: "example.com",
    },
    {
      type: "cookie",
      cookieName: "_pprv",
      hostname: "example.com",
    },
  ]);

  assertResolved(observations, "Piano", "Piano (Tinypass)", "infrastructure");
  const piano = observations.find((item) => item.vendor === "Piano" && item.product === "Piano (Tinypass)");
  assert.deepEqual(piano?.matchedCookieNames.sort(), ["_pcid", "_pctx", "_pprv"]);
  assert.equal(piano?.regulatoryRelevance.includes("personalization"), true);
  assert.equal(piano?.regulatoryRelevance.includes("paywall"), true);
});

test("resolves customer experience and session replay endpoint families from canonical registry sources", () => {
  const observations = resolveVendorObservations([
    request("https://edge.fullstory.com/s/settings/o-221JN4-na1/v1/web", "edge.fullstory.com"),
    request("https://analytics-fe.digital-cloud.medallia.com/api/web/events", "analytics-fe.digital-cloud.medallia.com"),
  ]);

  assertResolved(observations, "FullStory", "FullStory", "session_replay");
  assertResolved(observations, "Medallia", "Medallia Digital", "analytics");
});

test("resolves security performance and support endpoints as non-tracker purposes", () => {
  const observations = resolveVendorObservations([
    request("https://collector-pxj770cp7y.px-cloud.net/api/v2/collector", "collector-pxj770cp7y.px-cloud.net"),
    request("https://c.go-mpulse.net/boomerang/config.js", "c.go-mpulse.net"),
    request("https://bam.nr-data.net/1/browser/fixture", "bam.nr-data.net"),
    request("https://insights-collector.newrelic.com/v1/accounts/123/events", "insights-collector.newrelic.com"),
    request("https://cdn3.forter.com/v1/site.js", "cdn3.forter.com"),
    request("https://prod2-live-chat.sprinklr.com/live-chat/widget", "prod2-live-chat.sprinklr.com"),
  ]);

  assertResolved(observations, "HUMAN", "PerimeterX / HUMAN Bot Defense", "security");
  assertResolved(observations, "Akamai", "Akamai mPulse", "performance_monitoring");
  assertResolved(observations, "New Relic", "New Relic Browser", "performance_monitoring");
  assertResolved(observations, "Forter", "Forter Fraud Prevention", "security");
  assertResolved(observations, "Sprinklr", "Sprinklr Live Chat", "customer_support");
  assert.equal(
    observations.some((item) => ["analytics", "advertising", "session_replay"].includes(item.purpose)),
    false,
  );
});

test("resolves Fable Microsoft cookie aliases with host context", () => {
  const observations = resolveVendorObservations([
    {
      type: "cookie",
      cookieName: "MUID",
      hostname: ".bing.com",
    },
    {
      type: "cookie",
      cookieName: "CLID",
      hostname: ".clarity.ms",
    },
    {
      type: "cookie",
      cookieName: "MUID",
      hostname: "example.com",
    },
  ]);

  assertResolved(observations, "Microsoft", "Microsoft Advertising / Bing UET", "advertising");
  assertResolved(observations, "Microsoft", "Microsoft Clarity", "session_replay");
  assert.equal(
    observations.some((item) =>
      item.product === "Microsoft Advertising / Bing UET" &&
      item.matchedHostnames.includes("example.com"),
    ),
    false,
  );
});

test("reclassifies Fable security cookies as security infrastructure", () => {
  const observations = resolveVendorObservations([
    { type: "cookie", cookieName: "__cf_bm", hostname: ".linkedin.com" },
    { type: "cookie", cookieName: "_cfuvid", hostname: ".theathletic.com" },
    { type: "cookie", cookieName: "bm_sv", hostname: "example.com" },
    { type: "cookie", cookieName: "datadome", hostname: ".taboola.com" },
  ]);

  assertResolved(observations, "Cloudflare", "Cloudflare Bot Management", "security");
  assertResolved(observations, "Akamai", "Akamai Bot Manager / Edge", "security");
  assertResolved(observations, "DataDome", "DataDome Bot Protection", "security");
});

test("resolves Fable functional CDN and consent-management host aliases", () => {
  const observations = resolveVendorObservations([
    request("https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js", "cdnjs.cloudflare.com"),
    request("https://cdn.datatables.net/1.13.8/js/jquery.dataTables.min.js", "cdn.datatables.net"),
    request("https://code.jquery.com/jquery-3.7.1.min.js", "code.jquery.com"),
    request("https://geolocation.onetrust.com/cookieconsentpub/v1/geo/location", "geolocation.onetrust.com"),
    request("https://launchpad.privacymanager.io/latest/launchpad.js", "launchpad.privacymanager.io"),
    request("https://vitals.vercel-insights.com/v1/vitals", "vitals.vercel-insights.com"),
  ]);

  assertResolved(observations, "Cloudflare", "cdnjs", "infrastructure");
  assertResolved(observations, "DataTables", "DataTables CDN", "infrastructure");
  assertResolved(observations, "jQuery", "jQuery CDN", "infrastructure");
  assertResolved(observations, "OneTrust", "OneTrust CMP", "consent_management");
  assertResolved(observations, "LiveRamp", "LiveRamp Privacy Manager", "consent_management");
  assertResolved(observations, "Vercel", "Vercel Analytics", "analytics");
});

test("resolves Fable adtech and analytics host aliases", () => {
  const observations = resolveVendorObservations([
    request("https://ib.adnxs.com/getuid", "ib.adnxs.com"),
    request("https://ad.turn.com/r/call", "ad.turn.com"),
    request("https://prg.smartadserver.com/sync", "prg.smartadserver.com"),
    { type: "cookie", cookieName: "sync_cookie_csrf", hostname: ".mc.yandex.com" },
    request("https://hbxlp.media.net/pixel", "hbxlp.media.net"),
    request("https://match.sharethrough.com/sync", "match.sharethrough.com"),
    request("https://creativecdn.com/tags", "creativecdn.com"),
    request("https://tr.blismedia.com/pixel", "tr.blismedia.com"),
    request("https://ups.analytics.yahoo.com/ups/55912/sync", "ups.analytics.yahoo.com"),
    request("https://ak.sail-horizon.com/spm/spm.v1.min.js", "ak.sail-horizon.com"),
    request("https://www.lightboxcdn.com/creative.js", "www.lightboxcdn.com"),
    request("https://c.tvpixel.com/pixel", "c.tvpixel.com"),
    request("https://cd71891d94494d13b6b2adab650716f6.mediatailor.us-west-2.amazonaws.com/v1/manifest", "cd71891d94494d13b6b2adab650716f6.mediatailor.us-west-2.amazonaws.com"),
    request("https://efcad85fded269f462c434c4c5f84654a17d4a77.cws.conviva.com/0/wsg", "efcad85fded269f462c434c4c5f84654a17d4a77.cws.conviva.com"),
    request("https://jssdkcdns.mparticle.com/js/v2.js", "jssdkcdns.mparticle.com"),
    request("https://experiments.parsely.com/exp.js", "experiments.parsely.com"),
    request("https://static.chartbeat.com/js/chartbeat.js", "static.chartbeat.com"),
    request("https://user-sync.fwmrm.net/sync", "user-sync.fwmrm.net"),
    request("https://sync.bfmio.com/sync", "sync.bfmio.com"),
  ]);

  assertResolved(observations, "Xandr", "Xandr / AppNexus", "advertising");
  assertResolved(observations, "Amobee", "Turn", "advertising");
  assertResolved(observations, "Equativ", "Smart AdServer", "advertising");
  assertResolved(observations, "Yandex", "Yandex Ads", "advertising");
  assertResolved(observations, "Media.net", "Media.net", "advertising");
  assertResolved(observations, "Sharethrough", "Sharethrough", "advertising");
  assertResolved(observations, "RTB House", "RTB House", "advertising");
  assertResolved(observations, "Blis", "Blis", "advertising");
  assertResolved(observations, "Yahoo", "Yahoo Advertising", "advertising");
  assertResolved(observations, "Sailthru", "Sailthru", "advertising");
  assertResolved(observations, "Lightbox", "Lightbox", "advertising");
  assertResolved(observations, "Innovid", "TV Pixel", "advertising");
  assertResolved(observations, "AWS", "AWS MediaTailor", "advertising");
  assertResolved(observations, "Conviva", "Conviva", "analytics");
  assertResolved(observations, "mParticle", "mParticle", "analytics");
  assertResolved(observations, "Parse.ly", "Parse.ly", "analytics");
  assertResolved(observations, "Chartbeat", "Chartbeat", "analytics");
  assertResolved(observations, "FreeWheel", "FreeWheel", "advertising");
  assertResolved(observations, "Beachfront", "Beachfront", "advertising");
});

test("resolves extended Fable adtech host and cookie aliases", () => {
  const observations = resolveVendorObservations([
    request("https://tags.srv.stackadapt.com/events.js", "tags.srv.stackadapt.com"),
    { type: "cookie", cookieName: "IQPData", hostname: ".intentiq.com" },
    request("https://i.liadm.com/sync", "i.liadm.com"),
    { type: "cookie", cookieName: "novauid", hostname: ".novatiq.com" },
    request("https://sync.3lift.com/sync", "sync.3lift.com"),
    request("https://live.rezync.com/sync", "live.rezync.com"),
    request("https://bh.contextweb.com/pixel", "bh.contextweb.com"),
    request("https://pixel-sync.sitescout.com/sync", "pixel-sync.sitescout.com"),
    request("https://um.simpli.fi/sync", "um.simpli.fi"),
    request("https://sync.go.sonobi.com/sync", "sync.go.sonobi.com"),
    request("https://sync.teads.tv/sync", "sync.teads.tv"),
    request("https://ads.yieldmo.com/pixel", "ads.yieldmo.com"),
    request("https://static.ads-twitter.com/uwt.js", "static.ads-twitter.com"),
  ]);

  assertResolved(observations, "StackAdapt", "StackAdapt", "advertising");
  assertResolved(observations, "Intent IQ", "Intent IQ", "advertising");
  assertResolved(observations, "LiveIntent", "LiveIntent", "advertising");
  assertResolved(observations, "Novatiq", "Novatiq", "advertising");
  assertResolved(observations, "TripleLift", "TripleLift", "advertising");
  assertResolved(observations, "Zeta Global", "Zeta Global / Rezync", "advertising");
  assertResolved(observations, "PulsePoint", "PulsePoint / ContextWeb", "advertising");
  assertResolved(observations, "SiteScout", "SiteScout", "advertising");
  assertResolved(observations, "Simpli.fi", "Simpli.fi", "advertising");
  assertResolved(observations, "Sonobi", "Sonobi", "advertising");
  assertResolved(observations, "Teads", "Teads", "advertising");
  assertResolved(observations, "Yieldmo", "Yieldmo", "advertising");
  assertResolved(observations, "X", "Twitter / X Ads Pixel", "advertising");
});

test("resolves extended Fable functional asset and support host aliases", () => {
  const observations = resolveVendorObservations([
    request("https://widgets.media.sportradar.com/widget.js", "widgets.media.sportradar.com"),
    request("https://embed.trustmary.com/widget.js", "embed.trustmary.com"),
    request("https://use.typekit.net/abc.css", "use.typekit.net"),
    request("https://kit.fontawesome.com/abc.js", "kit.fontawesome.com"),
    request("https://maps.googleapis.com/maps/api/js", "maps.googleapis.com"),
    request("https://player.vimeo.com/video/123", "player.vimeo.com"),
    request("https://cdn.jwplayer.com/libraries/player.js", "cdn.jwplayer.com"),
    request("https://a40.usablenet.com/pt/accessibility.js", "a40.usablenet.com"),
    request("https://images.ctfassets.net/image.png", "images.ctfassets.net"),
    request("https://d15kdpgjg3unno.cloudfront.net/app.js", "d15kdpgjg3unno.cloudfront.net"),
    request("https://ajax.googleapis.com/ajax/libs/jquery/3.7.1/jquery.min.js", "ajax.googleapis.com"),
  ]);

  assertResolved(observations, "Sportradar", "Sportradar Widgets", "infrastructure");
  assertResolved(observations, "Trustmary", "Trustmary Reviews Widget", "customer_support");
  assertResolved(observations, "Adobe", "Adobe Fonts / Typekit", "infrastructure");
  assertResolved(observations, "Font Awesome", "Font Awesome Kit", "infrastructure");
  assertResolved(observations, "Google", "Google Maps / Places", "infrastructure");
  assertResolved(observations, "Vimeo", "Vimeo Player", "infrastructure");
  assertResolved(observations, "JW Player", "JW Player", "infrastructure");
  assertResolved(observations, "UsableNet", "UsableNet Accessibility", "infrastructure");
  assertResolved(observations, "Contentful", "Contentful Assets", "infrastructure");
  assertResolved(observations, "AWS", "CloudFront Distribution", "infrastructure");
  assertResolved(observations, "Google", "Google Hosted Libraries", "infrastructure");
});

test("does not turn generic static or low-confidence endpoints into vendor observations", () => {
  const observations = resolveVendorObservations([
    request("https://static.examplecdn.com/app.js", "static.examplecdn.com"),
    request("https://collector.example.net/collect?event=fixture", "collector.example.net"),
    request("https://www.google.com/collect?unknown=redacted", "www.google.com"),
    request("https://assets.thdstatic.com/core/app.js", "assets.thdstatic.com"),
    request("https://53.fs1.hubspotusercontent-na1.net/hubfs/file.js", "53.fs1.hubspotusercontent-na1.net"),
  ]);

  assert.equal(observations.length, 0);
});

function request(url: string, hostname: string) {
  return {
    type: "request" as const,
    url,
    hostname,
  };
}

function assertResolved(
  observations: ReturnType<typeof resolveVendorObservations>,
  vendor: string,
  product: string,
  purpose: string,
) {
  const observation = observations.find((item) => item.vendor === vendor && item.product === product);
  assert.ok(observation, `${vendor} ${product} should resolve`);
  assert.equal(observation.purpose, purpose);
  assert.equal(observation.confidence >= 0.9, true);
}
