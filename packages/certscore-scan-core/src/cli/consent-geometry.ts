#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Browser, Page } from "playwright";
import { chromium } from "playwright";
import { captureConsentControlGeometry } from "../consent-control-geometry.js";
import {
  buildConsentGeometryEgressDiagnostic,
  collectConsentGeometryPageAccess,
  firstProxyEnv,
  missingRequiredProxyDiagnostic,
  type ConsentGeometryAccessDiagnostic,
  type ConsentGeometryEgressDiagnostic,
} from "../consent-geometry-access.js";
import { chromiumContextOptions, chromiumLaunchOptions } from "../playwright-runtime.js";

type ParsedArgs = {
  urls: string[];
  urlsFile?: string;
  out?: string;
  envFile?: string;
  waitMs?: number;
  width?: number;
  height?: number;
  navigationTimeoutMs?: number;
  networkIdleTimeoutMs?: number;
  screenshotTimeoutMs?: number;
  headed?: boolean;
  noNavigationFallbacks?: boolean;
  disableHttp2Fallback?: boolean;
  requireProxy?: boolean;
  egressLabel?: string;
};

type NavigationAttempt = {
  url: string;
  waitUntil: "domcontentloaded" | "commit";
  success: boolean;
  finalUrl?: string;
  httpStatus?: number;
  error?: string;
};

type ScanRow = {
  site: string;
  artifactPath: string;
  screenshotPath?: string;
  accessStatus: ConsentGeometryAccessDiagnostic["status"];
  accessReasonCodes: string[];
  egressLabel: string;
  proxyConfigured: boolean;
  cmp: string;
  accept: boolean;
  reject: boolean;
  options: boolean;
  notes: string;
};

type SiteCaptureResult =
  | { ok: true; row: ScanRow }
  | { ok: false; error: unknown; attempts: NavigationAttempt[] };

void main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  },
);

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.envFile) {
    await loadEnvFile(args.envFile);
  }
  if (args.urlsFile) {
    args.urls.push(...await readUrlsFile(args.urlsFile));
  }
  if (args.urls.length === 0) {
    console.error("Usage: pnpm --filter @certscore/scan-core consent-geometry --url <url> [--url <url>...] [--urls-file sites.txt] [--out artifacts/consent-control-geometry] [--wait-ms 3000]");
    process.exit(1);
  }

  const outRoot = args.out ?? path.join(process.cwd(), "artifacts", "consent-control-geometry");
  await mkdir(outRoot, { recursive: true });
  const egress = buildConsentGeometryEgressDiagnostic({
    label: args.egressLabel,
    requireProxy: args.requireProxy,
  });
  if (args.requireProxy && !firstProxyEnv()) {
    const rows = await writeMissingProxyRows(args.urls, outRoot, egress);
    await writeSummary(outRoot, rows, egress);
    process.exit(2);
  }

  let browser = await launchBrowser(args);
  let http2FallbackBrowser: Browser | undefined;
  const rows: ScanRow[] = [];
  try {
    for (const url of args.urls) {
      const siteDir = path.join(outRoot, safeSiteSlug(url));
      await mkdir(siteDir, { recursive: true });

      if (!browser.isConnected()) {
        browser = await launchBrowser(args);
      }
      let result = await captureSite(browser, url, siteDir, args);
      if (!result.ok && isBrowserClosedError(result.error)) {
        await browser.close().catch(() => undefined);
        browser = await launchBrowser(args);
        result = await captureSite(browser, url, siteDir, args, {
          notePrefix: "browser_relaunched_after_disconnect",
        });
      }
      if (!result.ok && shouldTryHttp2Fallback(result.error, args)) {
        if (!http2FallbackBrowser?.isConnected()) {
          http2FallbackBrowser = await launchBrowser(args, { disableHttp2: true });
        }
        http2FallbackBrowser ??= await launchBrowser(args, { disableHttp2: true });
        const fallbackResult = await captureSite(http2FallbackBrowser, url, siteDir, args, {
          notePrefix: "http2_disabled_fallback",
        });
        if (fallbackResult.ok) {
          result = fallbackResult;
        } else {
          result = {
            ok: false,
            error: fallbackResult.error,
            attempts: [...result.attempts, ...fallbackResult.attempts],
          };
        }
      }

      if (result.ok) {
        rows.push(result.row);
        console.log(`Wrote ${result.row.artifactPath}`);
        await writeSummary(outRoot, rows, egress, { quiet: true });
      } else {
        const errorPath = path.join(siteDir, "error.txt");
        await writeFile(errorPath, formatDiagnosticError(result.error, result.attempts));
        rows.push({
          site: url,
          artifactPath: errorPath,
          accessStatus: "navigation_error",
          accessReasonCodes: ["navigation_failed"],
          egressLabel: egress.label,
          proxyConfigured: egress.proxyConfigured,
          cmp: "error",
          accept: false,
          reject: false,
          options: false,
          notes: result.error instanceof Error ? result.error.message : String(result.error),
        });
        console.error(`Failed ${url}: ${result.error instanceof Error ? result.error.message : String(result.error)}`);
        await writeSummary(outRoot, rows, egress, { quiet: true });
      }
    }
  } finally {
    await Promise.all([
      browser.close(),
      http2FallbackBrowser?.close() ?? Promise.resolve(),
    ]);
  }

  await writeSummary(outRoot, rows, egress);
  console.log("| Site | Access | CMP | Accept | Reject | Options | Egress | Notes |");
  console.log("|---|---|---|---:|---:|---:|---|---|");
  for (const row of rows) {
    console.log(`| ${row.site} | ${row.accessStatus} | ${row.cmp} | ${yn(row.accept)} | ${yn(row.reject)} | ${yn(row.options)} | ${row.egressLabel} | ${row.notes.replace(/\|/g, "/")} |`);
  }
}

async function captureSite(
  browser: Browser,
  url: string,
  siteDir: string,
  args: ParsedArgs,
  options: { notePrefix?: string } = {},
): Promise<SiteCaptureResult> {
  const contextOptions = chromiumContextOptions();
  const context = await browser.newContext({
    ...contextOptions,
    viewport: {
      width: args.width ?? contextOptions.viewport?.width ?? 1366,
      height: args.height ?? contextOptions.viewport?.height ?? 900,
    },
    locale: contextOptions.locale ?? "en-US",
  });
  const page = await context.newPage();
  const attempts: NavigationAttempt[] = [];
  try {
    const navigation = await navigateWithFallbacks(page, url, args, attempts);
    await page.waitForLoadState("networkidle", { timeout: args.networkIdleTimeoutMs ?? 10_000 }).catch(() => undefined);
    await page.waitForTimeout(args.waitMs ?? 3_000);
    const access = await collectConsentGeometryPageAccess(page, navigation.httpStatus);

    const screenshotPath = path.join(siteDir, "pre-consent-viewport.png");
    const artifactPath = path.join(siteDir, "consent-control-geometry.json");
    let screenshotArtifactRef: string | undefined = screenshotPath;
    let screenshotWarning = "";
    await page.screenshot({
      path: screenshotPath,
      fullPage: false,
      timeout: args.screenshotTimeoutMs ?? 10_000,
      animations: "disabled",
    }).catch((error: unknown) => {
      screenshotArtifactRef = undefined;
      screenshotWarning = `screenshot_unavailable:${error instanceof Error ? error.message : String(error)}`;
    });

    const artifact = await captureConsentControlGeometry(page, {
      screenshotArtifactRef,
    });
    const egress = buildConsentGeometryEgressDiagnostic({ label: args.egressLabel });
    const diagnosticArtifact = {
      ...artifact,
      access,
      egress,
    };
    await writeFile(artifactPath, `${JSON.stringify(diagnosticArtifact, null, 2)}\n`);

    const navigationNotes = attempts
      .filter((attempt) => attempt.success)
      .map((attempt) => `${attempt.waitUntil}:${attempt.httpStatus ?? "no_status"}:${attempt.finalUrl ?? attempt.url}`);

    return {
      ok: true,
      row: {
        site: url,
        artifactPath,
        ...(screenshotArtifactRef ? { screenshotPath: screenshotArtifactRef } : {}),
        accessStatus: access.status,
        accessReasonCodes: access.reasonCodes,
        egressLabel: egress.label,
        proxyConfigured: egress.proxyConfigured,
        cmp: artifact.summary.cmpName ?? (artifact.summary.cmpDetected ? "detected" : "no"),
        accept: artifact.summary.firstLayerAccept,
        reject: artifact.summary.firstLayerReject,
        options: artifact.summary.firstLayerOptions,
        notes: [
          options.notePrefix,
          screenshotWarning,
          access.status !== "loaded" ? `access_no_go:${access.reasonCodes.join(",")}` : undefined,
          ...navigationNotes,
          ...artifact.summary.limitations,
        ].filter(Boolean).join("; "),
      },
    };
  } catch (error) {
    return { ok: false, error, attempts };
  } finally {
    await context.close().catch(() => undefined);
  }
}

async function launchBrowser(args: ParsedArgs, options: { disableHttp2?: boolean } = {}): Promise<Browser> {
  const launchOptions = chromiumLaunchOptions({ headless: !args.headed });
  return chromium.launch({
    ...launchOptions,
    args: [
      ...(launchOptions.args ?? []),
      ...(options.disableHttp2 ? ["--disable-http2"] : []),
    ],
  });
}

async function navigateWithFallbacks(
  page: Page,
  url: string,
  args: ParsedArgs,
  attempts: NavigationAttempt[],
): Promise<{ httpStatus?: number }> {
  let lastError: unknown;
  const candidates = args.noNavigationFallbacks ? [url] : navigationCandidates(url);
  for (const candidate of candidates) {
    for (const waitUntil of ["domcontentloaded", "commit"] as const) {
      try {
        const response = await page.goto(candidate, {
          waitUntil,
          timeout: args.navigationTimeoutMs ?? 60_000,
        });
        attempts.push({
          url: candidate,
          waitUntil,
          success: true,
          finalUrl: page.url(),
          httpStatus: response?.status(),
        });
        if (waitUntil === "commit") {
          await page.waitForLoadState("domcontentloaded", { timeout: 5_000 }).catch(() => undefined);
        }
        return { httpStatus: response?.status() };
      } catch (error) {
        lastError = error;
        attempts.push({
          url: candidate,
          waitUntil,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  throw lastError ?? new Error(`Navigation failed for ${url}`);
}

function navigationCandidates(value: string): string[] {
  const candidates = [value];
  try {
    const parsed = new URL(value);
    if (!parsed.hostname.startsWith("www.")) {
      const withWww = new URL(parsed);
      withWww.hostname = `www.${parsed.hostname}`;
      candidates.push(withWww.toString());
    } else {
      const withoutWww = new URL(parsed);
      withoutWww.hostname = parsed.hostname.replace(/^www\./, "");
      candidates.push(withoutWww.toString());
    }
  } catch {
    // The input has already been normalized before this point; keep the original on unexpected parse failures.
  }
  return Array.from(new Set(candidates));
}

function shouldTryHttp2Fallback(error: unknown, args: ParsedArgs): boolean {
  if (args.disableHttp2Fallback) {
    return false;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /ERR_HTTP2_PROTOCOL_ERROR|ERR_EMPTY_RESPONSE|Timeout/i.test(message);
}

function isBrowserClosedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Target page, context or browser has been closed|Browser has been closed|browser.*closed/i.test(message);
}

function formatDiagnosticError(error: unknown, attempts: NavigationAttempt[]): string {
  const lines = [
    error instanceof Error ? error.stack ?? error.message : String(error),
    "",
    "Navigation attempts:",
    JSON.stringify(attempts, null, 2),
  ];
  return `${lines.join("\n")}\n`;
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = { urls: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--url" && value) {
      parsed.urls.push(normalizeUrl(value));
      index += 1;
    } else if (key === "--urls-file" && value) {
      parsed.urlsFile = value;
      index += 1;
    } else if (key === "--out" && value) {
      parsed.out = value;
      index += 1;
    } else if (key === "--env-file" && value) {
      parsed.envFile = value;
      index += 1;
    } else if (key === "--wait-ms" && value) {
      parsed.waitMs = Number.parseInt(value, 10);
      index += 1;
    } else if (key === "--width" && value) {
      parsed.width = Number.parseInt(value, 10);
      index += 1;
    } else if (key === "--height" && value) {
      parsed.height = Number.parseInt(value, 10);
      index += 1;
    } else if (key === "--navigation-timeout-ms" && value) {
      parsed.navigationTimeoutMs = Number.parseInt(value, 10);
      index += 1;
    } else if (key === "--network-idle-timeout-ms" && value) {
      parsed.networkIdleTimeoutMs = Number.parseInt(value, 10);
      index += 1;
    } else if (key === "--screenshot-timeout-ms" && value) {
      parsed.screenshotTimeoutMs = Number.parseInt(value, 10);
      index += 1;
    } else if (key === "--headed") {
      parsed.headed = true;
    } else if (key === "--no-navigation-fallbacks") {
      parsed.noNavigationFallbacks = true;
    } else if (key === "--disable-http2-fallback") {
      parsed.disableHttp2Fallback = true;
    } else if (key === "--require-proxy") {
      parsed.requireProxy = true;
    } else if (key === "--egress-label" && value) {
      parsed.egressLabel = value;
      index += 1;
    }
  }
  return parsed;
}

async function readUrlsFile(filePath: string): Promise<string[]> {
  const content = await readFile(filePath, "utf8");
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map(normalizeUrl);
}

async function loadEnvFile(filePath: string): Promise<void> {
  const content = await readFile(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }
    const [, key, rawValue] = match;
    if (!key || process.env[key]) {
      continue;
    }
    process.env[key] = rawValue?.replace(/^['"]|['"]$/g, "") ?? "";
  }
}

async function writeMissingProxyRows(
  urls: string[],
  outRoot: string,
  egress: ConsentGeometryEgressDiagnostic,
): Promise<ScanRow[]> {
  const rows: ScanRow[] = [];
  for (const url of urls) {
    const siteDir = path.join(outRoot, safeSiteSlug(url));
    await mkdir(siteDir, { recursive: true });
    const errorPath = path.join(siteDir, "error.txt");
    const access = missingRequiredProxyDiagnostic({ label: egress.label });
    await writeFile(errorPath, `${access.textExcerpt}\n${JSON.stringify({ access, egress }, null, 2)}\n`);
    rows.push({
      site: url,
      artifactPath: errorPath,
      accessStatus: access.status,
      accessReasonCodes: access.reasonCodes,
      egressLabel: egress.label,
      proxyConfigured: false,
      cmp: "not_checked",
      accept: false,
      reject: false,
      options: false,
      notes: access.textExcerpt ?? "required proxy missing",
    });
  }
  return rows;
}

async function writeSummary(
  outRoot: string,
  rows: ScanRow[],
  egress: ConsentGeometryEgressDiagnostic,
  options: { quiet?: boolean } = {},
): Promise<void> {
  const summaryPath = path.join(outRoot, "summary.json");
  await writeFile(summaryPath, `${JSON.stringify({
    artifactVersion: "consent_geometry_cohort_summary.v1",
    generatedAt: new Date().toISOString(),
    egress,
    rows,
  }, null, 2)}\n`);
  if (!options.quiet) {
    console.log(`Wrote ${summaryPath}`);
  }
}

function normalizeUrl(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function safeSiteSlug(value: string): string {
  try {
    const url = new URL(value);
    return url.hostname.replace(/[^a-z0-9.-]+/gi, "_");
  } catch {
    return value.replace(/[^a-z0-9.-]+/gi, "_").slice(0, 80);
  }
}

function yn(value: boolean): "yes" | "no" {
  return value ? "yes" : "no";
}
