import { notFound } from "next/navigation";
import { PreConsentRuntimePreviewCard } from "../../../components/scans/pre-consent-runtime-preview-card";
import { runtimePreviewFixture } from "../../../components/scans/pre-consent-runtime-preview-fixture";

export const dynamic = "force-dynamic";
export default function RuntimePreviewFixturePage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <main className="mx-auto max-w-6xl p-4"><h1 className="mb-4 text-xl font-semibold">Synthetic runtime checkpoint preview</h1><PreConsentRuntimePreviewCard preview={runtimePreviewFixture} startedAt="2026-09-06T00:00:00.000Z" /></main>;
}
