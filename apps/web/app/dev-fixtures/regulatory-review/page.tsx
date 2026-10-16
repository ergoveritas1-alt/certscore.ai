import { notFound } from "next/navigation";
import { RegulatoryReviewPreview } from "./preview";
export const dynamic = "force-dynamic";
export default function RegulatoryReviewPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <RegulatoryReviewPreview />;
}
