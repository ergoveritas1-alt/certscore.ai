import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { GET } from "./route";

function request(headers: Record<string,string>={}) {
  return new NextRequest("https://certscore.ai/api/public/scan-defaults",{headers});
}

test("country defaults are private uncached hints without retained location data", async () => {
  const response=GET(request({"cf-ipcountry":"US","x-forwarded-for":"192.0.2.1",cookie:"analytics=denied"}));
  assert.deepEqual(await response.json(),{scanFrom:"california"});
  assert.equal(response.headers.get("Cache-Control"),"private, no-store, max-age=0");
  assert.equal(response.headers.get("Set-Cookie"),null);
  assert.match(response.headers.get("Vary")!,/Cookie/);
  assert.deepEqual(await GET(request()).json(),{scanFrom:"eu_ie"});
  assert.deepEqual(await GET(request({"cf-ipcountry":"CA"})).json(),{scanFrom:"eu_ie"});
});

test("every recognized session-cookie shape preserves logged-in defaults", async () => {
  for (const name of ["session_token","__Secure-session_token","certscore.session_token","__Secure-certscore.session_token","certscore_session"]) {
    assert.deepEqual(await GET(request({"cf-ipcountry":"US",cookie:`${name}=fixture`})).json(),{scanFrom:null},name);
  }
  assert.deepEqual(await GET(request({"cf-ipcountry":"US",cookie:"session_data=fixture"})).json(),{scanFrom:"california"});
});
