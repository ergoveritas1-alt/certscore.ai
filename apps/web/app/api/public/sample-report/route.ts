import { after } from "next/server";
import { isAnonymousScanQuotaError } from "../../../../server/pulse/anonymous-scan-quota";
import { handleSampleReportRequest } from "../../../../server/scans/sample-report-request";
import { openVisitorSampleReport } from "../../../../server/scans/sample-report-service";

export async function POST(request: Request) {
  return handleSampleReportRequest(request, {
    resolve: scanFrom => openVisitorSampleReport({ scanFrom, headers: request.headers, scheduleBackgroundTask: task => after(task) }),
    classifyQuotaError: error => isAnonymousScanQuotaError(error) ? { retryAfterSeconds: error.retryAfterSeconds } : null,
  });
}
