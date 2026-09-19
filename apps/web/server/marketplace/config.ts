import "server-only";
import { z } from "zod";

export const MARKETPLACE_LIGHT_PATH = "/marketplace/light";
export const MARKETPLACE_LIGHT_ENDPOINT = "https://mcp.certscore.ai/mcp/marketplace/light";
export const MARKETPLACE_CLAIM_COOKIE = "certscore_marketplace_claim";

export function marketplaceConfig() {
  return z.object({
    CERTSCORE_MARKETPLACE_LIGHT_ENABLED: z.enum(["0", "1"]).default("0"),
    CERTSCORE_MARKETPLACE_PRODUCT_CODE: z.string().min(1).default("a3p2vfccdufqnuhyn5r8lsx0q"),
    CERTSCORE_MARKETPLACE_PRODUCT_ID: z.string().min(1).default("prod-eagvxckgntmxc"),
    CERTSCORE_MARKETPLACE_SELLER_ACCOUNT: z.string().regex(/^\d{12}$/).default("199536052647"),
    CERTSCORE_MARKETPLACE_EVENTS_TOPIC_ARN: z.string().regex(/^arn:aws:sns:us-east-1:\d{12}:[A-Za-z0-9_-]+$/).optional(),
  }).parse(process.env);
}

export function requireMarketplaceEnabled() {
  const config = marketplaceConfig();
  if (config.CERTSCORE_MARKETPLACE_LIGHT_ENABLED !== "1" || !config.CERTSCORE_MARKETPLACE_EVENTS_TOPIC_ARN) {
    throw new Error("Marketplace Light is not configured.");
  }
  return config;
}
