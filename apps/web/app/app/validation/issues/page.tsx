import { ValidationIssuesPage } from "../../../../components/validation/issues-page";
import { ValidationOpsHostNotice } from "../../../../components/validation/ops-host-notice";
import { ValidationUnavailableNotice } from "../../../../components/validation/unavailable-notice";
import { requireValidationAdminContext } from "../../../../server/validation/auth";
import { buildValidationOpsUrl, getValidationOpsHostState } from "../../../../server/validation/ops-host";
import { isMissingValidationSchemaError } from "../../../../server/validation/schema";

export default async function ValidationIssuesRoutePage() {
  await requireValidationAdminContext();
  const validationOpsHost = getValidationOpsHostState();

  if (validationOpsHost.hostedOnDedicatedOpsApp) {
    return <ValidationOpsHostNotice destinationUrl={buildValidationOpsUrl("/app/validation/issues") ?? validationOpsHost.baseUrl} title="Validation issues" />;
  }

  try {
    return await ValidationIssuesPage();
  } catch (error) {
    if (isMissingValidationSchemaError(error)) {
      return <ValidationUnavailableNotice detail={error instanceof Error ? error.message : String(error)} />;
    }

    throw error;
  }
}
