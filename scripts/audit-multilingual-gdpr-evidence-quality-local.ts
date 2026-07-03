import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type Args = {
  comparisonPath: string;
  outDir: string;
};

type AcceptedEvidence = {
  disclosureType?: string;
  excerpt?: string;
  locale?: string;
  matchedTerm?: string;
  matchStrength?: string;
  rowId?: string;
  sourceUrl?: string;
};

type ComparisonRow = {
  acceptedEvidence?: AcceptedEvidence[];
  acceptedProductionSignalCount?: number;
  key: string;
  newlyObservedRows?: string[];
  optInObservedRows?: string[];
  optInReviewSignalRows?: string[];
  url?: string;
};

type ComparisonReport = {
  rows?: ComparisonRow[];
  totals?: Record<string, unknown>;
};

type EvidenceAuditRow = AcceptedEvidence & {
  flags: string[];
  reviewDisposition: "likely_benign" | "manual_review" | "no_flag";
  reviewReason: string;
  site: string;
  siteUrl?: string;
};

const FLAG_RULES: Array<{ id: string; pattern: RegExp }> = [
  {
    id: "support_or_sales_context",
    pattern: /\b(?:support|sales|service client|customer service|ventas|newsletter|assistenza|reclamaci[oó]n|réclamation)\b/i,
  },
  {
    id: "generic_transfer_context",
    pattern: /\b(?:shipping|livraison|env[ií]o|versand|przesył|transfer of money|bank|payment)\b/i,
  },
  {
    id: "short_excerpt",
    pattern: /^.{0,120}$/s,
  },
  {
    id: "generic_automation_context",
    pattern: /\b(?:workflow|support automatis|product automation|automatisation)\b/i,
  },
];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = JSON.parse(await readFile(args.comparisonPath, "utf8")) as ComparisonReport;
  const rows = report.rows ?? [];
  const accepted = rows.flatMap((row) =>
    (row.acceptedEvidence ?? []).map((evidence): EvidenceAuditRow => {
      const flags = evidenceFlags(evidence);
      const review = evidenceReviewDisposition(evidence, flags);
      return {
        ...evidence,
        flags,
        reviewDisposition: review.disposition,
        reviewReason: review.reason,
        site: row.key,
        siteUrl: row.url,
      };
    })
  );
  const acceptedSites = rows.filter((row) => (row.acceptedProductionSignalCount ?? 0) > 0);
  const flagged = accepted.filter((row) => row.flags.length > 0);
  const manualReview = accepted.filter((row) => row.reviewDisposition === "manual_review");
  const audit = {
    acceptedEvidenceCount: accepted.length,
    acceptedProductionSignalSites: acceptedSites.length,
    comparisonPath: args.comparisonPath,
    comparisonTotals: report.totals ?? {},
    flaggedEvidenceCount: flagged.length,
    flaggedEvidence: flagged,
    generatedAt: new Date().toISOString(),
    guardrails: [
      "local_artifact_only",
      "quality_review_only",
      "does_not_create_or_project_findings",
      "does_not_read_gdprTransparencyTopicCandidates",
      "does_not_click_consent_controls",
    ],
    localeCounts: countBy(accepted.map((row) => row.locale ?? "unknown")),
    manualReviewEvidence: manualReview,
    manualReviewEvidenceCount: manualReview.length,
    reviewDispositionCounts: countBy(accepted.map((row) => row.reviewDisposition)),
    rowCounts: countBy(accepted.map((row) => row.rowId ?? "unknown")),
    topicCounts: countBy(accepted.map((row) => row.disclosureType ?? "unknown")),
  };

  await mkdir(args.outDir, { recursive: true });
  await writeFile(path.join(args.outDir, "accepted-evidence-quality-audit.json"), `${JSON.stringify(audit, null, 2)}\n`, "utf8");
  await writeFile(path.join(args.outDir, "accepted-evidence-quality-audit.tsv"), `${auditTsv(accepted)}\n`, "utf8");
  await writeFile(path.join(args.outDir, "index.html"), htmlReport(audit), "utf8");
  console.log(`Wrote ${path.join(args.outDir, "accepted-evidence-quality-audit.json")}`);
  console.log(`Wrote ${path.join(args.outDir, "index.html")}`);
}

function evidenceFlags(evidence: AcceptedEvidence): string[] {
  const text = `${evidence.matchedTerm ?? ""} ${evidence.excerpt ?? ""}`;
  return FLAG_RULES
    .filter((rule) => rule.pattern.test(text))
    .map((rule) => rule.id);
}

function evidenceReviewDisposition(
  evidence: AcceptedEvidence,
  flags: string[],
): { disposition: EvidenceAuditRow["reviewDisposition"]; reason: string } {
  if (flags.length === 0) {
    return {
      disposition: "no_flag",
      reason: "No heuristic quality flags matched this accepted evidence row.",
    };
  }

  const text = `${evidence.matchedTerm ?? ""} ${evidence.excerpt ?? ""}`;
  const disclosureType = evidence.disclosureType ?? "";
  const strongPrivacyContext =
    /\b(?:personal data|personal information|data protection|privacy|dpo|gegevensbescherming|persoonsgegevens|donn[ée]es personnelles|protection des donn[ée]es|datos personales|protecci[oó]n de datos|dati personali|tuoi dati|protezione dei dati|dane osobowe|ochrony danych)\b/i.test(text);
  const privacySpecificMatchedTerm =
    /(?:data protection officer|dpo|délégué à la protection des données|delegado de protección de datos|responsable de la protección de datos|responsabile della protezione dei dati|autoridad de control|agencia española de protección de datos|autorità di controllo|titolare del trattamento|tratta i tuoi dati|automatycznemu przetwarzaniu danych)/i.test(evidence.matchedTerm ?? "");
  const authoritativeComplaintEvidence =
    disclosureType === "supervisory_authority" &&
    /\b(?:supervisory authority|data protection authority|agencia española de protección de datos|autorità di controllo|autoriteit persoonsgegevens|organ nadzorczy|autorité de contrôle)\b/i.test(text);
  const dpoEvidence =
    disclosureType === "dpo_contact" &&
    /\b(?:dpo|data protection officer|délégué à la protection des données|delegado de protección de datos|responsabile della protezione dei dati|functionaris voor gegevensbescherming|inspektor ochrony danych)\b/i.test(text);

  if (
    !flags.includes("short_excerpt") &&
    (authoritativeComplaintEvidence || dpoEvidence || (privacySpecificMatchedTerm && strongPrivacyContext))
  ) {
    return {
      disposition: "likely_benign",
      reason: "Flag matched nearby generic words, but the retained matched term and excerpt are privacy/data-protection specific.",
    };
  }

  return {
    disposition: "manual_review",
    reason: "Heuristic flag was not offset by a strong privacy-specific matched term and context.",
  };
}

function countBy(values: string[]) {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function auditTsv(rows: EvidenceAuditRow[]) {
  return [
    ["site", "siteUrl", "disclosureType", "rowId", "locale", "matchStrength", "matchedTerm", "flags", "reviewDisposition", "reviewReason", "sourceUrl", "excerpt"].join("\t"),
    ...rows.map((row) => [
      row.site,
      row.siteUrl ?? "",
      row.disclosureType ?? "",
      row.rowId ?? "",
      row.locale ?? "",
      row.matchStrength ?? "",
      row.matchedTerm ?? "",
      row.flags.join(","),
      row.reviewDisposition,
      row.reviewReason,
      row.sourceUrl ?? "",
      normalizeTsvText(row.excerpt ?? "").slice(0, 600),
    ].map(tsvCell).join("\t")),
  ].join("\n");
}

function htmlReport(audit: {
  acceptedEvidenceCount: number;
  acceptedProductionSignalSites: number;
  flaggedEvidence: EvidenceAuditRow[];
  flaggedEvidenceCount: number;
  localeCounts: Record<string, number>;
  manualReviewEvidence: EvidenceAuditRow[];
  manualReviewEvidenceCount: number;
  reviewDispositionCounts: Record<string, number>;
  rowCounts: Record<string, number>;
  topicCounts: Record<string, number>;
}) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Multilingual GDPR Evidence Quality Audit</title>
  <style>
    body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f6f7f9; color: #17202a; }
    main { max-width: 1180px; margin: 0 auto; padding: 28px; }
    h1 { font-size: 28px; margin: 0 0 8px; letter-spacing: 0; }
    h2 { font-size: 18px; margin: 26px 0 12px; letter-spacing: 0; }
    .lede { color: #52606d; margin: 0 0 20px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; }
    .card, .flag { background: #fff; border: 1px solid #d9dee7; border-radius: 8px; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04); }
    .card { padding: 14px; }
    .card b { display: block; font-size: 24px; }
    .card span, .meta { color: #52606d; font-size: 12px; }
    .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    td { border-bottom: 1px solid #edf0f4; padding: 7px 4px; }
    code { background: #eef2f7; border-radius: 4px; padding: 1px 4px; font-size: 12px; }
    .flag { padding: 12px; margin: 10px 0; border-left: 3px solid #d97706; }
    .excerpt { line-height: 1.45; margin-top: 6px; }
  </style>
</head>
<body>
<main>
  <h1>Multilingual GDPR Evidence Quality Audit</h1>
  <p class="lede">Local artifact-only review of adapter-accepted Article 13 evidence. Flags are heuristics for manual review, not findings.</p>
  <section class="grid">
    ${metric("Accepted signal sites", audit.acceptedProductionSignalSites)}
    ${metric("Accepted evidence rows", audit.acceptedEvidenceCount)}
    ${metric("Heuristic flags", audit.flaggedEvidenceCount)}
    ${metric("Manual-review flags", audit.manualReviewEvidenceCount)}
  </section>
  <section class="cols">
    ${countTable("Topics", audit.topicCounts)}
    ${countTable("Rows", audit.rowCounts)}
    ${countTable("Locales", audit.localeCounts)}
    ${countTable("Review Disposition", audit.reviewDispositionCounts)}
  </section>
  <h2>Manual Review Flags</h2>
  ${audit.manualReviewEvidence.length > 0 ? audit.manualReviewEvidence.map(flagCard).join("") : "<p>No manual-review flags.</p>"}
  <h2>Flagged Evidence</h2>
  ${audit.flaggedEvidence.length > 0 ? audit.flaggedEvidence.map(flagCard).join("") : "<p>No heuristic flags.</p>"}
</main>
</body>
</html>`;
}

function metric(label: string, value: number) {
  return `<div class="card"><b>${value}</b><span>${escapeHtml(label)}</span></div>`;
}

function countTable(title: string, counts: Record<string, number>) {
  return `<section class="card"><h2>${escapeHtml(title)}</h2><table>${Object.entries(counts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([key, value]) => `<tr><td><code>${escapeHtml(key)}</code></td><td>${value}</td></tr>`)
    .join("")}</table></section>`;
}

function flagCard(row: EvidenceAuditRow) {
  return `<section class="flag">
    <div><b>${escapeHtml(row.site)}</b> <span class="meta">${escapeHtml(row.disclosureType ?? "unknown")} / ${escapeHtml(row.locale ?? "unknown")}</span></div>
    <div class="meta">Disposition: <code>${escapeHtml(row.reviewDisposition)}</code> | ${escapeHtml(row.reviewReason)}</div>
    <div class="meta">Flags: ${row.flags.map((flag) => `<code>${escapeHtml(flag)}</code>`).join(" ")} | Term: <code>${escapeHtml(row.matchedTerm ?? "")}</code></div>
    <div class="excerpt">${escapeHtml(row.excerpt ?? "")}</div>
  </section>`;
}

function normalizeTsvText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function tsvCell(value: string) {
  return value.includes("\t") || value.includes("\n") || value.includes("\"")
    ? `"${value.replace(/"/g, "\"\"")}"`
    : value;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseArgs(argv: string[]): Args {
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "");
  const args: Partial<Args> = {
    outDir: path.join("artifacts", `local-gdpr-transparency-evidence-quality-audit-${timestamp}`),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--comparison") {
      args.comparisonPath = requiredValue(argv, ++index, arg);
    } else if (arg === "--out-dir") {
      args.outDir = requiredValue(argv, ++index, arg);
    } else if (arg === "--") {
      continue;
    } else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.comparisonPath) {
    throw new Error("Missing --comparison <path>.");
  }
  return args as Args;
}

function requiredValue(argv: string[], index: number, flag: string) {
  const value = argv[index];
  if (!value) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}

function printUsage() {
  console.log([
    "Usage: pnpm v2:multilingual-local-evidence-quality -- --comparison <comparison.json> [--out-dir <dir>]",
    "",
    "Audits adapter-accepted multilingual GDPR Transparency evidence from a local checklist comparison artifact.",
  ].join("\n"));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
