import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { buildConsentBootstrapScript } from "./consent-bootstrap";

function bootstrap(hostname: string, referrer: string, consent = "granted", tag = "G-TEST") {
  const scripts: unknown[] = [];
  const window = {
    location: { hostname },
    localStorage: { getItem: () => consent },
    dataLayer: [] as IArguments[],
    certscoreLoadGoogleTag: undefined as undefined | (() => void),
  };
  const document = {
    referrer,
    getElementsByTagName: () => [{ parentNode: { insertBefore: (script: unknown) => scripts.push(script) } }],
    createElement: () => ({}),
  };
  vm.runInNewContext(buildConsentBootstrapScript(tag), { window, document, URL });
  return { window, scripts, calls: () => window.dataLayer.map((args) => Array.from(args)) };
}

test("production Google tag stays off on localhost, preview domains, and without consent", () => {
  for (const host of ["localhost", "127.0.0.1", "preview.certscore.ai", "certscore.ai.example.com"]) {
    assert.equal(bootstrap(host, "").scripts.length, 0);
  }
  assert.equal(bootstrap("certscore.ai", "", "denied").scripts.length, 0);
  assert.equal(bootstrap("certscore.ai", "", "granted", "").scripts.length, 0);
});

test("OAuth return attribution is ignored only for the exact Google accounts host", () => {
  const result = bootstrap("certscore.ai", "https://accounts.google.com/");
  assert.equal(result.scripts.length, 1);
  assert.equal((result.calls().find((call) => call[0] === "config")?.[2] as { ignore_referrer?: boolean }).ignore_referrer, true);
  result.window.certscoreLoadGoogleTag?.();
  assert.equal(result.scripts.length, 1);
  for (const referrer of ["", "bad URL", "https://www.google.com/search?q=cookies", "https://accounts.google.com.example.com/"]) {
    const config = bootstrap("www.certscore.ai", referrer).calls().find((call) => call[0] === "config")?.[2] as object;
    assert.equal("ignore_referrer" in config, false);
  }
});

test("campaign GPC and invitation routes suppress third-party scripts even with prior consent", () => {
  for (const [pathname,gpc] of [["/black-friday",true],["/black-friday/apply",true],["/black-friday/activate",false]] as const) {
    const scripts:unknown[]=[];
    const window={location:{hostname:"certscore.ai",pathname},navigator:{globalPrivacyControl:gpc},localStorage:{getItem:()=>"granted"},dataLayer:[]};
    const document={referrer:"",getElementsByTagName:()=>[{parentNode:{insertBefore:(s:unknown)=>scripts.push(s)}}],createElement:()=>({setAttribute(){},addEventListener(){}})};
    vm.runInNewContext(buildConsentBootstrapScript("G-TEST",{scriptUrl:"https://analytics.example/script.js",websiteId:"test"}),{window,document,URL});
    assert.equal(scripts.length,0,pathname);
  }
});
