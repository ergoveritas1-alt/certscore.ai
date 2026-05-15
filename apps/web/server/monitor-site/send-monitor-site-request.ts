"use server";

import { redirect } from "next/navigation";
import { createMonitorSiteRequest } from "./monitor-site-request";
import { validateMonitorSiteRequestForm } from "./monitor-site-request-validation";

export type SendMonitorSiteRequestActionState = {
  error: string | null;
};

export async function sendMonitorSiteRequestAction(
  _: SendMonitorSiteRequestActionState,
  formData: FormData
): Promise<SendMonitorSiteRequestActionState> {
  const validation = validateMonitorSiteRequestForm(formData);

  if (!validation.ok) {
    return { error: validation.error };
  }

  try {
    await createMonitorSiteRequest(validation.value);
  } catch {
    return { error: "Monitoring request could not be saved. Please try again." };
  }

  redirect(`/monitor-site/thanks?website=${encodeURIComponent(validation.value.website)}`);
}
