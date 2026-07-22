"use server";

import { queryOne } from "@website-signal-risk-scanner/db";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/i;

function canonicalFingerprint(value: string, label: string) {
  const normalized = value.trim().toLowerCase();
  if (!SHA256_PATTERN.test(normalized)) throw new Error(`${label} must be a SHA-256 digest.`);
  return normalized.startsWith("sha256:") ? normalized : `sha256:${normalized}`;
}

function boundedModelVersion(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 120) {
    throw new Error("modelVersion must contain between 1 and 120 characters.");
  }
  return normalized;
}

function scanId(value: string, label: string) {
  const normalized = value.trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) throw new Error(`${label} must be a UUID.`);
  return normalized;
}

type PairRegistrationRow = { registered: boolean };

export async function registerCanonicalShadowScoreCollectionPair(input: {
  browserScanId: string;
  lambdaScanId: string;
  modelVersion: string;
  pairKey: string;
}) {
  const pairKey = canonicalFingerprint(input.pairKey, "pairKey");
  const modelVersion = boundedModelVersion(input.modelVersion);
  const lambdaScanId = scanId(input.lambdaScanId, "lambdaScanId");
  const browserScanId = scanId(input.browserScanId, "browserScanId");
  if (lambdaScanId === browserScanId) throw new Error("Pair members must be different scans.");

  const row = await queryOne<PairRegistrationRow>(
    `with locks as materialized (
       select pg_advisory_xact_lock(hashtextextended(value, 0))
         from unnest(array[$4, $1::text, $2::text]) as lock_value(value)
        order by value
     ), candidates as (
       select lambda.scan_id as lambda_scan_id,
              browser.scan_id as browser_scan_id,
              lambda.model_version,
              lambda.comparison_group_key,
              lambda.comparison_target_key
         from public.scan_score_shadow_comparisons lambda
         cross join (select count(*) from locks) lock_guard
         join public.scan_score_shadow_comparisons browser
           on browser.model_version = lambda.model_version
          and browser.comparison_group_key = lambda.comparison_group_key
          and browser.comparison_target_key = lambda.comparison_target_key
        where lambda.scan_id = $1::uuid
          and browser.scan_id = $2::uuid
          and lambda.model_version = $3
          and lambda.comparison_group_key is not null
          and lambda.comparison_target_key is not null
          and lambda.input_projection_fingerprint is not null
          and browser.input_projection_fingerprint is not null
          and lambda.coverage_projection_fingerprint is not null
          and browser.coverage_projection_fingerprint is not null
          and lambda.finding_projection_fingerprint is not null
          and browser.finding_projection_fingerprint is not null
          and lambda.coverage_projection_row_count is not null
          and browser.coverage_projection_row_count is not null
          and lambda.finding_projection_count is not null
          and browser.finding_projection_count is not null
          and lower(lambda.scan_source) in ('default', 'eu_de', 'eu_ie', 'california', 'lambda')
          and lower(browser.scan_source) in ('browser_extension', 'local_extension')
          and not exists (
            select 1 from public.score_shadow_collection_pair_members member
             where member.scan_id = lambda.scan_id
               and member.model_version = lambda.model_version
               and member.pair_key <> $4
          )
          and not exists (
            select 1 from public.score_shadow_collection_pair_members member
             where member.scan_id = browser.scan_id
               and member.model_version = browser.model_version
               and member.pair_key <> $4
          )
     ), pair_insert as (
       insert into public.score_shadow_collection_pairs (
         pair_key, model_version, comparison_group_key, comparison_target_key
       )
       select $4, model_version, comparison_group_key, comparison_target_key
         from candidates
       on conflict (pair_key) do nothing
       returning pair_key, model_version, comparison_group_key, comparison_target_key, state
     ), effective_pairs as (
       select pair_key, model_version, comparison_group_key, comparison_target_key, state
         from pair_insert
       union all
       select pair.pair_key, pair.model_version, pair.comparison_group_key,
              pair.comparison_target_key, pair.state
         from public.score_shadow_collection_pairs pair
         join candidates candidate
           on candidate.model_version = pair.model_version
          and candidate.comparison_group_key = pair.comparison_group_key
          and candidate.comparison_target_key = pair.comparison_target_key
        where pair.pair_key = $4
          and pair.state = 'active'
     ), pair_ready as (
       select pair_key from effective_pairs
     ), member_insert as (
       insert into public.score_shadow_collection_pair_members (
         pair_key, model_version, scan_id, source_family
       )
       select $4, candidate.model_version, candidate.lambda_scan_id, 'lambda'
         from candidates candidate cross join pair_ready
       union all
       select $4, candidate.model_version, candidate.browser_scan_id, 'browser_extension'
         from candidates candidate cross join pair_ready
       on conflict do nothing
       returning pair_key, model_version, scan_id, source_family
     ), effective_members as (
       select pair_key, model_version, scan_id, source_family from member_insert
       union all
       select member.pair_key, member.model_version, member.scan_id, member.source_family
         from public.score_shadow_collection_pair_members member
        where member.pair_key = $4
          and member.model_version = $3
     )
     select exists (
       select 1
         from effective_pairs pair
         join candidates candidate
           on candidate.model_version = pair.model_version
          and candidate.comparison_group_key = pair.comparison_group_key
          and candidate.comparison_target_key = pair.comparison_target_key
        where pair.pair_key = $4
          and pair.state = 'active'
          and (select count(*) from effective_members member
                where member.pair_key = pair.pair_key
                  and member.model_version = pair.model_version) = 2
          and exists (select 1 from effective_members member
                       where member.pair_key = pair.pair_key and member.scan_id = candidate.lambda_scan_id
                         and member.source_family = 'lambda')
          and exists (select 1 from effective_members member
                       where member.pair_key = pair.pair_key and member.scan_id = candidate.browser_scan_id
                         and member.source_family = 'browser_extension')
     ) as registered`,
    [lambdaScanId, browserScanId, modelVersion, pairKey]
  );

  if (!row?.registered) {
    throw new Error("Pair registration failed closed: scans must have complete shadow rows for the same exact target and model with one Lambda and one browser-extension source.");
  }
  return { pairKey, registered: true as const };
}
