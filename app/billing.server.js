/**
 * Shopify Billing API helpers
 *
 * Flow:
 *  1. merchant clicks Upgrade → createSubscription() → redirect to confirmationUrl
 *  2. Shopify redirects back to /app/billing?shop=...&charge_id=...
 *  3. app.billing.jsx calls activateSubscription() → saves to DB
 *  4. Every proxy / admin request calls getActivePlan() → reads DB cache
 */

import prisma from "./db.server";
import { getPlan, PLANS } from "./plans";

// ─── GraphQL mutations ────────────────────────────────────────────────────────

const APP_SUBSCRIPTION_CREATE = `#graphql
  mutation AppSubscriptionCreate(
    $name: String!
    $lineItems: [AppSubscriptionLineItemInput!]!
    $returnUrl: String!
    $trialDays: Int
    $test: Boolean
  ) {
    appSubscriptionCreate(
      name: $name
      lineItems: $lineItems
      returnUrl: $returnUrl
      trialDays: $trialDays
      test: $test
    ) {
      appSubscription {
        id
        status
        trialDays
        currentPeriodEnd
      }
      confirmationUrl
      userErrors { field message }
    }
  }
`;

const APP_SUBSCRIPTION_CANCEL = `#graphql
  mutation AppSubscriptionCancel($id: ID!) {
    appSubscriptionCancel(id: $id) {
      appSubscription { id status }
      userErrors { field message }
    }
  }
`;

const APP_SUBSCRIPTIONS_ACTIVE = `#graphql
  query ActiveSubscriptions {
    currentAppInstallation {
      activeSubscriptions {
        id
        name
        status
        trialDays
        currentPeriodEnd
        lineItems {
          plan {
            pricingDetails {
              ... on AppRecurringPricing {
                price { amount currencyCode }
                interval
              }
            }
          }
        }
      }
    }
  }
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Map Shopify subscription name back to our plan id */
const planIdFromName = (name) => {
  const plan = PLANS.find(
    (p) => p.name.toLowerCase() === String(name).toLowerCase(),
  );
  return plan?.id ?? "free";
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Start a new subscription for a paid plan.
 * Returns { confirmationUrl } to redirect the merchant to.
 */
export const createSubscription = async (admin, planId, returnUrl) => {
  const plan = getPlan(planId);
  if (!plan || plan.price === 0) {
    throw new Error(`Cannot create a billing subscription for plan: ${planId}`);
  }

  const isTest = process.env.NODE_ENV !== "production";

  const response = await admin.graphql(APP_SUBSCRIPTION_CREATE, {
    variables: {
      name: plan.name,
      returnUrl,
      trialDays: plan.trialDays ?? 0,
      test: isTest,
      lineItems: [
        {
          plan: {
            appRecurringPricingDetails: {
              price: { amount: plan.price, currencyCode: "USD" },
              interval: "EVERY_30_DAYS",
            },
          },
        },
      ],
    },
  });

  const payload = await response.json();
  const result = payload?.data?.appSubscriptionCreate;
  const errors = result?.userErrors ?? [];

  if (errors.length) {
    throw new Error(
      `Subscription creation failed: ${errors.map((e) => e.message).join(", ")}`,
    );
  }

  return {
    confirmationUrl: result.confirmationUrl,
    subscriptionId: result.appSubscription?.id,
  };
};

/**
 * Cancel an existing subscription.
 */
export const cancelSubscription = async (admin, subscriptionId) => {
  const response = await admin.graphql(APP_SUBSCRIPTION_CANCEL, {
    variables: { id: subscriptionId },
  });
  const payload = await response.json();
  const errors = payload?.data?.appSubscriptionCancel?.userErrors ?? [];
  if (errors.length) {
    throw new Error(
      `Subscription cancellation failed: ${errors.map((e) => e.message).join(", ")}`,
    );
  }
  return true;
};

/**
 * Read the active subscription from Shopify and sync it to our DB.
 * Returns the planId string.
 */
export const syncSubscriptionFromShopify = async (admin, shop) => {
  const response = await admin.graphql(APP_SUBSCRIPTIONS_ACTIVE);
  const payload = await response.json();
  const subs =
    payload?.data?.currentAppInstallation?.activeSubscriptions ?? [];

  if (subs.length === 0) {
    // No active subscription — ensure DB reflects free plan
    await prisma.activeSubscription.upsert({
      where: { shop },
      create: { shop, planId: "free", status: "active" },
      update: { planId: "free", subscriptionId: null, status: "active" },
    });
    return "free";
  }

  const sub = subs[0];
  const planId = planIdFromName(sub.name);

  await prisma.activeSubscription.upsert({
    where: { shop },
    create: {
      shop,
      planId,
      subscriptionId: sub.id,
      status: sub.status.toLowerCase(),
      trialEndsOn: sub.trialDays
        ? new Date(Date.now() + sub.trialDays * 86400000)
        : null,
      currentPeriodEnd: sub.currentPeriodEnd
        ? new Date(sub.currentPeriodEnd)
        : null,
    },
    update: {
      planId,
      subscriptionId: sub.id,
      status: sub.status.toLowerCase(),
      currentPeriodEnd: sub.currentPeriodEnd
        ? new Date(sub.currentPeriodEnd)
        : null,
    },
  });

  return planId;
};

/**
 * Save a newly approved subscription to the DB.
 * Called from the billing callback route after merchant approves.
 */
export const activateSubscription = async (shop, planId, subscriptionId) => {
  await prisma.activeSubscription.upsert({
    where: { shop },
    create: {
      shop,
      planId,
      subscriptionId,
      status: "active",
    },
    update: {
      planId,
      subscriptionId,
      status: "active",
    },
  });
};

/**
 * Get the active plan for a shop — reads DB cache first, falls back to free.
 * Pass `admin` to re-sync from Shopify if the DB has no record.
 */
export const getActivePlan = async (shop, admin = null) => {
  const record = await prisma.activeSubscription.findUnique({
    where: { shop },
  });

  if (record && record.status === "active") return record.planId;

  // No DB record — sync from Shopify if we have an admin client
  if (admin) {
    return syncSubscriptionFromShopify(admin, shop);
  }

  return "free";
};

/**
 * Downgrade a shop to free (cancel paid sub + update DB).
 */
export const downgradeToFree = async (admin, shop) => {
  const record = await prisma.activeSubscription.findUnique({
    where: { shop },
  });
  if (record?.subscriptionId) {
    await cancelSubscription(admin, record.subscriptionId).catch((err) =>
      console.error("Cancel subscription error (non-fatal):", err),
    );
  }
  await prisma.activeSubscription.upsert({
    where: { shop },
    create: { shop, planId: "free", status: "active" },
    update: { planId: "free", subscriptionId: null, status: "active" },
  });
};
