import { permanentRedirect } from "next/navigation";

type LegacyFindingDetailPageProps = {
  params: Promise<{
    findingId: string;
  }>;
};

export default async function LegacyFindingDetailPage({ params }: LegacyFindingDetailPageProps) {
  const { findingId } = await params;
  permanentRedirect(`/findings/${findingId}`);
}
