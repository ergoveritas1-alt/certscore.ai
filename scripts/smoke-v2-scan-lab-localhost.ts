#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildV2ScanLabRunPlan,
  type V2ScanLabRunProfile,
} from "../apps/web/server/admin/v2-scan-lab-runner";

type Args = {
  baseUrl: string;
  help: boolean;
  outDir: string;
  url: string;
};

type SmokeCheck = {
  actual?: unknown;
  expected?: unknown;
  name: string;
  passed: boolean;
};

type SmokeSummary = {
  generatedAt: string;
  input: {
    baseUrl: string;
    outDir: string;
    url: string;
  };
  localhost: {
    adminDagUrl: string;
    healthStatus?: number;
    pageStatus?: number;
    pageRedirectedToLogin: boolean;
    reachable: boolean;
  };
  planChecks: {
    eligibleDag: {
      consentScenarioDag: boolean;
      profile: V2ScanLabRunProfile;
      scenarioPlanningMode: string;
      scanArgs: string[];
    };
    ineligibleDag: {
      consentScenarioDag: boolean;
      profile: V2ScanLabRunProfile;
      scenarioPlanningMode: string;
      scanArgs: string[];
    };
  };
  checks: SmokeCheck[];
  status: "passed" | "failed";
};

const DEFAULT_BASE_URL = "http://localhost:3000";
const DEFAULT_OUT_DIR = path.join("artifacts", "v2-scan-lab-localhost-smoke");
const DEFAULT_URL = "webmd.com";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const baseUrl = normalizeBaseUrl(args.baseUrl);
  const adminDagUrl = `${baseUrl}/app/admin/v2-scan-lab?profile=full&url=${encodeURIComponent(args.url)}&consentDag=yes`;
  const health = await fetchStatus(`${baseUrl}/api/health`);
  const page = await fetchStatus(adminDagUrl);
  const eligibleDag = buildV2ScanLabRunPlan({
    consentScenarioDag: true,
    now: new Date("2026-06-14T00:00:00.000Z"),
    profile: "full",
    url: args.url,
    workspaceRoot: process.cwd(),
  });
  const ineligibleDag = buildV2ScanLabRunPlan({
    consentScenarioDag: true,
    now: new Date("2026-06-14T00:00:00.000Z"),
    profile: "standard",
    url: args.url,
    workspaceRoot: process.cwd(),
  });
  const eligibleScanArgs = eligibleDag.steps[0]?.args ?? [];
  const ineligibleScanArgs = ineligibleDag.steps[0]?.args ?? [];
  const checks: SmokeCheck[] = [
    check(
      "localhost_health_reachable",
      health.status !== undefined && health.status >= 200 && health.status < 500,
      "HTTP 2xx-4xx from /api/health",
      health.status,
    ),
    check(
      "admin_scan_lab_route_reachable",
      page.status !== undefined && page.status >= 200 && page.status < 500,
      "HTTP 2xx-4xx from admin scan lab route",
      page.status,
    ),
    check("eligible_profile_uses_planned_parallel", eligibleDag.scenarioPlanningMode === "planned_parallel", "planned_parallel", eligibleDag.scenarioPlanningMode),
    check("eligible_profile_records_consent_dag", eligibleDag.consentScenarioDag === true, true, eligibleDag.consentScenarioDag),
    check("eligible_profile_passes_scenario_planning_mode", argValue(eligibleScanArgs, "--scenario-planning-mode") === "planned_parallel", "planned_parallel", argValue(eligibleScanArgs, "--scenario-planning-mode")),
    check("eligible_profile_passes_scenario_concurrency", argValue(eligibleScanArgs, "--scenario-concurrency") === "2", "2", argValue(eligibleScanArgs, "--scenario-concurrency")),
    check("eligible_profile_passes_policy_deadline", argValue(eligibleScanArgs, "--policy-planning-deadline-ms") === "1500", "1500", argValue(eligibleScanArgs, "--policy-planning-deadline-ms")),
    check("eligible_profile_passes_lean_resource_mode", argValue(eligibleScanArgs, "--scenario-resource-mode") === "lean", "lean", argValue(eligibleScanArgs, "--scenario-resource-mode")),
    check("ineligible_profile_forces_legacy", ineligibleDag.scenarioPlanningMode === "legacy_sequential", "legacy_sequential", ineligibleDag.scenarioPlanningMode),
    check("ineligible_profile_clears_consent_dag", ineligibleDag.consentScenarioDag === false, false, ineligibleDag.consentScenarioDag),
    check("ineligible_profile_has_no_dag_args", !ineligibleScanArgs.includes("--scenario-planning-mode"), false, ineligibleScanArgs.includes("--scenario-planning-mode")),
  ];
  const summary: SmokeSummary = {
    generatedAt: new Date().toISOString(),
    input: {
      baseUrl,
      outDir: args.outDir,
      url: args.url,
    },
    localhost: {
      adminDagUrl,
      healthStatus: health.status,
      pageStatus: page.status,
      pageRedirectedToLogin: page.finalUrl?.includes("/login") === true,
      reachable: checks[0]?.passed === true && checks[1]?.passed === true,
    },
    planChecks: {
      eligibleDag: {
        consentScenarioDag: eligibleDag.consentScenarioDag,
        profile: eligibleDag.profile,
        scenarioPlanningMode: eligibleDag.scenarioPlanningMode,
        scanArgs: eligibleScanArgs,
      },
      ineligibleDag: {
        consentScenarioDag: ineligibleDag.consentScenarioDag,
        profile: ineligibleDag.profile,
        scenarioPlanningMode: ineligibleDag.scenarioPlanningMode,
        scanArgs: ineligibleScanArgs,
      },
    },
    checks,
    status: checks.every((item) => item.passed) ? "passed" : "failed",
  };

  await mkdir(args.outDir, { recursive: true });
  await writeFile(path.join(args.outDir, "V2ScanLabLocalhostSmoke.json"), `${JSON.stringify(summary, null, 2)}\n`);
  await writeFile(path.join(args.outDir, "V2ScanLabLocalhostSmoke.md"), renderMarkdown(summary));
  console.log(JSON.stringify({
    outDir: args.outDir,
    status: summary.status,
    adminDagUrl,
    pageRedirectedToLogin: summary.localhost.pageRedirectedToLogin,
    checks: summary.checks.map((item) => ({ name: item.name, passed: item.passed })),
  }, null, 2));
  if (summary.status !== "passed") {
    process.exit(1);
  }
}

async function fetchStatus(url: string): Promise<{ finalUrl?: string; status?: number }> {
  try {
    const response = await fetch(url, { redirect: "follow" });
    return {
      finalUrl: response.url,
      status: response.status,
    };
  } catch {
    return {};
  }
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    baseUrl: process.env.WC01_LOCAL_BASE_URL?.trim() || DEFAULT_BASE_URL,
    help: false,
    outDir: DEFAULT_OUT_DIR,
    url: DEFAULT_URL,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--") {
      continue;
    } else if (arg === "--base-url" && next) {
      args.baseUrl = next;
      index += 1;
    } else if (arg === "--url" && next) {
      args.url = next;
      index += 1;
    } else if (arg === "--out-dir" && next) {
      args.outDir = next;
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }
  return args;
}

function check(name: string, passed: boolean, expected?: unknown, actual?: unknown): SmokeCheck {
  return { actual, expected, name, passed };
}

function argValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function renderMarkdown(summary: SmokeSummary): string {
  return [
    "# V2 Scan Lab Localhost Smoke",
    "",
    "Internal diagnostic only. Does not change production behavior.",
    "",
    `- Status: ${summary.status}`,
    `- Base URL: ${summary.input.baseUrl}`,
    `- Admin DAG URL: ${summary.localhost.adminDagUrl}`,
    `- Health status: ${summary.localhost.healthStatus ?? "n/a"}`,
    `- Page status: ${summary.localhost.pageStatus ?? "n/a"}`,
    `- Page redirected to login: ${summary.localhost.pageRedirectedToLogin ? "yes" : "no"}`,
    "",
    "## Effective Planning Modes",
    "",
    `- full + consentDag=yes: ${summary.planChecks.eligibleDag.scenarioPlanningMode}`,
    `- standard + consentDag=yes: ${summary.planChecks.ineligibleDag.scenarioPlanningMode}`,
    "",
    "## Checks",
    "",
    ...summary.checks.map((item) =>
      `- ${item.passed ? "PASS" : "FAIL"} ${item.name}: actual=${formatValue(item.actual)} expected=${formatValue(item.expected)}`
    ),
    "",
  ].join("\n");
}

function formatValue(value: unknown): string {
  if (value === undefined) {
    return "n/a";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function usage(): string {
  return [
    "Usage: pnpm v2:scan-lab-localhost-smoke -- [options]",
    "",
    "Checks localhost:3000 reachability and validates internal admin v2 scan-lab DAG opt-in plumbing.",
    "This does not submit a long-running scan through the browser or change production behavior.",
    "",
    "Options:",
    "  --base-url <url>   Default: http://localhost:3000",
    "  --url <url>        Default: webmd.com",
    "  --out-dir <dir>    Default: artifacts/v2-scan-lab-localhost-smoke",
    "  --help",
  ].join("\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
