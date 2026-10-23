/** Local component/browser regression. All HTTP is intercepted on localhost:3000;
 * no database, scanner, payment service or real account is contacted. */
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { build } from "esbuild";
import { chromium } from "playwright";

async function main() {
  const output = "tmp/first-scan-onboarding";
  mkdirSync(output, { recursive: true });
  const bundle = await build({
    stdin: { contents: `
      import React,{useState} from 'react'; import {createRoot} from 'react-dom/client';
      import {AddDomainForm} from './apps/web/components/domains/add-domain-form';
      import {EmptyScanHistory} from './apps/web/components/scans/empty-scan-history';
      import {TrialScanAllowance} from './apps/web/components/scans/trial-scan-allowance';
      import {ProductAnalyticsTracker} from './apps/web/components/analytics/product-analytics-tracker';
      import {AppShell} from './apps/web/components/dashboard/app-shell';
      window.fixtureActions=[];
      function App(){const [usage,setUsage]=useState({monthlyLimit:10,monthlyScansUsed:0});
        const [plan,setPlan]=useState('free'); const [status,setStatus]=useState('active');
        window.setFixtureUsage=setUsage;window.setFixturePlan=setPlan;window.setFixtureStatus=setStatus;
        return <AppShell organizationName="Fixture workspace" userEmail="fixture@example.test" plan={plan}>
          <ProductAnalyticsTracker/>
          {location.pathname==='/app/scans'?<EmptyScanHistory/>:<>
          <h1 className="mb-5 text-2xl font-semibold">Overview</h1>
          <section id="scan-a-site" className="max-w-xl scroll-mt-24 space-y-4 rounded-2xl border bg-white p-5">
          <h2 className="text-xl font-semibold">Scan your first website</h2>
          <TrialScanAllowance planCode={plan} planStatus={status} usage={usage}/>
          <AddDomainForm planCode={plan}/></section>
          <form id="ordinary-form" hidden action={async()=>{window.ordinarySubmitted=true}} data-analytics-form="ordinary"><button type="submit">Ordinary form</button></form>
          </>}
        </AppShell>}
      createRoot(document.getElementById('root')).render(<App/>);`, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, platform: "browser", jsx: "automatic", tsconfig: "tsconfig.base.json",
    define: { "process.env": JSON.stringify({ NODE_ENV: "development" }) },
    plugins: [{ name: "fixture-boundaries", setup(b) {
      b.onResolve({ filter: /^(next\/(navigation|link|image|web-vitals))$/ }, args => ({ path: args.path, namespace: "mock" }));
      b.onResolve({ filter: /server\/domains\/create-domain$/ }, () => ({ path: "action", namespace: "mock" }));
      b.onResolve({ filter: /marketing\/domain-scan-form$/ }, () => ({ path: "availability", namespace: "mock" }));
      b.onResolve({ filter: /analytics\/data-layer-events$/ }, () => ({ path: "conversions", namespace: "mock" }));
      b.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ loader: "jsx", resolveDir: process.cwd(), contents: ({
        "next/navigation": "export function usePathname(){return location.pathname}",
        "next/link": "import React from 'react';export default function Link({prefetch,children,...props}){return <a {...props}>{children}</a>}",
        "next/image": "import React from 'react';export default function Image({priority,...props}){return <img {...props}/>}",
        "next/web-vitals": "export function useReportWebVitals(){}",
        action: "export async function createDomainAction(_,form){window.fixtureActions.push(Object.fromEntries(form));return {error:'Fixture server rejection with private URL https://private.example.test/?secret=hidden'}}",
        availability: "export function buildRecentScanAvailabilityUrl(){return '/api/fixture-availability'}",
        conversions: "export function clearPendingScanStarted(){};export function markPendingScanStarted(){}"
      } as Record<string,string>)[args.path]! }));
    } }]
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.setDefaultTimeout(10_000);
    const events: any[] = [], errors: string[] = [], unexpected: string[] = [];
    page.on("pageerror", e => { errors.push(e.message); console.error("Browser error:", e.message); });
    await page.addInitScript(() => { (window as any).certscoreAnalyticsConsent = "denied"; });
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin !== "http://localhost:3000") { unexpected.push(url.origin); await route.abort(); return; }
      if (url.pathname === "/api/operational-events") { events.push(route.request().postDataJSON()); await route.fulfill({ json: { ok: true } }); return; }
      if (url.pathname === "/api/dashboard/scan-usage") { await route.fulfill({ json: { monthlyLimit: 10, monthlyScansUsed: 0, monthlyPeriodEnd: "2026-10-31" } }); return; }
      if (url.pathname === "/api/fixture-availability") { await route.fulfill({ json: { hasRecentReusableScan: false } }); return; }
      if (url.pathname.startsWith("/api/")) { await route.fulfill({ status: 403, json: {} }); return; }
      if (url.pathname === "/fixture.js") { await route.fulfill({ contentType: "application/javascript", body: bundle.outputFiles[0]!.text }); return; }
      if (url.pathname === "/fixture.css") { await route.fulfill({ contentType: "text/css", body: readFileSync(`${output}/styles.css`, "utf8") }); return; }
      if (url.pathname.endsWith(".png")) { await route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=", "base64") }); return; }
      await route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>' });
    });
    const submitted = () => events.filter(e => e.eventName === "form_submitted" && e.formId === "website_scan");
    async function waitFor(check: () => boolean) {
      for (let i=0; i<100; i++) { if(check())return;await new Promise(r=>setTimeout(r,20)); } assert.ok(check());
    }
    await page.goto("http://localhost:3000/app/scans");
    const sample = page.getByRole("link", { name: "Explore a sample report" });
    assert.match((await sample.getAttribute("href"))!, /\/scan\/[0-9a-f-]{36}$/);
    await page.screenshot({ path: `${output}/empty-mobile.png`, fullPage: true });
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth),false);
    await page.getByRole("link", { name: "Scan your first website" }).click();
    await page.getByLabel("Website address").waitFor();
    await waitFor(() => events.some(e => e.elementId === "empty_scans:start"));
    for (const width of [320,390,768,1280]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth), false, `overflow at ${width}`);
      const input = await page.getByLabel("Website address").boundingBox();
      const button = await page.getByRole("button",{name:"Scan website",exact:true}).boundingBox();
      assert.ok(input && button && button.y >= input.y + input.height, "submit must not overlap URL input");
      assert.ok(button.height >= 44, "touch target");
      assert.ok(await page.getByText("TRIAL",{exact:true}).isVisible());
      await page.screenshot({ path: `${output}/scan-${width}.png`, fullPage: true });
    }
    // Domains uses the same form in a 360px desktop card.
    await page.locator('#scan-a-site').evaluate(el => { (el as HTMLElement).style.width = '360px'; (el as HTMLElement).style.padding = '24px'; });
    const cardBounds = await page.locator('#scan-a-site').boundingBox();
    for (const control of [page.getByLabel('Website address'), page.getByRole('button', { name: 'Scan website', exact: true }), page.locator('[data-analytics-id="website_scan:options"]')]) {
      const bounds = await control.boundingBox();
      assert.ok(cardBounds && bounds && bounds.x + bounds.width <= cardBounds.x + cardBounds.width - 24, 'controls fit narrow desktop card');
    }
    await page.locator('#scan-a-site').evaluate(el => { (el as HTMLElement).removeAttribute('style'); });
    await page.setViewportSize({ width:390,height:844 });
    await page.getByRole("button", {name:"Scan website",exact:true}).click();
    await waitFor(() => events.some(e => e.feature === "scan_validation:website_required"));
    assert.equal(submitted().length,0); assert.equal(await page.evaluate(()=>(window as any).fixtureActions.length),0);
    await page.getByLabel("Website address").fill("   ");
    await page.getByRole("button",{name:"Scan website",exact:true}).click();
    await waitFor(() => events.filter(e => e.feature === "scan_validation:website_required").length===2);
    assert.equal(submitted().length,0);
    await page.getByLabel("Website address").fill("https://www.google.com/search?q=private-query");
    await page.getByRole("button",{name:"Scan website",exact:true}).click();
    await page.getByText("This looks like a search results link.",{exact:true}).waitFor();
    await waitFor(() => events.some(e => e.feature === "scan_validation:search_results_confirmation_required"));
    assert.equal(submitted().length,0);
    await page.getByRole("button",{name:"Scan search results page anyway",exact:true}).click();
    await waitFor(() => events.some(e => e.feature === "scan_validation:server_rejected"));
    assert.equal(submitted().length,1);
    assert.equal(await page.evaluate(()=>(window as any).fixtureActions[0].confirmedSearchResultsUrl),"https://www.google.com/search?q=private-query");
    await page.getByLabel("Website address").fill("example.com");
    await page.locator('[data-analytics-id="website_scan:options"]').click();
    await page.getByRole("option",{name:"California",exact:true}).click();
    await waitFor(() => events.some(e => e.elementId === "website_scan:options:california"));
    await page.getByRole("button",{name:"Scan website",exact:true}).click();
    await waitFor(() => events.filter(e => e.feature === "scan_validation:server_rejected").length===2);
    assert.equal(submitted().length,2);
    assert.equal(await page.evaluate(()=>(window as any).fixtureActions[1].scanFrom),"california");
    assert.equal(await page.evaluate(()=>(window as any).fixtureActions[1].localV2ScanProfile),"standard");
    await page.locator("#ordinary-form").evaluate(el => { (el as HTMLFormElement).hidden = false; });
    await page.getByRole("button",{name:"Ordinary form",exact:true}).click();
    await waitFor(() => events.some(e => e.eventName === "form_submitted" && e.formId === "ordinary"));
    assert.ok(await page.evaluate(()=>(window as any).ordinarySubmitted));
    assert.ok(events.some(e => e.eventName==="form_started" && e.formId==="website_scan"));
    const serialized = JSON.stringify(events);
    assert.ok(!serialized.includes("private-query") && !serialized.includes("private.example") && !serialized.includes("secret=hidden") && !serialized.includes("example.com"));
    await page.evaluate(()=>(window as any).setFixtureUsage({monthlyLimit:3,monthlyScansUsed:2}));
    await page.getByText(/Your trial has 1 scan remaining/).waitFor();
    await page.evaluate(()=>(window as any).setFixtureUsage({monthlyLimit:3,monthlyScansUsed:4}));
    await page.getByText("You’ve used your current trial scan allowance.").waitFor();
    assert.equal(await page.getByText(/No upgrade is needed/).count(),0);
    await page.evaluate(()=>(window as any).setFixtureUsage({monthlyLimit:null,monthlyScansUsed:4}));
    await page.getByText(/Your trial has scans available/).waitFor();
    await page.evaluate(()=>(window as any).setFixtureStatus('paused'));
    await page.getByText(/Your trial has scans available/).waitFor({state:'detached'});
    await page.evaluate(()=>{(window as any).setFixtureStatus('active');(window as any).setFixturePlan('pro')});
    assert.equal(await page.getByText(/No upgrade is needed/).count(),0);
    assert.deepEqual(errors,[]); assert.deepEqual(unexpected,[]);
    console.log("PASS: empty-history CTA, 320/390/768/1280 layouts, visible trial badge, dynamic/exhausted/paused/paid quota copy, required/confirmation/server outcomes, single valid submission, ordinary React form tracking, scan option payloads and telemetry redaction.");
  } finally { await browser.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1});
