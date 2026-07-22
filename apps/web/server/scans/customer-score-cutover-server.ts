import "server-only";

import {
  CUSTOMER_GDPR_EPRIVACY_SCORE_MODE_ENV,
  selectCustomerGdprEprivacyScore
} from "../../lib/scans/customer-score-cutover";

export function selectConfiguredCustomerGdprEprivacyScore(input: Omit<
  Parameters<typeof selectCustomerGdprEprivacyScore>[0],
  "rawMode"
>) {
  return selectCustomerGdprEprivacyScore({
    ...input,
    rawMode: process.env[CUSTOMER_GDPR_EPRIVACY_SCORE_MODE_ENV]
  });
}
