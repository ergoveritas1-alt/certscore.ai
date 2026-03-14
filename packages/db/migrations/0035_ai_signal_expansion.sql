alter table public.scan_snapshots
  alter column ai_chatbot_present drop not null,
  alter column ai_assistant_widget_detected drop not null,
  alter column ai_chatbot_present drop default,
  alter column ai_assistant_widget_detected drop default,
  add column if not exists ai_disclosure_text_present boolean,
  add column if not exists ai_terms_or_policy_ai_reference boolean,
  add column if not exists ai_help_center_ai_reference boolean,
  add column if not exists ai_search_or_answer_experience_detected boolean,
  add column if not exists ai_hiring_automation_signal_detected boolean;
