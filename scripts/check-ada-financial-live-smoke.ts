import { query, queryOne } from "../packages/db/src/postgres";

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

async function main() {
  const adaScanId = getEnv("ADA_SCAN_ID");
  const adaScanUrl = getEnv("ADA_SCAN_URL");
  const financialEmptyScanUrl = getEnv("FINANCIAL_EMPTY_SCAN_URL");

  if (!adaScanId && !financialEmptyScanUrl) {
    throw new Error("Set ADA_SCAN_ID and/or FINANCIAL_EMPTY_SCAN_URL.");
  }

  const checks: Record<string, unknown> = {};

  if (adaScanId) {
    const scan = await queryOne<{ id: string; status: string }>(
      `select id, status from scans where id = $1`,
      [adaScanId],
      { readOnly: true }
    );
    if (!scan) {
      throw new Error(`Scan ${adaScanId} was not visible through DATABASE_URL.`);
    }

    const examples = await query<{
      help: string;
      page_url: string;
      rule_code: string;
      rule_group: string;
      severity: string;
    }>(
      `
        select rule_code, rule_group, severity, help, page_url
        from scan_accessibility_rule_examples
        where scan_id = $1
        order by severity, rule_group, rule_code
        limit 12
      `,
      [adaScanId],
      { readOnly: true }
    );

    if (examples.rows.length === 0) {
      throw new Error(`WS01 did not persist scan_accessibility_rule_examples for ${adaScanId}.`);
    }

    checks.adaExamples = {
      count: examples.rows.length,
      examples: examples.rows
    };

    if (adaScanUrl) {
      const pageText = stripHtml(await fetchText(adaScanUrl));
      const adaIndex = pageText.search(/DOJ \/ ADA accessibility/i);
      const adaWindow = adaIndex >= 0 ? pageText.slice(adaIndex, adaIndex + 900) : "";
      const hasRepresentativeRule = examples.rows.some((example) =>
        new RegExp(example.rule_code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(pageText)
      );

      if (adaIndex < 0) {
        throw new Error("WC01 report did not render the DOJ / ADA accessibility lens.");
      }
      if (/Audit-only/i.test(adaWindow) && !hasRepresentativeRule) {
        throw new Error("DOJ / ADA accessibility remained audit-only and no representative axe rule was visible.");
      }

      checks.adaReport = {
        representativeRuleVisible: hasRepresentativeRule,
        statusWindow: adaWindow.slice(0, 300)
      };
    }
  }

  if (financialEmptyScanUrl) {
    const pageText = stripHtml(await fetchText(financialEmptyScanUrl));
    const financialIndex = pageText.search(/Financial & commercial claims/i);
    const financialWindow = financialIndex >= 0 ? pageText.slice(financialIndex, financialIndex + 600) : "";
    if (financialIndex < 0 || !/Audit-only/i.test(financialWindow)) {
      throw new Error("Financial & commercial claims did not render as Audit-only.");
    }
    if (/High-confidence claims or earnings language surfaced without enough balancing disclosure/i.test(financialWindow)) {
      throw new Error("Financial & commercial claims still surfaced the high-confidence earnings finding.");
    }
    checks.financialClaims = {
      status: "audit_only_empty",
      statusWindow: financialWindow.slice(0, 300)
    };
  }

  console.log(JSON.stringify({ checks, status: "ok" }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
