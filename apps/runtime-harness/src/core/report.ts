import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AutoDecisionSummary, ComparisonConclusion, ComparisonReport, RuntimeMode, RuntimeRunResult } from "./types";
import type { BrowserPassResult } from "../hybrid-auto-decision-core";

function hostnameFromUrl(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function getDocumentResponses(mode: RuntimeRunResult) {
  return mode.responses
    .filter((response) => response.resourceType === "document" || response.requestId === mode.requestedUrl || response.url === mode.requestedUrl || response.url === mode.finalUrl)
    .sort((left, right) => left.timestampMs - right.timestampMs);
}

function getInitialAndFinalDocumentStatus(mode: RuntimeRunResult) {
  const documents = getDocumentResponses(mode);
  return {
    initialStatus: documents[0]?.status ?? mode.mainDocument.status ?? null,
    finalStatus: documents.at(-1)?.status ?? mode.mainDocument.status ?? null
  };
}

function getTopVendors(mode: RuntimeRunResult, limit = 5) {
  return Object.entries(mode.vendorSummary.vendorCounts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit);
}

function scoreRun(run: RuntimeRunResult) {
  const phaseScore: Record<RuntimeRunResult["classification"]["maxPhaseReached"], number> = {
    navigation_started: 0,
    main_document: 1,
    dom_content_loaded: 2,
    page_title: 3,
    html_snapshot: 4,
    first_party_subresources: 5,
    third_party_signals: 6
  };

  return (
    phaseScore[run.classification.maxPhaseReached] * 1_000 +
    run.vendorSummary.normalizedVendors.length * 100 +
    run.vendorSummary.rawDomains.length * 10 +
    run.requests.length
  );
}

function buildConclusion(modes: RuntimeRunResult[]): ComparisonConclusion {
  if (modes.length === 0) {
    return {
      confidenceNotes: ["No modes completed."],
      furthestRuntime: null,
      richestVendorRuntime: null,
      summary: "No runtime results were available."
    };
  }

  const furthest = [...modes].sort((left, right) => scoreRun(right) - scoreRun(left))[0] ?? null;
  const richest = [...modes].sort((left, right) => {
    const leftScore = left.vendorSummary.normalizedVendors.length * 100 + left.vendorSummary.rawDomains.length;
    const rightScore = right.vendorSummary.normalizedVendors.length * 100 + right.vendorSummary.rawDomains.length;
    return rightScore - leftScore;
  })[0] ?? null;

  const confidenceNotes: string[] = [];
  const challengeModes = modes.filter((mode) => mode.classification.challengeDetected);
  if (modes.length > 1 && challengeModes.length === modes.length) {
    confidenceNotes.push("Every runtime saw a challenge or verification interstitial, which points more toward environment or site logic than one specific automation library.");
  } else if (modes.length > 1 && challengeModes.length > 0) {
    confidenceNotes.push("Only some runtimes hit challenge indicators, which suggests runtime fidelity or environment differences matter.");
  }
  if (modes.length > 1 && furthest && richest && furthest.mode === richest.mode) {
    confidenceNotes.push(`${furthest.mode} was both the furthest runtime and the richest vendor graph.`);
  }

  const summary =
    modes.length === 1 && furthest
      ? `${furthest.mode} completed the only requested runtime. Use multi-mode runs to compare runtime fidelity against environment-level blocking.`
      : furthest && richest
      ? `${furthest.mode} got furthest into post-navigation state, while ${richest.mode} produced the richest vendor graph. Compare these with the challenge classifications to separate runtime fidelity from environment-level blocking.`
      : "Comparison completed.";

  return {
    confidenceNotes,
    furthestRuntime: furthest?.mode ?? null,
    richestVendorRuntime: richest?.mode ?? null,
    summary
  };
}

export function renderMarkdown(report: ComparisonReport) {
  const lines: string[] = [];
  lines.push(`# Runtime Comparison`);
  lines.push("");
  lines.push(`- target: ${report.targetUrl}`);
  lines.push(`- timestamp: ${report.timestamp}`);
  lines.push("");
  lines.push("## Modes");
  lines.push("");

  for (const mode of report.modes) {
    const { initialStatus, finalStatus } = getInitialAndFinalDocumentStatus(mode);
    const challengeRecoveryTimeMs = mode.timings.challengeToRecoveryMs;
    const firstThirdPartyRequestTimeMs = mode.timings.firstThirdPartyRequestTimestampMs;
    const topVendors = getTopVendors(mode);

    lines.push(`### ${mode.mode}`);
    lines.push(`- main document status: ${mode.mainDocument.status ?? "unavailable"}`);
    lines.push(`- initial document status: ${initialStatus ?? "unavailable"}`);
    lines.push(`- final document status: ${finalStatus ?? "unavailable"}`);
    lines.push(`- final URL: ${mode.finalUrl ?? "unavailable"}`);
    lines.push(`- title: ${mode.title ?? "unavailable"}`);
    lines.push(`- max phase reached: ${mode.classification.maxPhaseReached}`);
    lines.push(`- challenge detected: ${mode.classification.challengeDetected ? "yes" : "no"}`);
    lines.push(
      `- blocker summary: ${mode.classification.blockerSummary.outcome}${mode.classification.blockerSummary.vendorHint ? ` (${mode.classification.blockerSummary.vendorHint})` : ""}`
    );
    if (mode.classification.blockerSummary.evidence.length > 0) {
      lines.push(`- blocker evidence: ${mode.classification.blockerSummary.evidence.join(", ")}`);
    }
    lines.push(`- challenge recovery to 200: ${challengeRecoveryTimeMs === null ? "no" : `yes (${challengeRecoveryTimeMs} ms)`}`);
    lines.push(`- first third-party request: ${firstThirdPartyRequestTimeMs === null ? "none" : `${firstThirdPartyRequestTimeMs} ms`}`);
    lines.push(`- signals preceded consent UI: ${mode.consentSignalTiming.signalsPrecededConsentUi}`);
    lines.push(`- first cookie: ${mode.timings.firstCookieTimestampMs === null ? "none" : `${mode.timings.firstCookieTimestampMs} ms`}`);
    lines.push(
      `- first high-signal cookie: ${mode.timings.firstHighSignalCookieTimestampMs === null ? "none" : `${mode.timings.firstHighSignalCookieTimestampMs} ms`}`
    );
    lines.push(`- request count: ${mode.requests.length}`);
    lines.push(`- response count: ${mode.responses.length}`);
    lines.push(`- cookie count: ${mode.cookieSnapshots.at(-1)?.cookieCount ?? 0}`);
    lines.push(`- pre-consent requests: ${mode.networkSummary.preConsentRequestCount}`);
    lines.push(`- popups: ${mode.uiSummary.popupCount}`);
    lines.push(`- autoplay video/audio: ${mode.mediaSummary.autoplayVideoObserved ? "yes" : "no"}/${mode.mediaSummary.autoplayAudioObserved ? "yes" : "no"}`);
    lines.push(
      `- fingerprinting: tier ${mode.fingerprinting.tier}, confidence ${mode.fingerprinting.confidence}, categories ${mode.fingerprinting.signals.attributeCategoryCount}`
    );
    if (mode.fingerprinting.tier > 0) {
      lines.push(`- fingerprinting summary: ${mode.fingerprinting.summary}`);
      lines.push(
        `- fingerprinting evidence: ${mode.fingerprinting.reasons.length === 0 ? "none" : mode.fingerprinting.reasons.slice(0, 3).join("; ")}`
      );
    }
    lines.push(
      `- finding packet: ${mode.findingPacket.summary.confirmed} confirmed, ${mode.findingPacket.summary.notObserved} not observed, ${mode.findingPacket.summary.inconclusive} inconclusive`
    );
    lines.push(
      `- run quality: ${mode.runQualitySummary.evidenceDepth}, confidence ${mode.runQualitySummary.overallConfidence.toFixed(2)}, likely sufficient ${mode.runQualitySummary.likelySufficientForFindings ? "yes" : "no"}`
    );
    lines.push(`- third-party domains: ${mode.thirdPartyDomainCount}`);
    lines.push(`- vendors: ${mode.vendorSummary.normalizedVendors.join(", ") || "none"}`);
    lines.push(`- pre-consent vendors: ${mode.preConsentVendorSummary.normalizedVendors.join(", ") || "none"}`);
    lines.push(
      `- top vendors by count: ${topVendors.length === 0 ? "none" : topVendors.map(([vendor, count]) => `${vendor} (${count})`).join(", ")}`
    );
    lines.push(
      `- top cookie-setting hosts: ${
        mode.vendorLeaderboard.topCookieSettingHosts.length === 0
          ? "none"
          : mode.vendorLeaderboard.topCookieSettingHosts
              .slice(0, 5)
              .map((row) => `${row.endpointHostname} (${row.setCookieResponseCount})`)
              .join(", ")
      }`
    );
    if (mode.findings.length > 0) {
      lines.push(`- findings: ${mode.findings.map((finding) => `[${finding.severity}] ${finding.title}`).join("; ")}`);
    }
    lines.push(`- screenshot: ${mode.screenshotPath ?? "unavailable"}`);
    lines.push(`- stop reason: ${mode.classification.stopReason}`);
    lines.push(`- notes: ${mode.classification.classifierNotes.join(" ") || "none"}`);
    lines.push("");
  }

  lines.push("## Conclusion");
  lines.push("");
  lines.push(`- ${report.conclusion.summary}`);
  for (const note of report.conclusion.confidenceNotes) {
    lines.push(`- ${note}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

export async function writeComparisonReport(outputDir: string, report: ComparisonReport) {
  await mkdir(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, "comparison.json");
  const markdownPath = path.join(outputDir, "comparison.md");
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, renderMarkdown(report), "utf8");
  return { jsonPath, markdownPath };
}

export async function writeHybridAutoReportBundle(outputDir: string, report: ComparisonReport, autoDecisionSummary: AutoDecisionSummary | null) {
  const comparison = await writeComparisonReport(outputDir, report);
  const autoDecisionPath =
    autoDecisionSummary === null
      ? null
      : path.join(outputDir, "auto-decision.json");

  if (autoDecisionPath) {
    await writeFile(autoDecisionPath, `${JSON.stringify(autoDecisionSummary, null, 2)}\n`, "utf8");
  }

  return {
    autoDecisionPath,
    ...comparison
  };
}

export async function writeRuntimeArtifacts(outputDir: string, run: RuntimeRunResult) {
  await mkdir(outputDir, { recursive: true });
  const files = {
    cnameCandidatesPath: path.join(outputDir, "cname-candidates.json"),
    cnameCloakingPath: path.join(outputDir, "cname-cloaking.json"),
    cnameObservationsPath: path.join(outputDir, "cname-observations.json"),
    consentSignalTimingPath: path.join(outputDir, "consent-signal-timing.json"),
    consentSummaryPath: path.join(outputDir, "consent-summary.json"),
    consentVisualPath: path.join(outputDir, "consent-visual.json"),
    consentUiPath: path.join(outputDir, "consent-ui.json"),
    cookieWriteObservationsPath: path.join(outputDir, "cookie-write-observations.json"),
    cookieRiskSummaryPath: path.join(outputDir, "cookie-risk-summary.json"),
    cookieDiffsPath: path.join(outputDir, "cookie-diffs.json"),
    cookiesBeforeConsentPath: path.join(outputDir, "cookies-before-consent.json"),
    browserCollectorPath: path.join(outputDir, "browser-collector.json"),
    domainVendorRegistryPath: path.join(outputDir, "domain-vendor-registry.json"),
    findingsPath: path.join(outputDir, "findings.json"),
    fingerprintApiEventSamplesPath: path.join(outputDir, "fingerprint-api-event-samples.json"),
    fingerprintingPath: path.join(outputDir, "fingerprinting.json"),
    findingPacketPath: path.join(outputDir, "finding-packet.json"),
    keyloggingSummaryPath: path.join(outputDir, "keylogging-summary.json"),
    leakMapPath: path.join(outputDir, "leak-map.json"),
    mediaSummaryPath: path.join(outputDir, "media-summary.json"),
    navigationSummaryPath: path.join(outputDir, "navigation-summary.json"),
    networkSummaryPath: path.join(outputDir, "network-summary.json"),
    pageSnapshotSummaryPath: path.join(outputDir, "page-snapshot-summary.json"),
    postRejectPersistencePath: path.join(outputDir, "post-reject-persistence.json"),
    preConsentTimelinePath: path.join(outputDir, "preconsent-timeline.json"),
    rawRedirectTimelinePath: path.join(outputDir, "raw-redirect-timeline.json"),
    rawRequestTimelinePath: path.join(outputDir, "raw-request-timeline.json"),
    rawResponseTimelinePath: path.join(outputDir, "raw-response-timeline.json"),
    requestObservationsPath: path.join(outputDir, "request-observations.json"),
    requestToVendorObservationsPath: path.join(outputDir, "request-to-vendor-observations.json"),
    blockerSummaryPath: path.join(outputDir, "blocker-summary.json"),
    runSummaryPath: path.join(outputDir, "run-summary.json"),
    runQualitySummaryPath: path.join(outputDir, "run-quality-summary.json"),
    storageSummaryPath: path.join(outputDir, "storage-summary.json"),
    uiSummaryPath: path.join(outputDir, "ui-summary.json"),
    runtimeMetadataPath: path.join(outputDir, "runtime-metadata.json"),
    stopSummaryPath: path.join(outputDir, "stop-summary.json"),
    vendorLeaderboardPath: path.join(outputDir, "vendor-leaderboard.json"),
    vendorSummaryExtendedPath: path.join(outputDir, "vendor-summary-extended.json"),
    vendorSummaryPath: path.join(outputDir, "vendor-summary.json")
  };

  const runSummary = {
    challengeDetected: run.classification.challengeDetected,
    classification: run.classification.classification,
    blockerSummary: run.classification.blockerSummary,
    cookieCount: run.cookieSnapshots.at(-1)?.cookieCount ?? 0,
    errors: run.errors,
    consentSummary: run.consentSummary,
    highSignalCookieCount: run.cookieRiskSummary.filter((item) => item.observed).length,
    fingerprinting: run.fingerprinting,
    finalStatus: run.timings.finalDocumentStatus,
    findingCount: run.findings.length,
    firstCookieTimestampMs: run.timings.firstCookieTimestampMs,
    firstHighSignalCookieTimestampMs: run.timings.firstHighSignalCookieTimestampMs,
    firstThirdPartyRequestTimestampMs: run.timings.firstThirdPartyRequestTimestampMs,
    initialStatus: run.timings.initialDocumentStatus,
    mode: run.mode,
    navigationOutcome: run.navigationOutcome,
    networkSummary: run.networkSummary,
    runQualitySummary: run.runQualitySummary,
    runtimeMetadata: run.runtimeMetadata,
    stopSummary: run.stopSummary,
    targetUrl: run.requestedUrl,
    thirdPartyDomainCount: run.thirdPartyDomainCount,
    vendorCount: run.preConsentVendorSummary.normalizedVendors.length,
    wallTimeMs: run.wallTimeMs
  };

  await Promise.all([
    writeFile(files.preConsentTimelinePath, `${JSON.stringify(run.preConsentTimeline, null, 2)}\n`, "utf8"),
    writeFile(files.browserCollectorPath, `${JSON.stringify(run.browserCollector, null, 2)}\n`, "utf8"),
    writeFile(files.cnameCandidatesPath, `${JSON.stringify(run.cnameCandidates, null, 2)}\n`, "utf8"),
    writeFile(files.cnameObservationsPath, `${JSON.stringify(run.cnameObservations, null, 2)}\n`, "utf8"),
    writeFile(files.consentSignalTimingPath, `${JSON.stringify(run.consentSignalTiming, null, 2)}\n`, "utf8"),
    writeFile(files.consentSummaryPath, `${JSON.stringify(run.consentSummary, null, 2)}\n`, "utf8"),
    writeFile(files.consentVisualPath, `${JSON.stringify(run.consentVisual, null, 2)}\n`, "utf8"),
    writeFile(files.consentUiPath, `${JSON.stringify(run.consentUi, null, 2)}\n`, "utf8"),
    writeFile(files.cookieWriteObservationsPath, `${JSON.stringify(run.cookieWriteObservations, null, 2)}\n`, "utf8"),
    writeFile(files.cookieRiskSummaryPath, `${JSON.stringify(run.cookieRiskSummary, null, 2)}\n`, "utf8"),
    writeFile(files.cookieDiffsPath, `${JSON.stringify(run.cookieDiffs, null, 2)}\n`, "utf8"),
    writeFile(files.cookiesBeforeConsentPath, `${JSON.stringify(run.cookiesBeforeConsent, null, 2)}\n`, "utf8"),
    writeFile(files.domainVendorRegistryPath, `${JSON.stringify(run.domainVendorRegistry, null, 2)}\n`, "utf8"),
    writeFile(files.findingsPath, `${JSON.stringify(run.findings, null, 2)}\n`, "utf8"),
    writeFile(files.fingerprintApiEventSamplesPath, `${JSON.stringify(run.fingerprintApiEventSamples, null, 2)}\n`, "utf8"),
    writeFile(files.fingerprintingPath, `${JSON.stringify(run.fingerprinting, null, 2)}\n`, "utf8"),
    writeFile(files.findingPacketPath, `${JSON.stringify(run.findingPacket, null, 2)}\n`, "utf8"),
    writeFile(files.keyloggingSummaryPath, `${JSON.stringify(run.keyloggingSummary, null, 2)}\n`, "utf8"),
    writeFile(files.blockerSummaryPath, `${JSON.stringify(run.classification.blockerSummary, null, 2)}\n`, "utf8"),
    writeFile(path.join(outputDir, "timings.json"), `${JSON.stringify(run.timings, null, 2)}\n`, "utf8"),
    writeFile(files.mediaSummaryPath, `${JSON.stringify(run.mediaSummary, null, 2)}\n`, "utf8"),
    writeFile(files.navigationSummaryPath, `${JSON.stringify(run.navigationSummary, null, 2)}\n`, "utf8"),
    writeFile(files.networkSummaryPath, `${JSON.stringify(run.networkSummary, null, 2)}\n`, "utf8"),
    writeFile(files.pageSnapshotSummaryPath, `${JSON.stringify(run.pageSnapshotSummary, null, 2)}\n`, "utf8"),
    writeFile(path.join(outputDir, "preconsent-vendor-summary.json"), `${JSON.stringify(run.preConsentVendorSummary, null, 2)}\n`, "utf8"),
    writeFile(files.rawRedirectTimelinePath, `${JSON.stringify(run.redirectChain, null, 2)}\n`, "utf8"),
    writeFile(files.rawRequestTimelinePath, `${JSON.stringify(run.requests, null, 2)}\n`, "utf8"),
    writeFile(files.rawResponseTimelinePath, `${JSON.stringify(run.responses, null, 2)}\n`, "utf8"),
    writeFile(files.requestObservationsPath, `${JSON.stringify(run.requestObservations, null, 2)}\n`, "utf8"),
    writeFile(files.requestToVendorObservationsPath, `${JSON.stringify(run.requestToVendorObservations, null, 2)}\n`, "utf8"),
    writeFile(files.runSummaryPath, `${JSON.stringify(runSummary, null, 2)}\n`, "utf8"),
    writeFile(files.runQualitySummaryPath, `${JSON.stringify(run.runQualitySummary, null, 2)}\n`, "utf8"),
    writeFile(files.runtimeMetadataPath, `${JSON.stringify(run.runtimeMetadata, null, 2)}\n`, "utf8"),
    writeFile(files.storageSummaryPath, `${JSON.stringify(run.storageSummary, null, 2)}\n`, "utf8"),
    writeFile(files.stopSummaryPath, `${JSON.stringify(run.stopSummary, null, 2)}\n`, "utf8"),
    writeFile(files.uiSummaryPath, `${JSON.stringify(run.uiSummary, null, 2)}\n`, "utf8"),
    writeFile(files.vendorLeaderboardPath, `${JSON.stringify(run.vendorLeaderboard, null, 2)}\n`, "utf8"),
    writeFile(files.vendorSummaryExtendedPath, `${JSON.stringify(run.vendorSummaryExtended, null, 2)}\n`, "utf8"),
    writeFile(files.vendorSummaryPath, `${JSON.stringify(run.vendorSummary, null, 2)}\n`, "utf8"),
    writeFile(files.leakMapPath, `${JSON.stringify(run.leakMap, null, 2)}\n`, "utf8"),
    writeFile(files.cnameCloakingPath, `${JSON.stringify(run.cnameCloaking, null, 2)}\n`, "utf8"),
    writeFile(files.postRejectPersistencePath, `${JSON.stringify(run.postRejectPersistence, null, 2)}\n`, "utf8")
  ]);

  return files;
}

export async function writeHybridAutoBrowserPass(outputDir: string, browserPass: BrowserPassResult) {
  await mkdir(outputDir, { recursive: true });
  const browserPassPath = path.join(outputDir, "browser-pass.json");
  await writeFile(browserPassPath, `${JSON.stringify(browserPass, null, 2)}\n`, "utf8");
  return { browserPassPath };
}

export function createComparisonReport(targetUrl: string, modes: RuntimeRunResult[]): ComparisonReport {
  return {
    conclusion: buildConclusion(modes),
    modes,
    targetUrl,
    timestamp: new Date().toISOString()
  };
}

export function modeSlug(mode: RuntimeMode) {
  return mode.replace(/[^a-z0-9]+/gi, "-");
}
