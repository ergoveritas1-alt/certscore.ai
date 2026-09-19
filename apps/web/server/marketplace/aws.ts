import "server-only";
import { MarketplaceMeteringClient, ResolveCustomerCommand } from "@aws-sdk/client-marketplace-metering";
import { MarketplaceAgreementClient, DescribeAgreementCommand } from "@aws-sdk/client-marketplace-agreement";
import { SNSClient, ConfirmSubscriptionCommand } from "@aws-sdk/client-sns";
import { requireMarketplaceEnabled } from "./config";
import { agreementAllowsAccess, licenseEventSchema, validateResolvedCustomer } from "./contracts";
import { applyLicenseEvent } from "./repository";

const metering = new MarketplaceMeteringClient({ region: "us-east-1", maxAttempts: 2 });
const agreements = new MarketplaceAgreementClient({ region: "us-east-1", maxAttempts: 2 });
const sns = new SNSClient({ region: "us-east-1", maxAttempts: 2 });

export async function resolveMarketplaceCustomer(token: string) {
  const config = requireMarketplaceEnabled();
  const response = await metering.send(new ResolveCustomerCommand({ RegistrationToken: token }), { abortSignal: AbortSignal.timeout(10_000) });
  return validateResolvedCustomer(response, config.CERTSCORE_MARKETPLACE_PRODUCT_CODE);
}

export async function confirmMarketplaceTopic(token: string) {
  const config = requireMarketplaceEnabled();
  await sns.send(new ConfirmSubscriptionCommand({ TopicArn: config.CERTSCORE_MARKETPLACE_EVENTS_TOPIC_ARN, Token: token, AuthenticateOnUnsubscribe: "true" }), { abortSignal: AbortSignal.timeout(10_000) });
}

export async function processMarketplaceEvent(value: unknown) {
  const config = requireMarketplaceEnabled();
  const event = licenseEventSchema.parse(value);
  if (event.account !== config.CERTSCORE_MARKETPLACE_SELLER_ACCOUNT
    || event.detail.product.code !== config.CERTSCORE_MARKETPLACE_PRODUCT_CODE
    || event.detail.product.id !== config.CERTSCORE_MARKETPLACE_PRODUCT_ID) throw new Error("Unexpected Marketplace event identity.");
  if (event["detail-type"] === "License Deprovisioned - Manufacturer") {
    await applyLicenseEvent(event, false, null);
    return;
  }
  // An update is not itself a grant. Check AWS's current agreement state, fail closed on errors.
  const agreement = await agreements.send(new DescribeAgreementCommand({ agreementId: event.detail.agreement.id }), { abortSignal: AbortSignal.timeout(10_000) });
  await applyLicenseEvent(event, agreementAllowsAccess(agreement, event.detail.acceptor.accountId), agreement.endTime ?? null);
}
