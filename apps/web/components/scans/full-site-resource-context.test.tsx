import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DataTransferDisclosure, ProviderHeadquarters } from "./full-site-resource-context";
import type { NetworkDestination } from "@certscore/contracts";
const context = { identity: null, provider: null, headquarters: "US", transfer: null, policy: { status: "unknown" as const, mentions: [], reviewed: [] } };

test("destination cell emphasizes observed country/operator, keeping headquarters and mechanism in details", () => {
  const destination: NetworkDestination = { ip: "8.8.8.8", countryCode: "DE", provider: "Fixture network", source: "response_server_addr_geolite2", locationLabel: "server location (may be CDN edge)" };
  const html = renderToStaticMarkup(<DataTransferDisclosure label="Example" context={context} destinations={[destination]}/>);
  const cell = html.slice(0, html.indexOf("</button>"));
  assert.match(cell, /Germany/); assert.match(cell, /Fixture network/);
  assert.doesNotMatch(cell, /HQ:|Mechanism not assessed|Unknown/);
  assert.match(html, /Mechanism not assessed/);
  assert.match(html, /subsequent processing or storage/);
});

test("captured IP without a lookup and stored browser data have distinct neutral states", () => {
  const html = renderToStaticMarkup(<DataTransferDisclosure label="Example" context={context} destinations={[{ ip: "8.8.8.8", source: "cdp_remote_ip", locationLabel: "server location (may be CDN edge)", enrichment: { country: "database_unavailable", network: "database_unavailable" } }]}/>);
  assert.match(html, /IP captured · location unavailable/);
  assert.match(html, /Country lookup database unavailable/);
  const cookie = renderToStaticMarkup(<DataTransferDisclosure label="Cookie" context={context} resourceKind="cookie"/>);
  assert.match(cookie, /See linked requests/);
  assert.doesNotMatch(cookie.slice(0, cookie.indexOf("</button>")), /US/);
});


test("HQ cells expose source provenance and distinguish legacy or regional identities", () => {
  const identity = { product: "Amplitude", vendor: "Amplitude", entity: "Amplitude, Inc.", registryVersion: "fixture" };
  const html = renderToStaticMarkup(<ProviderHeadquarters context={{...context, identity}}/>);
  assert.match(html, /Provider headquarters for Amplitude/);
  assert.match(html, /https:\/\/www.amplitude.com\/contact/);
  assert.match(html, /Sources checked 2026-09-07/);
  assert.match(html, /regional Google|entity contracts with this site/);
  const legacy = renderToStaticMarkup(<ProviderHeadquarters context={{...context, headquarters: null, identity: {...identity, entity: "Hotjar Ltd"}}}/>);
  assert.match(legacy, /Headquarters not verified/);
  assert.match(legacy, /merged into Contentsquare/);
  assert.doesNotMatch(legacy, /Source-verified headquarters/);
  const regional = renderToStaticMarkup(<ProviderHeadquarters context={{...context, headquarters: null, identity: {...identity, entity: "Google Ireland Limited"}}}/>);
  assert.match(regional, /Unknown/);
  assert.doesNotMatch(regional, /US|Source-verified/);
});

test("documented service region is separate from observed IP location and transfer mechanism", () => {
  const html = renderToStaticMarkup(<DataTransferDisclosure label="Sentry" context={context} requestUrls={["https://o1.ingest.de.sentry.io/api/2/envelope/"]}/>);
  const cell = html.slice(0, html.indexOf("</button>"));
  assert.match(cell, /Destination unavailable/);
  assert.match(cell, /Service region: DE \(documented\)/);
  assert.match(html, /Documented service regions/);
  assert.match(html, /Sources checked 2026-09-07/);
  assert.match(html, /Mechanism not assessed/);
  const asset = renderToStaticMarkup(<DataTransferDisclosure label="Script" context={context} requestUrls={["https://o1.ingest.de.sentry.io/script.js"]}/>);
  assert.doesNotMatch(asset, /Service region:|Documented service regions/);
});
