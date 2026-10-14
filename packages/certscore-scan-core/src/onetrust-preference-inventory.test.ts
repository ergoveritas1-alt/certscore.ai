import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { readOneTrustInventoryInDocument } from "./onetrust-preference-inventory.js";

const read = (value: unknown) => JSON.parse(JSON.stringify(runInNewContext(`(() => { const __name = (fn) => fn; return (${readOneTrustInventoryInDocument.toString()})(); })()`, {
  window: { OneTrust: { GetDomainData: () => value } },
}) ?? null));

test("loaded OneTrust declarations retain names and explicit units without inventing services or completeness", () => {
  const input = { Groups: [{ CustomGroupId: "C0002", GroupName: "Analytics", FirstPartyCookies: [
    { Name: "_ga", Description: "Audience measurement", Lifespan: "2 years", CookieValue: "private" },
    { Name: "unit_unknown", Lifespan: "730" }, { Name: "session", IsSession: true },
  ], Hosts: [{ HostName: "example-analytics.test", Cookies: [{ Name: "host_cookie", Lifespan: "1 day" }] }] }] };
  const before = structuredClone(input), result = read(input);
  assert.deepEqual(result.categories, ["Analytics"]);
  assert.deepEqual(result.services, []);
  assert.deepEqual(result.declarations.map((row: any) => [row.name, row.duration]), [["_ga", "2 years"], ["unit_unknown", ""], ["session", "Session"], ["host_cookie", "1 day"]]);
  assert.equal(result.truncated, false); assert.equal(result.declarationInventoryComplete, undefined);
  assert.ok(!JSON.stringify(result).includes("private")); assert.deepEqual(input, before);
});

test("configuration parsing is bounded and missing or malformed API data supplies no invented evidence", () => {
  for (const value of [null, {}, { Groups: {} }, { Groups: [{ CustomGroupId: "bad id", FirstPartyCookies: [{ Name: "fake" }] }] }]) {
    const result = read(value); assert.ok(result === null || result.declarations.length === 0);
  }
  const result = read({ Groups: Array.from({ length: 65 }, (_, i) => ({ CustomGroupId: `C${i}`, GroupName: `Category ${i}`, FirstPartyCookies: Array.from({ length: 101 }, (_, j) => ({ Name: `cookie_${i}_${j}` })) })) });
  assert.equal(result.declarations.length, 100); assert.equal(result.truncated, true);
  assert.ok(result.categories.length <= 64);
});

test("named OneTrust services, linked general vendors and explicit host labels survive nested groups", () => {
  const input = { GeneralVendors: [{VendorCustomId:"V1",Name:"Named Analytics"},{VendorCustomId:"V2",Name:"Not linked"}], Groups:[{
    CustomGroupId:"C1",GroupName:"Necessary",FirstPartyCookies:[{Name:"OptanonConsent"}],Hosts:[
      {HostId:"H1",HostName:"media.example.test",DisplayName:"Named Media",Cookies:[{Name:"media_id"}]},
      {HostId:"H2",HostName:"tracking.example.test",DisplayName:"tracking.example.test",Cookies:[]},
      {HostName:"other.example.test",Cookies:[]},
    ], SubGroups:[{CustomGroupId:"C2",GroupName:"Analytics",GeneralVendorsIds:["V1"],VendorServices:[{CustomVendorServiceId:"S1",ServiceName:"Named Metrics"}]}],
  }] };
  const original=structuredClone(input), result=read(input);
  assert.deepEqual(new Set(result.services),new Set(["Named Media","Named Metrics","Named Analytics"]));
  assert.deepEqual(result.categories,["Necessary","Analytics"]);
  assert.deepEqual(result.declarations.map((row:any)=>row.name),["OptanonConsent","media_id"]);
  assert.deepEqual(result.coverage,{scope:"configured_services",configured:4,resolved:3,unresolved:1,truncated:false});
  assert.deepEqual(input,original);
  assert.ok(!result.services.includes("Not linked"));
});

test("hostnames, cookies and unlinked vendors never become service identities", () => {
  const result=read({GeneralVendors:[{VendorCustomId:"V1",Name:"Unused vendor"}],Groups:[{
    CustomGroupId:"C1",GroupName:"Analytics",FirstPartyCookies:[{Name:"_ga"}],Hosts:[
      {HostId:"H1",HostName:"google-analytics.com",DisplayName:"google-analytics.com"},
      {HostId:"H2",DisplayName:"https://example.test/vendor"},
      {HostId:"H3",DisplayName:"*.example.test"},
      {HostId:"H4",DisplayName:"localhost"},
      {DisplayName:"First-party cookies",Cookies:[]},
      {HostId:"H5",DisplayName:"[::1]"},{HostId:"H6",DisplayName:"例子.公司"},{HostId:"H7",DisplayName:"example.test."},
      {HostId:"H8",DisplayName:"example.test?token=not-a-service"},
    ],
  }]});
  assert.deepEqual(result.services,[]);
  assert.deepEqual(result.declarations.map((row:any)=>row.name),["_ga"]);
  assert.equal(result.coverage.resolved,0);
  assert.equal(result.coverage.unresolved,9);
});

test("conflicting vendor identities and absent linked entries stay unresolved", () => {
  const result=read({GeneralVendors:[{VendorCustomId:"V1",Name:"One"},{VendorCustomId:"V1",Name:"Different"}],Groups:[{
    CustomGroupId:"C1",GeneralVendorsIds:["V1","missing"],VendorServices:[
      {CustomVendorServiceId:"S1",ServiceName:"One"},{CustomVendorServiceId:"S1",ServiceName:"Different"},
      {CustomVendorServiceId:"S2",ServiceName:"Stable"},{CustomVendorServiceId:"S2",ServiceName:"Stable"},
    ],
  }]});
  assert.deepEqual(result.services,["Stable"]);
  assert.deepEqual(result.coverage,{scope:"configured_services",configured:4,resolved:1,unresolved:3,truncated:false});
});

test("cookie and service payloads share a bounded allowance and cyclic subgroups terminate", () => {
  const group:any={CustomGroupId:"C1",VendorServices:Array.from({length:101},(_,i)=>({CustomVendorServiceId:`S${i}`,ServiceName:`Service ${i}`})),FirstPartyCookies:[{Name:"_ga"}]};
  group.SubGroups=[group];
  const result=read({Groups:[group]});
  assert.equal(result.services.length,80);
  assert.equal(result.declarations.length,1,"Cookie headroom survives a prolific service list");
  assert.equal(result.coverage.truncated,true);
  assert.equal(result.truncated,true);
  const malformed=read({Groups:[{CustomGroupId:"C1",VendorServices:[{CustomVendorServiceId:"S1",ServiceName:"x".repeat(4097)},{CustomVendorServiceId:"S2",ServiceName:{Name:"fake"}}]}]});
  assert.deepEqual(malformed.services,[]);
  assert.equal(malformed.coverage.unresolved,2);
});

test("the single loaded getter read retains only a unique rendered CMP disclosure", async () => {
  const {chromium}=await import("playwright");
  const {readOneTrustPreferenceInventory}=await import("./onetrust-preference-inventory.js");
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage();
    const text="For this, we use unique identifiers like your IP address and share your data with 2 partners (Vimeo, Google).";
    for(const [html,expected] of [
      [`<div id="onetrust-banner-sdk"><p id="onetrust-policy-text">${text}</p></div>`,["Vimeo","Google"]],
      [`<p id="onetrust-policy-text">${text}</p>`,[]],
      [`<div id="onetrust-banner-sdk" hidden><p id="onetrust-policy-text">${text}</p></div>`,[]],
      [`<div id="onetrust-banner-sdk" style="opacity:0"><p id="onetrust-policy-text">${text}</p></div>`,[]],
      [`<div id="onetrust-banner-sdk"><p id="onetrust-policy-text">${text}</p><p id="onetrust-policy-text">${text}</p></div>`,[]],
      [`<div id="onetrust-banner-sdk"><p id="onetrust-policy-text">and share your data with 2 partners (<span hidden>Vimeo, Google</span>)</p></div>`,[]],
    ] as const){
      await page.setContent(`${html}<script>window.reads=0;window.OneTrust={GetDomainData:()=>{window.reads++;return {Groups:[]}}}</script>`);
      const result=await readOneTrustPreferenceInventory(page);
      assert.deepEqual(result?.serviceDisclosures.flatMap(d=>d.names),expected);
      assert.deepEqual(result?.services,[],"A disclosure is not a configured vendor identity");
      assert.equal(await page.evaluate(()=>(window as any).reads),1);
    }
  }finally{await browser.close();}
});
