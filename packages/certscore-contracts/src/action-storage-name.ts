import { z } from "zod";

/** An observed empty name is not a missing name. Never replace it with a
 * synthetic identifier: the retained identity hash binds the exact storage key. */
export const actionStorageNameSchema = z.string().max(180);

export function validateActionStorageName(
  item: { name: string; hostname?: string; identityHash?: string; storageIdentityHash?: string },
  context: z.RefinementCtx,
) {
  if (item.name === "" && (!item.hostname || !(item.identityHash ?? item.storageIdentityHash))) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["name"],
      message: "An observed empty storage name requires its retained hostname and exact identity hash.",
    });
  }
}

/** This is a v2 representation extension, not a reinterpretation of v1 records. */
export function validateLegacyActionStorageNames(
  packet: { artifactVersion: string; storage: Record<string, unknown> },
  context: z.RefinementCtx,
) {
  if (!packet.artifactVersion.endsWith(".v1")) return;
  for (const [key, value] of Object.entries(packet.storage)) {
    if (!Array.isArray(value)) continue;
    value.forEach((item, index) => {
      if (item?.name === "") context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["storage", key, index, "name"],
        message: "Observed empty storage names require action evidence v2.",
      });
    });
  }
}
