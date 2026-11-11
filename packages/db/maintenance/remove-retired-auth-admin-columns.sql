-- Run after migration 0211 and after all web tasks on the previous revision
-- have drained. Earlier revisions require these columns.
begin;

alter table public.better_auth_sessions
  drop constraint better_auth_sessions_retired_admin_state,
  drop column impersonated_by;

alter table public.better_auth_users
  drop constraint better_auth_users_retired_admin_state,
  drop column role,
  drop column banned,
  drop column ban_reason,
  drop column ban_expires;

commit;
