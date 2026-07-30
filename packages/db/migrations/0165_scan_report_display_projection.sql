alter table if exists public.scan_snapshots
  add column if not exists report_projection_payload jsonb,
  add column if not exists report_projection_payload_sha256 text,
  add column if not exists report_projection_payload_size_bytes integer;

comment on column public.scan_snapshots.report_projection_payload is
  'Bounded, display-ready scan detail projection. This is derived from canonical retained evidence and does not replace the evidence source.';

comment on column public.scan_snapshots.report_projection_payload_sha256 is
  'SHA-256 of the canonical JSON serialization of report_projection_payload.';

comment on column public.scan_snapshots.report_projection_payload_size_bytes is
  'Canonical serialized byte size used to enforce the bounded report projection contract.';
