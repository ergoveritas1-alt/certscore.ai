/** Local synthetic review only: no application env, scanner, DB or public request. */
import assert from "node:assert/strict";
import {deriveConsentControlAssessment} from "@certscore/contracts";
import {createRequire} from "node:module";
import {createServer} from "node:http";
import {once} from "node:events";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {performance} from "node:perf_hooks";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {chromium} from "playwright";
import {gpcProductFixture} from "../apps/web/lib/scans/test-fixtures/gpc-product";
import {projectCmpAudit} from "../apps/web/lib/scans/cmp-audit-projection";
import {CmpDetails} from "../apps/web/components/scans/cmp-details";
import {GpcEvidenceIndexCard} from "../apps/web/components/scans/report-lab/shadow-scan-report";
import {buildUnifiedFindingDisplayPackets} from "../apps/web/lib/scans/unified-findings";
import {buildGpcResponseReportProjection} from "../apps/web/components/scans/report-lab/gpc-report-projection";
import {buildGpcProductionObservation} from "../packages/certscore-scan-core/src/gpc-production-observation";
import {buildGpcGuidance} from "../apps/web/lib/scans/gpc-guidance";
import {buildCanonicalReportExport} from "../apps/web/server/scans/report-export";
import {renderCanonicalReportPdf} from "../apps/web/server/scans/report-export-pdf";
import {priorityReportFixture,priorityScanRecord} from "../apps/web/server/scans/report-priority.fixture";

async function main() {
  const out=process.argv.find(arg=>arg.startsWith("--output="))?.slice("--output=".length)??"outputs/cmp-readiness-2026-11-02";
  if(!out.startsWith("outputs/") || out.includes(".."))throw Error("Expected a separate local outputs directory.");
  await mkdir(out,{recursive:true});
  const f=gpcProductFixture({scanId:"00000000-0000-4000-8000-000000000001",notReady:"signal_status_not_ready",baselineReadbackIncomplete:true});
  const findings=buildUnifiedFindingDisplayPackets({runtimeArtifacts:{gpcResponseAssessment:f.assessment,gpcActivityComparison:f.activityComparison},reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map()});
  const projection=buildGpcResponseReportProjection(findings)!;
  const consent=process.argv.includes("--cmp-loading") ? deriveConsentControlAssessment({
    scan:{scanId:f.gpc.scanId,requestedUrl:"https://example.test/",finalUrl:"https://example.test/",noGo:false},
    document:{canonicalDocumentId:"https://example.test/",observedDocumentIds:["https://example.test/"],identityStatus:"matched",
      canonicalDocumentToken:"synthetic-consent-document",observedDocumentTokens:["synthetic-consent-document"]},
    coverage:{status:"limited",requiredChannels:["dom_inventory","geometry"],completedChannels:[],incompleteChannels:["dom_inventory","geometry"],
      reasonCodes:["consent_session_access_limited","loading_or_stalled"]},
    source:{computedAt:"2026-11-02T00:00:00.000Z"},
  }) : null;
  const audit=projectCmpAudit({scanId:f.gpc.scanId,consentVendor:"OneTrust",consentControlAssessment:consent,checklistRows:[{
    id:"privacy_notice_availability",status:"Observed",evidenceState:"observed",assessmentStatus:"checked",
  } as never]});
  assert.equal(audit.experience?.mode,"capture_limited");
  assert.equal(projection.cmpStateComparison,undefined);
  const report=priorityReportFixture();report.projection.unifiedFindings=findings as never;
  report.consentControlAssessment=consent;
  const record=priorityScanRecord(report);
  record.runtimeArtifacts={...record.runtimeArtifacts,cmpVendorName:"OneTrust"};
  const ca=buildCanonicalReportExport(record,undefined,"ccpa_cpra")!, eu=buildCanonicalReportExport(record,undefined,"gdpr_eprivacy")!;
  assert.equal(ca.gpcResponse?.observation?.scanId,ca.scan.id);
  await writeFile(`${out}/california.pdf`,renderCanonicalReportPdf(ca));
  await writeFile(`${out}/eu.pdf`,renderCanonicalReportPdf(eu));
  const previous=structuredClone(f.assessment);delete previous.observation.semanticReadiness;
  const newGuidance=buildGpcGuidance(f.assessment,findings)!,oldGuidance=buildGpcGuidance(previous,findings)!;
  const priorReleaseGuidance=structuredClone(oldGuidance);
  const neutral=priorReleaseGuidance.items.find(item=>item.kind==="neutral")!;
  neutral.observation="GPC delivery: verified on the page request and browser property. CMP semantic observation: not_ready.";
  neutral.whatToCheck=neutral.whatToCheck.slice(0,1);
  const bytes=(v:unknown)=>Buffer.byteLength(JSON.stringify(v));
  const measure=(run:()=>unknown)=>{
    const times=[];for(let i=0;i<220;i++){const start=performance.now();run();if(i>=20)times.push(performance.now()-start);}
    times.sort((a,b)=>a-b);return {medianMs:times[100],p95Ms:times[190],maxMs:times.at(-1)};
  };
  const metrics={syntheticOnly:true,readinessFieldBytes:bytes(f.assessment.observation)-bytes(previous.observation),
    cmpAvailabilityBytes:bytes(audit.experience!.availability),
    cmpProjection:measure(()=>projectCmpAudit({scanId:f.gpc.scanId,consentVendor:"OneTrust",consentControlAssessment:consent})),
    guidanceReasonBytes:bytes(newGuidance)-bytes(oldGuidance),guidanceTotalBytes:bytes(newGuidance),
    guidanceAddedBytes:bytes(newGuidance)-bytes(priorReleaseGuidance),
    // Whole local producer timings include existing byte/schema/recipient work.
    producer:measure(()=>buildGpcProductionObservation({scanId:f.gpc.scanId,source:f.gpcSource})),
    guidance:measure(()=>buildGpcGuidance(f.assessment,findings)),productionCoverage:"not_measured",lambdaSavings:"not_measured"};
  await writeFile(`${out}/metrics.json`,JSON.stringify(metrics,null,2));
  if(process.argv.includes("--metrics-only")) {process.stdout.write(JSON.stringify(metrics,null,2)+"\n");return;}
  const markup=renderToStaticMarkup(<main className="mx-auto max-w-4xl p-3"><h1 className="mb-4 text-xl font-semibold">CertScore.ai · synthetic CMP and GPC review</h1><CmpDetails audit={audit} vendor="OneTrust" /><GpcEvidenceIndexCard projection={projection} california /></main>);
  const localRequire=createRequire(new URL("../apps/web/package.json",import.meta.url));
  const css=await localRequire("postcss")([localRequire("tailwindcss")({content:[{raw:markup,extension:"html"}]})])
    .process("@tailwind base; @tailwind components; @tailwind utilities;",{from:undefined});
  const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CertScore.ai local review</title><style>${css.css}</style></head><body>${markup}</body></html>`;
  const logo=await readFile("apps/web/public/vendor-logos/onetrust.png");
  const server=createServer((req,res)=>{
    if(req.url==="/vendor-logos/onetrust.png"){res.setHeader("content-type","image/png");res.end(logo);return;}
    if(req.url!=="/cmp-readiness-fixture"){res.writeHead(404).end();return;}
    res.setHeader("content-type","text/html; charset=utf-8");res.end(html);
  });
  // Inspect the listener before running. Never replace an existing preview.
  server.listen(3000,"localhost");await once(server,"listening");
  const browser=await chromium.launch({headless:true}),unexpected:string[]=[],errors:string[]=[];
  try {
    for(const width of [390,1280]) {
      const context=await browser.newContext({viewport:{width,height:1100},serviceWorkers:"block"});
      await context.route("**/*",async route=>{
        if(!["http://localhost:3000/cmp-readiness-fixture","http://localhost:3000/vendor-logos/onetrust.png"].includes(route.request().url()) || route.request().method()!=="GET") {
          unexpected.push(route.request().url());await route.abort();return;
        }
        await route.continue();
      });
      const page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));
      await page.goto("http://localhost:3000/cmp-readiness-fixture",{waitUntil:"load"});
      const cmp=page.locator("#cmp-details"),gpc=page.locator("#gpc-evidence");
      for(const card of [cmp,gpc]) {
        await card.locator(":scope > summary").focus();await page.keyboard.press("Enter");assert.equal(await card.getAttribute("open"),"");
      }
      assert.match(await cmp.innerText(),/OneTrust identified/);
      assert.doesNotMatch(await cmp.innerText(),/Provider: Not determined/);
      const why=cmp.getByText("Why detailed CMP checks are unavailable",{exact:true});
      await why.focus();await page.keyboard.press("Space");assert.equal(await why.locator("..").getAttribute("open"),"");
      if(consent)assert.match(await cmp.innerText(),/Loading or stalled page evidence was recorded/);
      assert.equal(await page.getByRole("table",{name:"Site-recorded opt-out settings"}).count(),0);
      const summary=page.getByText(projection.guidance!.items[0]!.observation,{exact:true});
      await summary.focus();await page.keyboard.press("Space");assert.equal(await summary.locator("..").getAttribute("open"),"");
      assert.match(await gpc.innerText(),/signal status other than ready/);
      assert.match(await gpc.innerText(),/GPC-off browser readback was not verified/);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.screenshot({path:`${out}/web-${width}.png`,fullPage:true});await context.close();
    }
    assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
    await writeFile(`${out}/browser-review.json`,JSON.stringify({syntheticOnly:true,widths:[390,1280],keyboardEnter:true,keyboardSpace:true,pageOverflow:false,unexpectedRequests:unexpected,pageErrors:errors,publicRequests:0},null,2));
  } finally {await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
  process.stdout.write(JSON.stringify(metrics,null,2)+"\n");
}
void main();
