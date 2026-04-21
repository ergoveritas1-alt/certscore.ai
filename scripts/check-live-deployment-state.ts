import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

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

type DeploymentTopology = {
  currentLiveGitRef?: string;
  currentLiveWebRuntimeTarget?: string;
  preferredWebPlatform?: string;
  primaryHost?: string;
  secondaryHost?: string;
};

function loadDeploymentTopology(): DeploymentTopology {
  const topologyPath = path.join(process.cwd(), "config", "deployment-topology.json");

  try {
    return JSON.parse(readFileSync(topologyPath, "utf8")) as DeploymentTopology;
  } catch {
    return {};
  }
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

    if (expectedLiveRuntimeTarget && liveReport.payload.runtimeTarget !== expectedLiveRuntimeTarget) {
      fail(
        `${liveLabel} runtime target is ${formatValue(liveReport.payload.runtimeTarget)}, expected ${expectedLiveRuntimeTarget}`
      );
    } else {
      pass(`${liveLabel} runtime target matches ${expectedLiveRuntimeTarget}`);
    }

    if (expectedLiveRuntimeTarget === "gcp-vm") {
      const serverHeader = liveReport.headers.server?.toLowerCase() ?? "";
      if (serverHeader.includes("cloudflare")) {
        pass(`${liveLabel} is fronted by Cloudflare while reporting the expected VM runtime target`);
      } else if (serverHeader.includes("caddy")) {
        pass(`${liveLabel} is being served by Caddy as expected for the VM lane`);
      } else {
        warn(
          `${liveLabel} server header is ${formatValue(liveReport.headers.server)}; confirm this edge still terminates on the VM lane`
        );
      }
    }
  }

  if (!secondaryReport || !secondaryReport.ok || !secondaryReport.payload) {
    warn(`${secondaryLabel} ${secondaryBaseUrl} did not return a usable /api/version payload`);
  } else {
    pass(`${secondaryLabel} ${secondaryBaseUrl} returned version metadata`);

    if (expectedSecondaryRuntimeTarget && secondaryReport.payload.runtimeTarget !== expectedSecondaryRuntimeTarget) {
      warn(
        `${secondaryLabel} runtime target is ${formatValue(secondaryReport.payload.runtimeTarget)}, expected ${expectedSecondaryRuntimeTarget}`
      );
    } else if (expectedSecondaryRuntimeTarget) {
      pass(`${secondaryLabel} runtime target matches ${expectedSecondaryRuntimeTarget}`);
    }
  }

  if (expectedLiveGitSha && liveReport?.payload?.gitSha) {
    if (liveReport.payload.gitSha === expectedLiveGitSha) {
      pass(`${liveLabel} git sha matches expected revision ${expectedLiveGitSha}`);
    } else {
      warn(`${liveLabel} git sha is ${liveReport.payload.gitSha}, expected ${expectedLiveGitSha}`);
    }
  } else if (expectedLiveGitSha) {
    warn(`Expected ${liveLabel.toLowerCase()} git sha is ${expectedLiveGitSha}, but the host did not return a git sha`);
  }

  if (
    expectedLiveGitSha &&
    secondaryReport?.payload?.gitSha === expectedLiveGitSha &&
    liveReport?.payload?.gitSha &&
    liveReport.payload.gitSha !== expectedLiveGitSha
  ) {
    fail(
      `${secondaryLabel} is serving expected revision ${expectedLiveGitSha} but ${liveLabel.toLowerCase()} ${liveBaseUrl} is still on ${liveReport.payload.gitSha}`
    );
  }

  if (secondaryReport?.payload?.gitSha && liveReport?.payload?.gitSha) {
    if (secondaryReport.payload.gitSha === liveReport.payload.gitSha) {
      pass(`${secondaryLabel} and ${liveLabel.toLowerCase()} agree on git sha ${liveReport.payload.gitSha}`);
    } else {
      warn(`${secondaryLabel} git sha ${secondaryReport.payload.gitSha} differs from ${liveLabel.toLowerCase()} git sha ${liveReport.payload.gitSha}`);
    }
  }

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
