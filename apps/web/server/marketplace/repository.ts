import "server-only";
import { randomBytes } from "node:crypto";
import { query, queryOne, withWriteTransaction } from "@website-signal-risk-scanner/db";
import { generateIntegrationApiKey, hashIntegrationApiKey } from "../integrations/api-keys";
import { marketplaceKeyPattern, type ResolvedCustomer, type LicenseEvent } from "./contracts";

export async function createMarketplaceClaim(customer: ResolvedCustomer) {
  const claim = randomBytes(32).toString("base64url");
  await withWriteTransaction(async client => {
    await client.query(`insert into marketplace_light_licenses (license_arn, product_code, buyer_account_id)
      values ($1, $2, $3) on conflict (license_arn) do nothing`,
    [customer.LicenseArn, customer.ProductCode, customer.CustomerAWSAccountId]);
    const binding = await client.query(`select license_arn from marketplace_light_licenses
      where license_arn=$1 and product_code=$2 and buyer_account_id=$3`,
    [customer.LicenseArn, customer.ProductCode, customer.CustomerAWSAccountId]);
    if (!binding.rowCount) throw new Error("Marketplace identity mismatch.");
    await client.query(`delete from marketplace_light_claims where expires_at < now()`);
    await client.query(`insert into marketplace_light_claims (token_hash, license_arn, expires_at)
      values ($1, $2, now() + interval '30 minutes')`, [hashIntegrationApiKey(claim), customer.LicenseArn]);
  });
  return claim;
}

export async function getMarketplaceClaim(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return queryOne<{ buyer_account_id: string }>(`select l.buyer_account_id
    from marketplace_light_claims c join marketplace_light_licenses l using (license_arn)
    where c.token_hash=$1 and c.expires_at>now() and c.consumed_at is null`, [hashIntegrationApiKey(token)]);
}

export async function claimMarketplaceLicense(token: string, userId: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error("Return to AWS Marketplace to set up your account.");
  await withWriteTransaction(async client => {
    const result = await client.query<{ license_arn: string; owner_user_id: string | null }>(`select c.license_arn, l.owner_user_id
      from marketplace_light_claims c join marketplace_light_licenses l using (license_arn)
      where c.token_hash=$1 and c.expires_at>now() and c.consumed_at is null for update of c, l`, [hashIntegrationApiKey(token)]);
    const row = result.rows[0];
    if (!row || (row.owner_user_id && row.owner_user_id !== userId)) throw new Error("This setup link is expired or already linked to another account.");
    await client.query(`update marketplace_light_licenses set owner_user_id=$2 where license_arn=$1`, [row.license_arn, userId]);
    await client.query(`update marketplace_light_claims set consumed_at=now() where token_hash=$1`, [hashIntegrationApiKey(token)]);
  });
}

export async function rotateMarketplaceKey(licenseArn: string, userId: string) {
  const token = generateIntegrationApiKey("cs_mp_light");
  await withWriteTransaction(async client => {
    const row = await client.query(`select license_arn from marketplace_light_licenses where license_arn=$1
      and owner_user_id=$2 and status='active' and (expires_at is null or expires_at>now()) for update`, [licenseArn, userId]);
    if (!row.rowCount) throw new Error("An active Marketplace subscription linked to your account is required.");
    await client.query(`insert into marketplace_light_keys (license_arn, token_hash, token_prefix, expires_at)
      values ($1, $2, $3, now() + interval '90 days') on conflict (license_arn) do update
      set token_hash=excluded.token_hash, token_prefix=excluded.token_prefix, expires_at=excluded.expires_at,
      created_at=now(), revoked_at=null`, [licenseArn, hashIntegrationApiKey(token), token.slice(0, 20)]);
  });
  return token;
}

export async function revokeMarketplaceKey(licenseArn: string, userId: string) {
  await query(`update marketplace_light_keys k set revoked_at=now() from marketplace_light_licenses l
    where k.license_arn=l.license_arn and l.license_arn=$1 and l.owner_user_id=$2`, [licenseArn, userId]);
}

export async function validateMarketplaceKey(token: string) {
  if (!marketplaceKeyPattern.test(token)) return false;
  const row = await queryOne(`select k.license_arn from marketplace_light_keys k
    join marketplace_light_licenses l using (license_arn)
    where k.token_hash=$1 and k.revoked_at is null and k.expires_at>now()
    and l.status='active' and (l.expires_at is null or l.expires_at>now())`, [hashIntegrationApiKey(token)]);
  return Boolean(row);
}

export function listMarketplaceLicenses(userId: string) {
  return query<{ license_arn: string; buyer_account_id: string; status: string; token_prefix: string | null; revoked_at: string | null; key_expires_at: string | null }>(
    `select l.license_arn, l.buyer_account_id, l.status, k.token_prefix, k.revoked_at, k.expires_at as key_expires_at
    from marketplace_light_licenses l left join marketplace_light_keys k using (license_arn)
    where l.owner_user_id=$1 order by l.created_at desc limit 100`, [userId]);
}

export async function applyLicenseEvent(event: LicenseEvent, active: boolean, expiresAt: Date | null) {
  const d = event.detail;
  const status = event["detail-type"] === "License Deprovisioned - Manufacturer" ? "revoked" : active ? "active" : "inactive";
  await withWriteTransaction(async client => {
    // License-specific ordering: a deprovisioned license never reactivates from a late update.
    await client.query(`insert into marketplace_light_licenses
      (license_arn, product_code, buyer_account_id, agreement_id, status, expires_at, event_at)
      values ($1,$2,$3,$4,$5,$6,$7)
      on conflict (license_arn) do update set agreement_id=excluded.agreement_id, status=excluded.status,
      expires_at=excluded.expires_at, event_at=excluded.event_at
      where marketplace_light_licenses.product_code=excluded.product_code
      and marketplace_light_licenses.buyer_account_id=excluded.buyer_account_id
      and marketplace_light_licenses.status<>'revoked'
      and (excluded.status='revoked' or marketplace_light_licenses.event_at is null or marketplace_light_licenses.event_at<excluded.event_at)`,
    [d.license.arn, d.product.code, d.acceptor.accountId, d.agreement.id, status, expiresAt, event.time]);
    // Disable old keys permanently; a later valid update requires the buyer to rotate.
    await client.query(`update marketplace_light_keys k set revoked_at=coalesce(k.revoked_at, now())
      from marketplace_light_licenses l where k.license_arn=l.license_arn and l.license_arn=$1 and l.status<>'active'`, [d.license.arn]);
  });
}
