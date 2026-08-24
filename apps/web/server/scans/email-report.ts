"use server";

import { createGmailTransport, getGmailConfig } from "../email/gmail";
import { buildReportEmailText } from "./report-email-content";

export type SendReportEmailActionState = {
  error: string | null;
  success: string | null;
};

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeScanId(value: string) {
  const scanId = value.trim();
  return /^[0-9a-f-]{32,36}$/i.test(scanId) ? scanId : "";
}

function formatEmailPlainTextDomain(value: string) {
  return value.replace(/\./g, ".\u200B");
}

export async function sendReportEmailAction(
  _previousState: SendReportEmailActionState,
  formData: FormData
): Promise<SendReportEmailActionState> {
  const recipientEmail = String(formData.get("recipientEmail") ?? "").trim().toLowerCase();
  const domainLabel = String(formData.get("domainLabel") ?? "").trim() || "this website";
  const scanId = normalizeScanId(String(formData.get("scanId") ?? ""));

  if (!isValidEmail(recipientEmail)) {
    return {
      error: "Enter a valid email address.",
      success: null
    };
  }

  if (!scanId) {
    return {
      error: "This report link is not available yet.",
      success: null
    };
  }

  const gmailConfig = getGmailConfig();

  if (!gmailConfig) {
    return {
      error: "Report email is not configured yet.",
      success: null
    };
  }

  const reportUrl = new URL(`/scan/${scanId}`, gmailConfig.appUrl).toString();
  const pdfUrl = new URL(`/api/scans/${scanId}/report-export?format=pdf`, gmailConfig.appUrl).toString();
  const emailDomainLabel = formatEmailPlainTextDomain(domainLabel);
  const transporter = createGmailTransport(gmailConfig);
  let executiveSummary: string[] = [];
  let downloadablePdfUrl: string | null = null;
  try {
    const [
      { buildCanonicalReportExport },
      { loadPersistedScanReportProjection },
      { getPublicScanStatusProjection },
    ] = await Promise.all([
      import("./report-export"),
      import("./scan-report-projection"),
      import("./scan-status-projection"),
    ]);
    const status = await getPublicScanStatusProjection(scanId);
    const scanRecord = status?.reportReady
      ? await loadPersistedScanReportProjection({ generation: status.reportGeneration, scanId })
      : null;
    const report = scanRecord ? buildCanonicalReportExport(scanRecord) : null;
    if (report) {
      executiveSummary = report.executiveSummary.sentences;
      downloadablePdfUrl = pdfUrl;
    }
  } catch {
    // Preserve the existing report-link email when the richer projection is temporarily unavailable.
  }

  try {
    await transporter.sendMail({
      from: `"CertScore.ai Reports" <${gmailConfig.fromEmail}>`,
      to: recipientEmail,
      subject: `Your CertScore.ai report for ${domainLabel}`,
      text: buildReportEmailText({
        domainLabel: emailDomainLabel,
        executiveSummary,
        pdfUrl: downloadablePdfUrl,
        reportUrl,
      })
    });
  } catch {
    return {
      error: "Report email could not be sent right now.",
      success: null
    };
  }

  return {
    error: null,
    success: "Sent."
  };
}
