import { getDashboardContext } from "../../../../server/auth";
import { getScanById } from "../../../../server/scans/get-scan-by-id";
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
  const { organization } = await getDashboardContext();
  const scanDetail = await getScanById({
    organizationId: organization.id,
    scanId
  });

  return <ValidationRunDetailPage scanDetail={scanDetail} scanId={scanId} />;
}
