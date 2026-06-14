import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  type CanonicalEvidenceBundle,
  canonicalEvidenceBundleSchema,
} from "./index.js";

const fixtureDir = path.resolve(process.cwd(), "fixtures/saved-bundles");

const expectedFixtureNames = [
  "akamai-security-cookie",
  "clarity-collection",
  "clarity-generic-collect-negative",
  "cmp-cookie",
  "consent-flow-persistence",
  "ga-collection",
  "ga-first-party-vendor-associated-cookie",
  "generic-cdn-noise",
  "google-ads-measurement",
  "google-consent-tag-support",
  "google-owned-unresolved",
  "gtm-library-only",
  "nbcu-site-owned-video-ad-infrastructure",
  "newrelic-performance-monitoring",
  "policy-surface-positive",
  "ptvpixel-unresolved",
  "third-party-cookie-positive",
];

test("saved-bundle fixture corpus is complete and contract-valid", async () => {
  const fixtures = await loadSavedBundleFixtures();

  assert.deepEqual(
    fixtures.map((fixture) => fixture.name).sort(),
    expectedFixtureNames,
  );

  for (const fixture of fixtures) {
    assert.doesNotThrow(() => canonicalEvidenceBundleSchema.parse(fixture.bundle), fixture.name);
    assertNoSensitiveRawValues(fixture.name, fixture.raw);
    assertNoRawRequestBodies(fixture.name, fixture.bundle);
    assertJourneyEvidenceRefs(fixture.name, fixture.bundle);
    assertVendorEvidenceRefs(fixture.name, fixture.bundle);
  }
});

async function loadSavedBundleFixtures(): Promise<Array<{
  name: string;
  raw: unknown;
  bundle: CanonicalEvidenceBundle;
}>> {
  const files = (await readdir(fixtureDir))
    .filter((file) => file.endsWith(".json"))
    .sort();
  const fixtures = [];
  for (const file of files) {
    const rawText = await readFile(path.join(fixtureDir, file), "utf8");
    const raw = JSON.parse(rawText) as unknown;
    fixtures.push({
      name: file.replace(/\.json$/, ""),
      raw,
      bundle: canonicalEvidenceBundleSchema.parse(raw),
    });
  }
  return fixtures;
}

function assertNoSensitiveRawValues(fixtureName: string, value: unknown): void {
  walk(value, [], (keyPath, item) => {
    const key = keyPath.at(-1) ?? "";
    const normalizedKey = key.toLowerCase();

    if (
      typeof item === "string" &&
      /(secret|password|bearer\s+|authorization|raw_cookie_value|sessionid=|token=)/i.test(item)
    ) {
      assert.fail(`${fixtureName}: sensitive-looking string at ${keyPath.join(".")}`);
    }

    if (
      typeof item === "string" &&
      ["value", "cookievalue", "requestbody", "responsebody", "body"].includes(normalizedKey)
    ) {
      assert.fail(`${fixtureName}: raw value/body field at ${keyPath.join(".")}`);
    }
  });
}

function assertNoRawRequestBodies(fixtureName: string, bundle: CanonicalEvidenceBundle): void {
  for (const event of bundle.networkEvents) {
    assert.equal(
      event.requestPayloadSignals?.bodyPresent,
      false,
      `${fixtureName}: ${event.eventId} has bodyPresent=true`,
    );
  }
  for (const response of bundle.networkResponseEvents) {
    assert.deepEqual(
      response.setCookieHeaders,
      [],
      `${fixtureName}: ${response.eventId} stores raw Set-Cookie headers`,
    );
  }
  for (const cookie of bundle.cookieEvents) {
    assert.equal(cookie.valueRedacted, true, `${fixtureName}: ${cookie.eventId} is not redacted`);
  }
}

function assertJourneyEvidenceRefs(fixtureName: string, bundle: CanonicalEvidenceBundle): void {
  const eventIds = eventIdSet(bundle);
  for (const journey of bundle.observedJourneys) {
    assert.notEqual(
      journey.eventRefs.length,
      0,
      `${fixtureName}: ${journey.journeyId} has no eventRefs`,
    );
    assert.notEqual(
      journey.evidenceRefs.length,
      0,
      `${fixtureName}: ${journey.journeyId} has no evidenceRefs`,
    );
    for (const ref of [...journey.eventRefs, ...journey.evidenceRefs]) {
      assert.equal(
        ref.eventId ? eventIds.has(ref.eventId) : false,
        true,
        `${fixtureName}: ${journey.journeyId} references unknown event ${ref.eventId}`,
      );
    }
  }
}

function assertVendorEvidenceRefs(fixtureName: string, bundle: CanonicalEvidenceBundle): void {
  const eventIds = eventIdSet(bundle);
  for (const vendor of bundle.normalizedVendorObservations) {
    assert.notEqual(
      vendor.matchedEvidenceIds.length,
      0,
      `${fixtureName}: ${vendor.observationId} has no matchedEvidenceIds`,
    );
    for (const eventId of vendor.matchedEvidenceIds) {
      assert.equal(
        eventIds.has(eventId),
        true,
        `${fixtureName}: ${vendor.observationId} references unknown event ${eventId}`,
      );
    }
    assert.notEqual(
      vendor.matchedEvidenceRefs.length,
      0,
      `${fixtureName}: ${vendor.observationId} has no matchedEvidenceRefs`,
    );
    assert.notEqual(
      vendor.matchSources.length,
      0,
      `${fixtureName}: ${vendor.observationId} has no matchSources`,
    );
    for (const ref of vendor.matchedEvidenceRefs) {
      assert.equal(
        ref.eventId ? eventIds.has(ref.eventId) : false,
        true,
        `${fixtureName}: ${vendor.observationId} has unknown matchedEvidenceRef ${ref.eventId}`,
      );
    }
    for (const source of vendor.matchSources) {
      assert.equal(
        source.sourceEventId ? eventIds.has(source.sourceEventId) : false,
        true,
        `${fixtureName}: ${vendor.observationId} has unknown match source event ${source.sourceEventId}`,
      );
      assert.equal(
        source.matchedValueRedacted !== undefined || source.matchedValueHash !== undefined,
        true,
        `${fixtureName}: ${vendor.observationId} match source lacks redacted/hash value`,
      );
    }
  }

  const vendorObservationIds = new Set(
    bundle.normalizedVendorObservations.map((vendor) => vendor.observationId),
  );
  for (const journey of bundle.observedJourneys) {
    for (const observationId of journey.relatedVendorObservationIds) {
      assert.equal(
        vendorObservationIds.has(observationId),
        true,
        `${fixtureName}: ${journey.journeyId} references unknown vendor observation ${observationId}`,
      );
    }
    if (journey.relatedVendors.length > 0) {
      assert.notEqual(
        journey.relatedVendorObservationIds.length,
        0,
        `${fixtureName}: ${journey.journeyId} has related vendors but no relatedVendorObservationIds`,
      );
    }
  }
}

function eventIdSet(bundle: CanonicalEvidenceBundle): Set<string> {
  return new Set([
    ...bundle.networkEvents,
    ...bundle.networkResponseEvents,
    ...bundle.cookieEvents,
    ...bundle.scriptEvents,
    ...bundle.iframeEvents,
    ...bundle.consentInteractionEvents,
  ].map((event) => event.eventId));
}

function walk(
  value: unknown,
  keyPath: string[],
  visit: (keyPath: string[], value: unknown) => void,
): void {
  visit(keyPath, value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, [...keyPath, String(index)], visit));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      walk(item, [...keyPath, key], visit);
    }
  }
}
