import { query } from "../packages/db/src/postgres";

const REQUIRED_TABLES = [
  "policy_enrichment",
  "validation_targets",
  "validation_settings",
  "validation_runs",
  "validation_run_findings",
  "validation_verdicts",
  "validation_audit_events"
] as const;

const REQUIRED_COLUMNS: Record<string, readonly string[]> = {
  policy_enrichment: [
    "policy_effective_date",
    "policy_governing_law",
    "policy_arbitration_present",
    "policy_cookie_disclosures",
    "policy_notice_contact_present",
    "policy_termination_or_suspension_present",
    "policy_cancellation_or_refund_present",
    "policy_field_coverage",
    "policy_coverage_ratio",
    "policy_snippet_count",
    "policy_structurally_weak"
  ],
  scan_snapshots: [
    "account_deletion_terms_present",
    "privacy_cookie_policy_conflict_detected",
    "policy_terms_conflict_detected"
  ],
  scan_runtime_artifacts: [
    "key_page_discovery_summary",
    "sensitive_payload_violations",
    "consent_opt_in_clicks",
    "consent_opt_out_clicks",
    "consent_friction_delta",
    "consent_redirect_or_auth_required",
    "consent_opt_in_evidence_log",
    "consent_opt_out_evidence_log",
    "consent_blocker_type",
    "consent_blocker_url",
    "consent_blocker_page_title",
    "consent_blocker_text_snippet",
    "consent_evidence_pass_count"
  ],
  validation_settings: [
    "singleton_key",
    "pipeline_enabled",
    "run_mode",
    "automatic_interval_minutes",
    "last_worker_started_at",
    "last_worker_heartbeat_at",
    "last_worker_host"
  ],
  validation_audit_events: ["metadata_json"],
  validation_run_findings: [
    "finding_family",
    "finding_source",
    "finding_scope",
    "finding_subject"
  ],
  validation_runs: [
    "domain_id",
    "triggered_by_user_id"
  ],
  validation_targets: ["consecutive_failures"],
  validation_verdicts: [
    "id",
    "validation_run_finding_id",
    "verdict",
    "system_confidence_score",
    "system_confidence_band",
    "system_confidence_explanation"
  ]
};

const NULLABLE_ORGANIZATION_ID_TABLES = [
  "scan_runtime_artifacts",
  "scan_signals",
  "scan_tracker_vendors",
  "scan_accessibility_rule_counts",
  "scan_accessibility_rule_examples",
  "scan_preconsent_violations",
  "scan_pages"
] as const;

type TableRow = {
  table_name: string;
};

type ColumnRow = {
  column_name: string;
  is_nullable: "YES" | "NO" | null;
  table_name: string;
};

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function buildInList(values: readonly string[]) {
  return values.map(sqlString).join(", ");
}

function printSection(title: string, lines: string[]) {
  console.log(`\n${title}`);
  for (const line of lines) {
    console.log(line);
  }
}

async function main() {
  const tableNames = Array.from(
    new Set([...REQUIRED_TABLES, ...Object.keys(REQUIRED_COLUMNS), ...NULLABLE_ORGANIZATION_ID_TABLES])
  );
  const columnNames = Array.from(new Set(Object.values(REQUIRED_COLUMNS).flat().concat(["organization_id"])));

  let remoteTables: TableRow[];
  let remoteColumns: ColumnRow[];

  try {
    remoteTables = (
      await query<TableRow>(
        `select table_name
         from information_schema.tables
         where table_schema = 'public'
           and table_name in (${buildInList(tableNames)})
         order by table_name;`,
        [],
        { readOnly: true }
      )
    ).rows;

    remoteColumns = (
      await query<ColumnRow>(
        `select table_name, column_name, is_nullable
         from information_schema.columns
         where table_schema = 'public'
           and table_name in (${buildInList(tableNames)})
           and column_name in (${buildInList(columnNames)})
         order by table_name, column_name;`,
        [],
        { readOnly: true }
      )
    ).rows;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to query database schema: ${message}`);
    process.exit(1);
    return;
  }

  const existingTables = new Set(remoteTables.map((row) => row.table_name));
  const existingColumns = new Map(remoteColumns.map((row) => [`${row.table_name}.${row.column_name}`, row] as const));

  const missingTables = REQUIRED_TABLES.filter((tableName) => !existingTables.has(tableName));
  const missingColumns: string[] = [];

  for (const [tableName, columns] of Object.entries(REQUIRED_COLUMNS)) {
    for (const columnName of columns) {
      if (!existingColumns.has(`${tableName}.${columnName}`)) {
        missingColumns.push(`${tableName}.${columnName}`);
      }
    }
  }

  const nonNullableOrganizationIds = NULLABLE_ORGANIZATION_ID_TABLES.filter((tableName) => {
    const row = existingColumns.get(`${tableName}.organization_id`);
    return row?.is_nullable === "NO";
  });

  printSection("Production Schema Audit", ["Connection source: DATABASE_URL"]);

  if (missingTables.length === 0) {
    printSection("Tables", ["All required tables are present."]);
  } else {
    printSection("Missing Tables", missingTables.map((tableName) => `- ${tableName}`));
  }

  if (missingColumns.length === 0) {
    printSection("Columns", ["All required columns are present."]);
  } else {
    printSection("Missing Columns", missingColumns.map((columnName) => `- ${columnName}`));
  }

  if (nonNullableOrganizationIds.length === 0) {
    printSection("Anonymous Preview Guard", ["All preview-related organization_id columns are nullable."]);
  } else {
    printSection(
      "Anonymous Preview Guard Failures",
      nonNullableOrganizationIds.map((tableName) => `- ${tableName}.organization_id is not nullable`)
    );
  }

  if (missingTables.length > 0 || missingColumns.length > 0 || nonNullableOrganizationIds.length > 0) {
    process.exit(1);
  }
}

void main();
