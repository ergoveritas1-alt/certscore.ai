alter table public.scan_model_review_artifacts
  alter column source_document_ids type text[]
  using source_document_ids::text[];

comment on column public.scan_model_review_artifacts.source_document_ids is
  'Bounded retained-evidence identifiers. Values may be UUID document rows or canonical v2 observation IDs.';
