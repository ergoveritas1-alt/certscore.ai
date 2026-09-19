import { z } from "zod";

export const marketplaceKeyPattern = /^cs_mp_light_[A-Za-z0-9_-]{43}$/;
const account = z.string().regex(/^\d{12}$/);
const license = z.string().min(20).max(1200).regex(/^arn:aws:license-manager:[a-z0-9-]*:\d{12}:license:[A-Za-z0-9-]+$/);
export const resolvedCustomerSchema = z.object({
  CustomerAWSAccountId: account,
  LicenseArn: license,
  ProductCode: z.string().min(1),
});
export const licenseEventSchema = z.object({
  id: z.string().uuid(),
  source: z.literal("aws.agreement-marketplace"),
  account,
  region: z.literal("us-east-1"),
  time: z.string().datetime(),
  "detail-type": z.enum(["License Updated - Manufacturer", "License Deprovisioned - Manufacturer"]),
  detail: z.object({
    catalog: z.literal("AWSMarketplace"),
    product: z.object({ code: z.string(), id: z.string() }),
    agreement: z.object({ id: z.string().regex(/^agmt-[a-z0-9]+$/) }),
    license: z.object({ arn: license }),
    acceptor: z.object({ accountId: account }),
  }),
});
export type ResolvedCustomer = z.infer<typeof resolvedCustomerSchema>;
export type LicenseEvent = z.infer<typeof licenseEventSchema>;

export function validateResolvedCustomer(value: unknown, productCode: string): ResolvedCustomer {
  const customer = resolvedCustomerSchema.parse(value);
  if (customer.ProductCode !== productCode) throw new Error("Unexpected Marketplace product.");
  return customer;
}

export function agreementAllowsAccess(
  agreement: { status?: string; acceptor?: { accountId?: string }; startTime?: Date; endTime?: Date },
  buyerAccount: string,
  now = Date.now(),
) {
  return agreement.status === "ACTIVE" && agreement.acceptor?.accountId === buyerAccount
    && Boolean(agreement.startTime && Number.isFinite(agreement.startTime.getTime()) && agreement.startTime.getTime() <= now)
    && (!agreement.endTime || (Number.isFinite(agreement.endTime.getTime()) && agreement.endTime.getTime() > now));
}
