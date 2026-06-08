import assert from "node:assert/strict";
import test from "node:test";
import { getReportUnifiedFindingForSignal } from "../../../../packages/shared/src/taxonomy/report-pillars";
import {
  buildBetaRegulatoryFindingSources,
  buildEuAiActRegulatoryChecklistArea
} from "./eu-ai-act-regulatory-checklist-area";
import { getHybridNanoSignalPopulations } from "./hybrid-runtime-evidence";
import { buildMergedSignalRecords, buildReviewFindingCandidatesFromMergedSignals } from "./merged-signals";

test("EU AI Act checklist projects retained AI surface tracking runtime evidence", () => {
  const runtimeArtifacts = {
    hybrid_runtime_evidence: {
      aiSurfaceRuntimeEvidence: {
        basis: [
          "ai_surface_text_or_url_hint",
          "runtime_request_correlated_to_ai_surface",
          "tracker_or_marketing_vendor_on_ai_surface"
        ],
        observed: true,
        pageUrls: ["https://www.intercom.com/"],
        requestUrls: [
          "https://api-iam.intercom.io/messenger/web/ping",
          "https://api-iam.intercom.io/messenger/web/events",
          "https://api-iam.intercom.io/messenger/web/rulesets/58118832/match",
          "https://api-iam.intercom.io/messenger/web/metrics"
        ],
        surfaceTypes: ["ai_assistant", "chatbot"],
        trackingObserved: true,
        trackingVendorCategories: ["analytics"]
      }
    }
  };
  const signalPopulations = getHybridNanoSignalPopulations(runtimeArtifacts);
  const aiSignal = signalPopulations.find((row) => row.key === "ai.flow_tracking_review_signal");

  assert.equal(aiSignal?.value, true);
  assert.deepEqual(aiSignal?.evidenceRefs, [
    "https://www.intercom.com/",
    "https://api-iam.intercom.io/messenger/web/ping",
    "https://api-iam.intercom.io/messenger/web/events",
    "https://api-iam.intercom.io/messenger/web/rulesets/58118832/match",
    "https://api-iam.intercom.io/messenger/web/metrics"
  ]);

  const mergedSignals = buildMergedSignalRecords({
    scannerSignals: signalPopulations.map((signal) => ({
      ...signal,
      source: "scanner"
    }))
  });
  const candidate = buildReviewFindingCandidatesFromMergedSignals({
    mergedSignals
  }).find((row) => row.signalKey === "ai.flow_tracking_review_signal");
  assert.ok(candidate);
  assert.equal(candidate.signalSource, "runtime_artifact_signal");
  assert.ok(candidate.signalKey);
  const mappedFinding = getReportUnifiedFindingForSignal(candidate.signalSource, candidate.signalKey);

  assert.equal(mappedFinding?.id, "ai_surface_tracking_review_signal");
  assert.equal(mappedFinding?.label, "AI surface tracking review signal");

  const euAiActArea = buildEuAiActRegulatoryChecklistArea(mappedFinding ? [
    {
      id: mappedFinding.id,
      label: mappedFinding.label
    }
  ] : []);
  const aiFlowRow = euAiActArea.rows.find((row) => row.id === "ai_flow_tracking");

  assert.equal(euAiActArea.maturityLabel, "Alpha");
  assert.equal(euAiActArea.status, "review_recommended");
  assert.equal(euAiActArea.score, 6);
  assert.equal(euAiActArea.counters.review, 1);
  assert.equal(aiFlowRow?.label, "AI flow tracking / replay / adtech");
  assert.equal(aiFlowRow?.status, "review_signal");
  assert.deepEqual(aiFlowRow?.evidenceRefs, ["AI surface tracking review signal"]);
});

test("EU AI Act checklist keeps AI flow tracking not testable without retained tracking evidence", () => {
  const runtimeArtifacts = {
    hybrid_runtime_evidence: {
      aiSurfaceRuntimeEvidence: {
        observed: true,
        pageUrls: ["https://example.com/ai-assistant"],
        requestUrls: [],
        surfaceTypes: ["ai_assistant", "chatbot"],
        trackingObserved: false,
        trackingVendorCategories: []
      }
    }
  };
  const signalPopulations = getHybridNanoSignalPopulations(runtimeArtifacts);
  const euAiActArea = buildEuAiActRegulatoryChecklistArea();
  const aiFlowRow = euAiActArea.rows.find((row) => row.id === "ai_flow_tracking");

  assert.equal(signalPopulations.some((row) => row.key === "ai.flow_tracking_review_signal"), false);
  assert.equal(euAiActArea.status, "limited_coverage");
  assert.equal(euAiActArea.score, null);
  assert.equal(euAiActArea.counters.review, 0);
  assert.equal(aiFlowRow?.status, "not_testable");
});

test("regulatory finding sources include unified packets even when executive findings are empty", () => {
  const sources = buildBetaRegulatoryFindingSources({
    executiveFindings: [],
    unifiedFindings: [
      {
        title: "AI surface tracking review signal",
        unifiedFindingId: "ai_surface_tracking_review_signal"
      }
    ]
  });
  const euAiActArea = buildEuAiActRegulatoryChecklistArea(sources);
  const aiFlowRow = euAiActArea.rows.find((row) => row.id === "ai_flow_tracking");

  assert.deepEqual(sources, [
    {
      id: "ai_surface_tracking_review_signal",
      label: "AI surface tracking review signal"
    }
  ]);
  assert.equal(euAiActArea.status, "review_recommended");
  assert.equal(euAiActArea.score, 6);
  assert.equal(aiFlowRow?.status, "review_signal");
});

test("EU AI Act checklist projects retained document semantic AI findings", () => {
  const sources = buildBetaRegulatoryFindingSources({
    executiveFindings: [],
    unifiedFindings: [
      {
        title: "AI transparency notice present",
        unifiedFindingId: "ai_transparency_notice_present"
      },
      {
        title: "AI interaction disclosure present",
        unifiedFindingId: "ai_interaction_disclosure_present"
      },
      {
        title: "Sensitive-context AI review signal",
        unifiedFindingId: "ai_sensitive_context_review_signal"
      }
    ]
  });
  const euAiActArea = buildEuAiActRegulatoryChecklistArea(sources);
  const byId = new Map(euAiActArea.rows.map((row) => [row.id, row]));

  assert.equal(euAiActArea.status, "review_recommended");
  assert.equal(euAiActArea.score, 31);
  assert.equal(euAiActArea.counters.checked, 2);
  assert.equal(euAiActArea.counters.review, 1);
  assert.equal(byId.get("ai_transparency_notice")?.status, "checked");
  assert.deepEqual(byId.get("ai_transparency_notice")?.evidenceRefs, ["AI transparency notice present"]);
  assert.equal(byId.get("ai_feature_disclosure")?.status, "checked");
  assert.deepEqual(byId.get("ai_feature_disclosure")?.evidenceRefs, ["AI interaction disclosure present"]);
  assert.equal(byId.get("sensitive_context_ai")?.status, "review_signal");
});

test("EU AI Act checklist projects explicit missing AI disclosure signals as not observed", () => {
  const sources = buildBetaRegulatoryFindingSources({
    executiveFindings: [],
    unifiedFindings: [
      {
        title: "AI transparency notice present",
        unifiedFindingId: "ai_transparency_notice_present"
      },
      {
        title: "AI interaction disclosure present",
        unifiedFindingId: "ai_interaction_disclosure_present"
      },
      {
        title: "AI marketing / disclosure alignment review",
        unifiedFindingId: "ai_marketing_disclosure_alignment_review"
      },
      {
        title: "Sensitive-context AI review signal",
        unifiedFindingId: "ai_sensitive_context_review_signal"
      },
      {
        title: "AI surface tracking review signal",
        unifiedFindingId: "ai_surface_tracking_review_signal"
      }
    ]
  });
  const euAiActArea = buildEuAiActRegulatoryChecklistArea(sources, {
    mergedSignals: [
      {
        evidenceRefs: ["https://example.com/responsible-ai"],
        key: "ai.generated_content_label_present",
        label: "AI-generated content label present",
        populationStatus: "missing",
        selectedPopulation: { value: false },
        value: false
      },
      {
        evidenceRefs: ["https://example.com/privacy"],
        key: "ai.automated_decision_disclosure_present",
        label: "Automated decision disclosure present",
        populationStatus: "missing",
        selectedPopulation: { value: false },
        value: false
      },
      {
        evidenceRefs: ["https://example.com/privacy"],
        key: "ai.human_review_path_present",
        label: "AI human review or escalation path present",
        populationStatus: "missing",
        selectedPopulation: { value: false },
        value: false
      }
    ]
  });
  const byId = new Map(euAiActArea.rows.map((row) => [row.id, row]));

  assert.equal(euAiActArea.score, 63);
  assert.equal(euAiActArea.counters.checked, 2);
  assert.equal(euAiActArea.counters.review, 3);
  assert.equal(euAiActArea.counters.notObserved, 3);
  assert.equal(euAiActArea.counters.notTestable, 0);
  assert.equal(byId.get("ai_feature_disclosure")?.status, "checked");
  assert.equal(byId.get("generated_content_labeling")?.status, "not_observed");
  assert.equal(byId.get("automated_decision_disclosure")?.status, "not_observed");
  assert.equal(byId.get("human_review_path")?.status, "not_observed");
});
