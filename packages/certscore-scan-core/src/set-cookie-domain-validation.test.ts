import assert from "node:assert/strict";
import test from "node:test";
import { isValidSetCookieDomainForResponse } from "./scanners/pre-consent-runtime-scanner.js";

test("accepts host and parent-domain cookies but rejects cross-registrable-domain attribution", () => {
  assert.equal(isValidSetCookieDomainForResponse("api.example.com", "api.example.com"), true);
  assert.equal(isValidSetCookieDomainForResponse("example.com", "api.example.com"), true);
  assert.equal(isValidSetCookieDomainForResponse("eventbrite.ca", "www.eventbrite.ca"), true);
  assert.equal(isValidSetCookieDomainForResponse("eventbrite.com", "www.eventbrite.ca"), false);
  assert.equal(isValidSetCookieDomainForResponse("zoominfo.com", "bzrcdn.openai.com"), false);
});
