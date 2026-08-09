import {
  parseSingleJsonOutput,
  runProdDbSqlOneoff,
} from "./lib/prod-db-psql-oneoff.js";

type MiniCacheTelemetry = {
  byKind: Array<{
    artifacts: number;
    cacheHits: number;
    cachedCompletionTokens: number;
    cachedPromptTokens: number;
    reviewKind: string;
    totalCompletionTokens: number;
    totalPromptTokens: number;
  }>;
  deployedAt: string;
  last24Hours: number;
  last24HoursCacheHits: number;
  latest: Array<{
    cacheHit: boolean;
    cachedPromptTokens: number | null;
    promptTokens: number | null;
    requestedModel: string;
    resolvedModel: string;
    reviewKind: string;
    reviewStatus: string;
    scanId: string;
    updatedAt: string;
  }>;
  sinceDeploy: number;
  sinceDeployCacheHits: number;
};

async function main() {
  const deployedAt = "2026-08-09T02:23:35Z";
  const output = await runProdDbSqlOneoff({
  marker: "MINI_CACHE_TELEMETRY",
  readOnly: true,
  sql: `
    select json_build_object(
      'deployedAt', '${deployedAt}',
      'byKind', coalesce((
        select json_agg(row_to_json(kind_summary) order by "reviewKind")
        from (
          select
            review_kind as "reviewKind",
            count(*)::integer as artifacts,
            count(*) filter (
              where coalesce((metrics_json->>'cacheHit')::boolean, false)
            )::integer as "cacheHits",
            coalesce(sum((metrics_json->>'promptTokens')::integer), 0)::integer as "totalPromptTokens",
            coalesce(sum((metrics_json->>'completionTokens')::integer), 0)::integer as "totalCompletionTokens",
            coalesce(sum((metrics_json->>'promptTokens')::integer) filter (
              where coalesce((metrics_json->>'cacheHit')::boolean, false)
            ), 0)::integer as "cachedPromptTokens",
            coalesce(sum((metrics_json->>'completionTokens')::integer) filter (
              where coalesce((metrics_json->>'cacheHit')::boolean, false)
            ), 0)::integer as "cachedCompletionTokens"
          from scan_model_review_artifacts
          where updated_at >= now() - interval '24 hours'
            and review_kind in ('policy_semantic', 'policy_semantic_static')
          group by review_kind
        ) kind_summary
      ), '[]'::json),
      'sinceDeploy', (
        select count(*)
        from scan_model_review_artifacts
        where updated_at >= timestamptz '${deployedAt}'
          and review_kind in ('policy_semantic', 'policy_semantic_static')
      ),
      'sinceDeployCacheHits', (
        select count(*)
        from scan_model_review_artifacts
        where updated_at >= timestamptz '${deployedAt}'
          and review_kind in ('policy_semantic', 'policy_semantic_static')
          and coalesce((metrics_json->>'cacheHit')::boolean, false)
      ),
      'last24Hours', (
        select count(*)
        from scan_model_review_artifacts
        where updated_at >= now() - interval '24 hours'
          and review_kind in ('policy_semantic', 'policy_semantic_static')
      ),
      'last24HoursCacheHits', (
        select count(*)
        from scan_model_review_artifacts
        where updated_at >= now() - interval '24 hours'
          and review_kind in ('policy_semantic', 'policy_semantic_static')
          and coalesce((metrics_json->>'cacheHit')::boolean, false)
      ),
      'latest', coalesce((
        select json_agg(row_to_json(recent))
        from (
          select
            scan_id as "scanId",
            review_kind as "reviewKind",
            review_status as "reviewStatus",
            requested_model as "requestedModel",
            resolved_model as "resolvedModel",
            updated_at as "updatedAt",
            coalesce((metrics_json->>'cacheHit')::boolean, false) as "cacheHit",
            (metrics_json->>'promptTokens')::integer as "promptTokens",
            (metrics_json->>'cachedPromptTokens')::integer as "cachedPromptTokens"
          from scan_model_review_artifacts
          where review_kind in ('policy_semantic', 'policy_semantic_static')
          order by updated_at desc
          limit 20
        ) recent
      ), '[]'::json)
    );
  `,
  });

  const telemetry = parseSingleJsonOutput<MiniCacheTelemetry>(output);
  console.log(JSON.stringify(telemetry, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
