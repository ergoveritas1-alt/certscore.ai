import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";

type Args = {
  concurrency: number;
  help?: boolean;
  outDir: string;
  qualifiedUrlMode: "original" | "privacy-control";
  timeoutMs: number;
  urlsPath: string;
};

type SeedPlanEntry = {
  privacyControlUrls: string[];
  url: string;
};

type ControlCandidate = {
  action: "do_not_sell_share" | "privacy_policy_or_notice_only" | "settings_manage" | "save_confirm" | "accept" | "reject";
  confidence: number;
  href?: string;
  label: string;
  reason: string;
  selector: string;
  tagName: string;
};

type QualificationResult = {
  candidates: ControlCandidate[];
  eligible: boolean;
  error?: string;
  finalUrl?: string;
  privacyControlUrl: string;
  reason: string;
  status: "qualified" | "not_qualified" | "failed";
  title?: string;
  url: string;
};

type Summary = {
  generatedAt: string;
  input: {
    concurrency: number;
    timeoutMs: number;
    totalSeeds: number;
    urlsPath: string;
  };
  results: QualificationResult[];
  totals: {
    failed: number;
    notQualified: number;
    qualified: number;
  };
};

const DEFAULT_OUT_DIR = "artifacts/v2-privacy-control-seed-qualification";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const plan = await readSeedPlan(args.urlsPath);
  const seedTargets = plan.flatMap((entry) =>
    entry.privacyControlUrls.map((privacyControlUrl) => ({
      privacyControlUrl,
      url: entry.url,
    })),
  );

  await mkdir(args.outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    colorScheme: "light",
    locale: "en-US",
    viewport: { width: 1365, height: 900 },
  });
  await installFastRoute(context);

  const results: QualificationResult[] = [];
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < seedTargets.length) {
      const target = seedTargets[nextIndex];
      nextIndex += 1;
      if (!target) {
        continue;
      }
      console.log(`[${results.length + 1}/${seedTargets.length}] qualifying ${target.url} seed=${target.privacyControlUrl}`);
      results.push(await qualifySeed(context, target, args.timeoutMs));
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, args.concurrency) }, () => worker()));
  await browser.close();

  const summary = buildSummary(args, results);
  await writeFile(path.join(args.outDir, "PrivacyControlSeedQualificationReport.json"), JSON.stringify(summary, null, 2));
  await writeFile(path.join(args.outDir, "PrivacyControlSeedQualificationReport.md"), renderMarkdown(summary));
  await writeFile(path.join(args.outDir, "qualified-privacy-control-seeds.jsonl"), renderQualifiedJsonl(results, args.qualifiedUrlMode));

  console.log(`Wrote ${path.join(args.outDir, "PrivacyControlSeedQualificationReport.json")}`);
  console.log(`Wrote ${path.join(args.outDir, "PrivacyControlSeedQualificationReport.md")}`);
  console.log(`Wrote ${path.join(args.outDir, "qualified-privacy-control-seeds.jsonl")}`);
  console.log(`Qualified ${summary.totals.qualified}/${summary.input.totalSeeds} seeded privacy controls`);
}

async function qualifySeed(
  context: BrowserContext,
  target: { privacyControlUrl: string; url: string },
  timeoutMs: number,
): Promise<QualificationResult> {
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  page.setDefaultNavigationTimeout(timeoutMs);
  try {
    const response = await page.goto(target.privacyControlUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForTimeout(1500);
    const statusCode = response?.status() ?? 0;
    if (statusCode >= 400) {
      return {
        candidates: [],
        eligible: false,
        finalUrl: page.url(),
        privacyControlUrl: target.privacyControlUrl,
        reason: `http_${statusCode}`,
        status: "not_qualified",
        title: await safeTitle(page),
        url: target.url,
      };
    }

    const candidates = await collectControlCandidates(page);
    const actionable = candidates.some((candidate) =>
      candidate.action === "do_not_sell_share" && candidate.confidence >= 0.82 &&
      !/privacy policy|privacy notice|cookie policy|learn more|read more/i.test(candidate.label)
    );
    return {
      candidates,
      eligible: actionable,
      finalUrl: page.url(),
      privacyControlUrl: target.privacyControlUrl,
      reason: actionable ? "actionable_do_not_sell_or_opt_out_control_observed" : "no_actionable_do_not_sell_or_opt_out_control",
      status: actionable ? "qualified" : "not_qualified",
      title: await safeTitle(page),
      url: target.url,
    };
  } catch (error) {
    return {
      candidates: [],
      eligible: false,
      error: formatError(error),
      privacyControlUrl: target.privacyControlUrl,
      reason: "navigation_or_extraction_failed",
      status: "failed",
      url: target.url,
    };
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function collectControlCandidates(page: Page): Promise<ControlCandidate[]> {
  const raw = await page.locator("button, a, input[type=button], input[type=submit], [role=button]").evaluateAll((nodes) =>
    nodes.slice(0, 300).map((node, index) => {
      const element = node as HTMLElement;
      const input = element instanceof HTMLInputElement ? element : null;
      const anchor = element instanceof HTMLAnchorElement ? element : null;
      const label = [
        element.innerText,
        element.getAttribute("aria-label"),
        element.getAttribute("title"),
        input?.value,
        anchor?.href,
      ].filter(Boolean).join(" ");
      return {
        href: anchor?.href,
        index,
        label,
        tagName: element.tagName.toLowerCase(),
      };
    }),
  );

  const candidates: ControlCandidate[] = [];
  for (const entry of raw) {
    const label = normalizeVisibleText(entry.label);
    if (!label) {
      continue;
    }
    const classified = classifyLabel(label);
    if (!classified) {
      continue;
    }
    candidates.push({
      ...classified,
      href: entry.href,
      label,
      selector: `${entry.tagName}:nth-control(${entry.index})`,
      tagName: entry.tagName,
    });
  }
  return dedupeCandidates(candidates).slice(0, 30);
}

function classifyLabel(label: string): Pick<ControlCandidate, "action" | "confidence" | "reason"> | undefined {
  const normalized = label.toLowerCase().replace(/\s+/g, " ").trim();
  if (/do not sell|do not share|do not sell or share|your privacy choices|privacy choices|opt out of (?:sale|sharing|targeted advertising)|opt-out of (?:sale|sharing|targeted advertising)|exclude my data|do not use my data|limit use of my sensitive/.test(normalized)) {
    return { action: "do_not_sell_share", confidence: 0.88, reason: "seed_control_label" };
  }
  if (/privacy policy|privacy notice|cookie policy|notice at collection/.test(normalized) && !/choice|settings|preference|manage|opt/.test(normalized)) {
    return { action: "privacy_policy_or_notice_only", confidence: 0.78, reason: "seed_control_label" };
  }
  if (/reject all|decline all|deny all|refuse all|necessary only|essential only|disable all|reject/.test(normalized)) {
    return { action: "reject", confidence: 0.86, reason: "seed_control_label" };
  }
  if (/accept all|allow all|agree|i agree|got it|okay|^ok$/.test(normalized)) {
    return { action: "accept", confidence: 0.84, reason: "seed_control_label" };
  }
  if (/manage|settings|preferences|customi[sz]e|options|choose/.test(normalized)) {
    return { action: "settings_manage", confidence: 0.82, reason: "seed_control_label" };
  }
  if (/save|confirm|submit|apply/.test(normalized) && /choice|preference|settings|selection|consent|opt/.test(normalized)) {
    return { action: "save_confirm", confidence: 0.82, reason: "seed_control_label" };
  }
  return undefined;
}

async function installFastRoute(context: BrowserContext) {
  await context.route("**/*", async (route) => {
    const request = route.request();
    const resourceType = request.resourceType();
    if (["font", "image", "media"].includes(resourceType)) {
      await route.abort();
      return;
    }
    await route.continue();
  });
}

function buildSummary(args: Args, results: QualificationResult[]): Summary {
  return {
    generatedAt: new Date().toISOString(),
    input: {
      concurrency: args.concurrency,
      timeoutMs: args.timeoutMs,
      totalSeeds: results.length,
      urlsPath: args.urlsPath,
    },
    results: [...results].sort((left, right) => left.url.localeCompare(right.url)),
    totals: {
      failed: results.filter((result) => result.status === "failed").length,
      notQualified: results.filter((result) => result.status === "not_qualified").length,
      qualified: results.filter((result) => result.status === "qualified").length,
    },
  };
}

function renderMarkdown(summary: Summary): string {
  const lines = [
    "# Privacy Control Seed Qualification",
    "",
    `- Total seeds: ${summary.input.totalSeeds}`,
    `- Qualified: ${summary.totals.qualified}`,
    `- Not qualified: ${summary.totals.notQualified}`,
    `- Failed: ${summary.totals.failed}`,
    "",
    "| URL | Seed | Status | Reason | Candidates |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const result of summary.results) {
    const candidates = result.candidates
      .filter((candidate) => candidate.action === "do_not_sell_share" || candidate.action === "save_confirm")
      .slice(0, 3)
      .map((candidate) => `${candidate.action}: ${candidate.label}`)
      .join("<br>") || "none";
    lines.push([
      result.url,
      result.privacyControlUrl,
      result.status,
      result.reason,
      candidates,
    ].map(markdownCell).join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function renderQualifiedJsonl(results: QualificationResult[], qualifiedUrlMode: Args["qualifiedUrlMode"]): string {
  return results
    .filter((result) => result.status === "qualified")
    .map((result) => JSON.stringify({
      url: qualifiedUrlMode === "privacy-control" ? result.privacyControlUrl : result.url,
      seedUrls: {
        privacyOptOut: result.privacyControlUrl,
      },
    }))
    .join("\n") + "\n";
}

async function readSeedPlan(filePath: string): Promise<SeedPlanEntry[]> {
  const raw = await readFile(filePath, "utf8");
  const entries = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map(parsePlanLine)
    .filter((entry) => entry.privacyControlUrls.length > 0);
  return mergeEntries(entries);
}

function parsePlanLine(line: string): SeedPlanEntry {
  if (!line.startsWith("{")) {
    return { privacyControlUrls: [], url: line };
  }
  const parsed = JSON.parse(line) as {
    privacyControlUrl?: unknown;
    privacyControlUrls?: unknown;
    seedUrls?: {
      privacyControl?: unknown;
      privacyControlUrl?: unknown;
      privacyOptOut?: unknown;
      privacyOptOutUrl?: unknown;
    };
    url?: unknown;
  };
  const url = typeof parsed.url === "string" ? parsed.url.trim() : "";
  if (!url) {
    throw new Error(`Seed plan line is missing url: ${line}`);
  }
  return {
    privacyControlUrls: uniqueStrings([
      ...asStringArray(parsed.privacyControlUrls),
      ...asStringArray(parsed.privacyControlUrl),
      ...asStringArray(parsed.seedUrls?.privacyOptOut),
      ...asStringArray(parsed.seedUrls?.privacyOptOutUrl),
      ...asStringArray(parsed.seedUrls?.privacyControl),
      ...asStringArray(parsed.seedUrls?.privacyControlUrl),
    ]),
    url,
  };
}

function mergeEntries(entries: SeedPlanEntry[]): SeedPlanEntry[] {
  const byUrl = new Map<string, SeedPlanEntry>();
  for (const entry of entries) {
    const existing = byUrl.get(entry.url);
    if (!existing) {
      byUrl.set(entry.url, { ...entry, privacyControlUrls: [...entry.privacyControlUrls] });
      continue;
    }
    existing.privacyControlUrls = uniqueStrings([...existing.privacyControlUrls, ...entry.privacyControlUrls]);
  }
  return [...byUrl.values()];
}

function asStringArray(value: unknown): string[] {
  if (typeof value === "string") {
    return [value.trim()].filter(Boolean);
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
}

function dedupeCandidates(candidates: ControlCandidate[]): ControlCandidate[] {
  const seen = new Set<string>();
  const deduped: ControlCandidate[] = [];
  for (const candidate of candidates.sort((left, right) => right.confidence - left.confidence)) {
    const key = `${candidate.action}:${candidate.label.toLowerCase()}:${candidate.href ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(candidate);
  }
  return deduped;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeVisibleText(value: string): string {
  return value.replace(/\s+/g, " ").replace(/\u00a0/g, " ").trim();
}

function markdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

async function safeTitle(page: Page): Promise<string | undefined> {
  try {
    return await page.title();
  } catch {
    return undefined;
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseArgs(argv: string[]): Args {
  const parsed: Args = {
    concurrency: 2,
    outDir: DEFAULT_OUT_DIR,
    qualifiedUrlMode: "original",
    timeoutMs: 20000,
    urlsPath: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg === "--urls" && value) {
      parsed.urlsPath = value;
      index += 1;
    } else if (arg === "--out-dir" && value) {
      parsed.outDir = value;
      index += 1;
    } else if (arg === "--timeout-ms" && value) {
      parsed.timeoutMs = Number(value);
      index += 1;
    } else if (arg === "--concurrency" && value) {
      parsed.concurrency = Number(value);
      index += 1;
    } else if (arg === "--qualified-url" && value) {
      if (value !== "original" && value !== "privacy-control") {
        throw new Error("--qualified-url must be original or privacy-control");
      }
      parsed.qualifiedUrlMode = value;
      index += 1;
    }
  }
  if (!parsed.help && !parsed.urlsPath) {
    throw new Error("--urls is required");
  }
  return parsed;
}

function usage(): string {
  return [
    "Usage: pnpm v2:qualify-privacy-control-seeds --urls <plan.jsonl> [--out-dir <dir>] [--timeout-ms 20000] [--concurrency 2] [--qualified-url original|privacy-control]",
    "",
    "Reads the same JSONL seed format accepted by v2:wc01-scan-lab-cohort and writes:",
    "- PrivacyControlSeedQualificationReport.json",
    "- PrivacyControlSeedQualificationReport.md",
    "- qualified-privacy-control-seeds.jsonl",
  ].join("\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
