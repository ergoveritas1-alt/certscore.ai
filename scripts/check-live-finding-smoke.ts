type SmokeResult = {
  name: string;
  passed: boolean;
  details: string[];
};

function getEnv(name: string) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

async function fetchText(url: string) {
  const response = await fetch(url);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  return text;
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

function containsAll(text: string, patterns: RegExp[]) {
  return patterns.every((pattern) => pattern.test(text));
}

async function checkSessionReplay(url: string): Promise<SmokeResult> {
  const text = stripHtml(await fetchText(url));
  const passed = containsAll(text, [
    /session replay observed/i,
    /session recording services detected/i,
    /microsoft clarity/i
  ]);

  return {
    details: passed
      ? ["Session replay finding and Microsoft Clarity provenance were present."]
      : ["Expected session replay finding text and Microsoft Clarity provenance were not both present."],
    name: "session-replay-runtime-provenance",
    passed
  };
}

async function checkFinancialAuditOnly(url: string): Promise<SmokeResult> {
  const text = stripHtml(await fetchText(url));
  const financialIndex = text.search(/Financial & commercial claims/i);
  const financialWindow = financialIndex >= 0 ? text.slice(financialIndex, financialIndex + 600) : "";
  const passed =
    financialIndex >= 0 &&
    /Audit-only/i.test(financialWindow) &&
    !/High-confidence claims or earnings language surfaced without enough balancing disclosure/i.test(financialWindow);

  return {
    details: passed
      ? ["Financial & commercial claims was present as Audit-only without the high-confidence earnings finding."]
      : ["Financial & commercial claims was missing, not Audit-only, or still showed the high-confidence earnings finding."],
    name: "financial-claims-empty-audit-only",
    passed
  };
}

async function main() {
  const sessionReplayUrl = getEnv("SESSION_REPLAY_SCAN_URL");
  const financialAuditOnlyUrl = getEnv("FINANCIAL_EMPTY_SCAN_URL");
  const results: SmokeResult[] = [];

  if (sessionReplayUrl) {
    results.push(await checkSessionReplay(sessionReplayUrl));
  }
  if (financialAuditOnlyUrl) {
    results.push(await checkFinancialAuditOnly(financialAuditOnlyUrl));
  }

  if (results.length === 0) {
    throw new Error("Set SESSION_REPLAY_SCAN_URL and/or FINANCIAL_EMPTY_SCAN_URL.");
  }

  console.log(JSON.stringify({ results }, null, 2));

  if (results.some((result) => !result.passed)) {
    process.exit(1);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
