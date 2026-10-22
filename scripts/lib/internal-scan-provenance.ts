/** Service-owned verification manifests only; never accept a request body here. */
export type InternalScanProvenanceRun = {
  runKey: string;
  source: string;
  rows: Array<{ scanId: string; sourceScanId: string }>;
  requireAll?: boolean;
  /** Queue scripts already retain these same IDs in a service-owned temp table. */
  manifestTable?: "pg_temp.proof_rerun_input";
};

export function internalScanProvenanceSql(run: InternalScanProvenanceRun): string {
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  if (!/^[a-z0-9][a-z0-9_-]{0,127}$/i.test(run.runKey)
    || run.source !== "operator-post-reject-proof-verification"
    || (run.manifestTable !== undefined && run.manifestTable !== "pg_temp.proof_rerun_input")
    || !run.rows.length || run.rows.length > 100
    || new Set(run.rows.map(r => r.scanId)).size !== run.rows.length
    || run.rows.some(r => !uuid.test(r.scanId) || !uuid.test(r.sourceScanId) || r.scanId === r.sourceScanId)) {
    throw new Error("Invalid service-owned verification manifest");
  }
  const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
  const expected = run.manifestTable
    ? `select id as "scanId",source as "sourceScanId" from pg_temp.proof_rerun_input`
    : `select * from jsonb_to_recordset(${literal(JSON.stringify(run.rows))}::jsonb)
    as manifest("scanId" uuid, "sourceScanId" uuid)`;
  const projection = JSON.stringify({version: 1, class: "internal", basis: "operator_verification_run", runKey: run.runKey});
  // Configuration alone is insufficient: require the exact trusted manifest and
  // independently retained queue event, with no API/browser request association.
  const eligible = `s.scan_config_json->>'source' = ${literal(run.source)}
    and s.scan_config_json #>> '{ownerVerification,runKey}' = ${literal(run.runKey)}
    and s.scan_config_json #>> '{ownerVerification,sourceScanId}' = manifest."sourceScanId"::text
    and s.submitted_by_user_id is null
    and (s.activity_traffic->>'class' = 'unknown' or s.activity_traffic = ${literal(projection)}::jsonb)
    and exists (select 1 from public.scan_events e where e.scan_id=s.id
      and e.event_type='full_scan.queued'
      and e.metadata_json->>'runKey' = ${literal(run.runKey)}
      and e.metadata_json->>'sourceScanId' = manifest."sourceScanId"::text)
    and not exists (select 1 from public.scan_requests r where coalesce(r.fulfilled_by_scan_id,r.scan_id)=s.id)
    and not exists (select 1 from public.pulse_requests r where r.scan_id=s.id)`;
  return `do $internal_scan_provenance$
begin
  perform s.id from public.scans s join (${expected}) manifest on s.id=manifest."scanId" for update of s;
  if exists (select 1 from (${expected}) manifest left join public.scans s on s.id=manifest."scanId"
    where ${run.requireAll === false ? "s.id is not null and" : "s.id is null or"} not coalesce((${eligible}), false)) then
    raise exception 'Internal scan provenance manifest failed verification';
  end if;
  with changed as (
    update public.scans s set activity_traffic=${literal(projection)}::jsonb
    from (${expected}) manifest
    where s.id=manifest."scanId" and ${eligible} and s.activity_traffic->>'class'='unknown'
    returning s.id,s.domain_id,s.organization_id
  ) insert into public.scan_events(scan_id,domain_id,organization_id,event_type,message,metadata_json)
    select id,domain_id,organization_id,'admin.activity_provenance.corrected',
      'Internal verification provenance registered.',
      jsonb_build_object('runKey',${literal(run.runKey)},'activityTraffic',${literal(projection)}::jsonb,
        'policy','operator_verification_run.v1','previousClass','unknown') from changed;
end $internal_scan_provenance$;`;
}
