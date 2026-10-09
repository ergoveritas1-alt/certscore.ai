/** Shared initial-ingestion/reconciliation handling for the external mini bot.
 * No requests, retries, or scan creation are performed by these helpers. */
export function evidenceState({ payload, error, classification, attempts = 0, maxAttempts = 3, now = Date.now() }) {
  const retained = Boolean(payload) && !error;
  const unavailable = !retained && classification?.httpStatus === 409 && classification?.apiErrorCode === 'scan_unavailable';
  const exhausted = !retained && !unavailable && attempts >= maxAttempts &&
    ['network_error', 'api_error_transient'].includes(classification?.errorType);
  const terminal = unavailable || exhausted;
  return {
    retained, terminal,
    status: retained ? 'retained' : terminal ? 'unavailable' : 'pending',
    errorType: retained ? null : unavailable ? 'evidence_unavailable' : exhausted ? 'evidence_retry_exhausted' : 'evidence_retrieval_pending',
    nextAttemptAt: retained || terminal ? null : new Date(now + 30000).toISOString(),
  };
}

export function checklistSummary(payload) {
  const rows = payload?.gdprEprivacyChecklistRows?.items ?? [];
  const status = id => rows.find(row => row.id === id)?.status || null;
  return {
    privacyPolicyCaptured: status('privacy_notice_availability'),
    cookiePolicyCaptured: status('cookie_notice_policy_availability'),
    acceptControlSeen: status('accept_consent_control'),
    rejectControlSeen: status('reject_all_path_availability'),
    optionsPreferencesControlSeen: status('options_settings_preferences_control'),
  };
}

/** Existing independent reads overlap; one failure never discards other data. */
export async function supportingResources(tasks) {
  const entries = Object.entries(tasks);
  const results = await Promise.allSettled(entries.map(([, task]) => Promise.resolve().then(task)));
  return Object.fromEntries(entries.map(([name], index) => [name, results[index]]));
}

export function ingestionTiming({ submittedAt, completedAt, supportingStartedAt, now = Date.now() }) {
  const seconds = start => Number.isFinite(start) && start <= now ? Math.round((now - start) / 100) / 10 : null;
  return {
    botTotalSeconds: seconds(Date.parse(submittedAt)),
    supportingResourceSeconds: seconds(supportingStartedAt),
    completedToIngestedSeconds: seconds(Date.parse(completedAt)),
  };
}
