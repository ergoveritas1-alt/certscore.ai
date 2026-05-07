import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "./route";

test("scan-url-preflight route returns a structured validation status", async () => {
  const response = await POST(
    new Request("http://localhost/api/scan-url-preflight", {
      body: JSON.stringify({ domain: "localhost" }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    })
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.status, "invalid_url");
  assert.equal(payload.requiresConfirmation, false);
});
