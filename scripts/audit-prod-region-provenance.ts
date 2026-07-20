import { writeFile } from "node:fs/promises";
import * as prodDbNamespace from "./lib/prod-db-psql-oneoff.ts";

const prodDb = (prodDbNamespace as typeof prodDbNamespace & { default?: typeof prodDbNamespace }).default ?? prodDbNamespace;
const sql = `
with candidates as (
  select s.id as scan_id, s.completed_at, coalesce(nullif(d.normalized_url, ''), 'https://' || d.hostname) as url,
    coalesce(nullif(se.metadata_json->>'awsRegion', ''), nullif(s.scan_config_json#>>'{execution,v2DagLambda,awsRegion}', ''), 'unknown') as region,
    se.metadata_json->'artifactPointers'->>'scanArtifactUri' as scan_artifact_uri,
    row_number() over (partition by coalesce(nullif(se.metadata_json->>'awsRegion', ''), nullif(s.scan_config_json#>>'{execution,v2DagLambda,awsRegion}', ''), 'unknown') order by s.completed_at desc) as region_rank
  from scans s
  join domains d on d.id = s.domain_id
  left join scan_snapshots ss on ss.scan_id = s.id
  left join scan_runtime_artifacts sra on sra.scan_id = s.id
  left join lateral (
    select metadata_json from scan_events
    where scan_id = s.id and event_type = 'v2_lambda_result.received'
    order by created_at desc limit 1
  ) se on true
  where s.created_at >= now() - interval '240 days'
    and s.status = 'completed'
    and s.scan_config_json->>'processor' = 'local-certscore-v2-dag-parallel-v1'
    and d.hostname not in ('sits.com', 'example.com', 'example.org')
    and coalesce(sra.scan_no_go_assessment->>'decision', '') <> 'no_go'
    and coalesce(ss.scan_outcome, '') not in ('no_go')
    and coalesce(ss.scan_outcome, '') not like 'reachability_blocked%'
    and coalesce(ss.access_posture_class, '') <> 'early_loss'
)
select scan_id, completed_at, url, region, scan_artifact_uri
from candidates where region_rank <= 8 order by region, region_rank;
`;

async function main() {
  const result = await prodDb.runProdDbSqlOneoff({ marker: "GDPR_REGION_PROVENANCE", readOnly: true, sql });
  await writeFile("artifacts/gdpr-transparency-prod-region-provenance.json", `${JSON.stringify({ generatedAt: new Date().toISOString(), readOnly: true, result }, null, 2)}\n`);
  console.log(result);
}
void main().catch((error: unknown) => { console.error(error instanceof Error ? error.stack ?? error.message : String(error)); process.exitCode = 1; });
