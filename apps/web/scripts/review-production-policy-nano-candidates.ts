import process from "node:process";
import { closePools, query } from "@website-signal-risk-scanner/db";

type NanoCandidateRow = {
  domain: string;
  latest_completed_at: string;
  max_confidence: number | null;
  signal_count: number;
  signal_key: string;
  signal_values: unknown[];
};

const NANO_REVIEW_SIGNAL_KEYS = [
  "policyAmbiguityScore",
  "disclosure.privacy_policy_word_count",
  "privacy.gpc_disclosure_present",
  "privacy.cookie_runtime_disclosure_gap_detected",
  "privacy.behavioral_analytics_disclosure_present",
  "privacy.dsar_request_mechanism_present",
  "privacy.privacy_rights_path_present",
  "privacy.privacy_contact_path_present",
  "privacy.tracking_technologies_disclosure_present",
  "privacy.targeted_advertising_disclosure_present",
  "privacy.third_party_advertising_disclosure_present"
] as const;

function getArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function getNumberArg(flag: string, fallback: number) {
  const raw = getArgValue(flag);
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getKeyArgs() {
  const raw = getArgValue("--keys");
  if (!raw) {
    return [...NANO_REVIEW_SIGNAL_KEYS];
  }

  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function renderMarkdown(rows: NanoCandidateRow[]) {
  const lines = [
    "# Production Nano Policy Candidate Review",
    "",
    "These rows show production Nano-populated policy signals that are useful for calibration of policy absence, disclosure, and clarity findings. Nano should corroborate retained policy evidence; it should not replace runtime anchors or scoped section-review evidence.",
    "",
    "| Signal key | Domain | Signal rows | Max confidence | Latest completed | Values |",
    "|---|---|---:|---:|---|---|"
  ];

  for (const row of rows) {
    lines.push(
      `| \`${row.signal_key}\` | ${row.domain} | ${row.signal_count} | ${row.max_confidence ?? ""} | ${row.latest_completed_at} | \`${JSON.stringify(row.signal_values).replace(/\|/g, "/")}\` |`
    );
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  const limit = getNumberArg("--limit", 50);
  const scanType = getArgValue("--scan-type") ?? "full";
  const signalKeys = getKeyArgs();
  const result = await query<NanoCandidateRow>(
    `
      select sig.signal_key,
             ss.domain,
             count(*)::int as signal_count,
             max(sig.confidence)::float as max_confidence,
             max(s.completed_at)::text as latest_completed_at,
             jsonb_agg(distinct sig.signal_value_json) as signal_values
        from scan_signals sig
        join scans s on s.id = sig.scan_id
        join scan_snapshots ss on ss.scan_id = s.id
       where s.status = 'completed'
         and s.organization_id is not null
         and s.scan_type = $1
         and sig.population_source = 'nano'
         and sig.signal_key = any($2::text[])
       group by sig.signal_key, ss.domain
       order by latest_completed_at desc, signal_count desc, sig.signal_key asc, ss.domain asc
       limit $3
    `,
    [scanType, signalKeys, limit],
    { readOnly: true }
  );

  if (hasFlag("--json")) {
    process.stdout.write(`${JSON.stringify({ rows: result.rows, signalKeys }, null, 2)}\n`);
    return;
  }

  process.stdout.write(renderMarkdown(result.rows));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePools();
  });
