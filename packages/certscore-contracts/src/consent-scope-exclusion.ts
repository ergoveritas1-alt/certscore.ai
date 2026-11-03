import { z } from "zod";

/** A bounded reason from the live interaction gate, never authorization.
 * aria_hidden remains readable for older captures; current DOM pointer checks
 * use physical actionability and do not emit it as an exclusion by itself. */
export const consentScopeExclusionSchema = z.object({
  version: z.literal("consent_scope_exclusion.v1"),
  reason: z.enum(["aria_hidden", "inert", "hidden", "transparent", "unavailable"]),
}).strict();
export type ConsentScopeExclusion = z.infer<typeof consentScopeExclusionSchema>;
