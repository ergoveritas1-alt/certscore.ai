import { notFound } from "next/navigation";
import { ValidationRunDetailPage } from "../../../../../components/validation/run-detail-page";
import { ValidationUnavailableNotice } from "../../../../../components/validation/unavailable-notice";
import { requireValidationAdminContext } from "../../../../../server/validation/auth";
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

  try {
    return await ValidationRunDetailPage({ runId: scanId });
  } catch (error) {
    if (isMissingValidationSchemaError(error)) {
      return <ValidationUnavailableNotice detail={error instanceof Error ? error.message : String(error)} />;
    }

    throw error;
  }
}
