import { z } from "zod";

/** Identification provenance, not a confidence calibration or risk decision. */
export const vendorRegistryIdentitySchema = z.object({
  entityId: z.string().regex(/^ent_[a-f0-9]{12}$/),
  vendorId: z.string().regex(/^ven_[a-f0-9]{12}$/),
  serviceId: z.string().regex(/^svc_[a-f0-9]{12}$/),
}).strict();

export const vendorRegistryAttributionSchema = vendorRegistryIdentitySchema.extend({
  contractVersion: z.literal("vendor-registry-attribution-v1"),
  resolverVersion: z.string().min(1).max(120),
  ruleIds: z.array(z.string().regex(/^[a-z0-9_:-]{1,120}$/)).min(1).max(32)
    .refine(ids => new Set(ids).size === ids.length, "Duplicate rule IDs"),
  matchKind: z.enum(["endpoint", "cookie_context", "runtime_signature", "cookie_name", "hostname"]),
}).strict();

export type VendorRegistryIdentity = z.infer<typeof vendorRegistryIdentitySchema>;
export type VendorRegistryAttribution = z.infer<typeof vendorRegistryAttributionSchema>;
