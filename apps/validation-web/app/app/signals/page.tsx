import { redirect } from "next/navigation";
import { getDashboardContext } from "../../../server/auth";
import { getOrganizationScans } from "../../../server/scans/get-organization-scans";

export default async function SignalsPage() {
  const { organization } = await getDashboardContext();
  const [latestScan] = await getOrganizationScans(organization.id, 1);

  if (latestScan) {
    redirect(`/app/scans/${latestScan.id}`);
  }

  redirect("/app/scans");
}
