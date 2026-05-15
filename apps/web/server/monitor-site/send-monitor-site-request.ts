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

  let request: Awaited<ReturnType<typeof createMonitorSiteRequest>>;
  try {
    request = await createMonitorSiteRequest(validation.value);
  } catch {
    return { error: "Monitoring request could not be saved. Please try again." };
  }

  const params = new URLSearchParams({ website: validation.value.website });
  if (request?.publicStatusToken) {
    params.set("statusToken", request.publicStatusToken);
  }

  redirect(`/monitor-site/thanks?${params.toString()}`);
}
