import { redirect } from "next/navigation";
import { AUTHENTIC_SAMPLE_REPORT_URL } from "../../lib/marketing/sample-report";

// Keep the public entry point stable as the retained sample report is refreshed.
// Reading a sample must not create a new scan.
export default function SampleReportPage() {
  redirect(AUTHENTIC_SAMPLE_REPORT_URL);
}
