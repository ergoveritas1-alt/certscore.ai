"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireAuthenticatedUser } from "../auth";
import { claimMarketplaceLicense, rotateMarketplaceKey, revokeMarketplaceKey } from "./repository";
import { MARKETPLACE_CLAIM_COOKIE, MARKETPLACE_LIGHT_PATH, requireMarketplaceEnabled } from "./config";
import { admitMarketplaceRequest } from "./http";

export type MarketplaceActionState = { message: string; key: string | null };
export async function marketplaceAction(_state: MarketplaceActionState, form: FormData): Promise<MarketplaceActionState> {
  requireMarketplaceEnabled();
  const user = await requireAuthenticatedUser();
  if (!admitMarketplaceRequest(`key:${user.id}`, 20)) return { message: "Please wait a minute before changing keys again.", key: null };
  const operation = form.get("operation");
  const licenseArn = form.get("licenseArn");
  try {
    let key: string | null = null;
    if (operation === "claim") {
      const jar = await cookies();
      await claimMarketplaceLicense(jar.get(MARKETPLACE_CLAIM_COOKIE)?.value ?? "", user.id);
      jar.delete(MARKETPLACE_CLAIM_COOKIE);
    } else if (typeof licenseArn === "string" && licenseArn.length <= 1200 && operation === "rotate") {
      key = await rotateMarketplaceKey(licenseArn, user.id);
    } else if (typeof licenseArn === "string" && licenseArn.length <= 1200 && operation === "revoke") {
      await revokeMarketplaceKey(licenseArn, user.id);
    } else return { message: "Choose a valid action.", key: null };
    revalidatePath(MARKETPLACE_LIGHT_PATH);
    return { message: operation === "claim" ? "Subscription linked. Refresh if AWS activation is still pending." : key ? "Save your new key now. The previous key no longer works." : "Key revoked.", key };
  } catch {
    return { message: "Unable to complete this action. Confirm your subscription is active and linked to this account, or restart setup from AWS Marketplace.", key: null };
  }
}
