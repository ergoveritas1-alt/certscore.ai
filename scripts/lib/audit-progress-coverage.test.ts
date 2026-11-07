import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import ts from "typescript";
import {COVERAGE_MAP} from "./audit-progress-coverage";

const read=(file:string)=>readFileSync(new URL(`../../${file}`,import.meta.url),"utf8");
const parse=(file:string)=>ts.createSourceFile(file,read(file),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function find(node:ts.Node,predicate:(n:ts.Node)=>boolean):ts.Node|undefined {
  if(predicate(node))return node;
  return ts.forEachChild(node,n=>find(n,predicate));
}
const reportFile="apps/web/components/scans/report-lab/shadow-scan-report.tsx";
const source=parse(reportFile);
const directory=find(source,n=>ts.isFunctionDeclaration(n)&&n.name?.text==="EvidenceDirectory")!;
const columns=find(directory,n=>ts.isJsxElement(n)&&n.openingElement.tagName.getText(source)==="EvidenceColumns") as ts.JsxElement;
function attribute(node:ts.JsxElement|ts.JsxSelfClosingElement,name:string){
  const attrs=ts.isJsxElement(node)?node.openingElement.attributes:node.attributes;
  return attrs.properties.find(p=>ts.isJsxAttribute(p)&&p.name.getText(source)===name) as ts.JsxAttribute|undefined;
}
const presentation=parse("apps/web/lib/scans/detailed-evidence-presentation.ts");
const titleDeclaration=find(presentation,n=>ts.isVariableDeclaration(n)&&n.name.getText(presentation)==="EVIDENCE_SECTION_TITLES")!;
const titleObject=find(titleDeclaration,ts.isObjectLiteralExpression) as ts.ObjectLiteralExpression;
const titles=Object.fromEntries(titleObject.properties.map(p=>{
  assert.ok(ts.isPropertyAssignment(p)&&ts.isStringLiteral(p.initializer));
  return [p.name.getText(presentation),p.initializer.text];
}));
function titleOf(node:ts.JsxElement){
  const header=find(node,n=>ts.isJsxSelfClosingElement(n)&&n.tagName.getText(source)==="EvidenceSectionHeader") as ts.JsxSelfClosingElement;
  assert.ok(header,"New evidence box has no reviewed header");
  const init=attribute(header,"title")?.initializer;
  if(init&&ts.isStringLiteral(init))return init.text;
  assert.ok(init&&ts.isJsxExpression(init)&&init.expression&&ts.isPropertyAccessExpression(init.expression));
  assert.equal(init.expression.expression.getText(source),"EVIDENCE_SECTION_TITLES");
  const title=titles[init.expression.name.text];assert.ok(title);return title;
}

test("coverage map matches every top-level customer evidence box, without counting nested cards twice",()=>{
  assert.ok(columns);
  const componentIds:Record<string,string>={CmpDetails:"cmp",AccessibilityEvidence:"accessibility",CaliforniaPrivacyWorkpaper:"privacy",GpcEvidenceIndexCard:"gpc",CmsSecurityEvidence:"cms"};
  const actual:string[]=[];
  function visit(n:ts.Node):void {
    if(ts.isJsxElement(n)||ts.isJsxSelfClosingElement(n)){
      const tag=(ts.isJsxElement(n)?n.openingElement.tagName:n.tagName).getText(source);
      if(tag==="details"){assert.ok(ts.isJsxElement(n));actual.push(titleOf(n));return;}
      if(tag==="SitewideEvidenceCard"){
        const group=attribute(n,"group")?.initializer;assert.ok(group&&ts.isStringLiteral(group));
        assert.ok(["tracking","runtime"].includes(group.text));actual.push(titles[group.text]!);return;
      }
      assert.ok(componentIds[tag],`Unmapped top-level report component: ${tag}`);
      actual.push(titles[componentIds[tag]!]!);return;
    }
    ts.forEachChild(n,visit);
  }
  for(const child of columns.children)visit(child);
  const integrity=attribute(columns,"siteIntegrity")?.getText(source);
  assert.match(integrity??"",/SiteIntegrityEvidence/);
  const integritySource=read("apps/web/components/scans/site-integrity-evidence.tsx");
  const integrityTitle=integritySource.match(/EvidenceSectionHeader title="([^"]+)"/)?.[1];assert.ok(integrityTitle);
  actual.unshift(integrityTitle);
  const reportRows=COVERAGE_MAP.filter(c=>c.kind==="report_box");
  assert.deepEqual(reportRows.map(c=>c.box),[...new Set(actual)]);
  assert.equal(new Set(reportRows.map(c=>c.id)).size,reportRows.length);
  assert.equal(reportRows.length,13);
  assert.ok(reportRows.every(c=>c.report&&c.visibility&&c.now&&c.gap));
  assert.equal(COVERAGE_MAP.filter(c=>c.kind==="audit_only").length,6);
});

test("reviewed component title sources and conditional visibility still match the map",()=>{
  const code=directory.getText(source);
  for(const guard of ['!compact ? <details aria-label="Site metadata"','!compact && report.metrics.forms > 0','report.accessibilityAudit ? <AccessibilityEvidence','GPC_CUSTOMER_RESULTS_ENABLED && reportSectionInFocus("gpc"','=== "ccpa_cpra" ? <CaliforniaPrivacyWorkpaper','report.acceptPath || report.rejectPath','compact && report.fullSite ? <SitewideEvidenceCard'])assert.ok(code.includes(guard),`Review changed box visibility: ${guard}`);
  assert.match(read("apps/web/components/scans/site-integrity-evidence.tsx"),/if \(!report.findings.length\) return null/);
  assert.match(read("apps/web/components/scans/cms-security-evidence.tsx"),/if \(!projection \|\| !projection.assessment.detections.length && !projection.pluginInventory\?\.detections.length && !projection.technologyInventory\?\.detections.length\) return null/);
  assert.match(read("apps/web/components/scans/cms-security-evidence.tsx"),/title=\{EVIDENCE_SECTION_TITLES.cms\}/);
  assert.match(read("apps/web/lib/scans/california-privacy-evidence.ts"),/title: EVIDENCE_SECTION_TITLES.privacy/);
  assert.match(read("apps/web/components/scans/regulatory-review-focus.tsx"),/EvidenceSectionHeader title=\{section.title\}/);
  assert.match(read("apps/web/lib/scans/cmp-audit-projection.ts"),/title: "CMP details"/);
  assert.match(read("apps/web/lib/scans/accessibility-report.ts"),/ACCESSIBILITY_REPORT_LABEL = EVIDENCE_SECTION_TITLES.accessibility/);
  assert.match(read("apps/web/components/scans/sitewide-evidence-card.tsx"),/title=\{`\$\{title\} · Sitewide`\}/);
  assert.match(read("apps/web/lib/scans/report-framework-scope.ts"),/section === "gpc" \|\| section === "privacy"\) return focus === "ccpa_cpra"/);
  assert.match(read("apps/web/lib/scans/gpc-customer-policy.ts"),/GPC_CUSTOMER_RESULTS_ENABLED: boolean = true/);
  for(const route of ["apps/web/app/(marketing)/scan/[scanId]/page.tsx","apps/web/app/app/scans/[scanId]/page.tsx"])assert.match(read(route),/components\/scans\/report-lab\/shadow-scan-report/);
});
