import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { derivePolicySurfaceInspectionOutcome } from "@certscore/contracts";
import { createArtifactWriter } from "./artifact-writer.js";
import { policySurfaceScanner, type PolicyNanoAssistProvider } from "./scanners/policy-surface-scanner.js";

// Local deterministic provider: this regression never sends a model request.
const nanoAssistProvider: PolicyNanoAssistProvider = {
  async classifyLinks(input) {
    return { assistId: input.assistId, rankedCandidates: input.candidates.slice(0, 8).map((candidate, index) => ({
      candidateId: candidate.candidateId, likelySurfaceType: candidate.deterministicSurfaceType,
      shouldFetch: candidate.fetchable, priorityRank: index + 1, confidence: 0.95,
      reason: "Fixture uses canonical deterministic candidate types.", uncertaintyNotes: [],
    })) };
  },
};
const body = `<main><h1>Riverside Restaurant</h1><p>${"Visit our family restaurant for lunch and dinner. Explore our seasonal menu, opening hours, reservations and local catering services. ".repeat(12)}</p></main>`;

for (const scenario of ["missing", "seeded_missing", "seeded_observed_but_unfetchable", "observed_but_unfetchable", "observed_notice_404", "blocked", "enumeration_overflow", "uninspected_frame", "opaque_frame", "same_origin_empty_frame", "same_origin_choice_frame", "named_choice_button", "inspected_shadow", "nested_shadow_choice", "hidden_unnamed_control", "visible_unnamed_control", "loading_document", "interactive_document"] as const) {
  test(`policy negative search: ${scenario}`, { timeout: 25_000 }, async () => {
    const server = createServer((request, response) => {
      response.setHeader("content-type", "text/html");
      if (request.url !== "/" && request.url !== "/pending-script" && request.url !== "/pending-image") {
        response.statusCode = 404; response.end("Not found"); return;
      }
      if (request.url === "/pending-script" || request.url === "/pending-image") return;
      if (scenario === "blocked") {
        response.statusCode = 403; response.end("Access denied"); return;
      }
      const extra = (scenario === "observed_but_unfetchable" || scenario === "seeded_observed_but_unfetchable") ? '<footer><a href="/privacy-policy">Privacy policy</a></footer>'
        : scenario === "observed_notice_404" ? '<footer><a href="/notice">Notice at Collection</a></footer>'
        : scenario === "enumeration_overflow" ? Array.from({ length: 1001 }, (_, i) => `<button>Menu item ${i}</button>`).join("")
        : scenario === "uninspected_frame" ? '<iframe src="about:blank" style="display:none"></iframe>'
        : scenario === "opaque_frame" ? '<iframe sandbox="allow-scripts" srcdoc="<p>Embedded information</p>"></iframe>'
        : scenario === "same_origin_empty_frame" ? '<iframe srcdoc="<p>Store information</p>"></iframe>'
        : scenario === "same_origin_choice_frame" ? '<iframe srcdoc="<a href=/choice>Your Privacy Choices</a>"></iframe>'
        : scenario === "named_choice_button" ? '<footer><button type="button">Your Privacy Choices</button></footer>'
        : scenario === "inspected_shadow" ? '<div id="custom-footer"></div><script>document.querySelector("#custom-footer").attachShadow({mode:"open"}).innerHTML="<span>Footer</span>"</script>'
        : scenario === "nested_shadow_choice" ? '<div id="outer-host"></div><script>const root=document.querySelector("#outer-host").attachShadow({mode:"open"});root.innerHTML="<div id=inner-host></div>";root.querySelector("#inner-host").attachShadow({mode:"open"}).innerHTML="<a href=/choice>Your Privacy Choices</a>"</script>'
        : scenario === "hidden_unnamed_control" ? '<button style="display:none"></button>'
        : scenario === "visible_unnamed_control" ? '<button style="width:24px;height:24px"></button>'
        : scenario === "interactive_document" ? '<img src="/pending-image" alt="Store illustration">'
        : scenario === "loading_document" ? '<script src="/pending-script"></script>' : "";
      response.end(`<html lang="en"><head><title>Riverside Restaurant</title></head><body>${body}${extra}</body></html>`);
    });
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const address = server.address(); assert.ok(address && typeof address === "object");
    const normalizedUrl = `http://127.0.0.1:${address.port}/`;
    const root = await mkdtemp(path.join(tmpdir(), "policy-negative-"));
    try {
      const result = await policySurfaceScanner({ url: normalizedUrl, normalizedUrl,
        scanStartedAtMs: Date.now(), internalBudgetMs: 12_000, discoveryMode: "fast",
        artifactWriter: await createArtifactWriter(root), nanoAssistProvider,
        ...(scenario.startsWith("seeded_") ? { policySurfaceSeeds: [{ hintType: "privacy_policy",
          source: "canonical_legal_surface_hint" as const, url: new URL("/privacy-policy", normalizedUrl).href }] } : {}) });
      const inspection = derivePolicySurfaceInspectionOutcome({ modulesRun: [result.moduleRun], normalizedUrl,
        privacyChoiceInspection: result.privacyChoiceInspection, negativeSearchEvidence: result.negativeSearchEvidence, policySurfaceObservations: result.policySurfaceObservations });
      if (inspection.privacyChoiceInspection?.contractVersion === "certscore.privacy-choice-inspection.v5") {
        const proof = inspection.privacyChoiceInspection;
        assert.ok(proof.diagnostics, "Existing DOM reads retain bounded diagnostic metadata");
        assert.equal(proof.diagnostics.inspectionSourceHash, proof.sourceHash);
        assert.ok(Buffer.byteLength(JSON.stringify(proof.diagnostics)) <= 4096);
        if (scenario === "uninspected_frame") {
          assert.equal(proof.coverage, "limited");
          assert.equal(proof.hiddenUninspectedFrameCount, 1);
          assert.ok(proof.diagnostics.frames.some(row => row.first.reason === "display_none") || proof.diagnostics.limitations.includes("diagnostic_time_limit"));
        }
        if (scenario === "visible_unnamed_control") {
          assert.ok(proof.diagnostics.unnamedControls.length === 1 || proof.diagnostics.limitations.includes("diagnostic_time_limit"));
        }
      }
      if (["missing", "seeded_missing", "inspected_shadow", "hidden_unnamed_control", "same_origin_empty_frame"].includes(scenario)) {
        assert.equal(result.moduleRun.status, "completed", JSON.stringify(result.moduleRun));
        assert.ok(result.policySurfaceObservations.filter(row => row.status === "failed").length > 0,
          "Guessed URL 404s do not negate the independently completed observed-link search.");
        assert.equal(inspection.outcome, "no_privacy_policy_observed_complete_coverage", JSON.stringify(result));
        assert.ok(inspection.negativeSearchEvidence?.renderedInspectionHash);
        assert.equal(inspection.privacyChoiceInspection?.coverage,"complete");
        assert.equal(inspection.privacyChoiceInspection?.namedChoiceCandidateCount,0);
        assert.equal(inspection.privacyChoiceInspection?.documentUrl,normalizedUrl);
        assert.equal(inspection.privacyChoiceInspection?.contractVersion,"certscore.privacy-choice-inspection.v5");
        if (scenario === "same_origin_empty_frame") {
          assert.equal(inspection.privacyChoiceInspection.inspectedSameOriginFrameCount,1);
          assert.equal(inspection.privacyChoiceInspection.uninspectedFrameCount,0);
        }
        if (scenario === "hidden_unnamed_control") {
          assert.equal(inspection.privacyChoiceInspection?.unnamedControlCount,0);
          assert.equal(inspection.privacyChoiceInspection?.hiddenUnnamedControlCount,1);
        }
      } else if (scenario === "observed_but_unfetchable" || scenario === "seeded_observed_but_unfetchable") {
        assert.equal(inspection.outcome, "privacy_policy_observed");
        assert.equal(inspection.documentRetrievalCoverageStatus, "insufficient");
        assert.equal(result.negativeSearchEvidence, undefined);
        assert.equal(inspection.privacyChoiceInspection?.representativeDocument,true,"ordinary marketing homepage with a delayed footer policy label remains representative");
        assert.equal(inspection.privacyChoiceInspection?.coverage,"complete");
      } else if (scenario === "observed_notice_404") {
        const notice = result.policySurfaceObservations.find(row => row.surfaceType === "notice_at_collection" && row.status === "failed" && row.httpStatus === 404);
        assert.ok(notice, "Expected the observed named notice link to retain its fetch result.");
        assert.equal(notice.finalUrl, new URL("/notice", normalizedUrl).href);
        assert.equal(notice.fetchFailureReason, "http_error");
      } else if (scenario === "nested_shadow_choice") {
        assert.equal(inspection.privacyChoiceInspection?.uninspectedShadowRootCount,0);
        assert.equal(inspection.privacyChoiceInspection?.namedChoiceCandidateCount,1);
        assert.equal(inspection.privacyChoiceInspection?.coverage,"complete");
      } else if (scenario === "same_origin_choice_frame") {
        assert.equal(inspection.privacyChoiceInspection?.namedChoiceCandidateCount,1);
        assert.equal(inspection.privacyChoiceInspection?.coverage,"limited");
        assert.equal(inspection.privacyChoiceInspection?.uninspectedFrameCount,1);
        if (inspection.privacyChoiceInspection?.contractVersion === "certscore.privacy-choice-inspection.v5") {
          assert.equal(inspection.privacyChoiceInspection.unprojectableFrameCount,1);
        } else assert.fail("Expected v3 frame diagnostics");
      } else if (scenario === "named_choice_button") {
        const choice = result.policySurfaceObservations.find(row => row.surfaceType === "your_privacy_choices");
        assert.equal(choice?.linkVisibility,"visible");
        assert.equal(choice?.accessibleNameSource,"text");
        assert.equal(choice?.linkSourcePageUrl,normalizedUrl);
        assert.equal(inspection.privacyChoiceInspection?.namedChoiceCandidateCount,1);
      } else if (scenario === "uninspected_frame") {
        const proof = inspection.privacyChoiceInspection;
        assert.equal(proof?.contractVersion, "certscore.privacy-choice-inspection.v6");
        assert.equal(proof?.coverage, "complete");
        assert.equal(proof?.uninspectedFrameCount, 1);
        assert.equal(inspection.outcome, "indeterminate_limited_coverage", "Choice exclusion does not complete the policy search");
        assert.equal(result.negativeSearchEvidence, undefined);
      } else if (scenario === "opaque_frame") {
        assert.equal(inspection.privacyChoiceInspection?.coverage,"limited");
        if (inspection.privacyChoiceInspection?.contractVersion === "certscore.privacy-choice-inspection.v5") {
          assert.equal(inspection.privacyChoiceInspection.inaccessibleFrameCount,1);
        } else assert.fail("Expected v3 frame diagnostics");
      } else if (scenario === "interactive_document") {
        const proof=inspection.privacyChoiceInspection;
        assert.equal(proof?.contractVersion,"certscore.privacy-choice-inspection.v5");
        if (proof?.contractVersion!=="certscore.privacy-choice-inspection.v5") throw new Error("Expected v5 proof");
        assert.equal(proof.documentReadyState,"interactive");
        assert.equal(proof.coverage,"complete");
        assert.deepEqual(proof.limitationKeys,[]);
        assert.equal(result.negativeSearchEvidence,undefined,"Policy negative-search readiness stays unchanged");
      } else if (scenario === "visible_unnamed_control") {
        assert.equal(inspection.privacyChoiceInspection?.unnamedControlCount,1);
        assert.equal(inspection.privacyChoiceInspection?.coverage,"limited");
      } else {
        assert.equal(inspection.outcome, "indeterminate_limited_coverage", scenario);
        assert.equal(result.negativeSearchEvidence, undefined);
        assert.notEqual(inspection.privacyChoiceInspection?.coverage,"complete");
      }
    } finally {
      server.closeAllConnections(); server.close(); await once(server, "close");
      await rm(root, { recursive: true, force: true });
    }
  });
}

test("policy document language comes from retained fetched HTML, not homepage or link locale",{timeout:25000},async()=>{
  const server=createServer((request,response)=>{
    response.setHeader("content-type","text/html");
    if(request.url === "/") response.end(`<!doctype html><html lang="en"><body>${body}<footer><a href="/privacy-policy">Privacy Policy</a></footer></body></html>`);
    else if(request.url === "/privacy-policy") response.end(`<!doctype html><html data-lang="en" lang="fr"><head><title>Privacy Policy</title></head><body><h1>Privacy Policy</h1><p>${"Our privacy policy describes how we collect personal information to provide services, retain records and respond to access requests. ".repeat(12)}</p></body></html>`);
    else {response.statusCode=404;response.end("Not found");}
  });
  server.listen(0,"127.0.0.1");await once(server,"listening");
  const address=server.address();assert.ok(address && typeof address === "object");
  const normalizedUrl=`http://127.0.0.1:${address.port}/`;
  const root=await mkdtemp(path.join(tmpdir(),"policy-language-"));
  try {
    const result=await policySurfaceScanner({url:normalizedUrl,normalizedUrl,scanStartedAtMs:Date.now(),internalBudgetMs:12000,discoveryMode:"fast",
      artifactWriter:await createArtifactWriter(root),nanoAssistProvider});
    const policy=result.policySurfaceObservations.find(row=>row.url.endsWith("/privacy-policy") && row.status === "fetched");
    assert.ok(policy,"Observed policy should be fetched");
    assert.equal(policy.documentLanguage,"fr","Homepage English or data-lang cannot establish the policy's language");
  }finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(root,{recursive:true,force:true});}
});
