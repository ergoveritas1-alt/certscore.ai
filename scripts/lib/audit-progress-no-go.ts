import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { scanNoGoReasonCodeSchema, type ScanNoGoReasonCode } from '../../packages/certscore-api-contracts/src/scan-no-go';
import type { Metric, ProgressRow } from './audit-progress';

export const NO_GO_REASON_LABELS = {
  access_denied_or_forbidden_page: 'Access denied or forbidden',
  authentication_required: 'Sign-in required',
  blank_or_unusable_page: 'Blank or unusable page',
  captcha_or_challenge: 'CAPTCHA or security challenge',
  configuration_error: 'Site configuration error',
  loading_or_stalled: 'Stalled loading',
  maintenance_or_unavailable: 'Maintenance or unavailable',
  navigation_transport_failure: 'Navigation or transport failure',
  not_found_404: 'Page not found (404)',
  parked_or_placeholder: 'Parked or placeholder page',
  rate_limited_429: 'Rate limited (429)',
  redirect_only_page: 'Redirect notice only',
  retained_visual_error_shell: 'Error page in visual capture',
  runtime_capture_unverified: 'Starting-page capture unverified',
  server_error_5xx: 'Server error (5xx)',
  site_not_ready: 'Site not ready',
  target_unreachable_or_unsuitable: 'Target unreachable or unsuitable',
  tls_or_certificate_error: 'TLS or certificate error',
  unsupported_region: 'Unsupported region',
  visual_capture_failed_or_placeholder: 'Visual capture failed or showed a placeholder',
  unknown: 'Unknown reason',
  unavailable: 'Reason unavailable',
} satisfies Record<ScanNoGoReasonCode | 'unavailable', string>;

const MAX_EXPORT_BYTES = 6 * 1024 * 1024;

export const NO_GO_REASON_METRICS: Metric[] = Object.entries(NO_GO_REASON_LABELS).map(([reason, label]) => ({
  id: 'outcome.no_go_reason.' + reason,
  label,
  group: 'No-go reasons',
  denominator: 'Retained no-go outcomes on the selected day, including outcomes with unavailable reason evidence',
  success: ['recorded'],
}));

export const NO_GO_TOTAL_METRIC: Metric = {
  id: 'outcome.no_go_total',
  label: 'Total no-gos',
  group: 'No-go reasons',
  denominator: 'All retained attempts on the selected day',
  success: ['recorded'],
};

export const NO_GO_METRICS = [NO_GO_TOTAL_METRIC, ...NO_GO_REASON_METRICS];

/** Read the returned primary reason from the exact archived export for each no-go. */
export function readAuditNoGoReasons(
  rows: readonly Pick<ProgressRow, 'scanId' | 'createdAt' | 'states' | 'refs' | 'originProof'>[],
): Record<string, ScanNoGoReasonCode> {
  const reasons: Record<string, ScanNoGoReasonCode> = {};
  for (const row of rows) {
    if (row.states.outcome !== 'no_go' || row.originProof === 'production_id_selection_only') continue;
    const ref = row.refs.find(item => item.role === 'hash_verified_bot_archive_export');
    if (!ref) continue;
    const stat = statSync(ref.file);
    if (!stat.isFile() || stat.size > MAX_EXPORT_BYTES) throw Error('Invalid no-go export: ' + row.scanId);
    const bytes = readFileSync(ref.file);
    if (bytes.length !== stat.size || createHash('sha256').update(bytes).digest('hex') !== ref.sha256) {
      throw Error('No-go export hash or size mismatch: ' + row.scanId);
    }
    const report = JSON.parse(bytes.toString('utf8'));
    if (report?.scanId !== row.scanId || Date.parse(report.timestamps?.createdAt) !== Date.parse(row.createdAt) ||
        report.resultDisposition !== 'no_go') {
      throw Error('No-go export identity, timestamp or disposition mismatch: ' + row.scanId);
    }
    const reason = scanNoGoReasonCodeSchema.safeParse(report.noGo?.reasonCode);
    if (reason.success) reasons[row.scanId] = reason.data;
  }
  return reasons;
}
