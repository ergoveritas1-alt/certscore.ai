import "server-only";
import { z } from "zod";
const campaignEnvironment = z.object({
  CERTSCORE_BF26_EMAIL_DELIVERY: z.enum(["0", "1"]).default("0"),
  CERTSCORE_BF26_TEST_WINDOW: z.enum(["0", "1"]).default("0"),
  NODE_ENV: z.string().optional()
});
export function getCampaignConfig(env: Record<string, string | undefined> = process.env) {
  const values = campaignEnvironment.parse(env);
  return {
    emailDelivery: values.CERTSCORE_BF26_EMAIL_DELIVERY === "1",
    testWindow: values.NODE_ENV !== "production" && values.CERTSCORE_BF26_TEST_WINDOW === "1"
  };
}
