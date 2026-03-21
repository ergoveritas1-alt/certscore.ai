import { ValidationRunDetailPage } from "../../../../components/validation/run-detail-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ScanDetailPageProps = {
  params: Promise<{
    scanId: string;
  }>;
};

export default async function ScanDetailPage({ params }: ScanDetailPageProps) {
  const { scanId } = await params;
  return <ValidationRunDetailPage scanId={scanId} />;
}
