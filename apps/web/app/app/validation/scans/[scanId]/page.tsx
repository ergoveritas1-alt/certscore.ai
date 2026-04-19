import { notFound } from "next/navigation";
import { ValidationOpsHostNotice } from "../../../../../components/validation/ops-host-notice";
import { ValidationRunDetailPage } from "../../../../../components/validation/run-detail-page";
import { ValidationUnavailableNotice } from "../../../../../components/validation/unavailable-notice";
import { requireValidationAdminContext } from "../../../../../server/validation/auth";
import { buildValidationOpsUrl, getValidationOpsHostState } from "../../../../../server/validation/ops-host";
import { isMissingValidationSchemaError } from "../../../../../server/validation/schema";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ValidationRunPageProps = {
  params: Promise<{
    scanId: string;
  }>;
};

export default async function ValidationRunPage({ params }: ValidationRunPageProps) {
  await requireValidationAdminContext();
  const { scanId } = await params;

  if (!scanId) {
    notFound();
  }

  const validationOpsHost = getValidationOpsHostState();
  if (validationOpsHost.hostedOnDedicatedOpsApp) {
    return (
      <ValidationOpsHostNotice
        destinationUrl={buildValidationOpsUrl(`/app/validation/scans/${encodeURIComponent(scanId)}`) ?? validationOpsHost.baseUrl}
        title="Validation run details"
      />
    );
  }

  try {
    return await ValidationRunDetailPage({ runId: scanId });
  } catch (error) {
    if (isMissingValidationSchemaError(error)) {
      return <ValidationUnavailableNotice detail={error instanceof Error ? error.message : String(error)} />;
    }

    throw error;
  }
}
