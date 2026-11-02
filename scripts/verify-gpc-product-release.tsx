/** Hermetic UI and serialization review. No application env, DB, scanners or public requests. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { gpcProductFixture } from "../apps/web/lib/scans/test-fixtures/gpc-product";
import { buildUnifiedFindingDisplayPackets } from "../apps/web/lib/scans/unified-findings";
import { buildGpcResponseReportProjection } from "../apps/web/components/scans/report-lab/gpc-report-projection";
import { GpcEvidenceIndexCard } from "../apps/web/components/scans/report-lab/shadow-scan-report";
import { buildGpcCmpStateComparison } from "../packages/certscore-scan-core/src/gpc-cmp-state-comparison";
import { buildGpcGuidance } from "../apps/web/lib/scans/gpc-guidance";
import { buildCanonicalReportExport } from "../apps/web/server/scans/report-export";
import { renderCanonicalReportPdf } from "../apps/web/server/scans/report-export-pdf";
import { priorityReportFixture, priorityScanRecord } from "../apps/web/server/scans/report-priority.fixture";
import { apiV2GpcResponseSchema } from "@certscore/api-contracts";

async function main() {
  const out = "outputs/gpc-product-release";
  await mkdir(out,{recursive:true});
  const f = gpcProductFixture({scanId:"00000000-0000-4000-8000-000000000001",contradiction:true,
    urls:["https://stats.g.doubleclick.net/g/collect?v=2&tid=G-ABC123&cid=visitor-fixture"]});
  const findings = buildUnifiedFindingDisplayPackets({runtimeArtifacts:{gpcResponseAssessment:f.assessment,gpcCmpStateComparison:f.cmpStateComparison,gpcActivityComparison:f.activityComparison},reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map()});
  const projection = buildGpcResponseReportProjection(findings)!;
  assert.ok(projection.cmpStateComparison);
  const report = priorityReportFixture();
  report.projection.unifiedFindings = findings as never;
  const record = priorityScanRecord(report);
  const ca = buildCanonicalReportExport(record,undefined,"ccpa_cpra")!, eu = buildCanonicalReportExport(record,undefined,"gdpr_eprivacy")!;
  apiV2GpcResponseSchema.parse(ca.gpcResponse);
  await writeFile(`${out}/california.pdf`,renderCanonicalReportPdf(ca));
  await writeFile(`${out}/eu.pdf`,renderCanonicalReportPdf(eu));
  await writeFile(`${out}/canonical-synthetic.json`,JSON.stringify(ca,null,2));
  const measure = (work: () => unknown) => { const times:number[]=[];for(let i=0;i<120;i++){const t=performance.now();work();if(i>=20)times.push(performance.now()-t);}times.sort((a,b)=>a-b);return {medianMs:times[50],p95Ms:times[95],maxMs:times.at(-1)}; };
  const largest = gpcProductFixture({contradiction:true,priorCmpState:true,urls:Array.from({length:8},()=>[
    "https://stats.g.doubleclick.net/g/collect?v=2&tid=G-ABC123&cid=visitor-fixture",
    "https://securepubads.g.doubleclick.net/gampad/ads?gpp=DBAA&gpp_sid=8&us_privacy=1NYN",
    "https://securepubads.g.doubleclick.net/gampad/ads?gpp=&gpp_sid=&us_privacy=1NYN",
  ]).flat()});
  const largestFindings = buildUnifiedFindingDisplayPackets({runtimeArtifacts:{gpcResponseAssessment:largest.assessment},reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map()});
  const largestGuidance = buildGpcGuidance(largest.assessment,largestFindings)!;
  assert.equal(largestGuidance.items.length,5);
  const metrics = { syntheticOnly:true,
    fiveCaseGuidanceBytes:Buffer.byteLength(JSON.stringify(largestGuidance)),
    fiveCaseDiagnosis:measure(()=>buildGpcGuidance(largest.assessment,largestFindings)), sourceByteLengths:{baseline:f.baselineSource.bytes.length,gpc:f.gpcSource.bytes.length},
    packetBytes:Buffer.byteLength(JSON.stringify(f.cmpStateComparison)), guidanceBytes:Buffer.byteLength(JSON.stringify(projection.guidance)),
    producer:measure(()=>buildGpcCmpStateComparison({scanId:f.gpc.scanId,targetUrl:f.gpc.normalizedUrl,baseline:f.baselineSource,gpc:f.gpcSource})),
    diagnosis:measure(()=>buildGpcGuidance(f.assessment,findings)), publicGpcResponseBytes:Buffer.byteLength(JSON.stringify(ca.gpcResponse)) };
  await writeFile(`${out}/metrics.json`,JSON.stringify(metrics,null,2));
  const css = await readFile(`${out}/fixture.css`,"utf8");
  const markup = renderToStaticMarkup(<main className="mx-auto max-w-4xl p-3"><h1 className="mb-4 text-xl font-semibold">CertScore.ai · synthetic GPC release review</h1><GpcEvidenceIndexCard projection={projection} california /></main>);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CertScore.ai synthetic GPC review</title><style>${css}</style></head><body>${markup}</body></html>`;
  const server = createServer((req,res)=>{assert.equal(req.url,'/gpc-product-fixture');res.setHeader('content-type','text/html; charset=utf-8');res.end(html);});
  // Port inspection must precede this script. EADDRINUSE fails without replacing a listener.
  server.listen(3000,"localhost");await once(server,'listening');
  const browser = await chromium.launch({headless:true});
  const unexpected:string[]=[];
  try {
    for(const width of [390,1280]){
      const context=await browser.newContext({viewport:{width,height:1100},serviceWorkers:"block"});
      await context.route('**/*',async route=>{if(route.request().url()!=="http://localhost:3000/gpc-product-fixture"){unexpected.push(route.request().url());await route.abort();return;}await route.continue();});
      const page=await context.newPage();
      await page.goto("http://localhost:3000/gpc-product-fixture",{waitUntil:"load"});
      const card=page.locator('#gpc-evidence');
      await card.locator(':scope > summary').focus();await page.keyboard.press('Enter');
      assert.equal(await card.getAttribute('open'),'');
      assert.equal(await page.getByRole('table',{name:'Site-recorded opt-out settings'}).count(),1);
      const summary=page.getByText('Snapshot evidence and timing',{exact:true});
      await summary.focus();await page.keyboard.press('Space');
      assert.equal(await summary.locator('..').getAttribute('open'),'');
      const diagnosis=page.getByText(projection.guidance!.items[0]!.observation,{exact:true});
      await diagnosis.focus();await page.keyboard.press('Enter');
      assert.equal(await diagnosis.locator('..').getAttribute('open'),'');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no page overflow');
      await page.screenshot({path:`${out}/web-${width}.png`,fullPage:true});
      await context.close();
    }
    assert.deepEqual(unexpected,[]);
    await writeFile(`${out}/browser-review.json`,JSON.stringify({url:"http://localhost:3000/gpc-product-fixture",widths:[390,1280],keyboardEnter:true,keyboardSpace:true,pageOverflow:false,unexpectedRequests:unexpected,publicRequests:0},null,2));
  } finally {await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
  process.stdout.write(JSON.stringify(metrics,null,2)+"\n");
}
void main();
