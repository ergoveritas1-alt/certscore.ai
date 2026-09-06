import assert from "node:assert/strict";
import test from "node:test";
import { normalizedVendorObservationSchema, vendorRegistryIdentitySchema } from "@certscore/contracts";
import baseline from "./registry-identity-baseline.json";
import fixtures from "../../certscore-contracts/src/test-fixtures/vendor-registry-attribution-v1.json";
import {
  getCanonicalVendorRegistryManifest, resolveCanonicalVendor, resolveVendorObservations,
  type VendorResolverInput,
} from "./index";

test("registry identifiers are frozen, collision-free, and independent of display labels", () => {
  const manifest = getCanonicalVendorRegistryManifest();
  assert.equal(new Set(manifest.rules.map(rule => rule.ruleId)).size, manifest.rules.length);
  const identityLabels = new Map<string, string>();
  for (const rule of manifest.rules) {
    const { entityId, vendorId, serviceId } = rule;
    vendorRegistryIdentitySchema.parse({ entityId, vendorId, serviceId });
    const frozen = baseline[rule.ruleId as keyof typeof baseline];
    if (frozen) assert.deepEqual([entityId, vendorId, serviceId], frozen, rule.ruleId);
    else assert.equal(rule.review.status, "source_reviewed", "New rules need documented review provenance");
    for (const [id, label] of [[entityId, rule.entity], [vendorId, JSON.stringify([rule.entity, rule.vendor])],
      [serviceId, JSON.stringify([rule.entity, rule.vendor, rule.product])]]) {
      if (identityLabels.has(id!)) assert.equal(identityLabels.get(id!), label, `Identity collision: ${id}`);
      identityLabels.set(id!, label!);
    }
    if (rule.review.status === "source_reviewed") {
      assert.match(rule.review.reviewedAt, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(Number.isFinite(Date.parse(rule.review.reviewedAt)));
      assert.ok(rule.review.reviewer.trim());
      assert.ok(rule.review.sourceUrls.length);
      for (const url of rule.review.sourceUrls) assert.equal(new URL(url).protocol, "https:");
    }
  }
  for (const ruleId of Object.keys(baseline)) assert.ok(manifest.rules.some(rule => rule.ruleId === ruleId), `Explicitly migrate retired rule: ${ruleId}`);
  for (const serviceId of new Set(manifest.rules.map(rule => rule.serviceId))) {
    assert.ok(manifest.rules.filter(rule => rule.serviceId === serviceId).length <= 32);
  }
});

test("shared retained attribution contract matches resolver output without changing observation IDs or risk", () => {
  for (const fixture of fixtures) {
    const resolved = resolveCanonicalVendor(fixture.input as VendorResolverInput);
    assert.equal(resolved.status, "resolved");
    assert.deepEqual(JSON.parse(JSON.stringify(normalizedVendorObservationSchema.parse(resolved.observation))), fixture.observation);
  }
});

test("specific UET endpoint beats a broad Microsoft host match regardless of registry order", () => {
  const input = { type: "request" as const, url: "https://bat.bing.com/action/0" };
  const candidates = resolveVendorObservations([input]);
  assert.ok(candidates.length > 1);
  assert.equal(candidates[0]?.product, "Microsoft browser identity support");
  const result = resolveCanonicalVendor(input);
  assert.equal(result.status, "resolved");
  assert.equal(result.observation?.product, "Microsoft Advertising / Bing UET");
  assert.equal(result.observation?.registryAttribution?.matchKind, "endpoint");
});

test("equally strong conflicting service matches remain ambiguous, not highest-confidence guesses", () => {
  const input = { type: "request" as const, url: "https://mc.yandex.com/metrika" };
  assert.ok(resolveVendorObservations([input]).length > 1);
  assert.deepEqual(resolveCanonicalVendor(input), { status: "ambiguous", observation: null });
});

test("URL authority cannot be overridden by an unrelated supplied hostname", () => {
  assert.equal(resolveCanonicalVendor({ type: "request", url: "https://example.com/app.js", hostname: "bat.bing.com" }).status, "unrecognized");
  assert.equal(resolveCanonicalVendor({ type: "request", url: "https://bat.bing.com/action/0", hostname: "example.com" }).observation?.product, "Microsoft Advertising / Bing UET");
  for (const url of ["https://www.google.com/search?q=/maps/embed", "https://www.google.com.example.com/maps/embed",
    "https://example.com/?url=https://www.google.com/maps/embed"]) {
    assert.notEqual(resolveCanonicalVendor({ type: "iframe", url }).observation?.product, "Google Maps embed");
  }
});

test("request and iframe observations share service identity, not event identity", () => {
  const url = "https://www.facebook.com/plugins/page.php";
  const request = resolveCanonicalVendor({ type: "request", url, evidenceId: "request-one" }).observation!;
  const frame = resolveCanonicalVendor({ type: "iframe", url, evidenceId: "frame-two" }).observation!;
  assert.deepEqual(request.registryAttribution, frame.registryAttribution);
  assert.notDeepEqual(request.matchedEvidenceIds, frame.matchedEvidenceIds);
  const merged = resolveVendorObservations([{ type: "request", url, evidenceId: "request-one" }, { type: "iframe", url, evidenceId: "frame-two" }]);
  assert.deepEqual(merged[0]?.matchedEvidenceIds, ["request-one", "frame-two"]);
  assert.equal(merged[0]?.registryAttribution?.ruleIds.length, 1);
});
