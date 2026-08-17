#!/usr/bin/env node
import { appendFileSync } from "node:fs";

const baseUrl = normalizeBaseUrl(requiredEnv("CERTSCORE_ACTION_BASE_URL"));
const apiKey = requiredEnv("CERTSCORE_ACTION_API_KEY");
const targetUrl = requiredEnv("CERTSCORE_ACTION_TARGET_URL");
const scanFrom = env("CERTSCORE_ACTION_SCAN_FROM", "eu_ie");
const freshness = env("CERTSCORE_ACTION_FRESHNESS", "latest");
const failOn = env("CERTSCORE_ACTION_FAIL_ON", "critical").toLowerCase();
const maxWaitMs = secondsEnv("CERTSCORE_ACTION_MAX_WAIT_SECONDS", 300) * 1000;
const pollIntervalMs = secondsEnv("CERTSCORE_ACTION_POLL_INTERVAL_SECONDS", 10) * 1000;

const severityRank = new Map([
  ["info", 0],
  ["low", 1],
  ["medium", 2],
  ["high", 3],
  ["critical", 4]
]);

const pendingStatuses = new Set(["queued", "running", "finalizing"]);
const successStatuses = new Set(["completed", "completed_limited"]);
const failureStatuses = new Set(["failed", "expired", "rate_limited"]);

function env(name, fallback) {
  const value = process.env[name]?.trim();
  return value ? value : fallback;
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function secondsEnv(name, fallback) {
  const raw = env(name, String(fallback));
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative number of seconds.`);
  }
  return parsed;
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "");
}

function apiUrl(pathOrUrl) {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return new URL(pathOrUrl);
  }
  return new URL(pathOrUrl, baseUrl);
}

function scanIdFrom(value) {
  return value?.scanId ?? value?.scan_id ?? value?.scan?.scanId ?? value?.scan?.id ?? null;
}

function reportUrlFrom(value) {
  return value?.links?.report ?? value?.links?.fullReportUrl ?? value?.reportUrl ?? value?.scan?.links?.report ?? "";
}

function statusUrlFrom(value) {
  return value?.links?.status ?? value?.statusUrl ?? value?.nextCheckUrl ?? null;
}

function retryAfterMs(response, fallbackMs) {
  const raw = response.headers.get("retry-after");
  if (!raw) {
    return fallbackMs;
  }
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }
  const date = Date.parse(raw);
  if (Number.isFinite(date)) {
    return Math.max(0, date - Date.now());
  }
  return fallbackMs;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(pathOrUrl, options = {}) {
  const response = await fetch(apiUrl(pathOrUrl), {
    ...options,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${apiKey}`,
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...options.headers
    }
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok && response.status !== 202 && response.status !== 429) {
    const message = body?.error?.message ?? body?.message ?? `CertScore API returned HTTP ${response.status}.`;
    throw new Error(message);
  }
  return { body, response };
}

async function createScan() {
  const { body, response } = await request("/api/v2/scans", {
    method: "POST",
    body: JSON.stringify({
      url: targetUrl,
      freshness,
      scanFrom
    })
  });
  return { body, response };
}

async function pollUntilDone(initialBody, initialResponse) {
  let body = initialBody;
  let response = initialResponse;
  const startedAt = Date.now();

  while (true) {
    const status = body?.status;
    const scanId = scanIdFrom(body);

    if (successStatuses.has(status) && scanId) {
      return body;
    }
    if (body?.type === "certscore_scan" && scanId) {
      return body;
    }
    if (failureStatuses.has(status)) {
      throw new Error(`CertScore scan ended with status ${status}.`);
    }
    if (!pendingStatuses.has(status) && !statusUrlFrom(body)) {
      throw new Error(`CertScore returned an unexpected scan status: ${status ?? "missing"}.`);
    }
    if (Date.now() - startedAt >= maxWaitMs) {
      throw new Error(`Timed out waiting for CertScore scan after ${Math.round(maxWaitMs / 1000)} seconds.`);
    }

    const delay = Math.min(retryAfterMs(response, pollIntervalMs), Math.max(0, maxWaitMs - (Date.now() - startedAt)));
    await sleep(delay);

    const scanStatusId = scanIdFrom(body);
    const statusUrl = statusUrlFrom(body) ?? (scanStatusId ? `/api/v2/scans/${encodeURIComponent(scanStatusId)}/status` : null);
    if (!statusUrl) {
      throw new Error("CertScore did not return a status URL or scan ID for polling.");
    }

    const next = await request(statusUrl);
    body = next.body;
    response = next.response;
  }
}

async function findingsForScan(scanId) {
  const { body } = await request(`/api/v2/scans/${encodeURIComponent(scanId)}/findings`);
  return Array.isArray(body?.findings) ? body.findings : [];
}

function countBySeverity(findings) {
  const counts = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
    unknown: 0
  };
  for (const finding of findings) {
    const severity = typeof finding?.criticality === "string" ? finding.criticality.toLowerCase() : "unknown";
    if (Object.prototype.hasOwnProperty.call(counts, severity)) {
      counts[severity] += 1;
    } else {
      counts.unknown += 1;
    }
  }
  return counts;
}

function thresholdFindings(findings) {
  if (failOn === "none") {
    return [];
  }
  const threshold = severityRank.get(failOn);
  if (threshold === undefined) {
    throw new Error("fail-on must be one of: critical, high, medium, low, info, none.");
  }
  return findings.filter((finding) => {
    const rank = severityRank.get(String(finding?.criticality ?? "unknown").toLowerCase()) ?? -1;
    return rank >= threshold;
  });
}

function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${String(value).replaceAll("\n", " ")}\n`);
  }
}

function writeSummary(scanId, status, counts, reportUrl, blockedFindings) {
  const lines = [
    "## CertScore Pulse",
    "",
    `- Target: ${targetUrl}`,
    `- Scan ID: ${scanId}`,
    `- Status: ${status}`,
    `- Findings: ${counts.critical + counts.high + counts.medium + counts.low + counts.info + counts.unknown}`,
    `- Critical: ${counts.critical}`,
    `- High: ${counts.high}`,
    `- Medium: ${counts.medium}`,
    `- Low: ${counts.low}`,
    reportUrl ? `- Report: ${reportUrl}` : null,
    "",
    "CertScore outputs are automated public-web observations for human and agentic review. They are not legal advice, certification, or a compliance determination."
  ].filter(Boolean);

  if (blockedFindings.length > 0) {
    lines.splice(2, 0, `- Workflow threshold: ${failOn}`);
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
  }
}

const created = await createScan();
const completed = await pollUntilDone(created.body, created.response);
const scanId = scanIdFrom(completed);
if (!scanId) {
  throw new Error("CertScore completed the scan without returning a durable scan ID.");
}

const findings = await findingsForScan(scanId);
const counts = countBySeverity(findings);
const blockedFindings = thresholdFindings(findings);
const status = completed.status ?? "completed";
const reportUrl = reportUrlFrom(completed) || `${baseUrl}/scan/${scanId}`;

setOutput("scan-id", scanId);
setOutput("status", status);
setOutput("findings-count", findings.length);
setOutput("critical-findings", counts.critical);
setOutput("high-findings", counts.high);
setOutput("report-url", reportUrl);
writeSummary(scanId, status, counts, reportUrl, blockedFindings);

if (blockedFindings.length > 0) {
  console.error(`CertScore surfaced ${blockedFindings.length} automated review signal(s) at or above ${failOn}:`);
  for (const finding of blockedFindings.slice(0, 10)) {
    console.error(`- ${finding.label ?? finding.id ?? "unnamed finding"} (${finding.criticality ?? "unknown"})`);
  }
  console.error("Review the CertScore report and retained public evidence before deciding next steps.");
  process.exit(1);
}

console.log(`CertScore Pulse completed for ${targetUrl}: ${findings.length} finding(s), no signals at or above ${failOn}.`);
