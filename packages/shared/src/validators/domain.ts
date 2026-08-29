import { z } from "zod";
import { extractHostname, isNonPublicTargetUrlError, normalizeUrl } from "../utils/url";

export const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Enter a valid hex color like #0f172a.");

const rawDomainInputSchema = z
  .string()
  .trim()
  .min(1, "Enter a website domain to scan.")
  .max(2048, "That website address is too long.")
  .superRefine((value, context) => {
    try {
      normalizeUrl(value);
    } catch (error) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a valid website domain, such as example.com.",
        params: isNonPublicTargetUrlError(error) ? { reasonCode: error.reasonCode } : undefined
      });
    }
  });

export const previewScanRequestSchema = z
  .object({
    domain: rawDomainInputSchema
  })
  .transform(({ domain }) => {
    const normalizedUrl = normalizeUrl(domain);

    return {
      domain,
      normalizedUrl,
      hostname: extractHostname(normalizedUrl)
    };
  });

export const createDomainRequestSchema = z
  .object({
    domain: rawDomainInputSchema
  })
  .transform(({ domain }) => {
    const normalizedUrl = normalizeUrl(domain);

    return {
      domain,
      normalizedUrl,
      hostname: extractHostname(normalizedUrl)
    };
  });

export function getDomainValidationReasonCode(error: z.ZodError): "non_public_target" | null {
  return error.issues.some((issue) =>
    issue.code === z.ZodIssueCode.custom && issue.params?.reasonCode === "non_public_target"
  ) ? "non_public_target" : null;
}

export function parseDomainBatchInput(input: string) {
  const parts = input
    .split(/[\s,;]+/g)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  const valid: Array<{
    domain: string;
    hostname: string;
    normalizedUrl: string;
  }> = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  for (const part of parts) {
    const parsed = createDomainRequestSchema.safeParse({ domain: part });
    if (!parsed.success) {
      invalid.push(part);
      continue;
    }

    if (seen.has(parsed.data.normalizedUrl)) {
      continue;
    }

    seen.add(parsed.data.normalizedUrl);
    valid.push(parsed.data);
  }

  return {
    invalid,
    valid
  };
}
