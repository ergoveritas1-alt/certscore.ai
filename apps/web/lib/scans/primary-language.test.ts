import assert from "node:assert/strict";
import test from "node:test";
import { guessPrimaryLanguage, inferPrimaryLanguage } from "./primary-language";

test("declared page language wins over weaker URL and text hints", () => {
  assert.equal(guessPrimaryLanguage({
    declaredLanguages: ["de-DE"],
    textSamples: ["The website includes some English navigation text."],
    urls: ["https://example.com"]
  }), "de");
});

test("uses retained text and script evidence when no declaration is available", () => {
  assert.equal(guessPrimaryLanguage({
    textSamples: ["Bienvenue sur notre site. Nous utilisons des informations pour vous fournir nos services."],
    urls: ["https://example.com"]
  }), "fr");
  assert.equal(guessPrimaryLanguage({
    textSamples: ["すべてのユーザーに最新情報を提供します。プライバシーポリシーをご確認ください。"],
    urls: ["https://example.jp"]
  }), "ja");
});

test("uses locale paths and country TLDs without guessing from generic domains", () => {
  assert.equal(guessPrimaryLanguage({ urls: ["https://example.com/de/produkte"] }), "de");
  assert.equal(guessPrimaryLanguage({ urls: ["https://example.cn"] }), "zh");
  assert.equal(guessPrimaryLanguage({ urls: ["https://example.edu"] }), null);
  assert.equal(guessPrimaryLanguage({ urls: ["https://nonenglish.example.com"] }), null);
});

test("can correct a weak stored locale with stronger site evidence", () => {
  assert.equal(guessPrimaryLanguage({
    matchedLocales: ["en"],
    urls: ["https://example.de"]
  }), "de");
});

test("repeated canonical consent and policy locale matches form a best guess", () => {
  assert.equal(guessPrimaryLanguage({ matchedLocales: ["pl", "pl", "en"] }), "pl");
});

test("returns source and confidence with the best supported language", () => {
  assert.deepEqual(inferPrimaryLanguage({ declaredLanguages: ["fr-CA"], urls: ["https://example.com"] }), {
    confidence: "high",
    locale: "fr",
    source: "declared"
  });
  assert.deepEqual(inferPrimaryLanguage({ urls: ["https://example.de"] }), {
    confidence: "low",
    locale: "de",
    source: "url_hint"
  });
});
