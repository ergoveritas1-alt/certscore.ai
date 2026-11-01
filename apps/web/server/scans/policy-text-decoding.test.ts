import assert from "node:assert/strict";
import test from "node:test";
import {decodeBoundedPolicyText} from "./policy-text-decoding";

test("policy text keeps valid multilingual source content and existing whitespace normalization", () => {
  for (const text of ["Privacy policy", "Données à caractère personnel", "Dane osób – Łódź", "個人情報の保護", "An intentional replacement character: \uFFFD"]) {
    assert.equal(decodeBoundedPolicyText(Buffer.from(` \n${text}\t `)), text);
  }
  assert.equal(decodeBoundedPolicyText(Buffer.from("\uFEFFPolicy\r\ntext")), "Policy text");
  assert.equal(decodeBoundedPolicyText(Buffer.alloc(1_000_000, 32)), "");
});

test("malformed UTF-8 never becomes verified policy text through replacement decoding", () => {
  for (const bytes of [[0x80], [0xC0,0xAF], [0xED,0xA0,0x80], [0xF4,0x90,0x80,0x80], [0xE2,0x82], [0xFF]]) {
    const body=Buffer.concat([Buffer.from("Policy: "),Buffer.from(bytes)]);
    assert.match(body.toString("utf8"), /\uFFFD/, "The old decoder silently replaced these source bytes");
    assert.throws(()=>decodeBoundedPolicyText(body), /not valid bounded UTF-8 text/);
  }
});

test("empty, NUL and oversized policy bytes keep the same bounded failure without exposing content", () => {
  for (const body of [Buffer.alloc(0), Buffer.from("private\0policy"), Buffer.alloc(1_000_001, 97)]) {
    assert.throws(()=>decodeBoundedPolicyText(body), error=>error instanceof Error && error.message==="Policy text artifact is not valid bounded UTF-8 text.");
  }
});
