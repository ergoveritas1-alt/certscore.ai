#!/usr/bin/env node

const CLOUDFLARE_API_BASE_URL = "https://api.cloudflare.com/client/v4";
const DOMAIN_NAME = "certscore.ai";
const RECORD_TYPE = "TXT";
const RECORD_CONTENT = "openai-domain-verification=dv-Ytf3BpLI3fIQCGAN5sz4EoSU";
const RECORD_TTL = 300;
const RECORD_COMMENT = "OpenAI Admin domain verification for CertScore workspace";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function summarizeRecord(record) {
  return `id=${record.id} name=${record.name} type=${record.type}`;
}

async function cloudflareRequest(path, options = {}) {
  const apiToken = requiredEnv("CLOUDFLARE_API_TOKEN");
  const response = await fetch(`${CLOUDFLARE_API_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    }
  });

  const body = await response.json().catch(() => null);
  if (!response.ok || body?.success === false) {
    const messages = Array.isArray(body?.errors)
      ? body.errors.map((error) => error.message).filter(Boolean).join("; ")
      : "";
    throw new Error(`Cloudflare API request failed (${response.status}): ${messages || response.statusText}`);
  }

  return body;
}

async function listApexTxtRecords(zoneId) {
  const params = new URLSearchParams({
    type: RECORD_TYPE,
    name: DOMAIN_NAME,
    per_page: "100"
  });
  const body = await cloudflareRequest(`/zones/${zoneId}/dns_records?${params.toString()}`);
  return Array.isArray(body.result) ? body.result : [];
}

async function createOpenAiVerificationRecord(zoneId) {
  const body = await cloudflareRequest(`/zones/${zoneId}/dns_records`, {
    method: "POST",
    body: JSON.stringify({
      type: RECORD_TYPE,
      name: DOMAIN_NAME,
      content: RECORD_CONTENT,
      ttl: RECORD_TTL,
      comment: RECORD_COMMENT
    })
  });
  return body.result;
}

async function main() {
  const zoneId = requiredEnv("CLOUDFLARE_ZONE_ID");

  // One-off OpenAI Admin domain verification for the CertScore workspace.
  // This intentionally leaves all other apex TXT records untouched.
  const existingRecords = await listApexTxtRecords(zoneId);
  const existingVerificationRecord = existingRecords.find((record) => record.content === RECORD_CONTENT);

  if (existingVerificationRecord) {
    console.info(`OpenAI domain verification TXT already exists (${summarizeRecord(existingVerificationRecord)})`);
    return;
  }

  const createdRecord = await createOpenAiVerificationRecord(zoneId);
  console.info(`Created OpenAI domain verification TXT (${summarizeRecord(createdRecord)})`);

  const verifiedRecords = await listApexTxtRecords(zoneId);
  const verifiedRecord = verifiedRecords.find((record) => record.content === RECORD_CONTENT);
  if (!verifiedRecord) {
    throw new Error("Cloudflare accepted the create request, but the TXT record was not found on verification query");
  }

  console.info(`Verified OpenAI domain verification TXT exists (${summarizeRecord(verifiedRecord)})`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to add OpenAI domain verification TXT: ${message}`);
  process.exit(1);
});
