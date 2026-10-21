import { normalizeReportHeaderTheme, type ReportHeaderTheme } from "../../../lib/report-header-theme";
import { ReportPdfDownloadLink } from "../report-pdf-download-link";

export type WorkspaceReportBranding = { name: string; logoUrl: string | null; headerTheme?: ReportHeaderTheme };

export function WorkspaceReportBrand({ branding, scanId, fullSite }: {
  branding: WorkspaceReportBranding; scanId: string; fullSite: boolean;
}) {
  const black = normalizeReportHeaderTheme(branding.headerTheme) === "black";
  return <div className={`mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 border-b border-zinc-200 px-5 py-5 lg:px-10 ${black ? "bg-black text-white" : "bg-white text-zinc-900"}`}>
    <div className="flex min-w-0 items-center gap-4">
      {branding.logoUrl ? <img alt={`${branding.name} logo`} className="h-14 w-40 rounded bg-white p-2 object-contain object-left" src={branding.logoUrl} /> : null}
      <p className={`truncate text-sm font-medium ${black ? "text-zinc-200" : "text-zinc-600"}`}>{branding.name}</p>
    </div>
    <ReportPdfDownloadLink className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50" download href={`/api/scans/${encodeURIComponent(scanId)}/report-export?format=pdf${branding.logoUrl ? "&branding=workspace" : ""}&reviewFocus=gdpr_eprivacy${fullSite ? "&scope=full-site" : ""}`}>{branding.logoUrl ? "Download white-label PDF" : "Download PDF report"}</ReportPdfDownloadLink>
  </div>;
}
