import type Stripe from "stripe";

type BillingAlertKind = "checkout_completed" | "invoice_paid" | "payment_failed" | "subscription_canceled";

export type BillingAlertInput = {
  amount?: number | null;
  currency?: string | null;
  customerEmail?: string | null;
  customerId?: string | null;
  eventId: string;
  invoiceId?: string | null;
  kind: BillingAlertKind;
  organizationId?: string | null;
  plan?: string | null;
  stripeObjectId: string;
  subscriptionId?: string | null;
};

function formatMoney(amount: number | null | undefined, currency: string | null | undefined) {
  if (typeof amount !== "number") {
    return null;
  }

  return new Intl.NumberFormat("en-US", {
    currency: (currency || "usd").toUpperCase(),
    style: "currency"
  }).format(amount / 100);
}

export function buildBillingAlertEmail(input: BillingAlertInput) {
  const amount = formatMoney(input.amount, input.currency);
  const subjectByKind: Record<BillingAlertKind, string> = {
    checkout_completed: "New subscription checkout completed",
    invoice_paid: "Subscription invoice paid",
    payment_failed: "Subscription payment failed",
    subscription_canceled: "Subscription canceled"
  };
  const subject = `[CertScore Billing] ${subjectByKind[input.kind]}`;
  const lines = [
    subjectByKind[input.kind],
    "",
    `Event: ${input.eventId}`,
    `Stripe object: ${input.stripeObjectId}`,
    input.organizationId ? `Organization ID: ${input.organizationId}` : null,
    input.plan ? `Plan: ${input.plan}` : null,
    input.customerEmail ? `Customer email: ${input.customerEmail}` : null,
    input.customerId ? `Stripe customer: ${input.customerId}` : null,
    input.subscriptionId ? `Stripe subscription: ${input.subscriptionId}` : null,
    input.invoiceId ? `Stripe invoice: ${input.invoiceId}` : null,
    amount ? `Amount: ${amount}` : null
  ].filter((line): line is string => Boolean(line));

  return {
    subject,
    text: lines.join("\n")
  };
}

function getCheckoutAmount(session: Stripe.Checkout.Session) {
  return session.amount_total ?? session.amount_subtotal ?? null;
}

function getInvoiceAmount(invoice: Stripe.Invoice) {
  return invoice.amount_paid || invoice.amount_due || null;
}

function getCustomerId(value: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined) {
  if (!value) {
    return null;
  }
  return typeof value === "string" ? value : value.id;
}

function getSubscriptionId(value: string | Stripe.Subscription | null | undefined) {
  if (!value) {
    return null;
  }
  return typeof value === "string" ? value : value.id;
}

export function buildBillingAlertInput(event: Stripe.Event): BillingAlertInput | null {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      return {
        amount: getCheckoutAmount(session),
        currency: session.currency,
        customerEmail: session.customer_details?.email ?? session.customer_email ?? null,
        customerId: getCustomerId(session.customer as string | Stripe.Customer | Stripe.DeletedCustomer | null),
        eventId: event.id,
        kind: "checkout_completed",
        organizationId: session.metadata?.certscore_organization_id ?? session.client_reference_id ?? null,
        plan: session.metadata?.certscore_plan ?? session.metadata?.certscore_selected_plan ?? null,
        stripeObjectId: session.id,
        subscriptionId: getSubscriptionId(session.subscription as string | Stripe.Subscription | null)
      };
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      return {
        customerId: getCustomerId(subscription.customer as string | Stripe.Customer | Stripe.DeletedCustomer | null),
        eventId: event.id,
        kind: "subscription_canceled",
        organizationId: subscription.metadata?.certscore_organization_id ?? null,
        plan: subscription.metadata?.certscore_plan ?? null,
        stripeObjectId: subscription.id,
        subscriptionId: subscription.id
      };
    }
    case "invoice.payment_succeeded":
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      return {
        amount: getInvoiceAmount(invoice),
        currency: invoice.currency,
        customerEmail: invoice.customer_email,
        customerId: getCustomerId(invoice.customer as string | Stripe.Customer | Stripe.DeletedCustomer | null),
        eventId: event.id,
        invoiceId: invoice.id,
        kind: event.type === "invoice.payment_failed" ? "payment_failed" : "invoice_paid",
        organizationId: invoice.metadata?.certscore_organization_id ?? null,
        plan: invoice.metadata?.certscore_plan ?? null,
        stripeObjectId: invoice.id ?? event.id,
        subscriptionId: getSubscriptionId((invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null }).subscription)
      };
    }
    default:
      return null;
  }
}
