import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

type Args = {
  help?: boolean;
  maxFailures?: number;
  maxModuleFailures: number;
  minPreConsentTracking?: number;
  minSessionReplay?: number;
  minSites?: number;
  minThirdPartyCookies?: number;
  outDir?: string;
  summaryPath?: string;
};

type CohortSummary = {
  cohortSummaryVersion?: string;
  input?: {
    limit?: number;
    outDir?: string;
    profile?: string;
    totalUrls?: number;
    urlsPath?: string;
  };
  results?: CohortResult[];
  totals?: Record<string, unknown>;
};

type CohortResult = {
  chainKey?: string;
  cohort?: string;
  completedAt?: string;
  domain?: string;
  durationMs?: number;
  eligibleFindingKeys?: string[];
  error?: string;
  headedFallbackUsed?: boolean;
  index?: number;
  moduleRuns?: ModuleRunSummary[];
  normalizedUrl?: string;
  reviewCandidateCounts?: {
    eligible?: number;
    notEligible?: number;
    total?: number;
  };
  runtime?: {
    consentBannerLikelyPresent?: boolean | null;
    cookieEvents?: number;
    cookiesBeforeConsent?: number;
    coverageLimitationKeys?: string[];
    coverageStatus?: string;
    noGoCandidate?: boolean;
    noGoReasons?: string[];
    observedJourneys?: number;
    preConsentTrackingObserved?: boolean | null;
    sessionReplayOrBehavioralAnalyticsObserved?: boolean | null;
    silentEmptyRuntime?: boolean;
    thirdPartyCookiesPreConsentObserved?: boolean | null;
    thirdPartyRequests?: number;
    vendorObservations?: number;
  };
  startedAt?: string;
  status?: "completed" | "failed" | "skipped";
  url?: string;
};

type ModuleRunSummary = {
  errors?: string[];
  moduleName?: string;
  status?: string;
};

type VerificationCheck = {
  actual?: unknown;
  details?: string[];
  expected?: unknown;
  name: string;
  severity: "fail" | "warn" | "info";
  status: "passed" | "failed" | "warning" | "info";
};

type VerificationReport = {
  checkedAt: string;
  guardrailPosture: string[];
  input: {
    maxFailures: number;
    maxModuleFailures: number;
    minPreConsentTracking: number;
    minSessionReplay: number;
    minSites: number;
    minThirdPartyCookies: number;
    outDir: string;
    summaryPath: string;
  };
  metrics: {
    completed: number;
    criticalModuleFailures: number;
    failed: number;
    headedFallbackUsed: number;
    moduleFailures: number;
    noGoCandidates: number;
    results: number;
    runtimeCoverageLimited: number;
    silentEmptyCompleted: number;
    sitesWithPreConsentTracking: number;
    sitesWithSessionReplay: number;
    sitesWithThirdPartyCookies: number;
  };
  overallStatus: "passed" | "failed";
  verificationVersion: "wc01.v2_scan_lab_cohort_verification.1";
  checks: VerificationCheck[];
};

const CRITICAL_COHORT_MODULES = new Set(["preConsentRuntimeScanner", "vendorResolver"]);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const summaryPath = args.summaryPath ?? (await findLatestSummaryPath());
  const summary = await readJson<CohortSummary>(summaryPath);
  const results = Array.isArray(summary.results) ? summary.results : [];
  const minSites = args.minSites ?? inferMinSites(summary);
  const maxFailures = args.maxFailures ?? defaultMaxFailures(minSites);
  const minPreConsentTracking = args.minPreConsentTracking ?? (minSites >= 50 ? 10 : 0);
  const minThirdPartyCookies = args.minThirdPartyCookies ?? (minSites >= 50 ? 5 : 0);
  const minSessionReplay = args.minSessionReplay ?? (minSites >= 50 ? 1 : 0);
  const outDir = args.outDir ?? path.dirname(summaryPath);

  await mkdir(outDir, { recursive: true });

  const report = await buildVerificationReport({
    maxFailures,
    maxModuleFailures: args.maxModuleFailures,
    minPreConsentTracking,
    minSessionReplay,
    minSites,
    minThirdPartyCookies,
    outDir,
    results,
    summary,
    summaryPath,
  });

  const jsonPath = path.join(outDir, "Wc01V2ScanLabCohort.verification.json");
  const markdownPath = path.join(outDir, "Wc01V2ScanLabCohort.verification.md");
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, renderMarkdown(report), "utf8");

  console.log(`WC01 v2 Scan Lab cohort verification: ${report.overallStatus}`);
  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${markdownPath}`);

  if (report.overallStatus !== "passed") {
    process.exitCode = 1;
  }
}

async function buildVerificationReport(input: {
  maxFailures: number;
  maxModuleFailures: number;
  minPreConsentTracking: number;
  minSessionReplay: number;
  minSites: number;
  minThirdPartyCookies: number;
  outDir: string;
  results: CohortResult[];
  summary: CohortSummary;
  summaryPath: string;
}): Promise<VerificationReport> {
  const completed = input.results.filter((result) => result.status === "completed");
  const failed = input.results.filter((result) => result.status === "failed");
  const noGoCandidates = completed
    .map((result) => ({ result, reasons: noGoCandidateReasons(result) }))
    .filter((entry) => entry.reasons.length > 0);
  const moduleFailures = completed.flatMap((result) =>
    (result.moduleRuns ?? [])
      .filter((moduleRun) => moduleRun.status !== "completed")
      .map((moduleRun) => ({
        detail: `${result.domain ?? result.url}:${moduleRun.moduleName ?? "unknown"}:${moduleRun.status}`,
        moduleName: moduleRun.moduleName ?? "unknown",
        result,
      })),
  );
  const expectedNoGoModuleFailures = moduleFailures.filter((failure) =>
    isExpectedNoGoModuleFailure(failure.result, failure.moduleName, failure.result.moduleRuns),
  );
  const criticalModuleFailures = moduleFailures.filter((failure) =>
    CRITICAL_COHORT_MODULES.has(failure.moduleName) && !expectedNoGoModuleFailures.includes(failure),
  );
  const moduleWarnings = completed.flatMap((result) =>
    (result.moduleRuns ?? [])
      .filter((moduleRun) => moduleRun.status === "completed" && (moduleRun.errors ?? []).length > 0)
      .map((moduleRun) => `${result.domain ?? result.url}:${moduleRun.moduleName ?? "unknown"}:${moduleRun.errors?.[0]}`),
  );
  const silentEmptyCompleted = completed.filter((result) => isSilentEmptyCompleted(result));
  const runtimeCoverageLimited = completed.filter((result) => isRuntimeCoverageLimited(result));
  const artifactMisses = completed.flatMap((result) => missingArtifactPaths(result));
  const ford = input.results.find((result) => result.domain === "ford.com" || result.url?.includes("ford.com"));
  const checks: VerificationCheck[] = [];

  checks.push(passFailCheck({
    actual: input.summary.cohortSummaryVersion,
    expected: "wc01.v2_scan_lab_cohort.1",
    name: "summary_version",
    passed: input.summary.cohortSummaryVersion === "wc01.v2_scan_lab_cohort.1",
  }));
  checks.push({
    actual: expectedNoGoModuleFailures.map((failure) => failure.detail),
    expected: "expected downstream skips on corroborated no-go sites are excluded from the critical failure budget",
    name: "expected_no_go_module_exclusions",
    severity: "warn",
    status: expectedNoGoModuleFailures.length > 0 ? "warning" : "passed",
  });
  checks.push(passFailCheck({
    actual: input.results.length,
    expected: `>= ${input.minSites}`,
    name: "site_count",
    passed: input.results.length >= input.minSites,
  }));
  checks.push(passFailCheck({
    actual: failed.length,
    details: failed.map((result) => `${result.domain ?? result.url}: ${result.error ?? "failed"}`),
    expected: `<= ${input.maxFailures}`,
    name: "failure_budget",
    passed: failed.length <= input.maxFailures,
  }));
  checks.push(passFailCheck({
    actual: criticalModuleFailures.length,
    details: criticalModuleFailures.map((failure) => failure.detail),
    expected: `<= ${input.maxModuleFailures}`,
    name: "critical_module_failure_budget",
    passed: criticalModuleFailures.length <= input.maxModuleFailures,
  }));
  checks.push({
    actual: moduleFailures.length,
    details: moduleFailures.map((failure) => failure.detail),
    expected: "review non-critical module failures",
    name: "completed_module_failures",
    severity: "warn",
    status: moduleFailures.length > 0 ? "warning" : "passed",
  });
  checks.push(passFailCheck({
    actual: artifactMisses.length,
    details: artifactMisses,
    expected: 0,
    name: "completed_artifacts_exist",
    passed: artifactMisses.length === 0,
  }));
  checks.push(passFailCheck({
    actual: countRuntimeFlag(completed, "preConsentTrackingObserved"),
    expected: `>= ${input.minPreConsentTracking}`,
    name: "aggregate_pre_consent_tracking_floor",
    passed: countRuntimeFlag(completed, "preConsentTrackingObserved") >= input.minPreConsentTracking,
  }));
  checks.push(passFailCheck({
    actual: countRuntimeFlag(completed, "thirdPartyCookiesPreConsentObserved"),
    expected: `>= ${input.minThirdPartyCookies}`,
    name: "aggregate_third_party_cookie_floor",
    passed: countRuntimeFlag(completed, "thirdPartyCookiesPreConsentObserved") >= input.minThirdPartyCookies,
  }));
  checks.push(passFailCheck({
    actual: countRuntimeFlag(completed, "sessionReplayOrBehavioralAnalyticsObserved"),
    expected: `>= ${input.minSessionReplay}`,
    name: "aggregate_session_replay_floor",
    passed: countRuntimeFlag(completed, "sessionReplayOrBehavioralAnalyticsObserved") >= input.minSessionReplay,
  }));

  checks.push(...buildFordChecks(ford));
  checks.push(...buildControlSiteChecks(input.results));

  checks.push({
    actual: silentEmptyCompleted.length,
    details: silentEmptyCompleted.map((result) => `${result.domain ?? result.url}`),
    expected: "review manually",
    name: "silent_empty_completed_sites",
    severity: "warn",
    status: silentEmptyCompleted.length > 0 ? "warning" : "passed",
  });
  checks.push({
    actual: noGoCandidates.length,
    details: noGoCandidates.map((entry) =>
      `${entry.result.domain ?? entry.result.url}:${entry.reasons.join(",")}`,
    ),
    expected: "review separately from ordinary scanner misses",
    name: "blocked_no_go_candidates",
    severity: "warn",
    status: noGoCandidates.length > 0 ? "warning" : "passed",
  });
  checks.push({
    actual: runtimeCoverageLimited.length,
    details: runtimeCoverageLimited.map((result) =>
      `${result.domain ?? result.url}:${result.runtime?.coverageStatus ?? "unknown"}:${(result.runtime?.coverageLimitationKeys ?? []).join(",")}`,
    ),
    expected: "review coverage-limited completed sites",
    name: "runtime_coverage_limited_sites",
    severity: "warn",
    status: runtimeCoverageLimited.length > 0 ? "warning" : "passed",
  });
  checks.push({
    actual: moduleWarnings.length,
    details: moduleWarnings,
    expected: "review module warnings",
    name: "completed_module_warnings",
    severity: "warn",
    status: moduleWarnings.length > 0 ? "warning" : "passed",
  });

  const metrics = {
    completed: completed.length,
    criticalModuleFailures: criticalModuleFailures.length,
    failed: failed.length,
    headedFallbackUsed: completed.filter((result) => result.headedFallbackUsed === true).length,
    moduleFailures: moduleFailures.length,
    noGoCandidates: noGoCandidates.length,
    results: input.results.length,
    runtimeCoverageLimited: runtimeCoverageLimited.length,
    silentEmptyCompleted: silentEmptyCompleted.length,
    sitesWithPreConsentTracking: countRuntimeFlag(completed, "preConsentTrackingObserved"),
    sitesWithSessionReplay: countRuntimeFlag(completed, "sessionReplayOrBehavioralAnalyticsObserved"),
    sitesWithThirdPartyCookies: countRuntimeFlag(completed, "thirdPartyCookiesPreConsentObserved"),
  };

  return {
    checkedAt: new Date().toISOString(),
    checks,
    guardrailPosture: [
      "verification reads local v2 cohort artifacts only",
      "verification does not persist normalized concerns or unified findings",
      "verification does not update production report cards, scoring, checklist rows, or regulatory lenses",
      "candidate keys remain internal measurements for review",
    ],
    input: {
      maxFailures: input.maxFailures,
      maxModuleFailures: input.maxModuleFailures,
      minPreConsentTracking: input.minPreConsentTracking,
      minSessionReplay: input.minSessionReplay,
      minSites: input.minSites,
      minThirdPartyCookies: input.minThirdPartyCookies,
      outDir: input.outDir,
      summaryPath: input.summaryPath,
    },
    metrics,
    overallStatus: checks.some((check) => check.severity === "fail" && check.status === "failed") ? "failed" : "passed",
    verificationVersion: "wc01.v2_scan_lab_cohort_verification.1",
  };
}

function buildFordChecks(ford: CohortResult | undefined): VerificationCheck[] {
  if (!ford) {
    return [
      {
        actual: "not in selected cohort",
        expected: "ford.com present for Ford regression control",
        name: "ford_control_present",
        severity: "info",
        status: "info",
      },
    ];
  }

  const eligibleKeys = new Set(ford.eligibleFindingKeys ?? []);
  const requiredKeys = [
    "pre_consent_tracking_detected",
    "third_party_cookie_pre_consent",
    "session_replay_or_behavioral_analytics_observed",
  ];
  const missingKeys = requiredKeys.filter((key) => !eligibleKeys.has(key));

  return [
    passFailCheck({
      actual: ford.status,
      expected: "completed",
      name: "ford_control_completed",
      passed: ford.status === "completed",
    }),
    passFailCheck({
      actual: ford.runtime?.thirdPartyRequests ?? 0,
      expected: ">= 25",
      name: "ford_control_third_party_requests",
      passed: (ford.runtime?.thirdPartyRequests ?? 0) >= 25,
    }),
    passFailCheck({
      actual: ford.runtime?.cookiesBeforeConsent ?? 0,
      expected: ">= 10",
      name: "ford_control_cookies_before_consent",
      passed: (ford.runtime?.cookiesBeforeConsent ?? 0) >= 10,
    }),
    passFailCheck({
      actual: missingKeys,
      details: missingKeys,
      expected: "no missing required Ford candidate keys",
      name: "ford_control_candidate_keys",
      passed: missingKeys.length === 0,
    }),
    {
      actual: ford.headedFallbackUsed === true,
      expected: "true when local headless cannot navigate Ford",
      name: "ford_control_headed_fallback_observed",
      severity: "warn",
      status: ford.headedFallbackUsed === true ? "passed" : "warning",
    },
  ];
}

function buildControlSiteChecks(results: CohortResult[]): VerificationCheck[] {
  const optionalControls = [
    {
      domain: "nytimes.com",
      minThirdPartyRequests: 10,
      requiredKey: "pre_consent_tracking_detected",
      name: "publisher_adtech_control",
    },
    {
      domain: "hotjar.com",
      minThirdPartyRequests: 1,
      requiredKey: "session_replay_or_behavioral_analytics_observed",
      name: "session_replay_vendor_control",
    },
    {
      domain: "bbc.com",
      minThirdPartyRequests: 1,
      requiredKey: "consent_banner_observed_or_not_observed",
      name: "cmp_global_control",
    },
  ];

  return optionalControls.map((control) => {
    const result = results.find((candidate) => candidate.domain === control.domain || candidate.url?.includes(control.domain));
    if (!result) {
      return {
        actual: "not in selected cohort",
        expected: `${control.domain} present in full 50-site cohort`,
        name: control.name,
        severity: "info" as const,
        status: "info" as const,
      };
    }

    const passed =
      result.status === "completed" &&
      (result.runtime?.thirdPartyRequests ?? 0) >= control.minThirdPartyRequests &&
      (result.eligibleFindingKeys ?? []).includes(control.requiredKey);
    return {
      actual: {
        domain: result.domain,
        status: result.status,
        thirdPartyRequests: result.runtime?.thirdPartyRequests ?? 0,
        hasRequiredKey: (result.eligibleFindingKeys ?? []).includes(control.requiredKey),
      },
      expected: `${control.domain} completed with ${control.requiredKey}`,
      name: control.name,
      severity: "warn" as const,
      status: passed ? "passed" as const : "warning" as const,
    };
  });
}

function passFailCheck(input: {
  actual: unknown;
  details?: string[];
  expected: unknown;
  name: string;
  passed: boolean;
}): VerificationCheck {
  return {
    actual: input.actual,
    details: input.details,
    expected: input.expected,
    name: input.name,
    severity: "fail",
    status: input.passed ? "passed" : "failed",
  };
}

function isSilentEmptyCompleted(result: CohortResult) {
  if (result.status !== "completed") {
    return false;
  }
  if (result.runtime?.silentEmptyRuntime === true) {
    return true;
  }
  return false;
}

function isRuntimeCoverageLimited(result: CohortResult) {
  const status = result.runtime?.coverageStatus;
  return status === "limited_none" || status === "limited_partial";
}

function isExpectedNoGoModuleFailure(
  result: CohortResult,
  moduleName: string,
  moduleRuns: ModuleRunSummary[] | undefined,
) {
  if (!CRITICAL_COHORT_MODULES.has(moduleName) || noGoCandidateReasons(result).length === 0) {
    return false;
  }
  const moduleRun = (moduleRuns ?? []).find((candidate) => candidate.moduleName === moduleName);
  if (!moduleRun || moduleRun.status === "completed") {
    return false;
  }
  return (moduleRun.errors ?? []).some((error) =>
    /normal public site was not reached|access denied|forbidden|no-go/i.test(error),
  );
}

function noGoCandidateReasons(result: CohortResult) {
  const runtimeReasons = result.runtime?.noGoCandidate === true
    ? result.runtime.noGoReasons ?? ["summary_no_go_candidate"]
    : [];
  const inferredReasons = inferNoGoCandidateReasons(result);
  return [...new Set([...runtimeReasons, ...inferredReasons])].sort();
}

function inferNoGoCandidateReasons(result: CohortResult) {
  const reasons = new Set<string>();
  const artifactDir = artifactDirForResult(result);
  const bundle = readOptionalJson<Record<string, unknown>>(
    artifactDir ? path.join(artifactDir, "CanonicalEvidenceBundle.json") : undefined,
  );
  const moduleRuns = bundle
    ? coalesceArray(bundle.modulesRun, asRecord(bundle.metadata).moduleRuns).map(asRecord)
    : (result.moduleRuns ?? []).map((moduleRun) => moduleRun as Record<string, unknown>);
  const policyRun = moduleRuns.find((moduleRun) => asString(moduleRun.moduleName) === "policySurfaceScanner");
  const policyErrors = asStringArray(policyRun?.errors);
  const policyHomepageForbidden = policyErrors.some((error) =>
    /homepage fetch failed with status 403|forbidden|access denied/i.test(error),
  );
  const domText = readOptionalText(artifactDir ? path.join(artifactDir, "dom-text-pre-consent.txt") : undefined);
  const normalizedDomText = domText.replace(/\s+/g, " ").trim();
  const lowerDomText = normalizedDomText.toLowerCase();
  const blockTextMatches = [
    ["access_temporarily_restricted", "access is temporarily restricted"],
    ["automated_activity", "automated (bot) activity"],
    ["security_service_block", "this website is using a security service"],
    ["unable_to_access", "you are unable to access"],
    ["blocked_message", "you have been blocked"],
    ["human_verification", "verify you are human"],
    ["connection_security_review", "checking if the site connection is secure"],
    ["connection_security_review", "needs to review the security of your connection"],
  ].filter(([, needle]) => lowerDomText.includes(needle));

  for (const [reason] of blockTextMatches) {
    reasons.add(`block_page_text:${reason}`);
  }
  if (policyHomepageForbidden) {
    reasons.add("policy_homepage_fetch_403");
  }
  if (normalizedDomText.length === 0) {
    reasons.add("dom_text_empty");
  }

  const vendorObservations = bundle
    ? coalesceArray(bundle.normalizedVendorObservations, asRecord(bundle.evidence).normalizedVendorObservations)
    : [];
  if (bundle && vendorObservations.length === 0) {
    reasons.add("vendor_observations_zero");
  }
  const responseEvents = bundle
    ? coalesceArray(bundle.networkResponseEvents, asRecord(bundle.evidence).networkResponseEvents).map(asRecord)
    : [];
  const homepageResponseForbidden = responseEvents.some((event) => {
    const status = asNumber(event.status);
    const firstParty = event.firstParty === true;
    const pathValue = asString(event.path) ?? "";
    const responseUrl = asString(event.responseUrl) ?? asString(event.url) ?? "";
    return status === 403 && firstParty && (pathValue === "/" || /https:\/\/(?:www\.)?[^/]+\/?$/.test(responseUrl));
  });
  if (homepageResponseForbidden) {
    reasons.add("homepage_response_403");
  }
  const networkEvents = bundle
    ? coalesceArray(bundle.networkEvents, asRecord(bundle.evidence).networkEvents).map(asRecord)
    : [];
  const cloudflareChallengeObserved = networkEvents.some((event) => {
    const requestUrl = asString(event.requestUrl) ?? asString(event.url) ?? "";
    const hostname = asString(event.requestHostname) ?? asString(event.hostname) ?? "";
    const pathValue = asString(event.path) ?? "";
    const documentUrl = asString(event.documentUrl) ?? asString(event.topLevelUrl) ?? "";
    return (
      requestUrl.includes("/cdn-cgi/challenge-platform/") ||
      pathValue.includes("/cdn-cgi/challenge-platform/") ||
      documentUrl.includes("__cf_chl_rt_tk=") ||
      (hostname === "challenges.cloudflare.com" && requestUrl.includes("/turnstile/"))
    );
  });
  if (cloudflareChallengeObserved) {
    reasons.add("network_cloudflare_challenge");
  }
  const datadomeChallengeObserved = [...networkEvents, ...responseEvents].some((event) => {
    const requestUrl = asString(event.requestUrl) ?? asString(event.responseUrl) ?? asString(event.url) ?? "";
    const hostname = asString(event.requestHostname) ?? asString(event.hostname) ?? "";
    const pathValue = asString(event.path) ?? "";
    const cookieNames = asStringArray(event.cookieNamesSet);
    return (
      hostname.endsWith("captcha-delivery.com") ||
      requestUrl.includes("captcha-delivery.com/captcha") ||
      pathValue.includes("/captcha/") ||
      cookieNames.includes("datadome")
    );
  });
  if (datadomeChallengeObserved) {
    reasons.add("network_datadome_challenge");
  }

  const hasDirectBlockEvidence = [...reasons].some((reason) => reason.startsWith("block_page_text:"));
  const hasEmptyForbiddenShell =
    (policyHomepageForbidden || homepageResponseForbidden) &&
    normalizedDomText.length === 0 &&
    (!bundle || vendorObservations.length === 0);
  const hasEmptyCloudflareChallengeShell =
    cloudflareChallengeObserved &&
    normalizedDomText.length === 0 &&
    (!bundle || vendorObservations.length === 0);
  const hasEmptyDatadomeChallengeShell =
    datadomeChallengeObserved &&
    normalizedDomText.length === 0 &&
    (!bundle || vendorObservations.length === 0);

  if (
    !hasDirectBlockEvidence &&
    !hasEmptyForbiddenShell &&
    !hasEmptyCloudflareChallengeShell &&
    !hasEmptyDatadomeChallengeShell
  ) {
    return [];
  }
  return [...reasons].sort();
}

function missingArtifactPaths(result: CohortResult) {
  const calibrationDir = artifactDirForResult(result);
  if (!calibrationDir) {
    return [`${result.domain ?? result.url}: missing cohort/domain in summary`];
  }
  return [
    path.join(calibrationDir, "CanonicalEvidenceBundle.json"),
    path.join(calibrationDir, "ReviewResult.json"),
  ].filter((artifactPath) => !existsSync(artifactPath));
}

function artifactDirForResult(result: CohortResult) {
  if (!result.cohort || !result.domain) {
    return null;
  }
  return path.join(
    process.cwd(),
    "artifacts",
    `v2-calibration-${result.cohort}`,
    result.domain,
  );
}

function countRuntimeFlag(results: CohortResult[], flag: keyof NonNullable<CohortResult["runtime"]>) {
  return results.filter((result) => result.runtime?.[flag] === true).length;
}

function inferMinSites(summary: CohortSummary) {
  const limit = summary.input?.limit;
  if (typeof limit === "number" && Number.isFinite(limit)) {
    return limit;
  }
  const totalUrls = summary.input?.totalUrls;
  if (typeof totalUrls === "number" && totalUrls > 0) {
    return Math.min(50, totalUrls);
  }
  return 50;
}

function defaultMaxFailures(minSites: number) {
  if (minSites < 10) {
    return 0;
  }
  return Math.max(1, Math.floor(minSites * 0.06));
}

async function findLatestSummaryPath() {
  const artifactsDir = path.join(process.cwd(), "artifacts");
  const entries = await readdir(artifactsDir, { withFileTypes: true });
  const candidates = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("v2-scan-lab-cohort-"))
      .map(async (entry) => {
        const summaryPath = path.join(artifactsDir, entry.name, "Wc01V2ScanLabCohort.summary.json");
        if (!existsSync(summaryPath)) {
          return null;
        }
        const stats = await stat(summaryPath);
        return { mtimeMs: stats.mtimeMs, summaryPath };
      }),
  );
  const latest = candidates
    .filter((candidate): candidate is { mtimeMs: number; summaryPath: string } => Boolean(candidate))
    .sort((left, right) => right.mtimeMs - left.mtimeMs)[0];
  if (!latest) {
    throw new Error("No cohort summary found. Pass --summary <path> or run pnpm v2:wc01-scan-lab-cohort first.");
  }
  return latest.summaryPath;
}

function renderMarkdown(report: VerificationReport) {
  return [
    "# WC01 v2 Scan Lab Cohort Verification",
    "",
    "Internal diagnostic only. Artifact-only. Non-persistent. Not customer-facing report output.",
    "",
    `- Status: ${report.overallStatus}`,
    `- Summary: ${report.input.summaryPath}`,
    `- Results: ${report.metrics.results}`,
    `- Completed: ${report.metrics.completed}`,
    `- Failed: ${report.metrics.failed}`,
    `- Critical module failures: ${report.metrics.criticalModuleFailures}`,
    `- Module failures: ${report.metrics.moduleFailures}`,
    `- Blocked/no-go candidates: ${report.metrics.noGoCandidates}`,
    `- Runtime coverage limited: ${report.metrics.runtimeCoverageLimited}`,
    `- Headed fallback used: ${report.metrics.headedFallbackUsed}`,
    `- Silent empty completed: ${report.metrics.silentEmptyCompleted}`,
    `- Pre-consent tracking observed: ${report.metrics.sitesWithPreConsentTracking}`,
    `- Third-party cookies before consent observed: ${report.metrics.sitesWithThirdPartyCookies}`,
    `- Session replay or behavioral analytics observed: ${report.metrics.sitesWithSessionReplay}`,
    "",
    "## Checks",
    "",
    "| Check | Severity | Status | Expected | Actual | Details |",
    "|---|---|---|---|---|---|",
    ...report.checks.map(renderCheckRow),
    "",
    "## Guardrail Posture",
    "",
    ...report.guardrailPosture.map((item) => `- ${item}`),
    "",
  ].join("\n");
}

function renderCheckRow(check: VerificationCheck) {
  return [
    check.name,
    check.severity,
    check.status,
    formatCell(check.expected),
    formatCell(check.actual),
    formatCell((check.details ?? []).slice(0, 8).join("; ")),
  ]
    .map(escapeMarkdownCell)
    .join(" | ")
    .replace(/^/, "| ")
    .replace(/$/, " |");
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    maxModuleFailures: 0,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) {
      continue;
    }
    if (arg === "--summary") {
      args.summaryPath = requiredValue(argv, ++index, arg);
    } else if (arg === "--out-dir") {
      args.outDir = requiredValue(argv, ++index, arg);
    } else if (arg === "--min-sites") {
      args.minSites = parseNonNegativeInteger(requiredValue(argv, ++index, arg), arg);
    } else if (arg === "--max-failures") {
      args.maxFailures = parseNonNegativeInteger(requiredValue(argv, ++index, arg), arg);
    } else if (arg === "--max-module-failures") {
      args.maxModuleFailures = parseNonNegativeInteger(requiredValue(argv, ++index, arg), arg);
    } else if (arg === "--min-pre-consent-tracking") {
      args.minPreConsentTracking = parseNonNegativeInteger(requiredValue(argv, ++index, arg), arg);
    } else if (arg === "--min-third-party-cookies") {
      args.minThirdPartyCookies = parseNonNegativeInteger(requiredValue(argv, ++index, arg), arg);
    } else if (arg === "--min-session-replay") {
      args.minSessionReplay = parseNonNegativeInteger(requiredValue(argv, ++index, arg), arg);
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}\n\n${usage()}`);
    }
  }
  return args;
}

function usage() {
  return [
    "Usage:",
    "  pnpm v2:wc01-verify-scan-lab-cohort [--summary <path>] [--out-dir <dir>]",
    "                                         [--min-sites <n>] [--max-failures <n>]",
    "                                         [--max-module-failures <n>]",
    "                                         [--min-pre-consent-tracking <n>]",
    "                                         [--min-third-party-cookies <n>]",
    "                                         [--min-session-replay <n>]",
    "",
    "Verifies a WC01 v2 Scan Lab cohort summary and writes JSON/Markdown verification reports.",
    "If --summary is omitted, the latest artifacts/v2-scan-lab-cohort-*/Wc01V2ScanLabCohort.summary.json is used.",
    "",
    "Artifact-only. Non-persistent. Not implementation approval. Not customer-facing report output.",
  ].join("\n");
}

function requiredValue(argv: string[], index: number, flag: string) {
  const value = argv[index];
  if (!value) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}

function parseNonNegativeInteger(value: string, flag: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Expected ${flag} to be a non-negative integer.`);
  }
  return parsed;
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

function readOptionalJson<T>(filePath: string | undefined): T | null {
  if (!filePath || !existsSync(filePath)) {
    return null;
  }
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function readOptionalText(filePath: string | undefined) {
  if (!filePath || !existsSync(filePath)) {
    return "";
  }
  return readFileSync(filePath, "utf8");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function coalesceArray(...values: unknown[]) {
  for (const value of values) {
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
}

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function formatCell(value: unknown) {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (value === undefined) {
    return "";
  }
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }
  return String(value);
}

function escapeMarkdownCell(value: unknown) {
  return String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
