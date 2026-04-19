import { ValidationOverviewPage } from "../../../components/validation/overview-page";
import { ValidationOpsHostNotice } from "../../../components/validation/ops-host-notice";
import { ValidationUnavailableNotice } from "../../../components/validation/unavailable-notice";
import { buildValidationOpsUrl, getValidationOpsHostState } from "../../../server/validation/ops-host";
import { requireValidationAdminContext } from "../../../server/validation/auth";
import { isMissingValidationSchemaError } from "../../../server/validation/schema";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ValidationPage() {
  await requireValidationAdminContext();
  const validationOpsHost = getValidationOpsHostState();

  if (validationOpsHost.hostedOnDedicatedOpsApp) {
    return <ValidationOpsHostNotice destinationUrl={buildValidationOpsUrl("/app/validation") ?? validationOpsHost.baseUrl} title="Validation control center" />;
  }

  try {
    return await ValidationOverviewPage();
  } catch (error) {
    if (isMissingValidationSchemaError(error)) {
      return <ValidationUnavailableNotice detail={error instanceof Error ? error.message : String(error)} />;
    }

    throw error;
  }
}
