import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildPromotionGradePreconsentRequests,
  inferDirectEndpointVendorFromUrl
} from "./preconsent-public-evidence";

function row(input: {
  hostname: string;
  url: string;
  vendorName: string;
  vendorCategory?: string;
  firstSeenMs?: number;
  frameUrl?: string;
  finalUrl?: string;
  initiatorHost?: string;
  initiatorType?: string;
  initiatorUrl?: string;
  redirectChain?: string[];
  resourceType?: string;
}) {
  return {
    requestUrl: input.url,
    hostname: input.hostname,
    vendorName: input.vendorName,
    vendorCategory: input.vendorCategory ?? "advertising",
    essentiality: "non_essential",
    runtimePhase: "pre_consent",
    confidence: 0.95,
    collectionEndpointObserved: true,
    firstSeenMs: input.firstSeenMs ?? 10,
    firstPartyOrThirdParty: "third_party",
    ...(input.frameUrl ? { frameUrl: input.frameUrl } : {}),
    ...(input.finalUrl ? { finalUrl: input.finalUrl } : {}),
    ...(input.initiatorHost ? { initiatorHost: input.initiatorHost } : {}),
    ...(input.initiatorType ? { initiatorType: input.initiatorType } : {}),
    ...(input.initiatorUrl ? { initiatorUrl: input.initiatorUrl } : {}),
    ...(input.redirectChain ? { redirectChain: input.redirectChain } : {}),
    ...(input.resourceType ? { resourceType: input.resourceType } : {})
  };
}

test("preserves scanned page URL and tsMs while excluding library-only loads", () => {
  const common = {
    hostname: "api.segment.io",
    vendorName: "Segment",
    vendorCategory: "analytics",
    essentiality: "non_essential",
    runtimePhase: "pre_consent",
    confidence: 0.95,
    pageUrl: "https://www.example.test/",
    tsMs: 4321
  };
  const requests = buildPromotionGradePreconsentRequests({
    rows: [
      { ...common, requestUrl: "https://cdn.segment.com/analytics.js", classification: "library" },
      { ...common, requestUrl: "https://api.segment.io/v1/p", classification: "tracking", collectionEndpointObserved: true }
    ]
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.requestUrl, "https://api.segment.io/v1/p");
  assert.equal(requests[0]?.scannedPageUrl, "https://www.example.test/");
  assert.equal(requests[0]?.firstSeenMs, 4321);
});

test("sanitizes annotated request URLs while preserving bounded parameter names separately", () => {
  const observed = row({ hostname: "api.segment.io", vendorName: "Segment", vendorCategory: "analytics",
    url: "https://api.segment.io/v1/p?email=secret@example.test [query_redacted=true query_keys=email,client_id]" });
  const requests = buildPromotionGradePreconsentRequests({ rows: [observed] });
  assert.equal(requests[0]?.requestUrl, "https://api.segment.io/v1/p?redacted=1");
  assert.deepEqual(requests[0]?.queryKeysSample, ["email", "client_id"]);
  assert.doesNotMatch(JSON.stringify(requests), /secret@example|%20%5B|query_redacted/);
  assert.deepEqual(buildPromotionGradePreconsentRequests({ rows: [{ ...observed, collectionEndpointObserved: false }] }), [],
    "parameter names alone do not establish the required collection evidence");
});

test("Amazon CDN timing cannot become Amazon Ads tracking timing", () => {
  const requests = buildPromotionGradePreconsentRequests({
    scannedPageUrl: "https://www.amazon.de/",
    rows: [
      {
        category: "infrastructure",
        classification: "service",
        confidence: 0.99,
        entityRelationship: "same_entity",
        essentiality: "essential",
        hostname: "m.media-amazon.com",
        relationshipBasis: "canonical_entity_registry",
        requestUrl: "https://m.media-amazon.com/images/example.jpg",
        runtimePhase: "pre_consent",
        siteRelationship: "cross_site",
        tsMs: 4_780,
        vendorName: "Amazon Media CDN",
      },
      {
        category: "advertising",
        classification: "tracking",
        classificationBasis: "tracker_signature",
        collectionEndpointObserved: true,
        confidence: 0.94,
        entityRelationship: "same_entity",
        essentiality: "non_essential",
        hostname: "aax-eu.amazon-adsystem.com",
        relationshipBasis: "canonical_entity_registry",
        requestUrl: "https://aax-eu.amazon-adsystem.com/x/px/example",
        runtimePhase: "pre_consent",
        siteRelationship: "cross_site",
        tsMs: 6_430,
        vendorName: "Amazon Ads",
      }
    ]
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.vendorName, "Amazon Ads");
  assert.equal(requests[0]?.firstSeenMs, 6_430);
  assert.equal(requests[0]?.siteRelationship, "cross_site");
  assert.equal(requests[0]?.entityRelationship, "same_entity");
});

test("advertising-domain classification alone remains review evidence rather than promotion-grade tracking", () => {
  const requests = buildPromotionGradePreconsentRequests({
    scannedPageUrl: "https://www.amazon.de/",
    rows: [{
      category: "advertising",
      classification: "tracking",
      confidence: 0.94,
      essentiality: "non_essential",
      hostname: "aax-eu.amazon-adsystem.com",
      requestUrl: "https://aax-eu.amazon-adsystem.com/x/px/example",
      runtimePhase: "pre_consent",
      tsMs: 6_430,
      vendorName: "Amazon Ads"
    }]
  });

  assert.deepEqual(requests, []);
});

test("does not let a tracker URL replace the scanned page URL", () => {
  const requests = buildPromotionGradePreconsentRequests({
    scannedPageUrl: "https://www.ifit.com/en-gb",
    rows: [{
      category: "session_replay",
      collectionEndpointObserved: true,
      confidence: 0.98,
      essentiality: "non_essential",
      firstSeenMs: 4484,
      hostname: "edge.fullstory.com",
      pageUrl: "https://edge.fullstory.com/s/settings/15TFZD/v1/web",
      requestUrl: "https://edge.fullstory.com/s/fs.js",
      runtimePhase: "pre_consent",
      vendor: "FullStory"
    }]
  });

  assert.equal(requests[0]?.scannedPageUrl, "https://www.ifit.com/en-gb");
  assert.equal(requests[0]?.firstSeenMs, 4484);
});

test("does not promote a standalone Google Tag Manager bootstrap as confirmed tracking", () => {
  const requests = buildPromotionGradePreconsentRequests({
    scannedPageUrl: "https://www.aruba.it/",
    rows: [{
      category: "tag_management",
      confidence: 0.99,
      essentiality: "unknown",
      firstSeenMs: 3346,
      hostname: "www.googletagmanager.com",
      requestUrl: "https://www.googletagmanager.com/gtm.js?id=GTM-ARUBA",
      runtimePhase: "pre_consent",
      vendorName: "Google Tag Manager"
    }]
  });

  assert.deepEqual(requests, []);
});

test("keeps Medal GPT and Amplitude config loads out of confirmed tracking examples", () => {
  const requests = buildPromotionGradePreconsentRequests({
    scannedPageUrl: "https://medal.tv/",
    rows: [
      row({
        firstSeenMs: 1670,
        hostname: "securepubads.g.doubleclick.net",
        url: "https://securepubads.g.doubleclick.net/tag/js/gpt.js",
        vendorName: "Google Publisher Tag"
      }),
      row({
        firstSeenMs: 10515,
        hostname: "sr-client-cfg.amplitude.com",
        url: "https://sr-client-cfg.amplitude.com/config/abc",
        vendorCategory: "analytics",
        vendorName: "Amplitude"
      }),
      {
        ...row({
          hostname: "events.launchdarkly.com",
          url: "https://events.launchdarkly.com/events/bulk/abc",
          vendorCategory: "personalization",
          vendorName: "LaunchDarkly"
        }),
        firstSeenMs: null,
        timestampMs: null
      }
    ]
  });

  assert.deepEqual(requests, []);
});

test("preserves a genuine Amplitude event timestamp without borrowing the global earliest time", () => {
  const requests = buildPromotionGradePreconsentRequests({
    scannedPageUrl: "https://medal.tv/",
    rows: [row({
      firstSeenMs: 10515,
      hostname: "api2.amplitude.com",
      url: "https://api2.amplitude.com/2/httpapi",
      vendorCategory: "analytics",
      vendorName: "Amplitude"
    })]
  });

  assert.equal(requests[0]?.firstSeenMs, 10515);
  assert.equal(requests[0]?.scannedPageUrl, "https://medal.tv/");
});

test("does not let a Teads URL replace the scanned Daily page URL", () => {
  const requests = buildPromotionGradePreconsentRequests({
    scannedPageUrl: "https://www.daily.co.jp/",
    rows: [{
      confidence: 0.99,
      collectionEndpointObserved: true,
      essentiality: "non_essential",
      firstSeenMs: 3465,
      hostname: "at.teads.tv",
      pageUrl: "https://at.teads.tv/fpc?redacted=1",
      requestUrl: "https://at.teads.tv/fpc?redacted=1",
      runtimePhase: "pre_consent",
      vendorCategory: "advertising",
      vendorName: "Teads Video Advertising"
    }]
  });

  assert.equal(requests[0]?.scannedPageUrl, "https://www.daily.co.jp/");
  assert.equal(requests[0]?.requestUrl, "https://at.teads.tv/fpc?redacted=1");
});

test("uses the transmitted DoubleClick request instead of a Google configuration library as representative advertising evidence", () => {
  const common = {
    vendorCategory: "advertising",
    essentiality: "non_essential",
    runtimePhase: "pre_consent",
    confidence: 0.95,
    pageUrl: "https://www.example.test/"
  };
  const requests = buildPromotionGradePreconsentRequests({
    rows: [
      {
        ...common,
        hostname: "www.googletagmanager.com",
        requestUrl: "https://www.googletagmanager.com/gtm.js?id=GTM-TEST",
        vendorName: "Google Tag Manager",
        classification: "library",
        tsMs: 1000
      },
      {
        ...common,
        hostname: "ad.doubleclick.net",
        requestUrl: "https://ad.doubleclick.net/activity;src=123;type=test",
        vendorName: "Google Ads",
        classification: "tracking",
        collectionEndpointObserved: true,
        tsMs: 2461
      }
    ]
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.vendorName, "DoubleClick Floodlight");
  assert.equal(requests[0]?.requestUrl, "https://ad.doubleclick.net/activity;src=123;type=test");
  assert.equal(requests[0]?.firstSeenMs, 2461);
});

test("uses canonical endpoint attribution for retained pre-consent example requests", () => {
  const requests = buildPromotionGradePreconsentRequests({
    rows: [
      row({
        hostname: "cdn.privacy-mgmt.com",
        url: "https://cdn.privacy-mgmt.com/wrapperMessagingWithoutDetection.js?token=secret",
        vendorName: "Amazon Ads",
        firstSeenMs: 1,
        frameUrl: "https://cmp.example/frame.html?session=secret",
        finalUrl: "https://cdn.privacy-mgmt.com/wrapperMessagingWithoutDetection.js?token=secret",
        initiatorHost: "example.com",
        initiatorType: "script",
        initiatorUrl: "https://example.com/app.js?debug=secret",
        redirectChain: ["https://privacy-mgmt.example/redirect?token=secret"],
        resourceType: "script"
      }),
      row({
        hostname: "images.ctfassets.net",
        url: "https://images.ctfassets.net/site/image.png",
        vendorName: "DoubleClick Floodlight",
        firstSeenMs: 2
      }),
      row({
        hostname: "cdn.jsdelivr.net",
        url: "https://cdn.jsdelivr.net/npm/example/package.js",
        vendorName: "Google Tag Manager",
        firstSeenMs: 3
      }),
      row({
        hostname: "fonts.googleapis.com",
        url: "https://fonts.googleapis.com/css2?family=Inter",
        vendorName: "Google Static Assets",
        firstSeenMs: 4
      }),
      row({
        hostname: "www.gstatic.com",
        url: "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js",
        vendorName: "Google Fonts",
        firstSeenMs: 5
      }),
      row({
        hostname: "cdn.segment.com",
        url: "https://cdn.segment.com/analytics.js/v1/example/analytics.min.js",
        vendorName: "Adobe Analytics / Experience Cloud",
        firstSeenMs: 6
      }),
      row({
        hostname: "unpkg.com",
        url: "https://unpkg.com/react@18/umd/react.production.min.js",
        vendorName: "jsDelivr CDN",
        firstSeenMs: 7
      }),
      row({
        hostname: "use.typekit.net",
        url: "https://use.typekit.net/abcd123.css",
        vendorName: "Amazon Ads",
        firstSeenMs: 8
      }),
      row({
        hostname: "www.googletagmanager.com",
        url: "https://www.googletagmanager.com/gtm.js?id=GTM-TEST",
        vendorName: "Google Fonts",
        firstSeenMs: 9
      }),
      row({
        hostname: "d2pu3v2r6r77j3.cloudfront.net",
        url: "https://d2pu3v2r6r77j3.cloudfront.net/app.js",
        vendorName: "Google Tag Manager",
        firstSeenMs: 10
      }),
      row({
        hostname: "dev.visualwebsiteoptimizer.com",
        url: "https://dev.visualwebsiteoptimizer.com/j.php?a=123",
        vendorName: "CloudFront Distribution",
        firstSeenMs: 11
      }),
      row({
        hostname: "img.youtube.com",
        url: "https://img.youtube.com/vi/example/hqdefault.jpg",
        vendorName: "Taboola",
        firstSeenMs: 12
      }),
      row({
        hostname: "maxcdn.bootstrapcdn.com",
        url: "https://maxcdn.bootstrapcdn.com/bootstrap/4.0.0/css/bootstrap.min.css",
        vendorName: "Google Fonts",
        firstSeenMs: 13
      }),
      row({
        hostname: "cmp.osano.com",
        url: "https://cmp.osano.com/consent-manager/example/osano.js",
        vendorName: "Akamai Bot Manager / Edge",
        firstSeenMs: 14
      }),
      row({
        hostname: "static.hotjar.com",
        url: "https://static.hotjar.com/c/hotjar-123456.js?sv=6",
        vendorName: "Microsoft Clarity",
        firstSeenMs: 15
      }),
      row({
        hostname: "dpm.demdex.net",
        url: "https://dpm.demdex.net/id?d_orgid=example",
        vendorName: "Piano (Tinypass)",
        firstSeenMs: 16
      }),
      row({
        hostname: "fonts.googleapis.com",
        url: "https://fonts.googleapis.com/css2?family=Roboto",
        vendorName: "Google Analytics",
        firstSeenMs: 17
      }),
      row({
        hostname: "www.google.com",
        url: "https://www.google.com/recaptcha/api.js?render=site-key",
        vendorName: "Google Fonts",
        firstSeenMs: 18
      }),
      row({
        hostname: "static.tildacdn.com",
        url: "https://static.tildacdn.com/css/tilda-grid-3.0.min.css",
        vendorName: "jsDelivr CDN",
        firstSeenMs: 19
      }),
      row({
        hostname: "events.framer.com",
        url: "https://events.framer.com/script",
        vendorName: "Google Fonts",
        firstSeenMs: 20
      }),
      row({
        hostname: "consent.trustarc.com",
        url: "https://consent.trustarc.com/notice?domain=example.com",
        vendorName: "Google Tag Manager",
        firstSeenMs: 21
      }),
      row({
        hostname: "images.ctfassets.net",
        url: "https://images.ctfassets.net/site/another-image.png",
        vendorName: "Google Tag Manager",
        firstSeenMs: 22
      })
    ],
    maxItems: 22
  });

  assert.ok(requests.length > 0);
  assert.ok(requests.every(request => !["cmp", "infrastructure", "security", "tag_management", "unknown"].includes(request.vendorCategory)));
  const segment = requests.find(request => request.vendorName === "Segment");
  assert.equal(segment?.vendorCategory, "analytics");
  assert.equal(segment?.relatedOrInitiatingVendor, "Adobe Analytics / Experience Cloud");
  assert.match(segment?.vendorAttributionBasis ?? "", /canonical_vendor_resolver/);
  assert.ok(requests.some(request => request.vendorName === "Hotjar"));
  assert.equal(requests.some(request => /fonts\.|privacy-mgmt|recaptcha|tildacdn|ctfassets/.test(request.requestUrl)), false);

});

test("resolves Batch 3 through 6 endpoint hosts through the canonical vendor resolver", () => {
  assert.deepEqual(
    inferDirectEndpointVendorFromUrl("https://cloud.umami.is/script.js"),
    {
      vendorName: "Umami Analytics",
      vendorCategory: "analytics",
      basis: "canonical_vendor_resolver"
    }
  );
  assert.deepEqual(
    inferDirectEndpointVendorFromUrl("https://gateway.umami.is/api/send"),
    {
      vendorName: "Umami Analytics",
      vendorCategory: "analytics",
      basis: "canonical_vendor_resolver"
    }
  );
  assert.deepEqual(
    inferDirectEndpointVendorFromUrl("https://cdn.privacy-mgmt.com/wrapperMessagingWithoutDetection.js"),
    {
      vendorName: "Sourcepoint CMP",
      vendorCategory: "cmp",
      basis: "canonical_vendor_resolver"
    }
  );
  assert.deepEqual(
    inferDirectEndpointVendorFromUrl("https://images.ctfassets.net/site/image.png"),
    {
      vendorName: "Contentful Assets",
      vendorCategory: "infrastructure",
      basis: "canonical_vendor_resolver"
    }
  );
  assert.deepEqual(
    inferDirectEndpointVendorFromUrl("https://cdn.jsdelivr.net/npm/example/package.js"),
    {
      vendorName: "jsDelivr CDN",
      vendorCategory: "infrastructure",
      basis: "canonical_vendor_resolver"
    }
  );
  assert.deepEqual(
    inferDirectEndpointVendorFromUrl("https://fonts.googleapis.com/css2?family=Inter"),
    {
      vendorName: "Google Fonts",
      vendorCategory: "infrastructure",
      basis: "canonical_vendor_resolver"
    }
  );
  assert.deepEqual(
    inferDirectEndpointVendorFromUrl("https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js"),
    {
      vendorName: "Google Static Assets",
      vendorCategory: "infrastructure",
      basis: "canonical_vendor_resolver"
    }
  );
  assert.deepEqual(
    inferDirectEndpointVendorFromUrl("https://cdn.segment.com/analytics.js/v1/example/analytics.min.js"),
    {
      vendorName: "Segment",
      vendorCategory: "analytics",
      basis: "canonical_vendor_resolver"
    }
  );
  assert.deepEqual(
    inferDirectEndpointVendorFromUrl("https://unpkg.com/react@18/umd/react.production.min.js"),
    {
      vendorName: "unpkg CDN",
      vendorCategory: "infrastructure",
      basis: "canonical_vendor_resolver"
    }
  );
  assert.deepEqual(
    inferDirectEndpointVendorFromUrl("https://use.typekit.net/abcd123.css"),
    {
      vendorName: "Adobe Fonts / Typekit",
      vendorCategory: "infrastructure",
      basis: "canonical_vendor_resolver"
    }
  );
  assert.deepEqual(
    inferDirectEndpointVendorFromUrl("https://www.googletagmanager.com/gtm.js?id=GTM-TEST"),
    {
      vendorName: "Google Tag Manager",
      vendorCategory: "tag_management",
      basis: "canonical_vendor_resolver"
    }
  );
  assert.deepEqual(
    inferDirectEndpointVendorFromUrl("https://d2pu3v2r6r77j3.cloudfront.net/app.js"),
    {
      vendorName: "CloudFront Distribution",
      vendorCategory: "infrastructure",
      basis: "canonical_vendor_resolver"
    }
  );
  assert.deepEqual(
    inferDirectEndpointVendorFromUrl("https://dev.visualwebsiteoptimizer.com/j.php?a=123"),
    {
      vendorName: "Visual Website Optimizer",
      vendorCategory: "analytics",
      basis: "canonical_vendor_resolver"
    }
  );
  assert.deepEqual(
    inferDirectEndpointVendorFromUrl("https://img.youtube.com/vi/example/hqdefault.jpg"),
    {
      vendorName: "YouTube Image CDN",
      vendorCategory: "infrastructure",
      basis: "canonical_vendor_resolver"
    }
  );
  assert.deepEqual(
    inferDirectEndpointVendorFromUrl("https://maxcdn.bootstrapcdn.com/bootstrap/4.0.0/css/bootstrap.min.css"),
    {
      vendorName: "BootstrapCDN",
      vendorCategory: "infrastructure",
      basis: "canonical_vendor_resolver"
    }
  );
  assert.deepEqual(
    inferDirectEndpointVendorFromUrl("https://cmp.osano.com/consent-manager/example/osano.js"),
    {
      vendorName: "Osano CMP",
      vendorCategory: "cmp",
      basis: "canonical_vendor_resolver"
    }
  );
  assert.deepEqual(
    inferDirectEndpointVendorFromUrl("https://static.hotjar.com/c/hotjar-123456.js?sv=6"),
    {
      vendorName: "Hotjar",
      vendorCategory: "session_replay",
      basis: "canonical_vendor_resolver"
    }
  );
  assert.deepEqual(
    inferDirectEndpointVendorFromUrl("https://events.framer.com/script"),
    {
      vendorName: "Framer Analytics",
      vendorCategory: "analytics",
      basis: "canonical_vendor_resolver"
    }
  );
  assert.deepEqual(
    inferDirectEndpointVendorFromUrl("https://consent.trustarc.com/notice?domain=example.com"),
    {
      vendorName: "TrustArc CMP",
      vendorCategory: "cmp",
      basis: "canonical_vendor_resolver"
    }
  );
  assert.deepEqual(
    inferDirectEndpointVendorFromUrl("https://dpm.demdex.net/id?d_orgid=example"),
    {
      vendorName: "Adobe Audience Manager / Experience Cloud",
      vendorCategory: "advertising",
      basis: "canonical_vendor_resolver"
    }
  );
  assert.deepEqual(
    inferDirectEndpointVendorFromUrl("https://www.google.com/recaptcha/api.js?render=site-key"),
    {
      vendorName: "Google reCAPTCHA",
      vendorCategory: "security",
      basis: "canonical_vendor_resolver"
    }
  );
  assert.deepEqual(
    inferDirectEndpointVendorFromUrl("https://static.tildacdn.com/css/tilda-grid-3.0.min.css"),
    {
      vendorName: "Tilda CDN",
      vendorCategory: "infrastructure",
      basis: "canonical_vendor_resolver"
    }
  );
  assert.deepEqual(
    inferDirectEndpointVendorFromUrl("https://m.stripe.network/inner.html#url=https%3A%2F%2Fexample.com"),
    {
      vendorName: "Stripe.js",
      vendorCategory: "security",
      basis: "canonical_vendor_resolver"
    }
  );
  assert.deepEqual(
    inferDirectEndpointVendorFromUrl("https://framerusercontent.com/images/example.png"),
    {
      vendorName: "Framer Static Assets",
      vendorCategory: "infrastructure",
      basis: "canonical_vendor_resolver"
    }
  );
  assert.deepEqual(
    inferDirectEndpointVendorFromUrl("https://www.google-analytics.com/analytics.js"),
    {
      vendorName: "Google Analytics",
      vendorCategory: "analytics",
      basis: "canonical_vendor_resolver"
    }
  );
  assert.deepEqual(
    inferDirectEndpointVendorFromUrl("https://a.sfdcstatic.com/shared/fonts/SalesforceSans-Regular.woff2"),
    {
      vendorName: "Salesforce Static Assets",
      vendorCategory: "infrastructure",
      basis: "canonical_vendor_resolver"
    }
  );
});

test("suppresses borrowed host-bound vendor labels on unresolved endpoint hosts", () => {
  const requests = buildPromotionGradePreconsentRequests({
    rows: [
      row({
        hostname: "newcreatework.monster",
        url: "https://newcreatework.monster/pjs/YIFOL5Ph.js",
        vendorName: "jsDelivr CDN",
        vendorCategory: "tracking",
        firstSeenMs: 1
      }),
      row({
        hostname: "adxserve.com",
        url: "https://www.adxserve.com/adx/www/delivery/afr.php?zoneid=104",
        vendorName: "Google Fonts",
        vendorCategory: "advertising",
        firstSeenMs: 2
      }),
      row({
        hostname: "cdn.jsdelivr.net",
        url: "https://cdn.jsdelivr.net/npm/bootstrap@5.2.3/dist/css/bootstrap.min.css",
        vendorName: "HubSpot Scripts",
        vendorCategory: "tracking",
        firstSeenMs: 3
      }),
      row({
        hostname: "http2.mlstatic.com",
        url: "https://http2.mlstatic.com/storage/example.js",
        vendorName: "Hotjar",
        vendorCategory: "session_replay",
        firstSeenMs: 4
      }),
      row({
        hostname: "http2.mlstatic.com",
        url: "https://http2.mlstatic.com/storage/signin.js",
        vendorName: "Google Sign-in",
        vendorCategory: "tracking",
        firstSeenMs: 5
      }),
      row({
        hostname: "assets.example.test",
        url: "https://assets.example.test/vendor/react.js",
        vendorName: "unpkg CDN",
        vendorCategory: "tracking",
        firstSeenMs: 6
      }),
      row({
        hostname: "kbdlabimages.s3.us-east-2.amazonaws.com",
        url: "https://kbdlabimages.s3.us-east-2.amazonaws.com/jan-loyde-cabrera-6e9b45NTrI4-unsplash.webp",
        vendorName: "Google Analytics",
        vendorCategory: "analytics",
        firstSeenMs: 7
      }),
      row({
        hostname: "securepubads.g.doubleclick.net",
        url: "https://securepubads.g.doubleclick.net/tag/js/gpt.js",
        vendorName: "Google Publisher Tag",
        vendorCategory: "advertising",
        firstSeenMs: 8
      })
    ],
    maxItems: 8
  });

  assert.deepEqual(requests, [], "unresolved borrowed names and non-tracking CDN traffic cannot become tracking requests");

});

test("does not promote generic or unknown static bundle rows as pre-consent tracking evidence", () => {
  const requests = buildPromotionGradePreconsentRequests({
    rows: [
      {
        requestUrl: "https://assets.prod.abebookscdn.com/cdn/com/scripts/vendor/react18.bundle-8d00f21452.js",
        hostname: "assets.prod.abebookscdn.com",
        vendorCategory: "tracking",
        rawObservedVendor: null,
        resolvedEndpointVendor: null,
        essentiality: "non_essential",
        runtimePhase: "pre_consent",
        confidence: 0.95,
        firstSeenMs: 974,
        firstPartyOrThirdParty: "third_party"
      },
      {
        requestUrl: "https://assets.prod.abebookscdn.com/cdn/com/scripts/vendor/react18.bundle-8d00f21452.js",
        hostname: "assets.prod.abebookscdn.com",
        vendorName: "tracking",
        vendorCategory: "tracking",
        essentiality: "non_essential",
        runtimePhase: "pre_consent",
        confidence: 0.95,
        firstSeenMs: 974,
        firstPartyOrThirdParty: "third_party"
      },
      {
        requestUrl: "https://transcend-cdn.com/cm/airgap.js",
        hostname: "transcend-cdn.com",
        vendorName: "Transcend",
        vendorCategory: "tracking",
        essentiality: "non_essential",
        runtimePhase: "pre_consent",
        confidence: 0.95,
        firstSeenMs: 974,
        firstPartyOrThirdParty: "third_party"
      },
      {
        requestUrl: "https://privacy-center-api.transcend.io/graphql",
        hostname: "privacy-center-api.transcend.io",
        vendorName: "Transcend",
        vendorCategory: "tracking",
        essentiality: "non_essential",
        runtimePhase: "pre_consent",
        confidence: 0.95,
        firstSeenMs: 974,
        firstPartyOrThirdParty: "third_party"
      },
      {
        requestUrl: "https://m.stripe.network/inner.html#url=https%3A%2F%2Fexample.com",
        hostname: "m.stripe.network",
        vendorName: "DoubleClick Floodlight",
        vendorCategory: "tracking",
        essentiality: "non_essential",
        runtimePhase: "pre_consent",
        confidence: 0.95,
        firstSeenMs: 974,
        firstPartyOrThirdParty: "third_party"
      },
      {
        requestUrl: "https://framerusercontent.com/images/example.png",
        hostname: "framerusercontent.com",
        vendorName: "LinkedIn Ads Pixel",
        vendorCategory: "tracking",
        essentiality: "non_essential",
        runtimePhase: "pre_consent",
        confidence: 0.95,
        firstSeenMs: 974,
        firstPartyOrThirdParty: "third_party"
      },
      {
        requestUrl: "https://a.sfdcstatic.com/shared/fonts/SalesforceSans-Regular.woff2",
        hostname: "a.sfdcstatic.com",
        vendorName: "Akamai mPulse",
        vendorCategory: "tracking",
        essentiality: "non_essential",
        runtimePhase: "pre_consent",
        confidence: 0.95,
        firstSeenMs: 974,
        firstPartyOrThirdParty: "third_party"
      },
      {
        requestUrl: "https://securepubads.g.doubleclick.net/tag/js/gpt.js",
        hostname: "securepubads.g.doubleclick.net",
        vendorName: "tracking",
        vendorCategory: "tracking",
        essentiality: "non_essential",
        runtimePhase: "pre_consent",
        confidence: 0.95,
        firstSeenMs: 975,
        firstPartyOrThirdParty: "third_party"
      }
    ],
    maxItems: 3
  });

  assert.deepEqual(requests, []);
});

test("canonical endpoint vendors replace leaked request-event labels", () => {
  const requests = buildPromotionGradePreconsentRequests({
    rows: [
      row({
        hostname: "www.google-analytics.com",
        url: "https://www.google-analytics.com/analytics.js",
        vendorName: "DoubleClick Floodlight",
        vendorCategory: "analytics",
        firstSeenMs: 1
      })
    ],
    maxItems: 1
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.vendorName, "Google Analytics");
  assert.equal(requests[0]?.vendorCategory, "analytics");
  assert.equal(requests[0]?.rawObservedVendor, "DoubleClick Floodlight");
  assert.equal(requests[0]?.resolvedEndpointVendor, "Google Analytics");
  assert.deepEqual(requests[0]?.projectionWarnings, ["canonical_endpoint_vendor_replaced_raw_vendor"]);
});

test("executive evidence projection does not borrow request vendors by list position", () => {
  const source = readFileSync(new URL("./executive-findings-projection.ts", import.meta.url), "utf8");

  assert.match(source, /inferDirectEndpointVendorFromUrl/);
  assert.doesNotMatch(source, /vendors\[index\]/);
  assert.doesNotMatch(source, /vendor:\s*firstRequest\.vendor\s*\?\?\s*firstVendor/);
});
