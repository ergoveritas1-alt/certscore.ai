import Stripe from "stripe";

type PlanSetup = {
  amount: number;
  envName: string;
  lookupKey: string;
  productName: string;
};

const plans = [
  {
    amount: 4000,
    envName: "STRIPE_PRICE_INDIVIDUAL_MONTHLY",
    lookupKey: "certscore_starter_monthly",
    productName: "CertScore Starter"
  },
  {
    amount: 20000,
    envName: "STRIPE_PRICE_PRO_MONTHLY",
    lookupKey: "certscore_pro_monthly",
    productName: "CertScore Pro"
  }
] as const satisfies readonly PlanSetup[];

const webhookEvents = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_succeeded",
  "invoice.payment_failed"
] as const;

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Set ${name}.`);
  }

  return value;
}

function getOptionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

function isApplyMode() {
  return process.argv.includes("--apply");
}

function getWebhookUrl() {
  const explicitUrl = getOptionalEnv("STRIPE_WEBHOOK_URL");
  if (explicitUrl) {
    return explicitUrl;
  }

  const appUrl = getAppUrl();
  return new URL("/api/stripe/webhook", appUrl).toString();
}

function getAppUrl() {
  return getRequiredEnv("NEXT_PUBLIC_APP_URL").replace(/\/+$/, "");
}

async function findActivePriceByLookupKey(stripe: Stripe, lookupKey: string) {
  const prices = await stripe.prices.list({
    active: true,
    limit: 1,
    lookup_keys: [lookupKey]
  });

  return prices.data[0] ?? null;
}

async function findOrCreateProduct(stripe: Stripe, name: string, apply: boolean) {
  const products = await stripe.products.search({
    limit: 1,
    query: `name:'${name.replaceAll("'", "\\'")}' AND active:'true'`
  });
  const existingProduct = products.data[0] ?? null;

  if (existingProduct || !apply) {
    return existingProduct;
  }

  return stripe.products.create({
    name,
    metadata: {
      certscore_managed: "true"
    }
  });
}

async function findOrCreatePrice(stripe: Stripe, plan: PlanSetup, apply: boolean) {
  const existingPrice = await findActivePriceByLookupKey(stripe, plan.lookupKey);
  if (existingPrice || !apply) {
    return existingPrice;
  }

  const product = await findOrCreateProduct(stripe, plan.productName, apply);
  if (!product) {
    throw new Error(`Could not find or create Stripe product ${plan.productName}.`);
  }

  return stripe.prices.create({
    currency: "usd",
    lookup_key: plan.lookupKey,
    metadata: {
      certscore_managed: "true"
    },
    product: product.id,
    recurring: {
      interval: "month"
    },
    unit_amount: plan.amount
  });
}

async function findWebhookEndpoint(stripe: Stripe, url: string) {
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  return endpoints.data.find((endpoint) => endpoint.url === url && endpoint.status === "enabled") ?? null;
}

async function findOrCreateWebhookEndpoint(stripe: Stripe, apply: boolean) {
  const url = getWebhookUrl();
  const existingEndpoint = await findWebhookEndpoint(stripe, url);
  if (existingEndpoint && apply) {
    const enabledEvents = new Set(existingEndpoint.enabled_events);
    const hasExpectedEvents = webhookEvents.every((event) => enabledEvents.has(event));
    if (!hasExpectedEvents) {
      const endpoint = await stripe.webhookEndpoints.update(existingEndpoint.id, {
        enabled_events: [...webhookEvents],
        metadata: {
          ...existingEndpoint.metadata,
          certscore_managed: "true"
        }
      });
      return {
        endpoint,
        secret: null,
        url
      };
    }
  }

  if (existingEndpoint || !apply) {
    return {
      endpoint: existingEndpoint,
      secret: null,
      url
    };
  }

  const endpoint = await stripe.webhookEndpoints.create({
    enabled_events: [...webhookEvents],
    metadata: {
      certscore_managed: "true"
    },
    url
  });

  return {
    endpoint,
    secret: endpoint.secret ?? null,
    url
  };
}

async function findOrCreateBillingPortalConfiguration(stripe: Stripe, apply: boolean) {
  const appUrl = getAppUrl();
  const configurations = await stripe.billingPortal.configurations.list({ limit: 100 });
  const existingConfiguration =
    configurations.data.find(
      (configuration) => configuration.active && configuration.metadata.certscore_managed === "true"
    ) ?? null;

  const params = {
    business_profile: {
      headline: "Manage your CertScore.ai subscription.",
      privacy_policy_url: `${appUrl}/privacy`,
      terms_of_service_url: `${appUrl}/terms`
    },
    default_return_url: `${appUrl}/app/modify-plan`,
    features: {
      customer_update: {
        allowed_updates: ["email", "tax_id"],
        enabled: true
      },
      invoice_history: {
        enabled: true
      },
      payment_method_update: {
        enabled: true
      },
      subscription_cancel: {
        cancellation_reason: {
          enabled: true,
          options: ["too_expensive", "missing_features", "switched_service", "unused", "too_complex", "other"]
        },
        enabled: true,
        mode: "at_period_end",
        proration_behavior: "none"
      },
      subscription_update: {
        enabled: false
      }
    },
    metadata: {
      certscore_managed: "true"
    }
  } satisfies Stripe.BillingPortal.ConfigurationCreateParams;

  if (existingConfiguration && apply) {
    return stripe.billingPortal.configurations.update(existingConfiguration.id, params);
  }

  if (existingConfiguration || !apply) {
    return existingConfiguration;
  }

  return stripe.billingPortal.configurations.create(params);
}

async function main() {
  const apply = isApplyMode();
  const stripe = new Stripe(getRequiredEnv("STRIPE_SECRET_KEY"), {
    apiVersion: "2025-02-24.acacia"
  });

  const priceResults = [];
  for (const plan of plans) {
    const price = await findOrCreatePrice(stripe, plan, apply);
    priceResults.push({
      amount: plan.amount,
      envName: plan.envName,
      lookupKey: plan.lookupKey,
      priceId: price?.id ?? null,
      productName: plan.productName,
      status: price ? "ready" : apply ? "missing" : "would_create"
    });
  }

  const webhook = await findOrCreateWebhookEndpoint(stripe, apply);
  const billingPortalConfiguration = await findOrCreateBillingPortalConfiguration(stripe, apply);

  console.log(
    JSON.stringify(
      {
        apply,
        billingPortal: {
          cancellationMode: billingPortalConfiguration?.features.subscription_cancel.mode ?? "at_period_end",
          id: billingPortalConfiguration?.id ?? null,
          status: billingPortalConfiguration ? "ready" : apply ? "missing" : "would_create",
          subscriptionCancelEnabled: billingPortalConfiguration?.features.subscription_cancel.enabled ?? null
        },
        prices: priceResults,
        webhook: {
          enabledEvents: webhookEvents,
          id: webhook.endpoint?.id ?? null,
          signingSecretEnvName: "STRIPE_WEBHOOK_SECRET",
          signingSecretReturned: Boolean(webhook.secret),
          status: webhook.endpoint ? "ready" : apply ? "missing" : "would_create",
          url: webhook.url
        }
      },
      null,
      2
    )
  );

  if (webhook.secret) {
    console.log("");
    console.log("Set STRIPE_WEBHOOK_SECRET to the signing secret returned by Stripe for this endpoint.");
    console.log("Stripe only shows this secret at creation time; store it in your local and production secrets now.");
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
