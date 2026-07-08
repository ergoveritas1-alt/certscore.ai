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
    firstPartyOrThirdParty: "third_party"
  };
}

test("uses canonical endpoint attribution for retained pre-consent example requests", () => {
  const requests = buildPromotionGradePreconsentRequests({
    rows: [
      row({
        hostname: "cdn.privacy-mgmt.com",
        url: "https://cdn.privacy-mgmt.com/wrapperMessagingWithoutDetection.js",
        vendorName: "Amazon Ads",
        firstSeenMs: 1
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
      })
    ],
    maxItems: 17
  });

  assert.equal(requests[0]?.vendorName, "Sourcepoint CMP");
  assert.equal(requests[0]?.vendorCategory, "cmp");
  assert.equal(requests[0]?.relatedOrInitiatingVendor, "Amazon Ads");
  assert.match(requests[0]?.vendorAttributionBasis ?? "", /canonical_vendor_resolver/);

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
    inferDirectEndpointVendorFromUrl("https://dpm.demdex.net/id?d_orgid=example"),
    {
      vendorName: "Adobe Audience Manager / Experience Cloud",
      vendorCategory: "advertising",
      basis: "canonical_vendor_resolver"
    }
  );
});

test("executive evidence projection does not borrow request vendors by list position", () => {
  const source = readFileSync(new URL("./executive-findings-projection.ts", import.meta.url), "utf8");

  assert.match(source, /inferDirectEndpointVendorFromUrl/);
  assert.doesNotMatch(source, /vendors\[index\]/);
  assert.doesNotMatch(source, /vendor:\s*firstRequest\.vendor\s*\?\?\s*firstVendor/);
});
