import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
import test from "node:test";
import JSZip from "jszip";
import { createHash } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createCertScoreMcpServer } from "../packages/certscore-mcp/src/server";
import { CertScoreClient } from "../packages/certscore-sdk/src/client";
import { reconstructReportEvidencePages } from "../packages/certscore-sdk/src/detailed-evidence";
const { reportRequestScanFixture } = require("../apps/web/server/scans/report-forms.fixture.ts");
const { buildTimelineReportModel } = require("../apps/web/components/scans/report-lab/timeline-report-model.ts");
const { buildCanonicalReportExport } = require("../apps/web/server/scans/report-export.ts");
const { canonicalReportDocumentContent } = require("../apps/web/server/scans/report-export-pdf.ts");
const { buildPulseProjection } = require("../apps/web/lib/pulse/projection.ts");
const { buildApiV2FindingList, buildApiV2PreConsentCookiesTrackers, buildApiV2ScanResource,
  projectedFindingsFromPulse } = require("../apps/web/lib/api-v2/scan-resource.ts");
const { buildReportDisplayExport } = require("../apps/web/lib/api-v2/report-display-export.ts");
const { buildReportEvidencePage } = require("../apps/web/lib/api-v2/report-evidence-page.ts");
const { selectReportEvidenceSection } = require("../apps/web/lib/api-v2/report-evidence-selection.ts");
const { scopeReportPresentation } = require("../apps/web/lib/scans/report-framework-scope.ts");
const { CALIFORNIA_ADDITIONAL_REVIEW_VERSION, CALIFORNIA_CHOICE_FRICTION_FINDING,
  CALIFORNIA_COLLECTION_NOTICE_FINDING, CALIFORNIA_SENSITIVE_TRANSMISSION_FINDING } = require("@certscore/contracts");
const extraCaliforniaIds = [CALIFORNIA_COLLECTION_NOTICE_FINDING, CALIFORNIA_CHOICE_FRICTION_FINDING,
  CALIFORNIA_SENSITIVE_TRANSMISSION_FINDING, "california_post_reject_collection"];
import type { ReportEvidencePage } from "../packages/certscore-sdk/src/types";

function addCollectionAndDestinationProof(bundle: ReturnType<typeof import("../apps/web/server/scans/california-review-coverage.fixture").californiaCoverageFixture>["bundle"], pageUrl: string) {
  const noticeUrl = new URL("/notice", pageUrl).href;
  const choiceUrl = new URL("/opt-out", pageUrl).href;
  const collection = bundle.collectionSurfaceInventory!;
  bundle.policySurfaceInspection!.californiaAdditionalReview = CALIFORNIA_ADDITIONAL_REVIEW_VERSION;
  bundle.policySurfaceInspection!.privacyChoiceInspection!.namedChoiceCandidateCount = 1;
  collection.forms = [{ formRef: "contact", pageUrl, structure: "native_form", surfaceType: "contact", method: "post",
    actionRelationship: "self", candidateFieldCount: 1, retainedFieldCount: 1, fieldsTruncated: false,
    confidence: 1, directVsInferred: "direct", evidenceRefs: [{refId:"contact-form"}],
    fields: [{fieldRef:"email", elementType:"input", inputType:"email", semanticCategory:"email", label:"Email",
      required:true, disabled:false, readOnly:false, confidence:1, directVsInferred:"direct", evidenceRefs:[]}],
    privacyDisclosure: {version:2, truncated:false, excerpts: [{text:"Notice at Collection", association:"adjacent_notice",
      links:[{label:"Notice at Collection", url:noticeUrl}]}]},
  }];
  Object.assign(collection.coverage, {candidateFormCount:1, retainedFormCount:1, candidateFieldCount:1,
    retainedFieldCount:1, inspectedFormCandidateCount:1, inspectedFieldCandidateCount:1});
  bundle.policySurfaceObservations.push({...bundle.policySurfaceObservations[0]!, observationId:"opt-out",
    url:choiceUrl, normalizedUrl:choiceUrl, finalUrl:choiceUrl, httpStatus:200, surfaceType:"do_not_sell_or_share",
    linkText:"Do Not Sell or Share My Personal Information", documentRole:"unknown",
    californiaChoiceBarrier:{sourceDocumentUrl:pageUrl, destinationUrl:choiceUrl, textSha256:"7".repeat(64),
      scope:"sale_or_sharing", excerpt:"To opt out of the sale or sharing of your personal information, you must create an account."},
  });
  const eventRef = "form_trace:event:0", fieldRef = "form_trace:field:0:0", hash = "f".repeat(64);
  const recipient = "https://analytics.external.test/collection";
  bundle.formDestinationTrace = {contractVersion:"certscore.form-destination-trace.v1",mode:"passive",
    events:[{evidenceRef:eventRef,kind:"input",observedAtMs:100,documentUrl:pageUrl,documentToken:"loader-fixture",formIndex:0,
      actionUrl:pageUrl,actionDomain:new URL(pageUrl).hostname,
      fields:[{evidenceRef:fieldRef,name:"diagnosis",category:"health",personal:true,valueHmac:hash}]}],
    requests:[{evidenceRef:"form_trace:request:0",networkRequestId:"req-sensitive",eventRef,observedAtMs:200,url:recipient,
      domain:"external.test",method:"POST",party:"third_party",outsideDeclaredDestination:true,status:"response_observed",
      relation:"exact_field_value_match",matches:[{fieldRef,valueHmac:hash,location:"body"}]}],
    coverage:{truncated:false,unsupportedPayloads:0,scope:"main_document_existing_window",activeSubmission:false},
  };
  bundle.runtimeMetadataSnapshots = [{url:pageUrl,documentIdentity:{token:"loader-fixture"}}] as typeof bundle.runtimeMetadataSnapshots;
  bundle.networkEvents = [{requestId:"req-sensitive",url:recipient,requestUrl:recipient,method:"POST",timestampMs:200,documentUrl:pageUrl}] as typeof bundle.networkEvents;
  bundle.networkResponseEvents = [{requestId:"req-sensitive",responseUrl:recipient,timestampMs:250,documentUrl:pageUrl,
    status:204,directVsInferred:"direct"}] as typeof bundle.networkResponseEvents;
}

// Materialize one partial Reject recipient and one full GPC recipient. The consumers
// below receive persisted findings and evidence, never a preassigned score.
function addCaliforniaChoiceEvidence(scan: ReturnType<typeof reportRequestScanFixture>, rightsReview: boolean, additionalCalifornia: boolean) {
  const { californiaCoverageFixture, CA_FIXTURE_SOURCE, CA_FIXTURE_POLICY } = require("../apps/web/server/scans/california-review-coverage.fixture.ts");
  const { projectCaliforniaPrivacyReview } = require("../apps/web/server/scans/california-privacy-review-projection.ts");
  const { afterRejectClickProjection } = require("../apps/web/lib/scans/test-fixtures/after-reject-scoring.ts");
  const { buildPostRefusalRuntimeProjection } = require("../apps/web/lib/scans/post-refusal-runtime-projection.ts");
  const { buildUnifiedFindingDisplayPackets } = require("../apps/web/lib/scans/unified-findings.ts");
  const policy = rightsReview ? CA_FIXTURE_POLICY.replace("You have the right to delete your personal information. ", "")
    : additionalCalifornia ? "Notice at Collection. We collect your email address to respond to your request." : undefined;
  const fixture = californiaCoverageFixture(policy, scan.scan.requestedUrl);
  if (rightsReview) {
    const { CALIFORNIA_RIGHTS_REVIEW_SCORE_VERSION, CALIFORNIA_COMBINED_OPT_OUT_POLICY } = require("@certscore/contracts");
    fixture.bundle.policySurfaceInspection.rightsReviewScorePolicy = CALIFORNIA_RIGHTS_REVIEW_SCORE_VERSION;
    fixture.bundle.policySurfaceInspection.californiaDisclosureChoicePolicy = CALIFORNIA_COMBINED_OPT_OUT_POLICY;
  }
  fixture.bundle.scanId = fixture.policyEvidence.projection.scanId = scan.scan.id;
  fixture.bundle.policySurfaceInspection.californiaReviewPolicy = "california-privacy-review.v10";
  for (const observation of fixture.bundle.policySurfaceObservations) observation.documentLanguage = "en";
  if (additionalCalifornia) addCollectionAndDestinationProof(fixture.bundle, scan.scan.requestedUrl);
  const {reportVisualEvidenceFixture} = require("../apps/web/server/scans/report-appendix-evidence.fixture.ts");
  scan.runtimeArtifacts.consentControlAssessment = reportVisualEvidenceFixture(scan.scan.id,"d".repeat(64));
  scan.runtimeArtifacts.consentControlAssessment.scan.finalUrl = scan.scan.requestedUrl;
  scan.runtimeArtifacts.consentControlAssessment.californiaPrivacyReview = projectCaliforniaPrivacyReview(
    fixture.bundle, CA_FIXTURE_SOURCE, scan.scan.requestedUrl, fixture.policyEvidence);
  const reject = afterRejectClickProjection("measurement");
  const targetSha256 = createHash("sha256").update(scan.scan.requestedUrl).digest("hex");
  reject.actionControlProof.authorizedTargetSha256 = targetSha256;
  reject.sourceIdentity = {policyVersion:"post_reject_source_identity.v1", scanId:scan.scan.id, targetSha256};
  for (const request of [...reject.scoringEvidence.requests, ...reject.afterActionRequests]) request.httpStatus = 204;
  if (additionalCalifornia) {
    const { captureCaliforniaRejectRequest } = require("../packages/certscore-scan-core/src/california-reject-request.ts");
    const linkedInUrl = "https://px.ads.linkedin.com/collect?pid=publisher&li_adsId=visitor-fixture";
    for (const request of [...reject.scoringEvidence.requests, ...reject.afterActionRequests]) {
      const { requestId, startedAtMs } = request;
      Object.assign(request, {method:"GET", hostname:"px.ads.linkedin.com", vendor:"LinkedIn", purpose:"advertising",
        sanitizedUrl:"https://px.ads.linkedin.com/collect", measurementEvidence:undefined, googleConsentMode:undefined,
        californiaCollection:captureCaliforniaRejectRequest({url:linkedInUrl,method:"GET",requestId,startedAtMs,httpStatus:204,hasBody:false})});
    }
  }
  const {californiaPriorityGpcFixture, QUALIFIED_URL} = require("../apps/web/lib/scans/test-fixtures/california-priority-gpc.ts");
  const {assessGpcPotentialRisk} = require("../apps/web/lib/scans/california-potential-risk-policy.ts");
  const gpc = californiaPriorityGpcFixture([QUALIFIED_URL], scan.scan.id);
  Object.assign(scan.runtimeArtifacts, buildPostRefusalRuntimeProjection(reject), additionalCalifornia ? {} : {
    gpcResponseAssessment:gpc, californiaGpcPotentialRiskAssessment:assessGpcPotentialRisk(gpc),
  });
  const findings = buildUnifiedFindingDisplayPackets({runtimeArtifacts:scan.runtimeArtifacts,
    reviewFindingCandidates:[], validationFindings:[], validationFindingLookup:new Map()});
  scan.canonicalReportProjection.ownerUnifiedFindings = scan.canonicalReportProjection.globalUnifiedFindings = findings;
}

test("web, PDF/Word content, API, SDK and both MCP profiles retain identical forms, requests, choice proof and lens scope", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const focus of ["gdpr_eprivacy", "ccpa_cpra"] as const) for (const proof of ["retained", "missing_receipt", "wrong_target", "rights_review", "additional_california"] as const) {
      const rightsReview = proof === "rights_review";
      const additionalCalifornia = proof === "additional_california";
      if (rightsReview && focus !== "ccpa_cpra") continue;
      const intact = proof === "retained" || rightsReview || additionalCalifornia;
      const scan = reportRequestScanFixture(), scanId = scan.scan.id;
      const checkPresenceScore = focus === "ccpa_cpra" && intact;
      if (checkPresenceScore || additionalCalifornia) addCaliforniaChoiceEvidence(scan, rightsReview, additionalCalifornia);
      scan.snapshot.report_projection_status = "ready";
      if (proof === "missing_receipt") delete scan.runtimeArtifacts.postAcceptEvidenceProjection.packetSha256;
      if (proof === "wrong_target") scan.runtimeArtifacts.postAcceptEvidenceProjection.formSnapshotCapture.exactTargetSha256 = "f".repeat(64);
      for (const finding of scan.canonicalReportProjection.ownerUnifiedFindings) finding.sourceRefs = [];
      const before = structuredClone(scan);
      const web = buildTimelineReportModel(scan); assert.ok("findings" in web);
      const view = scopeReportPresentation({ ...web, reviewFocus: focus });
      const exported = buildCanonicalReportExport(scan, undefined, focus)!;
      const resource = buildApiV2ScanResource(scan);
      const pulse = buildPulseProjection({ scanRecord: scan, detail: "summary", format: "json", freshnessMode: "latest", requestedUrl: "https://example.test/", resolutionMode: "test", pulseRequestId: "owned-parity", waitSeconds: 0 });
      const apiFindings = additionalCalifornia ? buildApiV2FindingList({ scanId, findings: projectedFindingsFromPulse(
        buildPulseProjection({scanRecord:scan,detail:"full",format:"json",freshnessMode:"latest",requestedUrl:"https://example.test/",
          resolutionMode:"test",pulseRequestId:"owned-findings-parity",waitSeconds:0})) }) : undefined;
      assert.deepEqual(pulse.summary.postureScores, resource.postureScores);
      assert.deepEqual(pulse.formsSummary, web.formsSummary);
      const { buildApiV2PostureScores } = require("../apps/web/lib/api-v2/posture-scores.ts");
      view.postureScores = buildApiV2PostureScores({score:web.score.value,scoreExplanation:web.scoreExplanation,californiaScore:web.californiaScore});
      assert.deepEqual(view.postureScores,resource.postureScores);
      const partialTitle = "Non-essential activity after Reject click";
      if (checkPresenceScore && !additionalCalifornia) {
        assert.equal(view.findings.find(f => f.id === "california_collection_review")?.title, partialTitle);
        const expectedScore = rightsReview ? 74 : 78;
        assert.equal(resource.postureScores.ccpaCpra.score, expectedScore);
        assert.equal(resource.postureScores.ccpaCpra.policyVersion,rightsReview ? "california-regulatory-posture.v27-rights-review" : "california-regulatory-posture.v26-verified-event");
        const {renderCanonicalReportPdf} = require("../apps/web/server/scans/report-export-pdf.ts");
        const {renderCanonicalReportDocx} = require("../apps/web/server/scans/report-export-docx.ts");
        const pdf = renderCanonicalReportPdf(exported);
        const docx = await renderCanonicalReportDocx(exported);
        const {renderPulseMarkdown} = require("../apps/web/lib/pulse/markdown.ts");
        assert.ok(renderPulseMarkdown(pulse).includes(`California posture score | ${expectedScore}`));
        const text = [...pdf.toString("latin1").matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map(m=>m[1]).join(" ");
        assert.ok(text.includes(partialTitle));
        assert.ok(text.includes(`${expectedScore} of 100 SCORE California assessment`));
        const archive = await JSZip.loadAsync(docx);
        const documentXml = await archive.file("word/document.xml")!.async("string");
        assert.ok(documentXml.includes(partialTitle));
        assert.ok(documentXml.includes(`Score ${expectedScore}/100`));
        if (rightsReview) {
          for (const rendered of [text, documentXml]) {
            assert.match(rendered, /1 review item/);
            assert.match(rendered, /Who qualifies under the CCPA/);
            assert.match(rendered, /26,625,000/);
          }
          assert.doesNotMatch(view.verdict, /rights disclosure|applicability has not been determined/i);
        }
      }
      if (additionalCalifornia) {
        assert.equal(resource.postureScores.ccpaCpra.score, 55, JSON.stringify(web.californiaScore.deductions));
        assert.equal(resource.postureScores.ccpaCpra.policyVersion, "california-regulatory-posture.v30-collection-notice-and-choice-friction");
        const { renderCanonicalReportPdf } = require("../apps/web/server/scans/report-export-pdf.ts");
        const { renderCanonicalReportDocx } = require("../apps/web/server/scans/report-export-docx.ts");
        const pdfText = [...renderCanonicalReportPdf(exported).toString("latin1").matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map(m=>m[1]).join(" ");
        const docx = await JSZip.loadAsync(await renderCanonicalReportDocx(exported));
        const docxXml = await docx.file("word/document.xml")!.async("string");
        const california = focus === "ccpa_cpra";
        const titles = ["Notice at collection unavailable or incomplete", "Privacy choice requires account creation",
          "Sensitive form information sent to an external recipient", "Advertising collection after Reject"];
        for (const [index, id] of extraCaliforniaIds.entries()) {
          assert.equal(view.findings.some((finding: {id: string}) => finding.id === id), california, `${focus} ${id}`);
          for (const rendered of [pdfText, docxXml]) assert.equal(rendered.replace(/<[^>]+>/g, "").includes(titles[index]!), california, `${focus} ${titles[index]}`);
        }
        if (california) {
          assert.ok(pdfText.includes("55 of 100 SCORE California assessment"));
          assert.ok(docxXml.includes("Score 55/100"));
          assert.doesNotMatch(pdfText + docxXml, /Notice placement at collection points remains unassessed/);
        }
      }
      assert.deepEqual(resource.formsSummary, web.formsSummary);
      assert.equal(resource.score, web.score.value);
      assert.equal(focus === "ccpa_cpra" ? exported.californiaScore.score : exported.score.value, focus === "ccpa_cpra" ? resource.postureScores.ccpaCpra.score : resource.postureScores.gdprEprivacy.score);
      assert.deepEqual(resource.postAcceptObservation, exported.postAcceptObservation ?? null);
      assert.deepEqual(resource.postRefusalObservation, exported.postRefusalObservation ?? null);
      assert.deepEqual(resource.accessibilityAudit, exported.accessibilityAudit);
      const expectedRows = exported.appendix.dataCollectionSurfaces.reportInventory!.rows;
      assert.deepEqual(expectedRows, web.collectionTableRows);
      const content = canonicalReportDocumentContent(exported).lines.map(line => line.text).join("\n");
      assert.equal(expectedRows.length, intact ? 2 : 0);
      if (intact) assert.match(content, /2 recorded forms; 9 recorded fields/);
      else assert.equal(web.formsSummary.afterAcceptObserved, null, "missing or mismatched proof remains unknown");
      assert.match(content, /3 request events; 2 distinct request resources/);
      const calls: string[] = [];
      globalThis.fetch = async (input, init) => {
        const url = new URL(String(input)); calls.push(url.pathname + url.search);
        assert.ok(!init?.method || init.method === "GET", "read-only transport must not create a scan");
        if (url.pathname === `/api/v2/scans/${scanId}/pulse`) return Response.json({ type: "certscore_scan_pulse", scanId, pulse });
        if (url.pathname === `/api/v2/scans/${scanId}`) return Response.json(resource);
        if (apiFindings && url.pathname === `/api/v2/scans/${scanId}/findings`) return Response.json(apiFindings);
        if (additionalCalifornia && url.pathname === "/api/v1/pulse" && url.searchParams.get("scanId") === scanId) return Response.json(pulse);
        if (additionalCalifornia && url.pathname === `/api/v2/scans/${scanId}/pre-consent-cookies-trackers`) return Response.json(buildApiV2PreConsentCookiesTrackers(scan));
        assert.equal(url.pathname, `/api/v2/scans/${scanId}/report-evidence`);
        assert.equal(url.searchParams.get("reviewFocus"), focus);
        const section = url.searchParams.get("section") as "forms" | "tracking" | "policy" | null;
        const selected = section ? selectReportEvidenceSection(view as unknown as Record<string, unknown>, section).report : view;
        return Response.json(buildReportEvidencePage({ scanId, report: buildReportDisplayExport(selected as unknown as Record<string, unknown>), section: section ?? undefined, reviewFocus: focus, cursor: url.searchParams.get("cursor") }));
      };
      const sdk = new CertScoreClient({ apiKey: "owned-fixture", baseUrl: "https://certscore.ai" });
      assert.deepEqual(await sdk.getScanResource(scanId), resource);
      if (apiFindings) {
        const sdkFindings = await sdk.findings.list(scanId);
        assert.deepEqual(sdkFindings, apiFindings);
        for (const id of extraCaliforniaIds) assert.deepEqual(sdkFindings.findings.find(row => row.id === id)?.reviewLenses, ["CCPA / CPRA"], id);
      }
      assert.deepEqual((await sdk.getScanPulse(scanId)).pulse.summary.postureScores, resource.postureScores);
      const sdkFull = await sdk.getReportEvidence(scanId, { reviewFocus: focus });
      assert.deepEqual(sdkFull.postureScores, resource.postureScores);
      assert.deepEqual(sdkFull.formsSummary, web.formsSummary);
      assert.deepEqual((sdkFull.collectionTableRows as typeof expectedRows).map(r => [r.form, r.capturePhase, r.captureLimited]), expectedRows.map(r => [r.form, r.capturePhase, r.captureLimited]));
      assert.deepEqual(sdkFull.inventorySummary, web.inventorySummary);
      assert.deepEqual((sdkFull.resourceInventory as { requestMetric: unknown }).requestMetric, web.resourceInventory!.requestMetric);
      assert.deepEqual((sdkFull.findings as Array<Record<string, unknown>>).map(({ id, title, summary, severity }) => ({ id, title, summary, severity })), view.findings.map(({ id, title, summary, severity }: Record<string, unknown>) => ({ id, title, summary, severity })));
      if (focus === "gdpr_eprivacy") assert.equal(sdkFull.gpcResponse, undefined);
      else assert.deepEqual(sdkFull.gdprTransparencyRows, []);
      for (const toolProfile of ["full", "light"] as const) {
        const server = createCertScoreMcpServer({ apiKey: "owned-fixture", baseUrl: "https://certscore.ai", toolProfile });
        const client = new Client({ name: "CertScore.ai parity fixture", version: "0.0.0" });
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
        try {
          if (additionalCalifornia) {
            const result = await client.callTool({name:"certscore_get_scan_bundle", arguments:{scanId,detail:"findings",maxFindings:20}});
            assert.ok(!result.isError, JSON.stringify(result));
            assert.deepEqual(result.structuredContent?.postureScores, resource.postureScores);
            const findings = (result.structuredContent as {findings:Array<{id:string;reviewLenses:string[]}>}).findings;
            for (const id of extraCaliforniaIds) assert.deepEqual(findings.find(row => row.id === id)?.reviewLenses, ["CCPA / CPRA"], id);
          }
          if (apiFindings && toolProfile === "full") {
            const result = await client.callTool({ name:"certscore_list_findings", arguments:{scanId,limit:50} });
            assert.ok(!result.isError, JSON.stringify(result));
            const findings = (result.structuredContent as {findings:Array<{id:string; reviewLenses:string[]}>}).findings;
            for (const id of extraCaliforniaIds) assert.deepEqual(findings.find(row => row.id === id)?.reviewLenses, ["CCPA / CPRA"], id);
          }
          for (const section of ["forms", "tracking", "policy"] as const) {
            if (section === "policy" && !rightsReview && !additionalCalifornia) continue;
            const pages: ReportEvidencePage[] = []; let cursor: string | undefined;
            do {
              const result = await client.callTool({ name: "certscore_get_report_evidence_page", arguments: { scanId, section, reviewFocus: focus, ...(cursor ? { cursor } : {}) } });
              assert.ok(!result.isError, JSON.stringify(result));
              const page = result.structuredContent as unknown as ReportEvidencePage; pages.push(page);
              cursor = page.pagination.nextCursor ?? undefined;
            } while (cursor);
            const mcp = reconstructReportEvidencePages(pages), viaSdk = await sdk.getReportEvidence(scanId, { section, reviewFocus: focus });
            assert.deepEqual(mcp, viaSdk);
            if (checkPresenceScore && !additionalCalifornia) {
              assert.deepEqual(mcp.postureScores, resource.postureScores);
              const findings = mcp.findings as Array<{id:string; title:string}>;
              assert.equal(findings.find(f => f.id === "california_collection_review")?.title, partialTitle);
            }
            if (section === "policy" && additionalCalifornia) {
              assert.deepEqual(mcp.postureScores, resource.postureScores);
              const findingIds = (mcp.findings as Array<{id:string}>).map(row => row.id);
              for (const id of extraCaliforniaIds) assert.equal(findingIds.includes(id), focus === "ccpa_cpra", `${toolProfile} ${focus} ${id}`);
            }
            if (section === "policy" && rightsReview) {
              const findings = mcp.findings as Array<{id: string; status: string; severity: string; summary: string; applicabilityGuidance?: {checks: string[]}}>;
              const index = findings.findIndex(finding => finding.id === "california_rights_disclosure_not_observed");
              assert.ok(index > findings.findIndex(finding => finding.id === "california_collection_review"));
              const row = findings[index]!;
              assert.equal(row.status, "Review");
              assert.equal(row.severity, "low");
              assert.equal(row.summary.match(/CCPA applicability has not been determined/g)?.length, 1);
              assert.match(row.applicabilityGuidance!.checks.join(" "), /26,625,000/);
            }
            if (section === "forms") assert.deepEqual(mcp.formsSummary, web.formsSummary);
            if (section === "tracking") assert.deepEqual(mcp.inventorySummary, web.inventorySummary);
          }
        } finally { await client.close(); await server.close(); }
      }
      assert.ok(calls.length > 5); assert.deepEqual(scan, before);
    }
  } finally { globalThis.fetch = originalFetch; }
});
