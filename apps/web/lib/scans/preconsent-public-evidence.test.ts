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

  assert.equal(requests[0]?.vendorName, "Sourcepoint CMP");
  assert.equal(requests[0]?.vendorCategory, "cmp");
  assert.equal(requests[0]?.rawObservedVendor, "Amazon Ads");
  assert.equal(requests[0]?.rawObservedVendorCategory, "advertising");
  assert.equal(requests[0]?.resolvedEndpointVendor, "Sourcepoint CMP");
  assert.equal(requests[0]?.resolvedEndpointVendorCategory, "cmp");
  assert.equal(requests[0]?.requestUrl, "https://cdn.privacy-mgmt.com/wrapperMessagingWithoutDetection.js?redacted=1");
  assert.equal(requests[0]?.frameUrl, "https://cmp.example/frame.html?redacted=1");
  assert.equal(requests[0]?.finalUrl, "https://cdn.privacy-mgmt.com/wrapperMessagingWithoutDetection.js?redacted=1");
  assert.equal(requests[0]?.initiatorHost, "example.com");
  assert.equal(requests[0]?.initiatorType, "script");
  assert.equal(requests[0]?.initiatorUrl, "https://example.com/app.js?redacted=1");
  assert.deepEqual(requests[0]?.redirectChain, ["https://privacy-mgmt.example/redirect?redacted=1"]);
  assert.equal(requests[0]?.resourceType, "script");
  assert.equal(requests[0]?.relatedOrInitiatingVendor, "Amazon Ads");
  assert.match(requests[0]?.vendorAttributionBasis ?? "", /canonical_vendor_resolver/);
  assert.deepEqual(requests[0]?.projectionWarnings, ["canonical_endpoint_vendor_replaced_raw_vendor"]);

  assert.equal(requests[1]?.vendorName, "Contentful Assets");
  assert.equal(requests[1]?.vendorCategory, "infrastructure");
  assert.equal(requests[1]?.relatedOrInitiatingVendor, "DoubleClick Floodlight");

  assert.equal(requests[2]?.vendorName, "jsDelivr CDN");
  assert.equal(requests[2]?.vendorCategory, "infrastructure");
  assert.equal(requests[2]?.relatedOrInitiatingVendor, "Google Tag Manager");

  assert.equal(requests[3]?.vendorName, "Google Fonts");
  assert.equal(requests[3]?.vendorCategory, "infrastructure");
  assert.equal(requests[3]?.relatedOrInitiatingVendor, "Google Static Assets");

  assert.equal(requests[4]?.vendorName, "Google Static Assets");
  assert.equal(requests[4]?.vendorCategory, "infrastructure");
  assert.equal(requests[4]?.relatedOrInitiatingVendor, "Google Fonts");

  assert.equal(requests[5]?.vendorName, "Segment");
  assert.equal(requests[5]?.vendorCategory, "analytics");
  assert.equal(requests[5]?.relatedOrInitiatingVendor, "Adobe Analytics / Experience Cloud");

  assert.equal(requests[6]?.vendorName, "unpkg CDN");
  assert.equal(requests[6]?.vendorCategory, "infrastructure");
  assert.equal(requests[6]?.relatedOrInitiatingVendor, "jsDelivr CDN");

  assert.equal(requests[7]?.vendorName, "Adobe Fonts / Typekit");
  assert.equal(requests[7]?.vendorCategory, "infrastructure");
  assert.equal(requests[7]?.relatedOrInitiatingVendor, "Amazon Ads");

  assert.equal(requests[8]?.vendorName, "Google Tag Manager");
  assert.equal(requests[8]?.vendorCategory, "tag_management");
  assert.equal(requests[8]?.relatedOrInitiatingVendor, "Google Fonts");

  assert.equal(requests[9]?.vendorName, "CloudFront Distribution");
  assert.equal(requests[9]?.vendorCategory, "infrastructure");
  assert.equal(requests[9]?.relatedOrInitiatingVendor, "Google Tag Manager");

  assert.equal(requests[10]?.vendorName, "Visual Website Optimizer");
  assert.equal(requests[10]?.vendorCategory, "analytics");
  assert.equal(requests[10]?.relatedOrInitiatingVendor, "CloudFront Distribution");

  assert.equal(requests[11]?.vendorName, "YouTube Image CDN");
  assert.equal(requests[11]?.vendorCategory, "infrastructure");
  assert.equal(requests[11]?.relatedOrInitiatingVendor, "Taboola");

  assert.equal(requests[12]?.vendorName, "BootstrapCDN");
  assert.equal(requests[12]?.vendorCategory, "infrastructure");
  assert.equal(requests[12]?.relatedOrInitiatingVendor, "Google Fonts");

  assert.equal(requests[13]?.vendorName, "Osano CMP");
  assert.equal(requests[13]?.vendorCategory, "cmp");
  assert.equal(requests[13]?.relatedOrInitiatingVendor, "Akamai Bot Manager / Edge");

  assert.equal(requests[14]?.vendorName, "Hotjar");
  assert.equal(requests[14]?.vendorCategory, "session_replay");
  assert.equal(requests[14]?.relatedOrInitiatingVendor, "Microsoft Clarity");

  assert.equal(requests[15]?.vendorName, "Adobe Audience Manager / Experience Cloud");
  assert.equal(requests[15]?.vendorCategory, "advertising");
  assert.equal(requests[15]?.relatedOrInitiatingVendor, "Piano (Tinypass)");

  assert.equal(requests[16]?.vendorName, "Google Fonts");
  assert.equal(requests[16]?.vendorCategory, "infrastructure");
  assert.equal(requests[16]?.relatedOrInitiatingVendor, "Google Analytics");

  assert.equal(requests[17]?.vendorName, "Google reCAPTCHA");
  assert.equal(requests[17]?.vendorCategory, "security");
  assert.equal(requests[17]?.requestUrl, "https://www.google.com/recaptcha/api.js?redacted=1");
  assert.equal(requests[17]?.relatedOrInitiatingVendor, "Google Fonts");

  assert.equal(requests[18]?.vendorName, "Tilda CDN");
  assert.equal(requests[18]?.vendorCategory, "infrastructure");
  assert.equal(requests[18]?.relatedOrInitiatingVendor, "jsDelivr CDN");

  assert.equal(requests[19]?.vendorName, "Framer Analytics");
  assert.equal(requests[19]?.vendorCategory, "analytics");
  assert.equal(requests[19]?.relatedOrInitiatingVendor, "Google Fonts");

  assert.equal(requests[20]?.vendorName, "TrustArc CMP");
  assert.equal(requests[20]?.vendorCategory, "cmp");
  assert.equal(requests[20]?.relatedOrInitiatingVendor, "Google Tag Manager");

  assert.equal(requests[21]?.vendorName, "Contentful Assets");
  assert.equal(requests[21]?.vendorCategory, "infrastructure");
  assert.equal(requests[21]?.relatedOrInitiatingVendor, "Google Tag Manager");
  assert.deepEqual(
    requests.filter((request) => request.hostname === "images.ctfassets.net").map((request) => request.vendorName),
    ["Contentful Assets", "Contentful Assets"]
  );
});

test("resolves Batch 3 through 6 endpoint hosts through the canonical vendor resolver", () => {
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

  assert.equal(requests[0]?.vendorName, "newcreatework.monster");
  assert.equal(requests[0]?.vendorCategory, "unknown");
  assert.equal(requests[0]?.rawObservedVendor, "jsDelivr CDN");
  assert.equal(requests[0]?.resolvedEndpointVendor, null);
  assert.equal(requests[0]?.relatedOrInitiatingVendor, "jsDelivr CDN");
  assert.match(requests[0]?.vendorAttributionBasis ?? "", /borrowed_host_bound_vendor_suppressed/);
  assert.deepEqual(requests[0]?.projectionWarnings, ["borrowed_host_bound_vendor_suppressed"]);

  assert.equal(requests[1]?.vendorName, "adxserve.com");
  assert.equal(requests[1]?.vendorCategory, "unknown");
  assert.equal(requests[1]?.requestUrl, "https://www.adxserve.com/adx/www/delivery/afr.php?redacted=1");
  assert.equal(requests[1]?.relatedOrInitiatingVendor, "Google Fonts");
  assert.match(requests[1]?.vendorAttributionBasis ?? "", /borrowed_host_bound_vendor_suppressed/);

  assert.equal(requests[2]?.vendorName, "jsDelivr CDN");
  assert.equal(requests[2]?.vendorCategory, "infrastructure");
  assert.equal(requests[2]?.relatedOrInitiatingVendor, "HubSpot Scripts");
  assert.match(requests[2]?.vendorAttributionBasis ?? "", /canonical_vendor_resolver/);

  assert.equal(requests[3]?.vendorName, "http2.mlstatic.com");
  assert.equal(requests[3]?.vendorCategory, "unknown");
  assert.equal(requests[3]?.relatedOrInitiatingVendor, "Hotjar");
  assert.match(requests[3]?.vendorAttributionBasis ?? "", /borrowed_host_bound_vendor_suppressed/);

  assert.equal(requests[4]?.vendorName, "http2.mlstatic.com");
  assert.equal(requests[4]?.vendorCategory, "unknown");
  assert.equal(requests[4]?.relatedOrInitiatingVendor, "Google Sign-in");
  assert.match(requests[4]?.vendorAttributionBasis ?? "", /borrowed_host_bound_vendor_suppressed/);

  assert.equal(requests[5]?.vendorName, "assets.example.test");
  assert.equal(requests[5]?.vendorCategory, "unknown");
  assert.equal(requests[5]?.relatedOrInitiatingVendor, "unpkg CDN");
  assert.match(requests[5]?.vendorAttributionBasis ?? "", /borrowed_host_bound_vendor_suppressed/);

  assert.equal(requests[6]?.vendorName, "kbdlabimages.s3.us-east-2.amazonaws.com");
  assert.equal(requests[6]?.vendorCategory, "unknown");
  assert.equal(requests[6]?.rawObservedVendor, "Google Analytics");
  assert.equal(requests[6]?.relatedOrInitiatingVendor, "Google Analytics");
  assert.match(requests[6]?.vendorAttributionBasis ?? "", /borrowed_host_bound_vendor_suppressed/);

  assert.equal(requests[7]?.vendorName, "Google Publisher Tag");
  assert.equal(requests[7]?.vendorCategory, "advertising");
  assert.equal(requests[7]?.relatedOrInitiatingVendor, null);
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

  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.hostname, "securepubads.g.doubleclick.net");
  assert.equal(requests[0]?.vendorName, "Google Publisher Tag");
  assert.equal(requests[0]?.resolvedEndpointVendor, "Google Publisher Tag");
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
