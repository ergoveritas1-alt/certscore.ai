create table if not exists public.scan_document_sources (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans (id) on delete cascade,
  source text not null default 'nano_doc_retrieval',
  source_status text not null default 'ready' check (source_status in ('candidate', 'ready', 'failed', 'rejected')),
  document_type text not null,
  source_url text,
  canonical_url text,
  title text,
  document_text text,
  extraction_status text not null default 'pending' check (extraction_status in ('pending', 'ready', 'failed', 'insufficient')),
  semantic_confidence real,
  evidence_refs text[] not null default '{}',
  extracted_fields_json jsonb not null default '{}'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists scan_document_sources_scan_id_idx
  on public.scan_document_sources (scan_id, document_type, source_status);

alter table public.scan_document_sources enable row level security;

drop policy if exists scan_document_sources_select_member on public.scan_document_sources;
create policy scan_document_sources_select_member
on public.scan_document_sources
for select
to authenticated
using (
  exists (
    select 1
    from public.scans
    where scans.id = scan_document_sources.scan_id
      and scans.organization_id is not null
      and public.is_current_user_member_of_organization(scans.organization_id)
  )
);
