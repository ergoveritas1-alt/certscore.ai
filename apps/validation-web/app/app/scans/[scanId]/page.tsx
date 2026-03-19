import { ValidationRunDetailPage } from "../../../../components/validation/run-detail-page";

type ScanDetailPageProps = {
  params: Promise<{
    scanId: string;
  }>;
};

export default async function ScanDetailPage({ params }: ScanDetailPageProps) {
  const { scanId } = await params;
  return <ValidationRunDetailPage scanId={scanId} />;
}
