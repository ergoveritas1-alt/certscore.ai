alter table if exists public.scan_snapshots
  add column if not exists admin_evidence_matrix jsonb;

comment on column public.scan_snapshots.admin_evidence_matrix is
  'Bounded versioned Admin scan-row projection derived from the persisted canonical report/checklist; never raw scanner evidence.';
