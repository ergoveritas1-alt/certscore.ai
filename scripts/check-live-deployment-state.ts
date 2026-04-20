import { execFileSync } from "node:child_process";

type VersionPayload = {
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
  console.log(`  image tag: ${formatValue(report.payload?.imageTag)}`);
  console.log(`  app url: ${formatValue(report.payload?.appUrl)}`);
}

async function main() {
  const liveBaseUrl = getEnv("LIVE_BASE_URL", "https://certscore.ai");
  const vercelBaseUrl = getEnv("VERCEL_BASE_URL", "https://consentcheck-site.vercel.app");
  const expectedLiveRuntimeTarget = getEnv("EXPECTED_LIVE_RUNTIME_TARGET", "gcp-vm");
  const expectedLiveGitSha = getEnv("EXPECTED_LIVE_GIT_SHA", getGitSha("main") ?? "");

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

  const [liveReport, vercelReport] = await Promise.all([
    fetchVersionReport(liveBaseUrl).catch((error) => {
      fail(`Could not fetch live host version from ${liveBaseUrl}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }),
    fetchVersionReport(vercelBaseUrl).catch((error) => {
      warn(`Could not fetch Vercel host version from ${vercelBaseUrl}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    })
  ]);

  if (liveReport) {
    printReport("Live host", liveReport);
  }
  if (vercelReport) {
    printReport("Vercel host", vercelReport);
  }

  console.log();

  if (!liveReport || !liveReport.ok || !liveReport.payload) {
    fail(`Live host ${liveBaseUrl} did not return a usable /api/version payload`);
  } else {
    pass(`Live host ${liveBaseUrl} returned version metadata`);

    if (expectedLiveRuntimeTarget && liveReport.payload.runtimeTarget !== expectedLiveRuntimeTarget) {
      fail(
        `Live host runtime target is ${formatValue(liveReport.payload.runtimeTarget)}, expected ${expectedLiveRuntimeTarget}`
      );
    } else {
      pass(`Live host runtime target matches ${expectedLiveRuntimeTarget}`);
    }

    if (expectedLiveRuntimeTarget === "gcp-vm") {
      const serverHeader = liveReport.headers.server?.toLowerCase() ?? "";
      if (serverHeader.includes("caddy")) {
        pass("Live host is being served by Caddy as expected for the VM lane");
      } else {
        fail(`Live host server header is ${formatValue(liveReport.headers.server)}, expected a Caddy-served VM host`);
      }
    }
  }

  if (!vercelReport || !vercelReport.ok || !vercelReport.payload) {
    warn(`Vercel host ${vercelBaseUrl} did not return a usable /api/version payload`);
  } else {
    pass(`Vercel host ${vercelBaseUrl} returned version metadata`);
  }

  if (expectedLiveGitSha && liveReport?.payload?.gitSha) {
    if (liveReport.payload.gitSha === expectedLiveGitSha) {
      pass(`Live host git sha matches expected revision ${expectedLiveGitSha}`);
    } else {
      warn(`Live host git sha is ${liveReport.payload.gitSha}, expected ${expectedLiveGitSha}`);
    }
  } else if (expectedLiveGitSha) {
    warn(`Expected live git sha is ${expectedLiveGitSha}, but live host did not return a git sha`);
  }

  if (
    expectedLiveGitSha &&
    vercelReport?.payload?.gitSha === expectedLiveGitSha &&
    liveReport?.payload?.gitSha &&
    liveReport.payload.gitSha !== expectedLiveGitSha
  ) {
    fail(
      `Vercel is serving expected revision ${expectedLiveGitSha} but live host ${liveBaseUrl} is still on ${liveReport.payload.gitSha}`
    );
  }

  if (vercelReport?.payload?.gitSha && liveReport?.payload?.gitSha) {
    if (vercelReport.payload.gitSha === liveReport.payload.gitSha) {
      pass(`Vercel and live host agree on git sha ${liveReport.payload.gitSha}`);
    } else {
      warn(`Vercel git sha ${vercelReport.payload.gitSha} differs from live host git sha ${liveReport.payload.gitSha}`);
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
