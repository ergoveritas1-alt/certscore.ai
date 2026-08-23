import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as prodDbNamespace from "./lib/prod-db-psql-oneoff.ts";

const prodDb = (prodDbNamespace as typeof prodDbNamespace & { default?: typeof prodDbNamespace }).default ?? prodDbNamespace;

function valuesArg(name: string) {
  const values: string[] = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && process.argv[index + 1]) values.push(process.argv[index + 1]!);
  }
  return values;
}

function stringArg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

const scanIds = [...new Set(valuesArg("--scan-id"))];
if (scanIds.length === 0 || scanIds.length > 50 || scanIds.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) {
  throw new Error("Pass from 1 to 50 valid --scan-id values.");
}
const outPath = path.resolve(stringArg("--out") ?? "artifacts/gdpr-transparency-projection-loss-audit.json");
const quotedIds = scanIds.map((id) => `'${id}'::uuid`).join(", ");

const sql = `
select jsonb_build_object(
  'reportVersion', 'certscore.gdpr_transparency_projection_loss_audit.1',
  'generatedAt', timezone('utc', now()),
  'readOnly', true,
  'rows', coalesce(jsonb_agg(jsonb_build_object(
    'scanId', ss.scan_id::text,
    'sourceBundle', ss.report_projection_payload#>'{runtimeArtifacts,policy_disclosure_summary,policyTextEvidenceProjection,sourceBundle}',
    'policyDocuments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'documentRole', document->>'documentRole',
        'documentUrl', document->>'documentUrl',
        'extractionStatus', document->>'extractionStatus',
        'limitationKeys', document->'limitationKeys',
        'targetRelationship', document->>'targetRelationship',
        'textArtifactVerificationStatus', document->>'textArtifactVerificationStatus'
      ))
      from jsonb_array_elements(coalesce(
        ss.report_projection_payload#>'{runtimeArtifacts,policy_disclosure_summary,policyTextEvidenceProjection,documents}',
        '[]'::jsonb
      )) document
    ), '[]'::jsonb),
    'adapterDiagnostics', ss.report_projection_payload#>'{runtimeArtifacts,policy_disclosure_summary,gdprTransparencyProductionEvidenceDiagnostics}',
    'checklistRows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', checklist->>'id',
        'status', checklist->>'status',
        'limitation', checklist->>'limitation'
      ))
      from jsonb_array_elements(coalesce(
        ss.report_projection_payload#>'{canonicalReportProjection,checklistRows}',
        '[]'::jsonb
      )) checklist
      where checklist->>'id' in (
        'controller_contact_disclosure', 'processing_purposes_disclosure',
        'legal_basis_disclosure_observed', 'recipients_vendor_categories_disclosure',
        'retention_disclosure_observed', 'data_subject_rights_disclosure',
        'international_transfers_disclosure', 'dpo_contact_point_disclosure',
        'supervisory_authority_complaint_disclosure', 'privacy_notice_availability'
      )
    ), '[]'::jsonb)
  ) order by ss.scan_id), '[]'::jsonb)
)
from scan_snapshots ss
where ss.scan_id in (${quotedIds});
`;

async function main() {
  const output = await prodDb.runProdDbSqlOneoff({
    marker: "GDPR_PROJECTION_LOSS_AUDIT",
    readOnly: true,
    sql,
  });
  const result = prodDb.parseSingleJsonOutput<Record<string, unknown>>(output);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ outPath, scanCount: scanIds.length }, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
