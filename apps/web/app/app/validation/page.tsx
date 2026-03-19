import { ValidationOverviewPage } from "../../../components/validation/overview-page";
import { ValidationUnavailableNotice } from "../../../components/validation/unavailable-notice";
import { requireValidationAdminContext } from "../../../server/validation/auth";
import { isMissingValidationSchemaError } from "../../../server/validation/schema";

export default async function ValidationPage() {
  await requireValidationAdminContext();

  try {
    return await ValidationOverviewPage();
  } catch (error) {
    if (isMissingValidationSchemaError(error)) {
      return <ValidationUnavailableNotice detail={error instanceof Error ? error.message : String(error)} />;
    }

    throw error;
  }
}
