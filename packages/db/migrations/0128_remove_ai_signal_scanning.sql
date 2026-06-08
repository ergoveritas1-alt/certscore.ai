alter table if exists public.scan_snapshots
  drop column if exists mentions_automated_decisioning,
  drop column if exists mentions_ai_usage,
  drop column if exists ai_chatbot_present,
  drop column if exists ai_chatbot_vendor,
  drop column if exists ai_assistant_widget_detected,
  drop column if exists ai_disclosure_text_present,
  drop column if exists ai_terms_or_policy_ai_reference,
  drop column if exists ai_help_center_ai_reference,
  drop column if exists ai_search_or_answer_experience_detected,
  drop column if exists ai_hiring_automation_signal_detected,
  drop column if exists ai_trading_language_present;

delete from public.scan_signal_hits
where signal_key = any(array[
  'financial.ai_trading_or_automated_trading_language_present',
  'ai.flow_tracking_review_signal'
])
or signal_key like 'ai.%';

delete from public.scan_signals
where signal_key = any(array[
  'commerce.ai_chatbot_present',
  'commerce.ai_assistant_widget_detected',
  'commerce.ai_disclosure_text_present',
  'commerce.ai_terms_or_policy_ai_reference',
  'commerce.ai_help_center_ai_reference',
  'commerce.ai_search_or_answer_experience_detected',
  'commerce.ai_hiring_automation_signal_detected',
  'financial.ai_trading_or_automated_trading_language_present',
  'ai.flow_tracking_review_signal'
])
or signal_key like 'ai.%';

do $$
declare
  removed_finding_ids text[] := array[
    'ai_feature_claim_present',
    'ai_marketing_disclosure_alignment_review',
    'ai_interaction_disclosure_present',
    'ai_transparency_notice_present',
    'ai_generated_content_label_present',
    'ai_automated_decision_disclosure_present',
    'ai_human_review_path_present',
    'ai_sensitive_context_review_signal',
    'ai_surface_tracking_review_signal',
    'ai_financial_advice_or_trading_claims_without_disclosure'
  ];
begin
  if to_regclass('public.validation_run_findings') is not null then
    delete from public.validation_run_findings
    where rule_key = any(removed_finding_ids)
       or evidence_json->>'unifiedFindingId' = any(removed_finding_ids)
       or evidence_json->>'unified_finding_id' = any(removed_finding_ids)
       or evidence_json->>'findingId' = any(removed_finding_ids)
       or evidence_json->>'finding_id' = any(removed_finding_ids);
  end if;
end $$;

do $$
begin
  if to_regclass('public.scan_document_sources') is not null
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'scan_document_sources'
         and column_name = 'extracted_fields_json'
     ) then
    update public.scan_document_sources
    set extracted_fields_json = extracted_fields_json - array[
      'ai_automated_decision_disclosure_present',
      'aiAutomatedDecisionDisclosurePresent',
      'ai_feature_claims',
      'aiFeatureClaims',
      'ai_generated_content_label_present',
      'aiGeneratedContentLabelPresent',
      'ai_human_review_path_present',
      'aiHumanReviewPathPresent',
      'ai_interaction_disclosure_present',
      'aiInteractionDisclosurePresent',
      'ai_sensitive_contexts',
      'aiSensitiveContexts',
      'ai_transparency_notice_present',
      'aiTransparencyNoticePresent'
    ]
    where extracted_fields_json ?| array[
      'ai_automated_decision_disclosure_present',
      'aiAutomatedDecisionDisclosurePresent',
      'ai_feature_claims',
      'aiFeatureClaims',
      'ai_generated_content_label_present',
      'aiGeneratedContentLabelPresent',
      'ai_human_review_path_present',
      'aiHumanReviewPathPresent',
      'ai_interaction_disclosure_present',
      'aiInteractionDisclosurePresent',
      'ai_sensitive_contexts',
      'aiSensitiveContexts',
      'ai_transparency_notice_present',
      'aiTransparencyNoticePresent'
    ];
  end if;
end $$;

create or replace function pg_temp.certscore_strip_ai_finding_array(value jsonb, removed_finding_ids text[])
returns jsonb
language sql
immutable
as $$
  select case
    when jsonb_typeof(value) = 'array' then coalesce(
      (
        select jsonb_agg(element)
        from jsonb_array_elements(value) as elements(element)
        where coalesce(
            element->>'unifiedFindingId',
            element->>'unified_finding_id',
            element->>'findingId',
            element->>'finding_id',
            element->>'id'
          ) is null
          or coalesce(
            element->>'unifiedFindingId',
            element->>'unified_finding_id',
            element->>'findingId',
            element->>'finding_id',
            element->>'id'
          ) <> all(removed_finding_ids)
      ),
      '[]'::jsonb
    )
    else value
  end;
$$;

do $$
declare
  removed_finding_ids text[] := array[
    'ai_feature_claim_present',
    'ai_marketing_disclosure_alignment_review',
    'ai_interaction_disclosure_present',
    'ai_transparency_notice_present',
    'ai_generated_content_label_present',
    'ai_automated_decision_disclosure_present',
    'ai_human_review_path_present',
    'ai_sensitive_context_review_signal',
    'ai_surface_tracking_review_signal',
    'ai_financial_advice_or_trading_claims_without_disclosure'
  ];
begin
  if to_regclass('public.reports') is not null then
    update public.reports
    set report_payload_json =
      case when report_payload_json ? 'findings'
        then jsonb_set(report_payload_json, '{findings}', pg_temp.certscore_strip_ai_finding_array(report_payload_json->'findings', removed_finding_ids), false)
        else report_payload_json
      end;

    update public.reports
    set report_payload_json =
      case when report_payload_json ? 'unifiedFindings'
        then jsonb_set(report_payload_json, '{unifiedFindings}', pg_temp.certscore_strip_ai_finding_array(report_payload_json->'unifiedFindings', removed_finding_ids), false)
        else report_payload_json
      end;

    update public.reports
    set report_payload_json =
      case when report_payload_json ? 'unified_findings'
        then jsonb_set(report_payload_json, '{unified_findings}', pg_temp.certscore_strip_ai_finding_array(report_payload_json->'unified_findings', removed_finding_ids), false)
        else report_payload_json
      end;

    update public.reports
    set report_payload_json =
      case when report_payload_json ? 'displayPackets'
        then jsonb_set(report_payload_json, '{displayPackets}', pg_temp.certscore_strip_ai_finding_array(report_payload_json->'displayPackets', removed_finding_ids), false)
        else report_payload_json
      end;

    update public.reports
    set report_payload_json =
      case when report_payload_json ? 'display_packets'
        then jsonb_set(report_payload_json, '{display_packets}', pg_temp.certscore_strip_ai_finding_array(report_payload_json->'display_packets', removed_finding_ids), false)
        else report_payload_json
      end;

    update public.reports
    set report_payload_json =
      case when report_payload_json ? 'topFindings'
        then jsonb_set(report_payload_json, '{topFindings}', pg_temp.certscore_strip_ai_finding_array(report_payload_json->'topFindings', removed_finding_ids), false)
        else report_payload_json
      end;

    update public.reports
    set report_payload_json =
      case when report_payload_json ? 'top_findings'
        then jsonb_set(report_payload_json, '{top_findings}', pg_temp.certscore_strip_ai_finding_array(report_payload_json->'top_findings', removed_finding_ids), false)
        else report_payload_json
      end;

    update public.reports
    set summary_json =
      case when summary_json ? 'topFindings'
        then jsonb_set(summary_json, '{topFindings}', pg_temp.certscore_strip_ai_finding_array(summary_json->'topFindings', removed_finding_ids), false)
        else summary_json
      end;

    update public.reports
    set summary_json =
      case when summary_json ? 'top_findings'
        then jsonb_set(summary_json, '{top_findings}', pg_temp.certscore_strip_ai_finding_array(summary_json->'top_findings', removed_finding_ids), false)
        else summary_json
      end;
  end if;
end $$;
