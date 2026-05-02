import assert from "node:assert/strict";
import test from "node:test";
import { isRecognizedSessionCookieName } from "./middleware";

test("recognizes Better Auth session cookie names", () => {
  assert.equal(isRecognizedSessionCookieName("session_token"), true);
  assert.equal(isRecognizedSessionCookieName("__Secure-session_token"), true);
  assert.equal(isRecognizedSessionCookieName("certscore.session_token"), true);
  assert.equal(isRecognizedSessionCookieName("__Secure-certscore.session_token"), true);
  assert.equal(isRecognizedSessionCookieName("certscore_session"), true);
});

test("rejects unrelated cookies", () => {
  assert.equal(isRecognizedSessionCookieName("session_data"), false);
  assert.equal(isRecognizedSessionCookieName("__Secure-session_data"), false);
  assert.equal(isRecognizedSessionCookieName("csrf_token"), false);
});
