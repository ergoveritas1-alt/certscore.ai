import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "./route";

test("reflects only the ALB-observed rightmost source IP", async () => {
  const response = GET(new Request("https://certscore.ai/.well-known/certscore-egress", {
    headers: {
      "cf-connecting-ip": "192.0.2.99",
      "x-forwarded-for": "198.51.100.200, 203.0.113.42",
    },
  }));

  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.deepEqual(await response.json(), {
    artifactVersion: "certscore.egress-reflection.v1",
    ip: "203.0.113.42",
  });
});

test("fails closed when the trusted ALB source slot is unavailable", async () => {
  const response = GET(new Request("https://certscore.ai/.well-known/certscore-egress", {
    headers: { "x-real-ip": "198.51.100.200" },
  }));

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "trusted_source_ip_unavailable",
    type: "certscore_egress_reflector_error",
  });
});
