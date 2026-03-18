alter table public.validation_run_findings
  add column if not exists finding_family text,
  add column if not exists finding_source text,
  add column if not exists finding_scope text,
  add column if not exists finding_subject text;

update public.validation_run_findings
set
  finding_family = case
    when rule_key like 'scan_report_review.%' or subtype = 'policy_review_queue' then 'policy_review_queue'
    when rule_key like 'section_review.%' then 'policy_section_review'
    when rule_key like 'accessibility_review.%' then 'accessibility_review'
    else coalesce(finding_family, category)
  end,
  finding_source = case
    when rule_key like 'scan_report_review.%' or subtype = 'policy_review_queue' then 'policy_review_queue'
    when rule_key like 'section_review.%' then 'policy_enrichment'
    when rule_key like 'accessibility_review.%' then 'snapshot_accessibility'
    else coalesce(finding_source, 'unknown')
  end,
  finding_scope = case
    when rule_key like 'accessibility_review.%' then 'site'
    when rule_key like 'scan_report_review.%' or rule_key like 'section_review.%' then 'page'
    else coalesce(finding_scope, 'unknown')
  end,
  finding_subject = case
    when rule_key like 'scan_report_review.%' then 'disclosure'
    when rule_key like 'section_review.%' then 'privacy'
    when rule_key like 'accessibility_review.%' then 'accessibility'
    else coalesce(finding_subject, 'unknown')
  end
where
  finding_family is null
  or finding_source is null
  or finding_scope is null
  or finding_subject is null;

create index if not exists validation_run_findings_family_idx
  on public.validation_run_findings (finding_family, created_at desc);
