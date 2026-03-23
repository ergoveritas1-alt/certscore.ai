import { REGULATORY_FINDING_DEFINITIONS } from "./registry";
import { buildEvidenceRefs } from "./safety";
import { baseFindingFromDefinition, buildLimitations, detectClaimBehaviorGaps, extractPublicClaims, toReproductionInfo } from "./engines";
import type {
  EvidenceArtifactCollection,
  EvidencePacket,
  LaunchFindingId,
  ObservableBehavior,
  RegulatoryReviewArtifacts,
  ScanFinding,
  SurfaceObservation
} from "./types";

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function mergeEvidence(...sources: Array<EvidenceArtifactCollection | undefined>): EvidencePacket {
  const merged: EvidenceArtifactCollection = {
    cookies: [],
    domSnapshots: [],
    networkEvents: [],
    pageUrls: [],
    screenshots: [],
    sessionLogs: [],
    storageWrites: []
  };

  for (const source of sources) {
    if (!source) {
      continue;
    }

    merged.cookies = [...(merged.cookies ?? []), ...(source.cookies ?? [])];
    merged.domSnapshots = [...(merged.domSnapshots ?? []), ...(source.domSnapshots ?? [])];
    merged.networkEvents = [...(merged.networkEvents ?? []), ...(source.networkEvents ?? [])];
    merged.pageUrls = [...(merged.pageUrls ?? []), ...(source.pageUrls ?? [])];
    merged.screenshots = [...(merged.screenshots ?? []), ...(source.screenshots ?? [])];
    merged.sessionLogs = [...(merged.sessionLogs ?? []), ...(source.sessionLogs ?? [])];
    merged.storageWrites = [...(merged.storageWrites ?? []), ...(source.storageWrites ?? [])];
  }

  merged.pageUrls = uniqueStrings(merged.pageUrls ?? []);
  return buildEvidenceRefs(merged);
}

function hasConcreteBehaviorEvidence(evidence: EvidencePacket) {
  return evidence.networkEvents.length > 0 || evidence.cookies.length > 0 || evidence.storageWrites.length > 0;
}

function hasSignalComparisonEvidence(evidence: EvidencePacket) {
  const phases = new Set<string>();
  for (const entry of evidence.networkEvents) {
    if (entry.phase === "signal_enabled" || entry.phase === "signal_disabled") {
      phases.add(entry.phase);
    }
  }
  for (const entry of evidence.cookies) {
    if (entry.phase === "signal_enabled" || entry.phase === "signal_disabled") {
      phases.add(entry.phase);
    }
  }
  for (const entry of evidence.storageWrites) {
    if (entry.phase === "signal_enabled" || entry.phase === "signal_disabled") {
      phases.add(entry.phase);
    }
  }
  return phases.has("signal_enabled") && phases.has("signal_disabled");
}

function hasPostChoiceEvidence(evidence: EvidencePacket) {
  return (
    evidence.cookies.some((entry) => entry.phase === "after_choice") ||
    evidence.storageWrites.some((entry) => entry.phase === "after_choice") ||
    evidence.networkEvents.some((entry) => entry.phase === "after_choice")
  );
}

function hasClaimMatch(artifacts: RegulatoryReviewArtifacts, pattern: RegExp) {
  return artifacts.claims.some((claim) => pattern.test(claim.text));
}

function hasPageUrlMatch(artifacts: RegulatoryReviewArtifacts, pattern: RegExp) {
  return artifacts.pageUrls.some((pageUrl) => pattern.test(pageUrl));
}

function hasPotentialPrivacyChoiceSurface(artifacts: RegulatoryReviewArtifacts) {
  return (
    hasClaimMatch(artifacts, /opt out|do not sell|do not share|privacy choices|privacy rights|targeted ads|manage settings/i) ||
    hasPageUrlMatch(artifacts, /privacy|do-not-share|opt-?out|privacy-center|manage-settings|rights/i)
  );
}

function isAspirationalAccessibilityClaim(text: string) {
  return /we strive|we aim|we seek|we are committed|we endeavor/i.test(text);
}

function filterEvidenceByPage(evidence: EvidenceArtifactCollection, pageUrls: string[]) {
  const allowed = new Set(pageUrls);
  return buildEvidenceRefs({
    cookies: (evidence.cookies ?? []).filter((entry) => allowed.has(entry.pageUrl)),
    domSnapshots: (evidence.domSnapshots ?? []).filter((entry) => allowed.has(entry.pageUrl)),
    networkEvents: (evidence.networkEvents ?? []).filter((entry) => allowed.has(entry.pageUrl)),
    pageUrls: (evidence.pageUrls ?? []).filter((pageUrl) => allowed.has(pageUrl)),
    screenshots: (evidence.screenshots ?? []).filter((entry) => allowed.has(entry.pageUrl)),
    sessionLogs: (evidence.sessionLogs ?? []).filter((entry) => !entry.pageUrl || allowed.has(entry.pageUrl)),
    storageWrites: (evidence.storageWrites ?? []).filter((entry) => allowed.has(entry.pageUrl))
  });
}

function findSurface(artifacts: RegulatoryReviewArtifacts, surfaceKey: SurfaceObservation["surfaceKey"]) {
  return artifacts.surfaces.find((surface) => surface.surfaceKey === surfaceKey);
}

function findBehaviors(artifacts: RegulatoryReviewArtifacts, signals: string[]) {
  const wanted = new Set(signals);
  return artifacts.behaviors.filter((behavior) => wanted.has(behavior.signal));
}

function createFinding(input: {
  artifacts: RegulatoryReviewArtifacts;
  evidence: EvidencePacket;
  findingId: LaunchFindingId;
  observations: string[];
  recommendedReview?: string;
  whatWasTested: string[];
  flowCriticality?: "core" | "important" | "secondary";
  contradictionImportance?: "material" | "moderate" | "limited";
}) {
  const definition = REGULATORY_FINDING_DEFINITIONS[input.findingId];
  const finalized = baseFindingFromDefinition({
    breadth: new Set(input.evidence.pageUrls).size,
    contradictionImportance: input.contradictionImportance,
    evidence: input.evidence,
    finding: {
      claimType: definition.claimType,
      findingId: definition.findingId,
      generatedAt: input.artifacts.methodology.generatedAt,
      limitations: buildLimitations(definition.module, definition.claimType, {
        claimGap: definition.claimType === "claim_vs_behavior_gap"
      }),
      module: definition.module,
      observations: input.observations,
      pillar: definition.pillar,
      recommendedReview: input.recommendedReview,
      regulatoryMappings: definition.regulatoryMappings,
      reproduction: toReproductionInfo(input.artifacts),
      scanRunId: input.artifacts.methodology.scanRunId,
      title: definition.title,
      whatWasTested: input.whatWasTested
    },
    flowCriticality: input.flowCriticality
  });

  return finalized.validation.ok ? finalized.finding : null;
}

export function generateCaliforniaPrivacyChoiceFindings(artifacts: RegulatoryReviewArtifacts): ScanFinding[] {
  const findings: ScanFinding[] = [];
  const privacyPolicy = findSurface(artifacts, "privacy_policy");
  const optOut = findSurface(artifacts, "ca_opt_out");
  const browserSignal = findSurface(artifacts, "browser_opt_out_signal");
  const trackingBeforeChoice = findBehaviors(artifacts, ["tracking_before_choice", "pre_choice_tracking_observed"]);

  if (privacyPolicy?.detected === false) {
    const finding = createFinding({
      artifacts,
      evidence: mergeEvidence(artifacts.evidence, privacyPolicy.evidence),
      findingId: "privacy.ca.privacy_policy_surface_missing",
      observations: ["A privacy policy link or page was not evident on the tested public surfaces during the scan."],
      whatWasTested: ["Tested homepage, footer, and linked public legal pages for a privacy policy surface."]
    });
    if (finding) {
      findings.push(finding);
    }
  }

  if (optOut?.detected === false && !hasPotentialPrivacyChoiceSurface(artifacts)) {
    const finding = createFinding({
      artifacts,
      evidence: mergeEvidence(artifacts.evidence, optOut.evidence),
      findingId: "privacy.ca.opt_out_surface_missing",
      observations: ["An observable privacy choice surface for opt-out actions was not detected on tested public pages."],
      whatWasTested: ["Tested homepage, footer, privacy-related pages, and consent interfaces for an opt-out surface."]
    });
    if (finding) {
      findings.push(finding);
    }
  }

  if (browserSignal?.detected === false) {
    const pageUrl = browserSignal.pageUrl ?? artifacts.pageUrls[0];
    const evidence = mergeEvidence(filterEvidenceByPage(artifacts.evidence, pageUrl ? [pageUrl] : []), {
      cookies: artifacts.evidence.cookies?.filter((entry) => entry.phase === "signal_disabled" || entry.phase === "signal_enabled"),
      networkEvents: artifacts.evidence.networkEvents?.filter((entry) => entry.phase === "signal_disabled" || entry.phase === "signal_enabled"),
      pageUrls: pageUrl ? [pageUrl] : [],
      screenshots: artifacts.evidence.screenshots?.filter((entry) => entry.pageUrl === pageUrl),
      sessionLogs: artifacts.evidence.sessionLogs?.filter((entry) => /browser_signal|consent_surface_observation/i.test(entry.eventType)),
      storageWrites: artifacts.evidence.storageWrites?.filter((entry) => entry.phase === "signal_disabled" || entry.phase === "signal_enabled")
    });
    if (hasConcreteBehaviorEvidence(evidence) && hasSignalComparisonEvidence(evidence)) {
      const finding = createFinding({
        artifacts,
        evidence,
        findingId: "privacy.ca.browser_signal_not_evident",
        observations: [
          "No visible response to the tested browser-level opt-out signal was observed during the compared public sessions.",
          "The retained public evidence did not establish whether any server-side or region-specific signal handling may occur outside the tested conditions."
        ],
        recommendedReview: "Manual review recommended to confirm whether browser-level opt-out handling exists in other regions, account states, or private flows.",
        whatWasTested: ["Compared tested browser sessions for observable browser-level opt-out signal handling."]
      });
      if (finding) {
        findings.push(finding);
      }
    }
  }

  if (trackingBeforeChoice.length > 0) {
    const evidence = mergeEvidence(artifacts.evidence, {
      cookies: artifacts.evidence.cookies?.filter((entry) => entry.phase === "before_choice" || entry.phase === "signal_disabled"),
      networkEvents: artifacts.evidence.networkEvents?.filter((entry) => entry.phase === "before_choice" || entry.phase === "signal_disabled"),
      pageUrls: trackingBeforeChoice.map((entry) => entry.pageUrl),
      sessionLogs: artifacts.evidence.sessionLogs?.filter((entry) =>
        trackingBeforeChoice.some((behavior) => behavior.evidenceRefs.includes(entry.id))
      ),
      storageWrites: artifacts.evidence.storageWrites?.filter((entry) => entry.phase === "before_choice" || entry.phase === "signal_disabled")
    });
    if (hasConcreteBehaviorEvidence(evidence)) {
      const finding = createFinding({
        artifacts,
        evidence,
        findingId: "privacy.ca.pre_choice_tracking_observed",
        observations: uniqueStrings(trackingBeforeChoice.map((entry) => entry.summary)),
        whatWasTested: ["Observed tracking-related network, cookie, storage, and session activity before any privacy choice interaction."]
      });
      if (finding) {
        findings.push(finding);
      }
    }
  }

  for (const gap of detectClaimBehaviorGaps(extractPublicClaims(artifacts), artifacts.behaviors).filter((gap) => gap.kind === "privacy")) {
    const evidence = mergeEvidence(artifacts.evidence, {
      domSnapshots: artifacts.evidence.domSnapshots?.filter((entry) => entry.pageUrl === gap.claimSourceUrl && entry.excerpt?.includes(gap.claimText)),
      pageUrls: [gap.claimSourceUrl, ...artifacts.behaviors.filter((behavior) => gap.observedBehaviorEvidenceRefs.some((ref) => behavior.evidenceRefs.includes(ref))).map((behavior) => behavior.pageUrl)],
      sessionLogs: artifacts.evidence.sessionLogs?.filter((entry) => gap.observedBehaviorEvidenceRefs.includes(entry.id))
    });
    const finding = createFinding({
      artifacts,
      contradictionImportance: "material",
      evidence,
      findingId: "privacy.ca.claim_behavior_gap",
      observations: [
        `Claim text captured from ${gap.claimSourceUrl}: ${gap.claimText}`,
        gap.observedBehaviorSummary,
        gap.limitationNote
      ],
      recommendedReview: "Review the retained claim text and behavior evidence together to confirm whether public privacy disclosures need clarification.",
      whatWasTested: ["Compared retained privacy claim text from public pages against timestamped runtime behavior evidence."]
    });
    if (finding) {
      findings.push(finding);
      break;
    }
  }

  return findings;
}

export function generateUnifiedStatePrivacyFindings(artifacts: RegulatoryReviewArtifacts): ScanFinding[] {
  const findings: ScanFinding[] = [];
  const consumerRights = findSurface(artifacts, "consumer_rights_request");
  const adsOptOut = findSurface(artifacts, "targeted_ads_opt_out");
  const universalOptOut = findSurface(artifacts, "universal_opt_out");

  if (consumerRights?.detected === false && !hasPotentialPrivacyChoiceSurface(artifacts)) {
    const finding = createFinding({
      artifacts,
      evidence: mergeEvidence(artifacts.evidence, consumerRights.evidence),
      findingId: "privacy.state.consumer_rights_mechanism_missing",
      observations: ["A consumer rights request mechanism was not detected on tested public privacy surfaces."],
      whatWasTested: ["Tested public privacy pages, footers, and request pathways for a consumer rights mechanism."]
    });
    if (finding) {
      findings.push(finding);
    }
  }

  if (adsOptOut?.detected === false && !hasPotentialPrivacyChoiceSurface(artifacts)) {
    const finding = createFinding({
      artifacts,
      evidence: mergeEvidence(artifacts.evidence, adsOptOut.evidence),
      findingId: "privacy.state.targeted_ads_opt_out_missing",
      observations: ["A targeted advertising opt-out surface was not evident during the tested scan conditions."],
      whatWasTested: ["Tested public privacy disclosures and consent surfaces for a targeted advertising opt-out path."]
    });
    if (finding) {
      findings.push(finding);
    }
  }

  if (universalOptOut?.detected === false) {
    const evidence = mergeEvidence(artifacts.evidence, universalOptOut.evidence);
    if (
      hasConcreteBehaviorEvidence(evidence) &&
      hasSignalComparisonEvidence(evidence) &&
      hasClaimMatch(artifacts, /global privacy control|gpc|universal opt-?out|browser-based opt-?out/i)
    ) {
      const finding = createFinding({
        artifacts,
        evidence,
        findingId: "privacy.state.universal_opt_out_not_evident",
        observations: ["The retained evidence did not show observable handling of a universal opt-out signal under the tested conditions."],
        recommendedReview: "Manual review recommended if universal opt-out support may exist only for certain regions, devices, or logged-in states.",
        whatWasTested: ["Compared control and signal-enabled sessions for observable universal opt-out handling."]
      });
      if (finding) {
        findings.push(finding);
      }
    }
  }

  for (const gap of detectClaimBehaviorGaps(extractPublicClaims(artifacts), artifacts.behaviors).filter((gap) => gap.kind === "privacy")) {
    const finding = createFinding({
      artifacts,
      contradictionImportance: "moderate",
      evidence: mergeEvidence(artifacts.evidence, {
        domSnapshots: artifacts.evidence.domSnapshots?.filter((entry) => entry.pageUrl === gap.claimSourceUrl),
        pageUrls: [gap.claimSourceUrl, ...artifacts.behaviors.map((behavior) => behavior.pageUrl)]
      }),
      findingId: "privacy.state.disclosure_behavior_gap",
      observations: [
        `Claim text captured from ${gap.claimSourceUrl}: ${gap.claimText}`,
        gap.observedBehaviorSummary,
        gap.limitationNote
      ],
      recommendedReview: "Review whether public privacy disclosures clearly describe the observed choice and data-handling posture under the tested conditions.",
      whatWasTested: ["Compared public privacy disclosure text against retained behavior evidence relevant to rights and choice posture."]
    });
    if (finding) {
      findings.push(finding);
      break;
    }
  }

  return findings;
}

export function generateEUAccessibilityActPostureFindings(artifacts: RegulatoryReviewArtifacts): ScanFinding[] {
  const findings: ScanFinding[] = [];
  const statement = findSurface(artifacts, "accessibility_statement");

  if (statement?.detected === false) {
    const finding = createFinding({
      artifacts,
      evidence: mergeEvidence(artifacts.evidence, statement.evidence),
      findingId: "accessibility.eu.statement_missing",
      observations: ["An accessibility statement was not detected on the tested public pages."],
      whatWasTested: ["Tested homepage, footer, help pages, and legal pages for an accessibility statement surface."]
    });
    if (finding) {
      findings.push(finding);
    }
  }

  if (artifacts.accessibilityIssues.length > 0) {
    const supportedIssues = artifacts.accessibilityIssues.filter(
      (issue) => !/could not fully complete|scan error|import_|not a function|probe error/i.test(issue.summary)
    );
    if (supportedIssues.length > 0) {
      const evidence = mergeEvidence(artifacts.evidence, {
        domSnapshots: supportedIssues.map((issue) => ({
          excerpt: issue.summary,
          id: issue.id,
          pageUrl: issue.pageUrl,
          timestamp: issue.timestamp
        })),
        pageUrls: supportedIssues.map((issue) => issue.pageUrl),
        sessionLogs: supportedIssues.map((issue) => ({
          eventType: "accessibility_issue",
          id: `log-${issue.id}`,
          message: `${issue.impact} issue observed: ${issue.summary}`,
          pageUrl: issue.pageUrl,
          timestamp: issue.timestamp
        }))
      });
      const finding = createFinding({
        artifacts,
        evidence,
        findingId: "accessibility.eu.automated_barriers_detected",
        observations: uniqueStrings(supportedIssues.map((issue) => issue.summary)),
        whatWasTested: ["Ran automated accessibility checks on tested public pages and retained representative issue evidence."]
      });
      if (finding) {
        findings.push(finding);
      }
    }
  }

  const keyFlowIssues = artifacts.accessibilityIssues.filter((issue) => issue.keyFlow && (issue.impact === "critical" || issue.impact === "serious"));
  if (keyFlowIssues.length > 0) {
    const evidence = mergeEvidence(artifacts.evidence, {
      domSnapshots: keyFlowIssues.map((issue) => ({
        excerpt: issue.summary,
        id: issue.id,
        pageUrl: issue.pageUrl,
        timestamp: issue.timestamp
      })),
      pageUrls: keyFlowIssues.map((issue) => issue.pageUrl),
      sessionLogs: [
        {
          eventType: "manual_review_reason",
          id: "accessibility-manual-review",
          message: "Automation identified potential barriers on key flows, but manual review is required to confirm assistive-technology impact.",
          timestamp: artifacts.methodology.generatedAt
        }
      ]
    });
    const finding = createFinding({
      artifacts,
      evidence,
      findingId: "accessibility.eu.key_flow_barriers",
      flowCriticality: "core",
      observations: uniqueStrings(keyFlowIssues.map((issue) => issue.summary)),
      recommendedReview:
        "Manual review recommended on tested key flows to confirm screen-reader, keyboard, and assistive-technology impact beyond automated checks alone.",
      whatWasTested: ["Tested automated accessibility results on key public flows including signup, checkout, payment, login, or equivalent core tasks."]
    });
    if (finding) {
      findings.push(finding);
    }
  }

  for (const gap of detectClaimBehaviorGaps(extractPublicClaims(artifacts), artifacts.behaviors).filter((gap) => gap.kind === "accessibility")) {
    if (isAspirationalAccessibilityClaim(gap.claimText)) {
      continue;
    }
    const finding = createFinding({
      artifacts,
      contradictionImportance: "moderate",
      evidence: mergeEvidence(artifacts.evidence, {
        domSnapshots: artifacts.evidence.domSnapshots?.filter((entry) => entry.pageUrl === gap.claimSourceUrl),
        pageUrls: [gap.claimSourceUrl, ...artifacts.accessibilityIssues.map((issue) => issue.pageUrl)]
      }),
      findingId: "accessibility.eu.claim_gap",
      observations: [
        `Claim text captured from ${gap.claimSourceUrl}: ${gap.claimText}`,
        gap.observedBehaviorSummary,
        gap.limitationNote
      ],
      recommendedReview: "Review the public accessibility claim against the retained automated results and confirm whether more precise wording or additional testing is needed.",
      whatWasTested: ["Compared public accessibility claim text against retained automated accessibility results on tested pages."]
    });
    if (finding) {
      findings.push(finding);
      break;
    }
  }

  return findings;
}

export function generateCaliforniaBrowserOptOutReadinessFindings(artifacts: RegulatoryReviewArtifacts): ScanFinding[] {
  const findings: ScanFinding[] = [];
  const readiness = findSurface(artifacts, "browser_signal_readiness");
  const persistence = findSurface(artifacts, "privacy_preference_persistence");
  const confirmation = findSurface(artifacts, "privacy_preference_confirmation");

  if (readiness?.detected === false) {
    const evidence = mergeEvidence(artifacts.evidence, readiness.evidence);
    if (
      hasSignalComparisonEvidence(evidence) &&
      hasClaimMatch(artifacts, /global privacy control|gpc|browser-based opt-?out|privacy signal/i)
    ) {
      const finding = createFinding({
        artifacts,
        evidence,
        findingId: "privacy.ca.browser_readiness_not_evident",
        observations: ["Observable readiness for a browser-level privacy signal was not evident during the scan."],
        recommendedReview: "Review whether readiness depends on regional routing, authenticated state, or untested preference APIs.",
        whatWasTested: ["Compared tested browser sessions for observable browser-signal readiness."]
      });
      if (finding) {
        findings.push(finding);
      }
    }
  }

  if (persistence?.detected === false) {
    const evidence = mergeEvidence(artifacts.evidence, persistence.evidence);
    if (hasPostChoiceEvidence(evidence)) {
      const finding = createFinding({
        artifacts,
        evidence,
        findingId: "privacy.ca.preference_persistence_not_evident",
        observations: ["The retained evidence did not show observable persistence of the tested privacy preference across the scanned session states."],
        recommendedReview: "Review whether privacy preferences persist in other devices, browsers, or authenticated user states.",
        whatWasTested: ["Compared repeated page loads and session states for observable persistence of the tested privacy preference."]
      });
      if (finding) {
        findings.push(finding);
      }
    }
  }

  if (confirmation?.detected === false) {
    const evidence = mergeEvidence(artifacts.evidence, confirmation.evidence);
    if (hasPostChoiceEvidence(evidence)) {
      const finding = createFinding({
        artifacts,
        evidence,
        findingId: "privacy.ca.user_confirmation_not_evident",
        observations: ["A visible user confirmation acknowledging receipt of the tested privacy preference was not evident during the scan."],
        whatWasTested: ["Tested post-preference UI states for visible confirmation that a privacy preference was received."]
      });
      if (finding) {
        findings.push(finding);
      }
    }
  }

  return findings;
}

export function generateAllRegulatoryFindings(artifacts: RegulatoryReviewArtifacts) {
  return [
    ...generateCaliforniaPrivacyChoiceFindings(artifacts),
    ...generateUnifiedStatePrivacyFindings(artifacts),
    ...generateEUAccessibilityActPostureFindings(artifacts),
    ...generateCaliforniaBrowserOptOutReadinessFindings(artifacts)
  ];
}
