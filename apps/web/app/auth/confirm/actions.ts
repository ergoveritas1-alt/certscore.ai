"use server";

import { redirect } from "next/navigation";

function getSafeRedirectPath(nextParam: FormDataEntryValue | null) {
  if (typeof nextParam === "string" && nextParam.startsWith("/") && !nextParam.startsWith("//")) {
    return nextParam;
  }

  return "/app";
}

export async function confirmMagicLinkAction(formData: FormData) {
  const nextPath = getSafeRedirectPath(formData.get("next"));
  redirect(`/login?error=magic_link_disabled&next=${encodeURIComponent(nextPath)}`);
}
