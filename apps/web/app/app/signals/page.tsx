import { redirect } from "next/navigation";
import { getDashboardContext } from "../../../server/auth";
import { getLatestOrganizationScanId } from "../../../server/scans/repository";

export default async function SignalsPage() {
  const { organization } = await getDashboardContext();
  const latestScanId = await getLatestOrganizationScanId(organization.id);

  if (latestScanId) {
    redirect(`/app/scans/${latestScanId}`);
  }

  redirect("/app/scans");
}
