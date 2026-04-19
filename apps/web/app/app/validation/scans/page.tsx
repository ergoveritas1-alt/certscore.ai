import { ValidationScansPage } from "../../../../components/validation/scans-page";
import { ValidationOpsHostNotice } from "../../../../components/validation/ops-host-notice";
import { ValidationUnavailableNotice } from "../../../../components/validation/unavailable-notice";
import { requireValidationAdminContext } from "../../../../server/validation/auth";
import { buildValidationOpsUrl, getValidationOpsHostState } from "../../../../server/validation/ops-host";
import { isMissingValidationSchemaError } from "../../../../server/validation/schema";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
  const validationOpsHost = getValidationOpsHostState();

  if (validationOpsHost.hostedOnDedicatedOpsApp) {
    const params = new URLSearchParams();
    if (resolvedSearchParams.page) {
      params.set("page", resolvedSearchParams.page);
    }
    if (resolvedSearchParams.rankBand) {
      params.set("rankBand", resolvedSearchParams.rankBand);
    }
    if (resolvedSearchParams.status) {
      params.set("status", resolvedSearchParams.status);
    }
    const pathname = params.size > 0 ? `/app/validation/scans?${params.toString()}` : "/app/validation/scans";
    return <ValidationOpsHostNotice destinationUrl={buildValidationOpsUrl(pathname) ?? validationOpsHost.baseUrl} title="Validation runs" />;
  }

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
