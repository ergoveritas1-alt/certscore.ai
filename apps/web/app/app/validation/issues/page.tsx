import { ValidationIssuesPage } from "../../../../components/validation/issues-page";
import { ValidationUnavailableNotice } from "../../../../components/validation/unavailable-notice";
import { requireValidationAdminContext } from "../../../../server/validation/auth";
import { isMissingValidationSchemaError } from "../../../../server/validation/schema";

export default async function ValidationIssuesRoutePage() {
  await requireValidationAdminContext();

  try {
    return await ValidationIssuesPage();
  } catch (error) {
    if (isMissingValidationSchemaError(error)) {
      return <ValidationUnavailableNotice detail={error instanceof Error ? error.message : String(error)} />;
    }

    throw error;
  }
}
