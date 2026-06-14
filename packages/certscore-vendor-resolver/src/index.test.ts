import assert from "node:assert/strict";
import test from "node:test";
import { resolveEndpointGeography, resolveVendorObservations } from "./index.js";

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
  ]);

  assert.equal(observations[0]?.product, "Google Tag Manager");
  assert.equal(observations[0]?.purpose, "tag_management");
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
  assertResolved(observations, "BrightLine", "BrightLine", "advertising");
  assertResolved(observations, "DoubleVerify", "DoubleVerify", "advertising");
  assertResolved(observations, "LinkedIn", "LinkedIn Insight Tag", "advertising");
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
