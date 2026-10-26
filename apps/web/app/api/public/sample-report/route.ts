import { after } from "next/server";
import { getCurrentUser } from "../../../../server/auth";
import { isBetterAuthConfigurationError } from "../../../../server/better-auth/env";
import { isAnonymousScanQuotaError } from "../../../../server/pulse/anonymous-scan-quota";
import { handleSampleReportRequest } from "../../../../server/scans/sample-report-request";
import { openVisitorSampleReport } from "../../../../server/scans/sample-report-service";

export async function POST(request: Request) {
  return handleSampleReportRequest(request, {
    getCurrentUser: async () => {
      try { return await getCurrentUser(); } catch (error) {
        if (isBetterAuthConfigurationError(error)) return null;
        throw error;
      }
    },
    resolve: scanFrom => openVisitorSampleReport({ scanFrom, headers: request.headers, scheduleBackgroundTask: task => after(task) }),
    classifyQuotaError: error => isAnonymousScanQuotaError(error) ? { retryAfterSeconds: error.retryAfterSeconds } : null,
  });
}
