import { ValidationScansPage } from "../../../../components/validation/scans-page";
import { ValidationUnavailableNotice } from "../../../../components/validation/unavailable-notice";
import { requireValidationAdminContext } from "../../../../server/validation/auth";
import { isMissingValidationSchemaError } from "../../../../server/validation/schema";

type ValidationScansRoutePageProps = {
  searchParams?: Promise<{
    page?: string;
    rankBand?: string;
    status?: string;
  }>;
};

export default async function ValidationScansRoutePage({ searchParams }: ValidationScansRoutePageProps) {
  await requireValidationAdminContext();
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const page = Number.parseInt(resolvedSearchParams.page ?? "1", 10);

  try {
    return await ValidationScansPage({
      page: Number.isFinite(page) && page > 0 ? page : 1,
      rankBand: resolvedSearchParams.rankBand ?? null,
      status: resolvedSearchParams.status ?? null
    });
  } catch (error) {
    if (isMissingValidationSchemaError(error)) {
      return <ValidationUnavailableNotice detail={error instanceof Error ? error.message : String(error)} />;
    }

    throw error;
  }
}
