import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShadowScanReport } from "../../../../components/scans/report-lab/shadow-scan-report";
import {
  SHADOW_REPORT_SCAN_ID,
  isShadowReportVariant
} from "../../../../components/scans/report-lab/shadow-report-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    absolute: "Shadow scan report | CertScore.ai"
  },
  robots: {
    follow: false,
    index: false
  }
};

type ShadowScanReportPageProps = {
  params: Promise<{
    scanId: string;
    variant: string;
  }>;
};

export default async function ShadowScanReportPage({ params }: ShadowScanReportPageProps) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const { scanId, variant } = await params;
  if (scanId !== SHADOW_REPORT_SCAN_ID || !isShadowReportVariant(variant)) {
    notFound();
  }

  return <ShadowScanReport variant={variant} />;
}
