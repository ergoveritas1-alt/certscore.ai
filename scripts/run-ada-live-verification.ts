import { query, queryOne } from "../packages/db/src/postgres";

const DEFAULT_LIVE_BASE_URL = "https://certscore.ai";
const DEFAULT_ADA_DOMAIN = "w3.org";
const DEFAULT_TIMEOUT_MS = 10 * 60_000;
const DEFAULT_POLL_MS = 15_000;

type QueueResponse = {
  scanId?: unknown;
  scanUrl?: unknown;
};

type ScanRow = {
  id: string;
  status: string | null;
};

type AccessibilityExampleRow = {
  help: string | null;
  page_url: string | null;
  rule_code: string;
  rule_group: string | null;
  severity: string | null;
};

function getEnv(name: string) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertLiveDatabaseUrl(databaseUrl: string) {
  if (process.env.ALLOW_LOCAL_DATABASE_URL === "1") {
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL is not a valid database URL.");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]") {
    throw new Error("DATABASE_URL points at a local database. Set PROD_DATABASE_URL to the live DB or set ALLOW_LOCAL_DATABASE_URL=1 intentionally.");
  }
}

async function fetchText(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  return text;
}

async function fetchJson(url: string, init?: RequestInit) {
  return JSON.parse(await fetchText(url, init)) as QueueResponse;
}

function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/\s+/g, " ")
    .trim();
}

function extractStageStatus(html: string, label: string) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`${escapedLabel}</p><span[^>]*>([^<]+)</span>`, "i"));
  return match?.[1]?.trim() ?? null;
}

function scanHasFinished(html: string) {
  const labels = ["Scanner", "Nano Doc Retrieval", "Merged Signals", "Unified Findings"];
  return labels.every((label) => {
    const status = extractStageStatus(html, label);
    return status === "Completed" || status === "Failed" || status === "Blocked";
  });
}

async function queueAdaScan(liveBaseUrl: string, domain: string) {
  const response = await fetchJson(`${liveBaseUrl}/api/full-scan`, {
    body: JSON.stringify({ domain }),
    headers: {
      "Content-Type": "application/json",
      "X-CertScore-Scan-Source": "github-actions-ada-live-verification",
      "X-GitHub-Actor": process.env.GITHUB_ACTOR ?? "",
      "X-GitHub-Run-Id": process.env.GITHUB_RUN_ID ?? "",
      "X-GitHub-Sha": process.env.GITHUB_SHA ?? "",
      "X-GitHub-Workflow": process.env.GITHUB_WORKFLOW ?? ""
    },
    method: "POST"
  });
  const scanId = typeof response.scanId === "string" ? response.scanId : null;
  const scanUrl = typeof response.scanUrl === "string" ? new URL(response.scanUrl, liveBaseUrl).toString() : null;
  if (!scanId || !scanUrl) {
    throw new Error(`Live full-scan response did not include scanId and scanUrl: ${JSON.stringify(response)}`);
  }
  return { scanId, scanUrl };
}

async function waitForReport(scanUrl: string, timeoutMs: number, pollMs: number) {
  const deadline = Date.now() + timeoutMs;
  let lastText = "";

  while (Date.now() <= deadline) {
    const html = await fetchText(scanUrl, { headers: { "Cache-Control": "no-store" } });
    lastText = stripHtml(html);
    const snapshot = {
      findings: extractStageStatus(html, "Unified Findings"),
      mergedSignals: extractStageStatus(html, "Merged Signals"),
      nanoDocRetrieval: extractStageStatus(html, "Nano Doc Retrieval"),
      scanner: extractStageStatus(html, "Scanner")
    };
    console.log(JSON.stringify({ scanUrl, snapshot }));

    if (scanHasFinished(html)) {
      return lastText;
    }

    await sleep(pollMs);
  }

  throw new Error(`Timed out waiting for ${scanUrl} after ${Math.round(timeoutMs / 1000)}s.`);
}

async function loadAccessibilityExamples(scanId: string) {
  const scan = await queryOne<ScanRow>(
    `
      select id, status
      from scans
      where id = $1
    `,
    [scanId],
    { readOnly: true }
  );
  if (!scan) {
    throw new Error(`Scan ${scanId} is not visible through DATABASE_URL.`);
  }

  const examples = await query<AccessibilityExampleRow>(
    `
      select rule_code, rule_group, severity, help, page_url
      from scan_accessibility_rule_examples
      where scan_id = $1
      order by severity, rule_group, rule_code
      limit 12
    `,
    [scanId],
    { readOnly: true }
  );

  if (examples.rows.length === 0) {
    throw new Error(`WS01 did not persist scan_accessibility_rule_examples for ${scanId}.`);
  }

  return { examples: examples.rows, scan };
}

function assertAdaReport(pageText: string, examples: AccessibilityExampleRow[]) {
  const adaIndex = pageText.search(/DOJ \/ ADA accessibility/i);
  const adaWindow = adaIndex >= 0 ? pageText.slice(adaIndex, adaIndex + 900) : "";
  const visibleRule = examples.find((example) =>
    new RegExp(example.rule_code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(pageText)
  );

  if (adaIndex < 0) {
    throw new Error("WC01 report did not render the DOJ / ADA accessibility lens.");
  }
  if (/Audit-only/i.test(adaWindow) && !visibleRule) {
    throw new Error("DOJ / ADA accessibility remained audit-only and no representative axe rule was visible.");
  }

  return {
    representativeRuleVisible: Boolean(visibleRule),
    visibleRule: visibleRule?.rule_code ?? null
  };
}

async function assertFinancialEmptyState(financialEmptyScanUrl: string) {
  const pageText = stripHtml(await fetchText(financialEmptyScanUrl));
  const financialIndex = pageText.search(/Financial & commercial claims/i);
  const financialWindow = financialIndex >= 0 ? pageText.slice(financialIndex, financialIndex + 600) : "";
  if (financialIndex < 0 || !/Audit-only/i.test(financialWindow)) {
    throw new Error("Financial & commercial claims did not render as Audit-only.");
  }
  if (/High-confidence claims or earnings language surfaced without enough balancing disclosure/i.test(financialWindow)) {
    throw new Error("Financial & commercial claims still surfaced the high-confidence earnings finding.");
  }
}

async function main() {
  const databaseUrl = getEnv("DATABASE_URL");
  if (!databaseUrl) {
    throw new Error("Set DATABASE_URL to the database expected to back the live host.");
  }
  assertLiveDatabaseUrl(databaseUrl);

  const liveBaseUrl = (getEnv("LIVE_BASE_URL") ?? DEFAULT_LIVE_BASE_URL).replace(/\/+$/, "");
  const adaDomain = getEnv("ADA_SCAN_DOMAIN") ?? DEFAULT_ADA_DOMAIN;
  const existingAdaScanId = getEnv("ADA_SCAN_ID");
  const existingAdaScanUrl = getEnv("ADA_SCAN_URL");
  const financialEmptyScanUrl = getEnv("FINANCIAL_EMPTY_SCAN_URL");
  const timeoutMs = Number(getEnv("ADA_SCAN_TIMEOUT_MS") ?? DEFAULT_TIMEOUT_MS);
  const pollMs = Number(getEnv("ADA_SCAN_POLL_MS") ?? DEFAULT_POLL_MS);

  const queued =
    existingAdaScanId && existingAdaScanUrl
      ? { scanId: existingAdaScanId, scanUrl: existingAdaScanUrl }
      : await queueAdaScan(liveBaseUrl, adaDomain);

  const reportText = await waitForReport(queued.scanUrl, timeoutMs, pollMs);
  const { examples, scan } = await loadAccessibilityExamples(queued.scanId);
  const adaReport = assertAdaReport(reportText, examples);

  if (financialEmptyScanUrl) {
    await assertFinancialEmptyState(financialEmptyScanUrl);
  }

  console.log(
    JSON.stringify(
      {
        adaDomain,
        adaReport,
        examples: examples.slice(0, 5),
        financialClaims: financialEmptyScanUrl ? "audit_only_empty" : "not_checked",
        scan,
        scanUrl: queued.scanUrl,
        status: "ok"
      },
      null,
      2
    )
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
