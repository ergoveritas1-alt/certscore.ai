import { query } from "@website-signal-risk-scanner/db";
import { randomUUID } from "node:crypto";

let ensureScanRequestLogTablePromise: Promise<void> | null = null;

export type ScanRequestStatus = "queued" | "reused_recent_scan" | "rejected" | "failed";

export type RecordScanRequestInput = {
  errorCode?: string | null;
  errorMessage?: string | null;
  fulfilledByScanId?: string | null;
  normalizedDomain?: string | null;
  normalizedUrl?: string | null;
  organizationId?: string | null;
  requestChannel?: string | null;
  requestContext?: Record<string, unknown> | null;
  requestedBy?: Record<string, unknown> | null;
  requestedUrl?: string | null;
  requestType?: string;
  resolutionMode?: string | null;
  reusedCompletedAt?: string | null;
  reuseWindowHours?: number | null;
  scanId?: string | null;
  status: ScanRequestStatus;
};

async function createScanRequestLogTable() {
  await query(`
    create table if not exists public.scan_requests (
      id uuid primary key default gen_random_uuid(),
      public_id text not null unique,
      request_type text not null default 'full_scan',
      request_channel text not null default 'web_full_scan',
      requested_url text,
      normalized_url text,
      normalized_domain text,
      organization_id uuid references public.organizations (id) on delete set null,
      requested_by jsonb not null default '{}'::jsonb,
      request_context jsonb not null default '{}'::jsonb,
      status text not null default 'queued',
      resolution_mode text,
      scan_id uuid references public.scans (id) on delete set null,
      fulfilled_by_scan_id uuid references public.scans (id) on delete set null,
      reuse_window_hours integer,
      reused_completed_at timestamptz,
      error_code text,
      error_message text,
      requested_at timestamptz not null default now(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index if not exists scan_requests_requested_at_idx
      on public.scan_requests (requested_at desc);

    create index if not exists scan_requests_normalized_domain_requested_at_idx
      on public.scan_requests (normalized_domain, requested_at desc);

    create index if not exists scan_requests_scan_id_idx
      on public.scan_requests (scan_id);

    create index if not exists scan_requests_fulfilled_by_scan_id_idx
      on public.scan_requests (fulfilled_by_scan_id);

    create index if not exists scan_requests_status_requested_at_idx
      on public.scan_requests (status, requested_at desc);
  `);
}

export async function ensureScanRequestLogTable() {
  ensureScanRequestLogTablePromise ??= createScanRequestLogTable().catch((error) => {
    ensureScanRequestLogTablePromise = null;
    throw error;
  });

  return ensureScanRequestLogTablePromise;
}

export function createScanRequestPublicId() {
  return `scan_req_${randomUUID()}`;
}

export async function recordScanRequest(input: RecordScanRequestInput) {
  await ensureScanRequestLogTable();
  const publicId = createScanRequestPublicId();
  await query(
    `insert into public.scan_requests (
       public_id, request_type, request_channel, requested_url, normalized_url, normalized_domain,
       organization_id, requested_by, request_context, status, resolution_mode, scan_id,
       fulfilled_by_scan_id, reuse_window_hours, reused_completed_at, error_code, error_message
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12, $13, $14, $15, $16, $17)`,
    [
      publicId,
      input.requestType ?? "full_scan",
      input.requestChannel ?? "web_full_scan",
      input.requestedUrl ?? null,
      input.normalizedUrl ?? null,
      input.normalizedDomain ?? null,
      input.organizationId ?? null,
      JSON.stringify(input.requestedBy ?? {}),
      JSON.stringify(input.requestContext ?? {}),
      input.status,
      input.resolutionMode ?? null,
      input.scanId ?? null,
      input.fulfilledByScanId ?? input.scanId ?? null,
      input.reuseWindowHours ?? null,
      input.reusedCompletedAt ?? null,
      input.errorCode ?? null,
      input.errorMessage ?? null
    ]
  );
  return publicId;
}

export function logScanRequestFailure(context: string, error: unknown) {
  console.error("[web] scan request activity logging failed", {
    context,
    error: error instanceof Error ? error.message : String(error)
  });
}
