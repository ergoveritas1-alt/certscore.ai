import { z } from "zod";

/** Native DOM identity read from the same CDP backend node as an AX record.
 * This is corroborating observation provenance, never an action authorization. */
export const consentAccessibilityDomBindingSchema = z.object({
  version: z.literal("ax_backend_dom_binding.v1"),
  axNodeId: z.string().min(1).max(80),
  backendNodeId: z.number().int().positive().max(2_147_483_647),
  nodeType: z.literal(1),
  tagName: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/),
  documentUrl: z.string().url().max(2048),
  documentIdentity: z.object({source: z.literal("cdp_loader_id"), token: z.string().min(1).max(160)}).strict(),
}).strict();

export type ConsentAccessibilityDomBinding = z.infer<typeof consentAccessibilityDomBindingSchema>;
