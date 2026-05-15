"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { updateAdminMonitorSiteRequestStatus } from "./repository";
import { requirePlatformAdminContext } from "./platform-admin";

const updateMonitorSiteRequestStatusSchema = z.object({
  id: z.string().uuid("Invalid monitor request."),
  status: z.enum(["pending", "contacted", "converted", "closed"])
});

export async function updateMonitorSiteRequestStatusFormAction(formData: FormData): Promise<void> {
  await requirePlatformAdminContext();
  const parsed = updateMonitorSiteRequestStatusSchema.parse({
    id: formData.get("id"),
    status: formData.get("status")
  });

  await updateAdminMonitorSiteRequestStatus(parsed);

  revalidatePath("/app/admin");
  revalidatePath("/app/admin/monitor-requests");
  redirect("/app/admin/monitor-requests");
}
