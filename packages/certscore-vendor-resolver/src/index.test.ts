import assert from "node:assert/strict";
import test from "node:test";
import {
  buildUnknownVendorCandidateQueue,
  resolveCanonicalVendorLabel,
  resolveEndpointGeography,
  resolveVendorDisplayCategory,
  resolveVendorObservations,
} from "./index.js";

test("builds a bounded review queue from repeated unresolved third-party endpoints", () => {
  const queue = buildUnknownVendorCandidateQueue([
    {
      scanId: "scan-1",
      domainId: "site-1",
      source: "request",
      thirdParty: true,
      url: "https://cdn.example-vendor.net/sdk/123456789/session?email=person%40example.test",
      cookieNames: ["vendor_session"],
    },
    {
      scanId: "scan-2",
      domainId: "site-2",
      source: "script",
      thirdParty: true,
      url: "https://cdn.example-vendor.net/sdk/987654321/session?token=secret",
      cookieNames: ["vendor_session", "vendor_campaign"],
    },
    {
      scanId: "scan-3",
      domainId: "site-3",
      source: "request",
      thirdParty: true,
      url: "https://cdn.example-vendor.net/sdk/111222333/session#ignored",
    },
  ]);

  assert.equal(queue.candidates.length, 1);
  assert.deepEqual(queue.candidates[0], {
    candidateKey: "unknown-endpoint:cdn.example-vendor.net",
    hostname: "cdn.example-vendor.net",
    observationCount: 3,
    distinctScanCount: 3,
    distinctSiteCount: 3,
    distinctPathCount: 1,
    pathTemplates: ["/sdk/:id/session"],
    sampleEndpoints: ["https://cdn.example-vendor.net/sdk/:id/session"],
    cookieNames: ["vendor_campaign", "vendor_session"],
    sourceTypes: ["request", "script"],
    priorityScore: 25,
    recommendedAction: "deterministic_review",
    requiresOwnerResearch: true,
  });
});

test("does not create candidates from known, first-party, host-only, or lookalike observations", () => {
  const queue = buildUnknownVendorCandidateQueue([
    {
      scanId: "scan-known",
      domainId: "site-1",
      source: "script",
      thirdParty: true,
      url: "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js",
    },
    {
      scanId: "scan-first-party",
      domainId: "site-2",
      source: "request",
      thirdParty: false,
      url: "https://cdn.example-vendor.net/sdk.js",
    },
    {
      scanId: "scan-host-only",
      domainId: "site-3",
      source: "request",
      thirdParty: true,
      hostname: "cdn.example-vendor.net",
    },
    {
      scanId: "scan-lookalike",
      domainId: "site-4",
      source: "request",
      thirdParty: true,
      url: "https://not-example-vendor.net/sdk.js",
    },
  ]);

  assert.equal(queue.excluded.knownCanonical, 1);
  assert.equal(queue.excluded.invalidOrFirstParty, 1);
  assert.equal(queue.excluded.missingConcretePath, 1);
  assert.equal(queue.candidates.length, 1);
  assert.equal(queue.candidates[0]?.hostname, "not-example-vendor.net");
});

test("resolves the audited evidence-backed promotion batch with bounded paths", () => {
  const observations = resolveVendorObservations([
    request("https://cdn.parsely.com/keys/example.com/p.js", "cdn.parsely.com"),
    request("https://jssdkcdns.mparticle.com/js/v2/api-key/mparticle.js", "jssdkcdns.mparticle.com"),
    request("https://www.datadoghq-browser-agent.com/us1/v7/datadog-rum.js", "www.datadoghq-browser-agent.com"),
    request("https://vitals.vercel-insights.com/v1/vitals", "vitals.vercel-insights.com"),
    request("https://cdn.speedcurve.com/js/lux.js", "cdn.speedcurve.com"),
    request("https://fast.wistia.com/player.js", "fast.wistia.com"),
    request("https://cdn.flowplayer.com/releases/native/3/stable/flowplayer.min.js", "cdn.flowplayer.com"),
    request("https://siteimproveanalytics.com/js/siteanalyze_7340.js", "siteimproveanalytics.com"),
    request("https://j.6sc.co/6si.min.js", "j.6sc.co"),
    request("https://fast.fonts.net/cssapi/9b80e63b-ae4f-407f-90b5-08e4410e4341.css", "fast.fonts.net"),
    request("https://cdn.userway.org/widget.js", "cdn.userway.org"),
    request("https://stats.wp.com/w.js", "stats.wp.com"),
    request("https://c.tvpixel.com/js/current/dpm_pixel_min.js", "c.tvpixel.com"),
    request("https://experiments.parsely.com/vip-experiments.js", "experiments.parsely.com"),
    request("https://b281aa56-da9f-401b-a938-f111b0a96b5a.edge.permutive.app/b281aa56-da9f-401b-a938-f111b0a96b5a-web.js", "b281aa56-da9f-401b-a938-f111b0a96b5a.edge.permutive.app"),
    request("https://ka-p.fontawesome.com/releases/v6.7.2/css/pro.min.css", "ka-p.fontawesome.com"),
    request("https://c.clarity.ms/c.gif", "c.clarity.ms"),
    request("https://www.youtube.com/s/player/9fc68080/www-widgetapi.vflset/www-widgetapi.js", "www.youtube.com"),
  ]);

  assertResolved(observations, "Parse.ly", "Parse.ly Analytics", "analytics");
  assertResolved(observations, "mParticle", "mParticle Web SDK", "analytics");
  assertResolved(observations, "Datadog", "Datadog RUM", "performance_monitoring");
  assertResolved(observations, "Vercel", "Vercel Speed Insights", "performance_monitoring");
  assertResolved(observations, "SpeedCurve", "SpeedCurve LUX RUM", "performance_monitoring");
  assertResolved(observations, "Wistia", "Wistia Embedded Player", "infrastructure");
  assertResolved(observations, "Flowplayer", "Flowplayer Native", "infrastructure");
  assertResolved(observations, "Siteimprove", "Siteimprove Analytics", "analytics");
  assertResolved(observations, "6sense", "6sense WebTag", "analytics");
  assertResolved(observations, "Monotype", "Monotype Web Fonts", "infrastructure");
  assertResolved(observations, "UserWay", "UserWay Accessibility Widget", "infrastructure");
  assertResolved(observations, "WordPress.com", "Jetpack Stats", "analytics");
  assertResolved(observations, "LiveRamp", "Data Plus Math / LiveRamp", "advertising");
  assertResolved(observations, "Permutive", "Permutive", "advertising");
  assertResolved(observations, "Font Awesome", "Font Awesome Kits CDN", "infrastructure");
  assertResolved(observations, "Microsoft", "Microsoft Clarity", "session_replay");
  assertResolved(observations, "YouTube", "YouTube Embedded Player", "infrastructure");

  const lookalikes = resolveVendorObservations([
    request("https://cdn.parsely.example/keys/example.com/p.js", "cdn.parsely.example"),
    request("https://jssdkcdns.mparticle.example/js/v2/key/mparticle.js", "jssdkcdns.mparticle.example"),
    request("https://www.datadoghq-browser-agent.example/us1/v7/datadog-rum.js", "www.datadoghq-browser-agent.example"),
    request("https://vitals.vercel-insights.example/v1/vitals", "vitals.vercel-insights.example"),
    request("https://cdn.speedcurve.example/js/lux.js", "cdn.speedcurve.example"),
    request("https://fast.wistia.example/player.js", "fast.wistia.example"),
    request("https://cdn.flowplayer.example/releases/native/3/stable/flowplayer.min.js", "cdn.flowplayer.example"),
    request("https://siteimproveanalytics.example/js/siteanalyze_7340.js", "siteimproveanalytics.example"),
    request("https://j.6sc.example/6si.min.js", "j.6sc.example"),
    request("https://fast.fonts.example/cssapi/9b80e63b-ae4f-407f-90b5-08e4410e4341.css", "fast.fonts.example"),
    request("https://cdn.userway.example/widget.js", "cdn.userway.example"),
    request("https://stats.wp.example/w.js", "stats.wp.example"),
    request("https://c.tvpixel.example/js/current/dpm_pixel_min.js", "c.tvpixel.example"),
    request("https://experiments.parsely.example/vip-experiments.js", "experiments.parsely.example"),
    request("https://b281aa56-da9f-401b-a938-f111b0a96b5a.edge.permutive.example/b281aa56-da9f-401b-a938-f111b0a96b5a-web.js", "b281aa56-da9f-401b-a938-f111b0a96b5a.edge.permutive.example"),
    request("https://ka-p.fontawesome.example/releases/v6.7.2/css/pro.min.css", "ka-p.fontawesome.example"),
    request("https://c.clarity.example/c.gif", "c.clarity.example"),
  ]);
  assert.equal(lookalikes.some((item) => ["Parse.ly", "mParticle", "Datadog", "Microsoft", "Vercel", "SpeedCurve", "Wistia", "Flowplayer", "Siteimprove", "6sense", "Monotype", "UserWay", "WordPress.com", "LiveRamp", "Permutive", "Font Awesome"].includes(item.vendor)), false);
});

test("keeps the Wave 8 batch path-specific on known vendor hosts", () => {
  const observations = resolveVendorObservations([
    request("https://cdn.speedcurve.com/ordinary.js", "cdn.speedcurve.com"),
    request("https://fast.wistia.com/ordinary.js", "fast.wistia.com"),
    request("https://cdn.flowplayer.com/ordinary.js", "cdn.flowplayer.com"),
    request("https://siteimproveanalytics.com/js/ordinary.js", "siteimproveanalytics.com"),
    request("https://j.6sc.co/ordinary.js", "j.6sc.co"),
    request("https://fast.fonts.net/ordinary.css", "fast.fonts.net"),
    request("https://cdn.userway.org/ordinary.js", "cdn.userway.org"),
    request("https://stats.wp.com/ordinary.js", "stats.wp.com"),
    request("https://c.tvpixel.com/ordinary.js", "c.tvpixel.com"),
    request("https://experiments.parsely.com/ordinary.js", "experiments.parsely.com"),
    request("https://b281aa56-da9f-401b-a938-f111b0a96b5a.edge.permutive.app/ordinary.js", "b281aa56-da9f-401b-a938-f111b0a96b5a.edge.permutive.app"),
    request("https://ka-p.fontawesome.com/ordinary.css", "ka-p.fontawesome.com"),
  ]);

  assert.equal(
    observations.some((item) => ["SpeedCurve", "Wistia", "Flowplayer", "Siteimprove", "6sense", "Monotype", "UserWay", "WordPress.com", "LiveRamp", "Parse.ly", "Permutive", "Font Awesome"].includes(item.vendor)),
    false,
  );
});

test("resolves the Wave 9 production-evidence batch with product-specific paths", () => {
  const observations = resolveVendorObservations([
    request("https://maps.googleapis.com/maps-api-v3/api/js/65/3b/map.js", "maps.googleapis.com"),
    request("https://cdn.datatables.net/responsive/2.3.0/js/dataTables.responsive.min.js", "cdn.datatables.net"),
    request("https://digicert.my.salesforce-scrt.com/embeddedservice/v1/embedded-service-config?orgId=00D", "digicert.my.salesforce-scrt.com"),
    request("https://cdn.prod.website-files.com/65b90d1af46270f1b1f04719/css/certscore.webflow.css", "cdn.prod.website-files.com"),
    request("https://widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js", "widget.trustpilot.com"),
    request("https://a.quora.com/qevents.js", "a.quora.com"),
    request("https://nexus.ensighten.com/symantec/avg/Bootstrap.js", "nexus.ensighten.com"),
    request("https://static.trafficjunky.com/invocation/idsync/production/idsync.min.js", "static.trafficjunky.com"),
    request("https://ads.blogherads.com/static/blogherads.js", "ads.blogherads.com"),
    request("https://cse.google.com/cse/cse.js", "cse.google.com"),
    request("https://f.vimeocdn.com/p/4.46.51/js/player.module.js", "f.vimeocdn.com"),
    request("https://api.userway.org/api/v1/tunings/9ikoIUc0o1", "api.userway.org"),
    request("https://js.hsforms.net/forms/embed/v2.js", "js.hsforms.net"),
    request("https://s7d2.scene7.com/is/image/Caterpillar/CM20240618-abfa9-78951", "s7d2.scene7.com"),
    request("https://geo.captcha-delivery.com/captcha", "geo.captcha-delivery.com"),
  ]);

  assertResolved(observations, "Google", "Google Maps JavaScript API", "infrastructure");
  assertResolved(observations, "DataTables", "DataTables CDN", "infrastructure");
  assertResolved(observations, "Salesforce", "Salesforce Messaging for In-App and Web", "customer_support");
  assertResolved(observations, "Webflow", "Webflow Hosted Assets", "infrastructure");
  assertResolved(observations, "Trustpilot", "Trustpilot TrustBox", "infrastructure");
  assertResolved(observations, "Quora", "Quora Pixel", "advertising");
  assertResolved(observations, "Ensighten", "Ensighten Manage", "tag_management");
  assertResolved(observations, "TrafficJunky", "TrafficJunky Advertising", "advertising");
  assertResolved(observations, "SHE Media", "BlogHer Ads", "advertising");
  assertResolved(observations, "Google", "Google Programmable Search Engine", "infrastructure");
  assertResolved(observations, "Vimeo", "Vimeo Embedded Player", "infrastructure");
  assertResolved(observations, "UserWay", "UserWay Accessibility Widget", "infrastructure");
  assertResolved(observations, "HubSpot", "HubSpot Forms", "analytics");
  assertResolved(observations, "Adobe", "Adobe Dynamic Media / Scene7", "infrastructure");
  assertResolved(observations, "DataDome", "DataDome Challenge", "security");
});

test("rejects Wave 9 lookalikes and unrelated paths on vendor-controlled hosts", () => {
  const observations = resolveVendorObservations([
    request("https://maps.googleapis.com/ordinary.js", "maps.googleapis.com"),
    request("https://cdn.datatables.net/ordinary.js", "cdn.datatables.net"),
    request("https://digicert.my.salesforce-scrt.com/ordinary.json", "digicert.my.salesforce-scrt.com"),
    request("https://cdn.prod.website-files.com/ordinary.js", "cdn.prod.website-files.com"),
    request("https://widget.trustpilot.com/ordinary.js", "widget.trustpilot.com"),
    request("https://a.quora.com/ordinary.js", "a.quora.com"),
    request("https://nexus.ensighten.com/ordinary.js", "nexus.ensighten.com"),
    request("https://static.trafficjunky.com/ordinary.js", "static.trafficjunky.com"),
    request("https://ads.blogherads.com/ordinary.js", "ads.blogherads.com"),
    request("https://cse.google.com/ordinary.js", "cse.google.com"),
    request("https://f.vimeocdn.com/ordinary.js", "f.vimeocdn.com"),
    request("https://api.userway.org/ordinary.json", "api.userway.org"),
    request("https://js.hsforms.net/ordinary.js", "js.hsforms.net"),
    request("https://s7d2.scene7.com/ordinary/image.jpg", "s7d2.scene7.com"),
    request("https://geo.captcha-delivery.com/ordinary", "geo.captcha-delivery.com"),
    request("https://maps.googleapis.example/maps-api-v3/api/js/65/3b/map.js", "maps.googleapis.example"),
    request("https://widget.trustpilot.example/bootstrap/v5/tp.widget.bootstrap.min.js", "widget.trustpilot.example"),
    request("https://a.quora.example/qevents.js", "a.quora.example"),
  ]);

  const wave9Products = new Set([
    "Google Maps JavaScript API",
    "DataTables CDN",
    "Salesforce Messaging for In-App and Web",
    "Webflow Hosted Assets",
    "Trustpilot TrustBox",
    "Quora Pixel",
    "Ensighten Manage",
    "TrafficJunky Advertising",
    "BlogHer Ads",
    "Google Programmable Search Engine",
    "Vimeo Embedded Player",
    "UserWay Accessibility Widget",
    "HubSpot Forms",
    "Adobe Dynamic Media / Scene7",
    "DataDome Challenge",
  ]);
  assert.equal(observations.some((item) => wave9Products.has(item.product ?? "")), false);
});

test("resolves the Wave 10 actionable production clusters with bounded product paths", () => {
  const cases = [
    ["https://transcend-cdn.com/cm/abc123/translations/en.json", "transcend-cdn.com", "Transcend", "Transcend Consent Management", "consent_management"],
    ["https://cdn.confiant-integrations.net/gptprebidnative/client1/wrap.js", "cdn.confiant-integrations.net", "Confiant", "Confiant Ad Security", "security"],
    ["https://activate.platform.californiatimes.com/caltimes/latimes/code/a50375d7f0dad7a894d2ee32c92420bb.js", "activate.platform.californiatimes.com", "Ensighten", "Ensighten Manage", "tag_management"],
    ["https://maps.googleapis.com/maps/api/mapsjs/gen_204", "maps.googleapis.com", "Google", "Google Maps JavaScript API", "infrastructure"],
    ["https://cdn.userway.org/widgetapp/2026-05-12-14-26-48/locales/en-US.json", "cdn.userway.org", "UserWay", "UserWay Accessibility Widget", "infrastructure"],
    ["https://mc.yandex.com/counter_123", "mc.yandex.com", "Yandex", "Yandex Metrica", "analytics"],
    ["https://mc.webvisor.org/metrika/tag.js", "mc.webvisor.org", "Yandex", "Yandex Metrica", "analytics"],
    ["https://cdn.flowplayer.com/releases/native/3/stable/plugins/ga4.min.js", "cdn.flowplayer.com", "Flowplayer", "Flowplayer Native", "infrastructure"],
    ["https://cdn-cookieyes.com/client_data/site_123/script.js", "cdn-cookieyes.com", "CookieYes", "CookieYes CMP", "consent_management"],
    ["https://js.hubspot.com/web-interactives-embed.js", "js.hubspot.com", "HubSpot", "HubSpot Web Interactives", "analytics"],
    ["https://no-cache.hubspot.com/cta/default/portal_123/abc_123", "no-cache.hubspot.com", "HubSpot", "HubSpot Calls to Action", "analytics"],
    ["https://api.hubspot.com/livechat-public/v1/message", "api.hubspot.com", "HubSpot", "HubSpot Live Chat", "customer_support"],
    ["https://track.hubspot.com/__ptq.gif", "track.hubspot.com", "HubSpot", "HubSpot Analytics", "analytics"],
    ["https://fast.wistia.net/embed/medias/abc123.jsonp", "fast.wistia.net", "Wistia", "Wistia Embedded Player", "infrastructure"],
    ["https://use.fontawesome.com/releases/v6.7.2/css/all.css", "use.fontawesome.com", "Font Awesome", "Font Awesome Kits CDN", "infrastructure"],
    ["https://cmp.inmobi.com/choice/site123/example.com/choice.js", "cmp.inmobi.com", "InMobi", "InMobi Choice CMP", "consent_management"],
    ["https://fundingchoicesmessages.google.com/el/AGSKWxUNdpheKsY5xs_vwECyUYKt4WQ9RcjaJOWJ-D7Wh3i9xdhOvtGJvUH7V5pyPU-9qhX8ydX8CsBbYIw6NrLo6KQBGdOqJqBafNC7jJqoGHLbprtog9XfvixkIeaTlZwmZvINeKYgtA==", "fundingchoicesmessages.google.com", "Google", "Google Funding Choices CMP", "consent_management"],
    ["https://c.marsflag.com/search/app.css", "c.marsflag.com", "MarsFlag", "MarsFlag Site Search", "analytics"],
    ["https://cdn.membrana.media/scripts/header.js", "cdn.membrana.media", "Membrana Media", "Membrana Media Monetization", "advertising"],
    ["https://cdn.pdst.fm/ping.min.js", "cdn.pdst.fm", "Podscribe", "Podscribe Attribution", "analytics"],
    ["https://collector-21641.us.tvsquared.com/tv2track.js", "collector-21641.us.tvsquared.com", "TVSquared", "TVSquared Attribution", "advertising"],
    ["https://znbab-cemgsa.gov1.siteintercept.qualtrics.com/SIE/?Q_ZID=abc", "znbab-cemgsa.gov1.siteintercept.qualtrics.com", "Qualtrics", "Qualtrics Site Intercept", "analytics"],
    ["https://browser.sentry-cdn.com/8.20.0/bundle.tracing.min.js", "browser.sentry-cdn.com", "Sentry", "Sentry Browser SDK", "performance_monitoring"],
    ["https://www.queryly.com/js/queryly.v4.min.js", "www.queryly.com", "Queryly", "Queryly Site Search", "analytics"],
    ["https://munchkin.marketo.net/154/munchkin.js", "munchkin.marketo.net", "Adobe", "Adobe Marketo Engage Munchkin", "analytics"],
    ["https://try.abtasty.com/site123/main.885dc01482134b4f656c.js", "try.abtasty.com", "AB Tasty", "AB Tasty Experimentation", "analytics"],
    ["https://c.amazon-adsystem.com/aax2/apstag.js", "c.amazon-adsystem.com", "Amazon", "Amazon Publisher Services", "advertising"],
    ["https://counter.yadro.ru/hit_championat_com", "counter.yadro.ru", "LiveInternet", "LiveInternet Analytics Counter", "analytics"],
    ["https://pixel.wp.com/g.gif", "pixel.wp.com", "WordPress.com", "Jetpack Stats", "analytics"],
    ["https://cdn.intellimize.co/snippet/site_123.js", "cdn.intellimize.co", "Intellimize", "Intellimize Personalization", "analytics"],
    ["https://cookie-cdn.cookiepro.com/scripttemplates/202604.1.0/otBannerSdk.js", "cookie-cdn.cookiepro.com", "OneTrust", "OneTrust CMP", "consent_management"],
    ["https://tagan.adlightning.com/buzzfeed/op.js", "tagan.adlightning.com", "Ad Lightning", "Ad Lightning Ad Quality", "security"],
    ["https://cdn.ketchjs.com/ketchtag/stable/v2.12/ketch-sdk.js", "cdn.ketchjs.com", "Ketch", "Ketch CMP", "consent_management"],
  ] as const;

  for (const [url, hostname, vendor, product, purpose] of cases) {
    assertResolved(resolveVendorObservations([request(url, hostname)]), vendor, product, purpose);
  }
});

test("rejects Wave 10 lookalikes, shared infrastructure, and unrelated vendor-host paths", () => {
  const observations = resolveVendorObservations([
    request("https://cdn.confiant-integrations.net/ordinary.js", "cdn.confiant-integrations.net"),
    request("https://activate.platform.californiatimes.com/ordinary.js", "activate.platform.californiatimes.com"),
    request("https://maps.googleapis.com/ordinary.js", "maps.googleapis.com"),
    request("https://mc.yandex.com/ordinary.js", "mc.yandex.com"),
    request("https://api.hubspot.com/crm/v3/objects", "api.hubspot.com"),
    request("https://cmp.inmobi.com/ordinary.js", "cmp.inmobi.com"),
    request("https://challenges.cloudflare.com/turnstile/v0/api.js", "challenges.cloudflare.com"),
    request("https://cdn.membrana.media/image.jpg", "cdn.membrana.media"),
    request("https://app.hubspot.com/content-tools/menu", "app.hubspot.com"),
    request("https://53.fs1.hubspotusercontent-na1.net/hubfs/image.png", "53.fs1.hubspotusercontent-na1.net"),
    request("https://cdn.confiant-integrations.example/client/gpt_and_prebid/config.js", "cdn.confiant-integrations.example"),
    request("https://browser.sentry-cdn.example/8.20.0/bundle.min.js", "browser.sentry-cdn.example"),
    request("https://cdn.ketchjs.com/assets/logo.svg", "cdn.ketchjs.com"),
  ]);

  const wave10Products = new Set([
    "Confiant Ad Security", "Ensighten Manage", "Google Maps JavaScript API", "Yandex Metrica",
    "HubSpot Live Chat", "InMobi Choice CMP", "Membrana Media Monetization", "Sentry Browser SDK", "Ketch CMP",
  ]);
  assert.equal(observations.some((item) => wave10Products.has(item.product ?? "")), false);
});

test("resolves the Wave 11 residual production batch without collapsing product identities", () => {
  const cases = [
    ["https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/flow/ov1", "challenges.cloudflare.com", "Cloudflare", "Cloudflare Challenge Platform", "security"],
    ["https://sdk.privacy-center.org/public_key/loader.js", "sdk.privacy-center.org", "Didomi", "Didomi CMP", "consent_management"],
    ["https://sdk.privacy-center.org/sdk/abc123/modern/sdk.abc123.js", "sdk.privacy-center.org", "Didomi", "Didomi CMP", "consent_management"],
    ["https://ajax.googleapis.com/ajax/libs/jquery/3.7.1/jquery.min.js", "ajax.googleapis.com", "Google", "Google Hosted Libraries", "infrastructure"],
    ["https://code.jquery.com/jquery-3.7.1.min.js", "code.jquery.com", "jQuery", "jQuery CDN", "infrastructure"],
    ["https://code.jquery.com/ui/1.13.2/themes/base/jquery-ui.css", "code.jquery.com", "jQuery", "jQuery CDN", "infrastructure"],
    ["https://c.bing.com/c.gif?ctsa=mr", "c.bing.com", "Microsoft", "Microsoft Identity Synchronization", "advertising"],
    ["https://www.google.com/adsense/domains/caf.js", "www.google.com", "Google", "Google AdSense", "advertising"],
    ["https://no-cache.hubspot.com/cta/default/portal.123/config.abc.js", "no-cache.hubspot.com", "HubSpot", "HubSpot Calls to Action", "analytics"],
    ["https://js.hscollectedforms.net/collectedforms.js", "js.hscollectedforms.net", "HubSpot", "HubSpot Forms", "analytics"],
    ["https://forms-na1.hsforms.com/embed/v3/counters.gif", "forms-na1.hsforms.com", "HubSpot", "HubSpot Forms", "analytics"],
    ["https://try.abtasty.com/shared/commons.32b0810ba1fc402d09de.js", "try.abtasty.com", "AB Tasty", "AB Tasty Experimentation", "analytics"],
  ] as const;

  for (const [url, hostname, vendor, product, purpose] of cases) {
    assertResolved(resolveVendorObservations([request(url, hostname)]), vendor, product, purpose);
  }
});

test("rejects Wave 11 lookalikes and unrelated paths on the same service hosts", () => {
  const observations = resolveVendorObservations([
    request("https://challenges.cloudflare.com/ordinary.js", "challenges.cloudflare.com"),
    request("https://sdk.privacy-center.org/logo.svg", "sdk.privacy-center.org"),
    request("https://ajax.googleapis.com/ordinary.js", "ajax.googleapis.com"),
    request("https://code.jquery.com/ordinary.js", "code.jquery.com"),
    request("https://c.bing.com/search", "c.bing.com"),
    request("https://www.google.com/adsense/help", "www.google.com"),
    request("https://no-cache.hubspot.com/image.png", "no-cache.hubspot.com"),
    request("https://js.hscollectedforms.net/ordinary.js", "js.hscollectedforms.net"),
    request("https://forms-na1.hsforms.com/embed/v3/ordinary.gif", "forms-na1.hsforms.com"),
    request("https://try.abtasty.com/shared/logo.svg", "try.abtasty.com"),
  ]);

  const wave11Products = new Set([
    "Cloudflare Challenge Platform",
    "Didomi CMP",
    "Google Hosted Libraries",
    "jQuery CDN",
    "Microsoft Identity Synchronization",
    "Google AdSense",
    "HubSpot Calls to Action",
    "HubSpot Forms",
    "AB Tasty Experimentation",
  ]);
  assert.equal(observations.some((item) => wave11Products.has(item.product ?? "")), false);
});

test("resolves canonical product labels and apex vendor host labels conservatively", () => {
  assert.deepEqual(
    [
      resolveCanonicalVendorLabel("Adobe Audience Manager / Experience Cloud"),
      resolveCanonicalVendorLabel("Akamai mPulse"),
      resolveCanonicalVendorLabel("Amazon Ads"),
      resolveCanonicalVendorLabel("taboola.com"),
    ].map((resolution) => [resolution?.product, resolution?.purpose, resolution?.displayCategory]),
    [
      ["Adobe Audience Manager / Experience Cloud", "advertising", "Advertising"],
      ["Akamai mPulse", "performance_monitoring", "Performance monitoring"],
      ["Amazon Ads", "advertising", "Advertising"],
      ["Taboola", "advertising", "Advertising"],
    ],
  );
  assert.equal(resolveCanonicalVendorLabel("Adobe"), null);

  const apexObservation = resolveVendorObservations([{ type: "request", hostname: "taboola.com" }]);
  assertResolved(apexObservation, "Taboola", "Taboola", "advertising");
});

test("reconciles production product aliases to existing canonical identities", () => {
  assert.deepEqual(
    [
      resolveCanonicalVendorLabel("Google Ads"),
      resolveCanonicalVendorLabel("Adobe Analytics"),
      resolveCanonicalVendorLabel("DoubleClick / Floodlight"),
      resolveCanonicalVendorLabel("Scorecard Research"),
      resolveCanonicalVendorLabel("Snapchat Pixel"),
    ].map((resolution) => [resolution?.vendor, resolution?.product]),
    [
      ["Google", "Google Ads / DoubleClick"],
      ["Adobe", "Adobe Analytics / Experience Cloud"],
      ["Google", "DoubleClick Floodlight"],
      ["ScorecardResearch / Comscore", "ScorecardResearch"],
      ["Snap", "Snap Pixel"],
    ],
  );
});

test("resolves deterministic production-discovered vendor endpoints", () => {
  const observations = resolveVendorObservations([
    { type: "request", hostname: "tags.tiqcdn.com" },
    { type: "request", hostname: "api.id5-sync.com" },
    { type: "request", hostname: "b-code.liadm.com" },
    { type: "request", hostname: "sync.srv.stackadapt.com" },
    { type: "request", hostname: "contextual.media.net" },
    { type: "request", hostname: "js.appboycdn.com" },
    { type: "request", hostname: "t.contentsquare.net" },
    { type: "request", hostname: "cdn.quantummetric.com" },
  ]);

  for (const [vendor, product, purpose] of [
    ["Tealium", "Tealium iQ Tag Management", "tag_management"],
    ["ID5", "ID5 Identity", "advertising"],
    ["LiveIntent", "LiveIntent", "advertising"],
    ["StackAdapt", "StackAdapt", "advertising"],
    ["Media.net", "Media.net", "advertising"],
    ["Braze", "Braze", "analytics"],
    ["Contentsquare", "Contentsquare", "session_replay"],
    ["Quantum Metric", "Quantum Metric", "session_replay"],
  ] as const) {
    assertResolved(observations, vendor, product, purpose);
  }
});

test("does not promote lookalike hosts for newly added vendor rules", () => {
  const observations = resolveVendorObservations([
    { type: "request", hostname: "tiqcdn.com.example.test" },
    { type: "request", hostname: "not-id5-sync.com" },
    { type: "request", hostname: "media.net.example.test" },
    { type: "request", hostname: "not-quantummetric.com" },
  ]);

  assert.equal(observations.some((item) => ["Tealium", "ID5", "Media.net", "Quantum Metric"].includes(item.vendor)), false);
});

test("resolves the second production-discovered vendor wave", () => {
  const observations = resolveVendorObservations([
    { type: "request", url: "https://bat.bing.com/action/0" },
    { type: "request", url: "https://c.aps.amazon-adsystem.com/aps/prebid" },
    { type: "request", url: "https://ib.adnxs.com/getuid" },
    { type: "request", url: "https://eb2.3lift.com/sync" },
    { type: "request", url: "https://user-sync.fwmrm.net/sync" },
    { type: "request", url: "https://sync.teads.tv/sync" },
    { type: "request", url: "https://mc.yandex.com/metrika" },
  ]);

  for (const [vendor, product, purpose] of [
    ["Microsoft", "Microsoft Advertising / Bing UET", "advertising"],
    ["Amazon", "Amazon Publisher Services", "advertising"],
    ["Xandr", "Xandr / AppNexus", "advertising"],
    ["TripleLift", "TripleLift", "advertising"],
    ["FreeWheel", "FreeWheel", "advertising"],
    ["Teads", "Teads Video Advertising", "advertising"],
    ["Yandex", "Yandex Ads / Metrica", "advertising"],
  ] as const) {
    assertResolved(observations, vendor, product, purpose);
  }
});

test("keeps Amazon Publisher Services separate from generic Amazon Ads", () => {
  const observations = resolveVendorObservations([
    { type: "request", url: "https://c.aps.amazon-adsystem.com/aps/prebid" },
  ]);

  assertResolved(observations, "Amazon", "Amazon Publisher Services", "advertising");
  assert.equal(observations.some((item) => item.product === "Amazon Ads"), false);
});

test("does not classify unrelated Yandex hosts as advertising", () => {
  const observations = resolveVendorObservations([
    { type: "request", url: "https://www.yandex.com/unrelated" },
  ]);

  assert.equal(observations.some((item) => item.vendor === "Yandex"), false);
});

test("does not classify unrelated lookalike hosts as second-wave vendors", () => {
  const observations = resolveVendorObservations([
    { type: "request", url: "https://bat.bing.com.example.test/action/0" },
    { type: "request", url: "https://c.aps.amazon-adsystem.com.example.test/aps/prebid" },
    { type: "request", url: "https://ib.adnxs.com.example.test/getuid" },
    { type: "request", url: "https://eb2.3lift.com.example.test/sync" },
    { type: "request", url: "https://user-sync.fwmrm.net.example.test/sync" },
    { type: "request", url: "https://sync.teads.tv.example.test/sync" },
  ]);

  assert.equal(
    observations.some((item) => ["Microsoft", "Amazon", "Xandr", "TripleLift", "FreeWheel", "Teads"].includes(item.vendor)),
    false,
  );
});

test("resolves the first evidence-backed candidate promotion wave", () => {
  const observations = resolveVendorObservations([
    { type: "request", url: "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js", hostname: "cdn.onesignal.com" },
    { type: "request", url: "https://static.zdassets.com/ekr/snippet.js", hostname: "static.zdassets.com" },
    { type: "request", url: "https://cdn-gl.imrworldwide.com/cgi-bin/m", hostname: "cdn-gl.imrworldwide.com" },
    { type: "request", url: "https://static.chartbeat.com/chartbeat.js", hostname: "static.chartbeat.com" },
    { type: "request", url: "https://js.hcaptcha.com/1/api.js", hostname: "js.hcaptcha.com" },
    { type: "request", url: "https://kubiobuilder.matomo.cloud/matomo.js", hostname: "kubiobuilder.matomo.cloud" },
    { type: "request", url: "https://static.cloudflareinsights.com/beacon.min.js", hostname: "static.cloudflareinsights.com" },
    { type: "request", url: "https://challenges.cloudflare.com/turnstile/v0/api.js", hostname: "challenges.cloudflare.com" },
    { type: "request", url: "https://player.vimeo.com/video/123456789", hostname: "player.vimeo.com" },
    { type: "request", url: "https://js.qualified.com/qualified/widget.js", hostname: "js.qualified.com" },
  ]);

  for (const [vendor, product, purpose] of [
    ["OneSignal", "OneSignal Web Push", "advertising"],
    ["Zendesk", "Zendesk Web Widget", "customer_support"],
    ["Nielsen", "Nielsen Digital Audience Measurement", "analytics"],
    ["Chartbeat", "Chartbeat Publisher Analytics", "analytics"],
    ["hCaptcha", "hCaptcha", "security"],
    ["Matomo", "Matomo Analytics", "analytics"],
    ["Cloudflare", "Cloudflare Web Analytics", "analytics"],
    ["Cloudflare", "Cloudflare Turnstile", "security"],
    ["Vimeo", "Vimeo Embedded Player", "infrastructure"],
    ["Qualified", "Qualified Conversational Marketing", "customer_support"],
  ] as const) {
    assertResolved(observations, vendor, product, purpose);
  }
});

test("keeps candidate promotion rules bounded and product-specific", () => {
  const observations = resolveVendorObservations([
    { type: "request", url: "https://www.zendesk.com/hc/en-us", hostname: "www.zendesk.com" },
    { type: "request", url: "https://publisher.example.test/ping", hostname: "publisher.example.test" },
    { type: "request", url: "https://collector.example.test/log", hostname: "collector.example.test" },
    { type: "request", url: "https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b", hostname: "challenges.cloudflare.com" },
    { type: "request", url: "https://player.vimeo.com/", hostname: "player.vimeo.com" },
    { type: "request", url: "https://cdn.onesignal.com/ordinary.js", hostname: "cdn.onesignal.com" },
  ]);

  assert.equal(observations.some((item) => item.vendor === "Zendesk"), false);
  assert.equal(observations.some((item) => item.vendor === "Chartbeat"), false);
  assert.equal(observations.some((item) => item.vendor === "Nielsen"), false);
  assert.equal(observations.some((item) => item.product === "Cloudflare Turnstile"), false);
  assert.equal(observations.some((item) => item.vendor === "Vimeo"), false);
  assert.equal(observations.some((item) => item.vendor === "OneSignal"), false);
});

test("resolves the web-evidence-supported second candidate promotion wave", () => {
  const observations = resolveVendorObservations([
    { type: "request", url: "https://www.youtube.com/embed/M7lc1UVf-VE", hostname: "www.youtube.com" },
    { type: "request", url: "https://fundingchoicesmessages.google.com/i/pub-123456", hostname: "fundingchoicesmessages.google.com" },
    { type: "request", url: "https://pi.pardot.com/pd.js", hostname: "pi.pardot.com" },
    { type: "request", url: "https://www.dwin1.com/1001.js", hostname: "www.dwin1.com" },
    { type: "request", url: "https://platform-api.sharethis.com/js/sharethis.js", hostname: "platform-api.sharethis.com" },
  ]);

  for (const [vendor, product, purpose] of [
    ["YouTube", "YouTube Embedded Player", "infrastructure"],
    ["Google", "Google Funding Choices CMP", "consent_management"],
    ["Salesforce", "Salesforce Account Engagement", "analytics"],
    ["AWIN", "AWIN Affiliate Tracking", "advertising"],
    ["ShareThis", "ShareThis Widgets", "analytics"],
  ] as const) {
    assertResolved(observations, vendor, product, purpose);
  }
});

test("keeps web-evidence-supported candidate rules narrow", () => {
  const observations = resolveVendorObservations([
    { type: "request", url: "https://www.youtube.com/watch?v=M7lc1UVf-VE", hostname: "www.youtube.com" },
    { type: "request", url: "https://fundingchoicesmessages.google.com/unrelated", hostname: "fundingchoicesmessages.google.com" },
    { type: "request", url: "https://example.pardot.com/pd.js", hostname: "example.pardot.com" },
    { type: "request", url: "https://www.dwin1.com/not-a-mastertag.js", hostname: "www.dwin1.com" },
    { type: "request", url: "https://sharethis.com/js/sharethis.js", hostname: "sharethis.com" },
  ]);

  assert.equal(observations.some((item) => item.product === "YouTube Embedded Player"), false);
  assert.equal(observations.some((item) => item.product === "Google Funding Choices CMP"), false);
  assert.equal(observations.some((item) => item.product === "Salesforce Account Engagement"), false);
  assert.equal(observations.some((item) => item.product === "AWIN Affiliate Tracking"), false);
  assert.equal(observations.some((item) => item.product === "ShareThis Widgets"), false);
});

test("resolves the media and product-analytics evidence wave", () => {
  const observations = resolveVendorObservations([
    { type: "request", url: "https://cdn.pendo.io/agent/static/abc123/pendo.js", hostname: "cdn.pendo.io" },
    { type: "request", url: "https://plausible.io/js/script.js", hostname: "plausible.io" },
    { type: "request", url: "https://kit.fontawesome.com/abc12345.js", hostname: "kit.fontawesome.com" },
    { type: "request", url: "https://res.cloudinary.com/demo/image/upload/sample.jpg", hostname: "res.cloudinary.com" },
    { type: "request", url: "https://cdn.jwplayer.com/libraries/ALJ3XQCI.js", hostname: "cdn.jwplayer.com" },
    { type: "request", url: "https://players.brightcove.net/1507807800001/H15p1gTkg_default/index.min.js", hostname: "players.brightcove.net" },
  ]);

  for (const [vendor, product, purpose] of [
    ["Pendo", "Pendo", "analytics"],
    ["Plausible", "Plausible Analytics", "analytics"],
    ["Font Awesome", "Font Awesome Kits CDN", "infrastructure"],
    ["Cloudinary", "Cloudinary Media CDN", "infrastructure"],
    ["JW Player", "JW Player", "infrastructure"],
    ["Brightcove", "Brightcove Player", "infrastructure"],
  ] as const) {
    assertResolved(observations, vendor, product, purpose);
  }

  assert.equal(observations.find((item) => item.vendor === "Pendo")?.purpose, "analytics");
  assert.equal(observations.find((item) => item.vendor === "Plausible")?.purpose, "analytics");
});

test("keeps media and analytics candidate rules bounded", () => {
  const observations = resolveVendorObservations([
    { type: "request", url: "https://cdn.pendo.io/agent/pendo.js", hostname: "cdn.pendo.io" },
    { type: "request", url: "https://plausible.io/ordinary.js", hostname: "plausible.io" },
    { type: "request", url: "https://use.fontawesome.com/releases/v6.0.0/js/all.js", hostname: "use.fontawesome.com" },
    { type: "request", url: "https://res.cloudinary.com/demo/ordinary/file.jpg", hostname: "res.cloudinary.com" },
    { type: "request", url: "https://cdn.jwplayer.com/libraries/short.js", hostname: "cdn.jwplayer.com" },
    { type: "request", url: "https://players.brightcove.net/1507807800001/H15p1gTkg_default/player.js", hostname: "players.brightcove.net" },
  ]);

  assert.equal(observations.some((item) => ["Pendo", "Plausible", "Font Awesome", "Cloudinary", "JW Player", "Brightcove"].includes(item.vendor)), false);
});

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

test("resolves publisher infrastructure and supported ownership domains canonically", () => {
  const observations = resolveVendorObservations([
    { type: "request", hostname: "a.bildstatic.de" },
    { type: "request", hostname: "squid.gazeta.pl" },
    { type: "request", hostname: "rp.pl" },
    { type: "request", hostname: "hit.gemius.pl" },
    { type: "cookie", cookieName: "smuuid" },
  ]);

  assertResolved(observations, "Axel Springer", "Axel Springer publisher infrastructure", "infrastructure");
  assertResolved(observations, "Agora", "Agora publisher infrastructure", "infrastructure");
  assertResolved(observations, "Gremi Media", "Gremi Media publisher infrastructure", "infrastructure");
  assertResolved(observations, "Gemius", "Gemius audience measurement", "analytics");
  assertResolved(observations, "Salesmanago", "Salesmanago marketing automation", "analytics");
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

test("classifies Google Analytics library endpoints as Google Analytics", () => {
  const observations = resolveVendorObservations([
    request("https://www.google-analytics.com/analytics.js", "www.google-analytics.com"),
  ]);

  assertResolved(observations, "Google", "Google Analytics", "analytics");
  assert.equal(observations.some((item) => /doubleclick/i.test(item.product)), false);
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

test("resolves Osano CMP endpoints as consent management", () => {
  const observations = resolveVendorObservations([
    request("https://cmp.osano.com/consent-manager/example/osano.js", "cmp.osano.com"),
    {
      type: "cmp_runtime",
      domSelector: ".osano-cm-window__dialog",
      hostname: "osano",
      matchSource: "dom_selector",
    },
  ]);

  assertResolved(observations, "Osano", "Osano CMP", "consent_management");
  const osano = observations.find((item) => item.product === "Osano CMP");
  assert.ok(osano);
  assert.equal(resolveVendorDisplayCategory(osano), "Cookie compliance");
  assert.equal(osano.matchedHostnames.includes("cmp.osano.com"), true);
  assert.equal(osano.matchedHostnames.includes("osano"), false);
  assert.equal(
    osano.matchSources.some((source) =>
      source.matchedField === "dom_selector" &&
      source.matchedValueRedacted === ".osano-cm-window__dialog"
    ),
    true,
  );
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
    {
      type: "script",
      url: "https://static.hotjar.com/c/hotjar-123456.js?sv=6",
      hostname: "static.hotjar.com",
    },
  ]);

  assertResolved(observations, "FullStory", "FullStory", "session_replay");
  assertResolved(observations, "Hotjar", "Hotjar", "session_replay");
  const hotjar = observations.find((item) => item.product === "Hotjar");
  assert.ok(hotjar);
  assert.equal(hotjar.matchedHostnames.includes("static.hotjar.com"), true);
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

test("classifies LinkedIn and ZoomInfo tracking even when Cloudflare utility cookies are written", () => {
  const observations = resolveVendorObservations([
    request("https://snap.licdn.com/li.lms-analytics/insight.min.js", "snap.licdn.com"),
    request("https://px.ads.linkedin.com/collect/?pid=123", "px.ads.linkedin.com"),
    request("https://ws.zoominfo.com/pixel/collect?company=example", "ws.zoominfo.com"),
    {
      type: "cookie",
      cookieName: "__cf_bm",
      hostname: "linkedin.com",
    },
    {
      type: "cookie",
      cookieName: "__cf_bm",
      hostname: "zoominfo.com",
    },
  ]);

  assertResolved(observations, "LinkedIn", "LinkedIn Insight Tag", "advertising");
  assertResolved(observations, "LinkedIn", "LinkedIn Ads Pixel", "advertising");
  assertResolved(observations, "ZoomInfo", "ZoomInfo WebSights", "analytics");

  const zoomInfo = observations.find((item) => item.product === "ZoomInfo WebSights");
  assert.ok(zoomInfo);
  assert.equal(resolveVendorDisplayCategory(zoomInfo), "Analytics");
  assert.equal(zoomInfo.regulatoryRelevance.includes("b2b_intent_data"), true);
  assert.equal(zoomInfo.matchedHostnames.includes("ws.zoominfo.com"), true);

  const cloudflare = observations.find((item) => item.product === "Cloudflare Bot Management");
  assert.ok(cloudflare);
  assert.equal(cloudflare.vendor, "Cloudflare");
  assert.equal(cloudflare.purpose, "security");
  assert.deepEqual(cloudflare.matchedHostnames, []);
  assert.deepEqual(cloudflare.matchedCookieNames, ["__cf_bm"]);
});

test("classifies Framer, YouTube image CDN, Statuspage, Intercom, and common CDN hosts without borrowing unrelated vendors", () => {
  const observations = resolveVendorObservations([
    request("https://events.framer.com/script?v=2", "events.framer.com"),
    request("https://i.ytimg.com/vi/example/hqdefault.jpg", "i.ytimg.com"),
    request("https://img.youtube.com/vi/example/hqdefault.jpg", "img.youtube.com"),
    request("https://cdn.statuspage.io/se-v2.js", "cdn.statuspage.io"),
    request("https://5b4dcn321xtp.statuspage.io/api/v2/status.json", "5b4dcn321xtp.statuspage.io"),
    request("https://js.intercomcdn.com/frame-modern.js", "js.intercomcdn.com"),
    request("https://cdnjs.cloudflare.com/ajax/libs/example/1.0.0/example.min.js", "cdnjs.cloudflare.com"),
    request("https://maxcdn.bootstrapcdn.com/bootstrap/4.0.0/css/bootstrap.min.css", "maxcdn.bootstrapcdn.com"),
    request("https://unpkg.com/react@18/umd/react.production.min.js", "unpkg.com"),
    request("https://static.tildacdn.com/css/tilda-grid-3.0.min.css", "static.tildacdn.com"),
    request("https://use.typekit.net/abcd123.css", "use.typekit.net"),
    request("https://d2pu3v2r6r77j3.cloudfront.net/app.js", "d2pu3v2r6r77j3.cloudfront.net"),
    request("https://framerusercontent.com/images/example.png", "framerusercontent.com"),
    request("https://a.sfdcstatic.com/shared/fonts/SalesforceSans-Regular.woff2", "a.sfdcstatic.com"),
  ]);

  assertResolved(observations, "Framer", "Framer Analytics", "analytics");
  assertResolved(observations, "YouTube", "YouTube Image CDN", "infrastructure");
  assertResolved(observations, "Atlassian Statuspage", "Statuspage", "infrastructure");
  assertResolved(observations, "Intercom", "Intercom Messenger", "customer_support");
  assertResolved(observations, "cdnjs", "cdnjs CDN", "infrastructure");
  assertResolved(observations, "BootstrapCDN", "BootstrapCDN", "infrastructure");
  assertResolved(observations, "unpkg", "unpkg CDN", "infrastructure");
  assertResolved(observations, "Tilda", "Tilda CDN", "infrastructure");
  assertResolved(observations, "Adobe", "Adobe Fonts / Typekit", "infrastructure");
  assertResolved(observations, "Amazon CloudFront", "CloudFront Distribution", "infrastructure");
  assertResolved(observations, "Framer", "Framer Static Assets", "infrastructure");
  assertResolved(observations, "Salesforce", "Salesforce Static Assets", "infrastructure");

  const framer = observations.find((item) => item.product === "Framer Analytics");
  assert.ok(framer);
  assert.notEqual(framer.vendor, "Google Fonts");
  assert.equal(resolveVendorDisplayCategory(framer), "Analytics");

  const youtube = observations.find((item) => item.product === "YouTube Image CDN");
  assert.ok(youtube);
  assert.equal(resolveVendorDisplayCategory(youtube), "CDN");
  assert.equal(youtube.matchedHostnames.includes("img.youtube.com"), true);
});

test("classifies Google reCAPTCHA as security runtime", () => {
  const observations = resolveVendorObservations([
    request("https://www.google.com/recaptcha/api.js?render=site-key", "www.google.com"),
    request("https://www.google.com/recaptcha/api2/anchor?k=site-key", "www.google.com"),
    request("https://www.google.com/recaptcha/api2/webworker.js", "www.google.com"),
  ]);

  assertResolved(observations, "Google", "Google reCAPTCHA", "security");
  const recaptcha = observations.find((item) => item.product === "Google reCAPTCHA");
  assert.ok(recaptcha);
  assert.equal(resolveVendorDisplayCategory(recaptcha), "Security");
  assert.equal(recaptcha.matchedHostnames.includes("www.google.com"), true);
});

test("keeps native ad hosts when generic cookie names also match exchange rules", () => {
  const observations = resolveVendorObservations([
    request("https://content.adriver.ru/cgi-bin/erle.cgi?sid=1", "content.adriver.ru"),
    request("https://yandex.com/ads/system/context.js", "yandex.com"),
    {
      type: "cookie",
      cookieName: "uid",
      hostname: "content.adriver.ru",
    },
    {
      type: "cookie",
      cookieName: "i",
      hostname: "yandex.com",
    },
  ]);

  assertResolved(observations, "AdRiver", "AdRiver", "advertising");
  assertResolved(observations, "Yandex", "Yandex Ads / Metrica", "advertising");

  const adriver = observations.find((item) => item.product === "AdRiver");
  assert.ok(adriver);
  assert.equal(adriver.matchedHostnames.includes("content.adriver.ru"), true);

  const yandex = observations.find((item) => item.product === "Yandex Ads / Metrica");
  assert.ok(yandex);
  assert.equal(yandex.matchedHostnames.includes("yandex.com"), true);

  const criteo = observations.find((item) => item.product === "Criteo");
  assert.ok(criteo);
  assert.deepEqual(criteo.matchedHostnames, []);
  assert.deepEqual(criteo.matchedCookieNames, ["uid"]);

  const openX = observations.find((item) => item.product === "OpenX");
  assert.ok(openX);
  assert.deepEqual(openX.matchedHostnames, []);
  assert.deepEqual(openX.matchedCookieNames, ["i"]);
});

test("classifies Contentful assets and VK Mail.ru ad endpoints", () => {
  const observations = resolveVendorObservations([
    request("https://images.ctfassets.net/site/image.png", "images.ctfassets.net"),
    request("https://top-fwz1.mail.ru/counter?id=123", "top-fwz1.mail.ru"),
  ]);

  assertResolved(observations, "Contentful", "Contentful Assets", "infrastructure");
  assertResolved(observations, "VK / Mail.ru", "VK / Mail.ru Ads", "advertising");

  const contentful = observations.find((item) => item.product === "Contentful Assets");
  assert.ok(contentful);
  assert.equal(resolveVendorDisplayCategory(contentful), "CDN");

  const mailRu = observations.find((item) => item.product === "VK / Mail.ru Ads");
  assert.ok(mailRu);
  assert.equal(resolveVendorDisplayCategory(mailRu), "Advertising");
});

test("does not attach cookie or storage identifiers as matched hostnames", () => {
  const observations = resolveVendorObservations([
    {
      type: "cookie",
      cookieName: "euconsent-v2",
      hostname: "qc005",
    },
    {
      type: "cmp_runtime",
      storageKey: "permutive-consent",
      hostname: "permutive-consent",
      matchSource: "storage_key",
    },
    {
      type: "cookie",
      cookieName: "didomi_token",
      hostname: "didomi",
    },
    {
      type: "cmp_runtime",
      storageKey: "iubenda",
      hostname: "iubenda",
      matchSource: "storage_key",
    },
  ]);

  const quantcastChoice = observations.find((item) => item.product === "Quantcast Choice CMP");
  assert.ok(quantcastChoice);
  assert.deepEqual(quantcastChoice.matchedHostnames, []);
  assert.equal(quantcastChoice.matchedCookieNames.includes("euconsent-v2"), true);

  const permutive = observations.find((item) => item.product === "Permutive");
  assert.ok(permutive);
  assert.deepEqual(permutive.matchedHostnames, []);

  const didomi = observations.find((item) => item.product === "Didomi CMP");
  assert.ok(didomi);
  assert.deepEqual(didomi.matchedHostnames, []);
  assert.equal(didomi.matchedCookieNames.includes("didomi_token"), true);

  const iubenda = observations.find((item) => item.product === "Iubenda CMP");
  assert.ok(iubenda);
  assert.deepEqual(iubenda.matchedHostnames, []);
});

test("classifies VWO and Claydar marketing analytics endpoints", () => {
  const observations = resolveVendorObservations([
    request("https://dev.visualwebsiteoptimizer.com/j.php?a=123", "dev.visualwebsiteoptimizer.com"),
    request("https://api.claydar.com/collect", "api.claydar.com"),
  ]);

  assertResolved(observations, "VWO", "Visual Website Optimizer", "analytics");
  assertResolved(observations, "Claydar", "Claydar", "analytics");
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
    request("https://m.stripe.network/inner.html#url=https%3A%2F%2Fexample.com", "m.stripe.network"),
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
  const cloudflare = observations.find((item) => item.product === "Cloudflare Bot Management");
  assert.ok(cloudflare);
  assert.deepEqual(cloudflare.matchedHostnames, []);
  assert.deepEqual(cloudflare.matchedCookieNames, ["__cf_bm"]);
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

test("classifies iZooto web-push runtime without letting Cloudflare cookies erase the vendor", () => {
  const observations = resolveVendorObservations([
    request("https://cdn.izooto.com/scripts/sdk/izooto.js", "cdn.izooto.com"),
    {
      type: "cookie",
      cookieName: "__cf_bm",
      hostname: "cdn.izooto.com",
    },
  ]);

  const izooto = observations.find((item) => item.vendor === "iZooto");
  assert.ok(izooto);
  assert.equal(izooto.product, "iZooto Web Push");
  assert.equal(izooto.purpose, "advertising");
  assert.equal(izooto.regulatoryRelevance.includes("push_notifications"), true);
  assert.equal(izooto.matchedHostnames.includes("cdn.izooto.com"), true);
  assert.equal(resolveVendorDisplayCategory(izooto), "Marketing automation");
  const cloudflare = observations.find((item) => item.product === "Cloudflare Bot Management");
  assert.ok(cloudflare);
  assert.equal(cloudflare.vendor, "Cloudflare");
  assert.equal(cloudflare.purpose, "security");
  assert.deepEqual(cloudflare.matchedHostnames, []);
  assert.deepEqual(cloudflare.matchedCookieNames, ["__cf_bm"]);
});

test("classifies X/Twitter widget runtime without letting Cloudflare cookies erase the vendor", () => {
  const observations = resolveVendorObservations([
    request("https://platform.twitter.com/widgets.js", "platform.twitter.com"),
    {
      type: "cookie",
      cookieName: "__cf_bm",
      hostname: "platform.twitter.com",
    },
  ]);

  const twitter = observations.find((item) => item.product === "X/Twitter Social Widgets");
  assert.ok(twitter);
  assert.equal(twitter.vendor, "X/Twitter");
  assert.equal(twitter.purpose, "advertising");
  assert.equal(twitter.regulatoryRelevance.includes("social_embed"), true);
  assert.equal(twitter.matchedHostnames.includes("platform.twitter.com"), true);
  assert.equal(resolveVendorDisplayCategory(twitter), "Advertising");
  const cloudflare = observations.find((item) => item.product === "Cloudflare Bot Management");
  assert.ok(cloudflare);
  assert.equal(cloudflare.vendor, "Cloudflare");
  assert.equal(cloudflare.purpose, "security");
  assert.deepEqual(cloudflare.matchedHostnames, []);
  assert.deepEqual(cloudflare.matchedCookieNames, ["__cf_bm"]);
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

test("resolves the 1600-scan deterministic residual batch", () => {
  const observations = resolveVendorObservations([
    request("https://challenges.cloudflare.com/turnstile/v0/b/1eec422858ff/api.js", "challenges.cloudflare.com"),
    request("https://www.youtube.com/youtubei/v1/log_event?alt=json", "www.youtube.com"),
    request("https://yastatic.net/partner-code-bundles/123456/5e626e9fda9bdbd6.js", "yastatic.net"),
    request("https://btloader.com/tag?o=5708166709903360", "btloader.com"),
    request("https://client.aps.amazon-adsystem.com/publisher.js", "client.aps.amazon-adsystem.com"),
    request("https://geo.captcha-delivery.com/captcha/", "geo.captcha-delivery.com"),
    request("https://kit.fontawesome.com/37926dae7e/v7/kit-upload.css", "kit.fontawesome.com"),
    request("https://ka-p.fontawesome.com/releases/v6.7.2/webfonts/pro-fa-brands-400-0.woff2", "ka-p.fontawesome.com"),
    request("https://s.adroll.com/j/CWX7J3OCSZHGVD5OVW7E4C/roundtrip.js", "s.adroll.com"),
    request("https://js.monitor.azure.com/scripts/b/ai.3.min.js", "js.monitor.azure.com"),
    request("https://cdn.gladly.com/assets/chat-sdk/apiBootstrap_5dfdda5e77ce983a.js", "cdn.gladly.com"),
    request("https://sdk.mrf.io/statics/marfeel-sdk.js?id=fixture", "sdk.mrf.io"),
    request("https://dap.digitalgov.gov/web-vitals/dist/web-vitals.attribution.iife.js", "dap.digitalgov.gov"),
    request("https://cd.connatix.com/connatix.player.js", "cd.connatix.com"),
  ]);

  for (const [vendor, product, purpose] of [
    ["Cloudflare", "Cloudflare Turnstile", "security"],
    ["YouTube", "YouTube Embedded Player", "infrastructure"],
    ["Yandex", "Yandex Advertising Network", "advertising"],
    ["Blockthrough", "Blockthrough Ad Recovery", "advertising"],
    ["Amazon", "Amazon Publisher Services", "advertising"],
    ["DataDome", "DataDome Challenge", "security"],
    ["Font Awesome", "Font Awesome Kits CDN", "infrastructure"],
    ["AdRoll", "AdRoll Pixel", "advertising"],
    ["Microsoft", "Azure Monitor Application Insights", "performance_monitoring"],
    ["Gladly", "Gladly Chat", "customer_support"],
    ["Marfeel", "Marfeel Analytics SDK", "analytics"],
    ["GSA", "Digital Analytics Program", "analytics"],
    ["Connatix", "Connatix Video Player", "advertising"],
  ] as const) {
    assertResolved(observations, vendor, product, purpose);
  }
});

test("keeps the 1600-scan residual rules product and path bounded", () => {
  const observations = resolveVendorObservations([
    request("https://challenges.cloudflare.com/turnstile/v0/unrelated.js", "challenges.cloudflare.com"),
    request("https://www.youtube.com/watch?v=fixture", "www.youtube.com"),
    request("https://yastatic.net/common/site.js", "yastatic.net"),
    request("https://btloader.com/", "btloader.com"),
    request("https://client.aps.amazon-adsystem.com/logo.svg", "client.aps.amazon-adsystem.com"),
    request("https://geo.captcha-delivery.com/assets/logo.svg", "geo.captcha-delivery.com"),
    request("https://kit.fontawesome.com/ordinary.css", "kit.fontawesome.com"),
    request("https://s.adroll.com/images/logo.svg", "s.adroll.com"),
    request("https://js.monitor.azure.com/scripts/app.js", "js.monitor.azure.com"),
    request("https://cdn.gladly.com/marketing/home.js", "cdn.gladly.com"),
    request("https://sdk.mrf.io/images/logo.svg", "sdk.mrf.io"),
    request("https://dap.digitalgov.gov/readme.txt", "dap.digitalgov.gov"),
    request("https://cd.connatix.com/logo.svg", "cd.connatix.com"),
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
