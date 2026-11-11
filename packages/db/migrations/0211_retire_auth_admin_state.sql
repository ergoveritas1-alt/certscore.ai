-- Keep the existing columns available while the previous web revision drains.
-- Validate existing rows and prevent new privilege restrictions or impersonations
-- from being created by a previous revision during the transition.
alter table public.better_auth_users
  add constraint better_auth_users_retired_admin_state check (not banned);

alter table public.better_auth_sessions
  add constraint better_auth_sessions_retired_admin_state check (impersonated_by is null);
