import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as prodDbNamespace from "./lib/prod-db-psql-oneoff.ts";

const prodDb = (prodDbNamespace as typeof prodDbNamespace & { default?: typeof prodDbNamespace }).default ?? prodDbNamespace;

function positiveIntegerArg(name: string, fallback: number) {
  const index = process.argv.indexOf(name);
  const raw = index >= 0 ? process.argv[index + 1] : null;
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 1 || value > 168) {
    throw new Error(`${name} must be an integer from 1 to 168.`);
  }
  return value;
}

function stringArg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function timestampSlug() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

const hours = positiveIntegerArg("--hours", 18);
const diagnoseKeys = process.argv.includes("--diagnose-keys");
const outPath = path.resolve(
  stringArg("--out") ?? `artifacts/gdpr-transparency-policy-evidence-audit-${timestampSlug()}.json`,
);

const topicRows = [
  "controller_contact_disclosure",
  "processing_purposes_disclosure",
  "legal_basis_disclosure_observed",
  "recipients_vendor_categories_disclosure",
  "retention_disclosure_observed",
  "data_subject_rights_disclosure",
  "international_transfers_disclosure",
  "dpo_contact_point_disclosure",
  "supervisory_authority_complaint_disclosure",
  "privacy_notice_availability",
];

const sql = `
with recent as (
  select s.id as scan_id,
         s.completed_at,
         d.hostname,
         ss.report_projection_payload
    from scans s
    join domains d on d.id = s.domain_id
    join scan_snapshots ss on ss.scan_id = s.id
   where s.status = 'completed'
     and s.completed_at >= timezone('utc', now()) - (${hours}::text || ' hours')::interval
     and ss.report_projection_status = 'ready'
), topic as (
  select r.scan_id,
         r.completed_at,
         r.hostname,
         jsonb_object_agg(row_item->>'id', row_item->>'status') as row_statuses
    from recent r
    cross join lateral jsonb_array_elements(
      coalesce(r.report_projection_payload#>'{canonicalReportProjection,checklistRows}', '[]'::jsonb)
    ) row_item
   where row_item->>'id' = any(array[${topicRows.map((row) => `'${row}'`).join(", ")}])
   group by r.scan_id, r.completed_at, r.hostname
), policy_documents as (
  select r.scan_id,
         r.report_projection_payload#>>'{runtimeArtifacts,policy_disclosure_summary,policyTextEvidenceProjection,sourceBundle,verificationStatus}' as bundle_verification_status,
         count(document) filter (where document is not null)::int as document_count,
         count(document) filter (where document->>'documentFetchState' = 'fetched')::int as fetched_document_count,
         count(document) filter (where document->>'artifactVerificationStatus' = 'verified')::int as verified_document_count,
         count(document) filter (
           where document->>'artifactVerificationStatus' = 'verified'
             and document->>'extractionStatus' = 'complete'
         )::int as complete_verified_document_count,
         count(document) filter (
           where document->>'artifactVerificationStatus' = 'verified'
             and document->>'extractionStatus' = 'complete'
             and document->>'documentRole' = 'policy_document'
             and document->>'targetRelationship' in ('target_controller', 'first_party_brand')
         )::int as complete_owned_verified_document_count,
         count(document) filter (where document->>'extractionStatus' = 'thin')::int as thin_document_count,
         count(document) filter (where document->>'extractionStatus' = 'low_quality')::int as low_quality_document_count,
         max(coalesce((document->>'retainedTextChars')::int, 0))::int as max_retained_text_chars
    from recent r
    left join lateral jsonb_array_elements(coalesce(
      r.report_projection_payload#>'{runtimeArtifacts,policy_disclosure_summary,policyTextEvidenceProjection,documents}',
      '[]'::jsonb
    )) document on true
   group by r.scan_id, bundle_verification_status
), artifact_events as (
  select distinct on (scan_id)
         scan_id,
         metadata_json#>>'{artifactPointers,scanArtifactUri}' as scan_artifact_uri,
         metadata_json#>>'{artifactPointers,scanArtifactSha256}' as scan_artifact_sha256,
         metadata_json->>'resultStatus' as lambda_result_status
    from scan_events
   where scan_id in (select scan_id from recent)
     and event_type = 'v2_lambda_result.received'
   order by scan_id, created_at desc
), classified as (
  select t.*,
         p.bundle_verification_status,
         p.document_count,
         p.fetched_document_count,
         p.verified_document_count,
         p.complete_verified_document_count,
         p.complete_owned_verified_document_count,
         p.thin_document_count,
         p.low_quality_document_count,
         p.max_retained_text_chars,
         case
           when p.bundle_verification_status is null then 'wc01.policy_text_projection_missing'
           when p.bundle_verification_status <> 'verified' then 'retained_evidence.bundle_unverified'
           when p.document_count = 0 then 'ws01.policy_surface_not_observed'
           when p.fetched_document_count = 0 then 'ws01.policy_document_not_fetched'
           when p.complete_owned_verified_document_count > 0 then null
           when p.complete_verified_document_count > 0 then 'retained_evidence.target_ownership_or_governing_document_unverified'
           when p.thin_document_count > 0 then 'ws01.policy_text_thin'
           when p.low_quality_document_count > 0 then 'ws01.policy_text_low_quality'
           when p.verified_document_count = 0 then 'retained_evidence.policy_text_artifact_unverified'
           else 'ws01.policy_document_not_usable'
         end as first_broken_stage
    from topic t
    join policy_documents p on p.scan_id = t.scan_id
)
select jsonb_build_object(
  'reportVersion', 'certscore.gdpr_transparency_prod_policy_evidence_audit.1',
  'generatedAt', timezone('utc', now()),
  'windowHours', ${hours},
  'readOnly', true,
  'guardrails', jsonb_build_array(
    'Diagnostic only; no findings or projections are created or changed.',
    'Rows without verified usable evidence remain Not confirmed.',
    'No match found requires sufficient attributable coverage.'
  ),
  'completedProjectedScans', (select count(*) from recent),
  'classifiedNoUsablePolicyTextScans', count(*) filter (where c.first_broken_stage is not null),
  'stageCounts', coalesce((
    select jsonb_object_agg(first_broken_stage, stage_count)
      from (
        select first_broken_stage, count(*)::int as stage_count
          from classified
         where first_broken_stage is not null
         group by first_broken_stage
         order by first_broken_stage
      ) stage_summary
  ), '{}'::jsonb),
  'rows', coalesce(jsonb_agg(
    jsonb_build_object(
      'scanId', c.scan_id::text,
      'completedAt', c.completed_at,
      'hostname', c.hostname,
      'firstBrokenStage', c.first_broken_stage,
      'rowStatuses', c.row_statuses,
      'bundleVerificationStatus', c.bundle_verification_status,
      'documentCount', c.document_count,
      'fetchedDocumentCount', c.fetched_document_count,
      'verifiedDocumentCount', c.verified_document_count,
      'completeVerifiedDocumentCount', c.complete_verified_document_count,
      'completeOwnedVerifiedDocumentCount', c.complete_owned_verified_document_count,
      'thinDocumentCount', c.thin_document_count,
      'lowQualityDocumentCount', c.low_quality_document_count,
      'maxRetainedTextChars', c.max_retained_text_chars,
      'scanArtifactUri', ae.scan_artifact_uri,
      'scanArtifactSha256Present', ae.scan_artifact_sha256 is not null,
      'lambdaResultStatus', ae.lambda_result_status
    ) order by c.completed_at desc
  ) filter (where c.first_broken_stage is not null), '[]'::jsonb)
)
from classified c
left join artifact_events ae on ae.scan_id = c.scan_id;
`;

const diagnosticSql = `
with recent as (
  select ss.report_projection_payload
    from scans s
    join scan_snapshots ss on ss.scan_id = s.id
   where s.status = 'completed'
     and s.completed_at >= timezone('utc', now()) - (${hours}::text || ' hours')::interval
     and ss.report_projection_status = 'ready'
)
select jsonb_build_object(
  'completedProjectedScans', (select count(*) from recent),
  'payloadTypes', coalesce((
    select jsonb_object_agg(payload_type, payload_count)
      from (
        select coalesce(jsonb_typeof(report_projection_payload), 'sql_null') as payload_type,
               count(*)::int as payload_count
          from recent
         group by coalesce(jsonb_typeof(report_projection_payload), 'sql_null')
      ) payload_types
  ), '{}'::jsonb),
  'topLevelKeys', coalesce((
    select jsonb_object_agg(payload_key, key_count)
      from (
        select payload_key, count(*)::int as key_count
          from recent
          cross join lateral jsonb_object_keys(report_projection_payload) payload_key
         group by payload_key
      ) payload_keys
  ), '{}'::jsonb),
  'canonicalProjectionKeys', coalesce((
    select jsonb_object_agg(payload_key, key_count)
      from (
        select payload_key, count(*)::int as key_count
          from recent
          cross join lateral jsonb_object_keys(coalesce(report_projection_payload->'canonicalReportProjection', '{}'::jsonb)) payload_key
         group by payload_key
      ) payload_keys
  ), '{}'::jsonb)
);
`;

async function main() {
  const output = await prodDb.runProdDbSqlOneoff({
    marker: "GDPR_POLICY_EVIDENCE_AUDIT",
    readOnly: true,
    sql: diagnoseKeys ? diagnosticSql : sql,
  });
  const result = prodDb.parseSingleJsonOutput<Record<string, unknown>>(output);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({
    classifiedNoUsablePolicyTextScans: result.classifiedNoUsablePolicyTextScans,
    completedProjectedScans: result.completedProjectedScans,
    outPath,
    stageCounts: result.stageCounts,
  }, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
