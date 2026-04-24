import assert from "node:assert/strict";
import test from "node:test";
import { getRequestOrigin } from "./request-origin";

test("prefers forwarded host and proto when present", () => {
  const request = new Request("http://0.0.0.0:3000/auth/google?next=%2Fapp", {
    headers: {
      host: "0.0.0.0:3000",
      "x-forwarded-host": "localhost:3000",
      "x-forwarded-proto": "http"
    }
  });

  assert.equal(getRequestOrigin(request), "http://localhost:3000");
});

test("ignores bind host forwarded from production runtime", () => {
  const request = new Request("http://0.0.0.0:3000/logout", {
    headers: {
      host: "certscore.ai",
      "x-forwarded-host": "0.0.0.0:3000",
      "x-forwarded-proto": "https"
    }
  });

  assert.equal(getRequestOrigin(request), "https://certscore.ai");
});

test("uses localhost http when only host header is present", () => {
  const request = new Request("http://localhost:3000/auth/google?next=%2Fapp", {
    headers: {
      host: "localhost:3000"
    }
  });

  assert.equal(getRequestOrigin(request), "http://localhost:3000");
});

test("defaults external hosts to https", () => {
  const request = new Request("http://internal/auth/google?next=%2Fapp", {
    headers: {
      host: "www.certscore.ai"
    }
  });

  assert.equal(getRequestOrigin(request), "https://www.certscore.ai");
});
