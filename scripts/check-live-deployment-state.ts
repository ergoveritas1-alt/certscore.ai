import { execFileSync } from "node:child_process";
import { loadDeploymentTopology } from "./deployment-topology";
import { assessGitSha, assessPrimaryRuntime, assessSecondaryRuntime } from "./live-deployment-audit";

type VersionPayload = {
  amplifyAppId?: string | null;
  amplifyBranch?: string | null;
  appUrl?: string | null;
  gitRef?: string | null;
  gitSha?: string | null;
  hostname?: string | null;
  imageTag?: string | null;
  nodeVersion?: string | null;
  runtimeTarget?: string | null;
  service?: string | null;
  timestamp?: string | null;
  vercelDeploymentId?: string | null;
  vercelUrl?: string | null;
};

type EndpointReport = {
  baseUrl: string;
  headers: Record<string, string>;
  ok: boolean;
  payload: VersionPayload | null;
  status: number;
};

function getEnv(name: string, fallback?: string) {
  const value = process.env[name]?.trim();
  if (value && value.length > 0) {
    return value;
  }

  return fallback ?? "";
}

function getGitSha(ref: string) {
  try {
    return execFileSync("git", ["rev-parse", ref], {
      cwd: process.cwd(),
      encoding: "utf8"
    }).trim();
  } catch {
    return null;
  }
}

async function fetchVersionReport(baseUrl: string): Promise<EndpointReport> {
  const response = await fetch(new URL("/api/version", baseUrl), {
    headers: {
      Accept: "application/json"
    },
    redirect: "follow"
  });

  let payload: VersionPayload | null = null;
  try {
    payload = (await response.json()) as VersionPayload;
  } catch {
    payload = null;
  }

  const headers: Record<string, string> = {};
  for (const [key, value] of response.headers.entries()) {
    headers[key.toLowerCase()] = value;
  }

  return {
    baseUrl,
    headers,
    ok: response.ok,
    payload,
    status: response.status
  };
}

function formatValue(value: string | null | undefined) {
  return value && value.length > 0 ? value : "unknown";
}

function printReport(label: string, report: EndpointReport) {
  console.log(`${label}: ${report.baseUrl}`);
  console.log(`  status: ${report.status}`);
  console.log(`  server: ${formatValue(report.headers.server)}`);
  console.log(`  git sha: ${formatValue(report.payload?.gitSha)}`);
  console.log(`  git ref: ${formatValue(report.payload?.gitRef)}`);
  console.log(`  runtime target: ${formatValue(report.payload?.runtimeTarget)}`);
  console.log(`  amplify app id: ${formatValue(report.payload?.amplifyAppId)}`);
  console.log(`  amplify branch: ${formatValue(report.payload?.amplifyBranch)}`);
  console.log(`  image tag: ${formatValue(report.payload?.imageTag)}`);
  console.log(`  app url: ${formatValue(report.payload?.appUrl)}`);
}

async function main() {
  const topology = loadDeploymentTopology();
  const liveBaseUrl = getEnv("LIVE_BASE_URL", topology.primaryHost ?? "https://certscore.ai");
  const secondaryBaseUrl = getEnv(
    "SECONDARY_BASE_URL",
    getEnv("VERCEL_BASE_URL", topology.secondaryHost ?? "https://consentcheck.site")
  );
  const liveLabel = getEnv("LIVE_LABEL", "Primary host");
  const secondaryLabel = getEnv("SECONDARY_LABEL", "Secondary host");
  const expectedLiveRuntimeTarget = getEnv(
    "EXPECTED_LIVE_RUNTIME_TARGET",
    topology.currentLiveWebRuntimeTarget ?? "gcp-vm"
  );
  const expectedSecondaryRuntimeTarget = getEnv(
    "EXPECTED_SECONDARY_RUNTIME_TARGET",
    topology.currentLiveWebRuntimeTarget ?? expectedLiveRuntimeTarget
  );
  const expectedLiveGitSha = getEnv("EXPECTED_LIVE_GIT_SHA", "");

  let failures = 0;
  let warnings = 0;

  const fail = (message: string) => {
    failures += 1;
    console.log(`FAIL ${message}`);
  };

  const warn = (message: string) => {
    warnings += 1;
    console.log(`WARN ${message}`);
  };

  const pass = (message: string) => {
    console.log(`PASS ${message}`);
  };

  console.log("Live deployment state audit");
  console.log();

  const [liveReport, secondaryReport] = await Promise.all([
    fetchVersionReport(liveBaseUrl).catch((error) => {
      fail(`Could not fetch ${liveLabel.toLowerCase()} version from ${liveBaseUrl}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }),
    fetchVersionReport(secondaryBaseUrl).catch((error) => {
      warn(`Could not fetch ${secondaryLabel.toLowerCase()} version from ${secondaryBaseUrl}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    })
  ]);

  if (liveReport) {
    printReport(liveLabel, liveReport);
  }
  if (secondaryReport) {
    printReport(secondaryLabel, secondaryReport);
  }

  console.log();

  if (!liveReport || !liveReport.ok || !liveReport.payload) {
    fail(`Live host ${liveBaseUrl} did not return a usable /api/version payload`);
  } else {
    pass(`${liveLabel} ${liveBaseUrl} returned version metadata`);

    const runtimeAssessment = assessPrimaryRuntime({
      expectedRuntimeTarget: expectedLiveRuntimeTarget,
      label: liveLabel,
      report: liveReport
    });
    runtimeAssessment.failures.forEach(fail);
    runtimeAssessment.messages.forEach(pass);
    runtimeAssessment.warnings.forEach(warn);
  }

  if (!secondaryReport || !secondaryReport.ok || !secondaryReport.payload) {
    warn(`${secondaryLabel} ${secondaryBaseUrl} did not return a usable /api/version payload`);
  } else {
    pass(`${secondaryLabel} ${secondaryBaseUrl} returned version metadata`);

    const runtimeAssessment = assessSecondaryRuntime({
      expectedRuntimeTarget: expectedSecondaryRuntimeTarget,
      label: secondaryLabel,
      report: secondaryReport
    });
    runtimeAssessment.messages.forEach(pass);
    runtimeAssessment.warnings.forEach(warn);
  }

  const gitShaAssessment = assessGitSha({
    expectedLiveGitSha,
    liveGitSha: liveReport?.payload?.gitSha,
    secondaryGitSha: secondaryReport?.payload?.gitSha,
    liveBaseUrl,
    liveLabel,
    secondaryLabel
  });
  gitShaAssessment.failures.forEach(fail);
  gitShaAssessment.messages.forEach(pass);
  gitShaAssessment.warnings.forEach(warn);

  console.log();
  if (failures > 0) {
    console.log(`Live deployment state audit failed with ${failures} issue(s) and ${warnings} warning(s).`);
    process.exit(1);
  }

  console.log(`Live deployment state audit passed with ${warnings} warning(s).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
