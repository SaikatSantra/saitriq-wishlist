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
    $returnUrl: URL!
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
  try {
    const response = await admin.graphql(APP_SUBSCRIPTIONS_ACTIVE);
    const payload = await response.json();
    const subs =
      payload?.data?.currentAppInstallation?.activeSubscriptions ?? [];

    if (subs.length === 0) {
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
  } catch (err) {
    if (err?.code === "P2021" || err?.message?.includes("does not exist")) {
      console.warn("ActiveSubscription table missing — defaulting to free plan.");
      return "free";
    }
    throw err;
  }
};

/**
 * Save a newly approved subscription to the DB.
 * Called from the billing callback route after merchant approves.
 */
export const activateSubscription = async (shop, planId, subscriptionId, { trialEndsOn, currentPeriodEnd } = {}) => {
  await prisma.activeSubscription.upsert({
    where: { shop },
    create: {
      shop,
      planId,
      subscriptionId,
      status: "active",
      trialEndsOn: trialEndsOn ? new Date(trialEndsOn) : null,
      currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd) : null,
    },
    update: {
      planId,
      subscriptionId,
      status: "active",
      trialEndsOn: trialEndsOn ? new Date(trialEndsOn) : null,
      currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd) : null,
    },
  });
};

/**
 * Get the active plan for a shop — reads DB cache first, falls back to free.
 * Pass `admin` to re-sync from Shopify if the DB has no record.
 */
export const getActivePlan = async (shop, admin = null) => {
  try {
    const record = await prisma.activeSubscription.findUnique({
      where: { shop },
    });

    if (record && record.status === "active") return record.planId;

    // No DB record — sync from Shopify if we have an admin client
    if (admin) {
      return syncSubscriptionFromShopify(admin, shop);
    }
  } catch (err) {
    // Table may not exist yet (migration pending) — degrade gracefully to free
    if (err?.code === "P2021" || err?.message?.includes("does not exist")) {
      console.warn("ActiveSubscription table missing — defaulting to free plan. Run pending migrations.");
      return "free";
    }
    throw err;
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

// ─── Addon (one-time purchase) ────────────────────────────────────────────────
// Change these values to update the addon price and saves granted.

export const ADDON = {
  saves: 5000,   // extra saves granted per purchase
  price: 5,      // price in USD (e.g. 5 = $5.00)
  name: "Saitriq Wishlist: +5,000 saves", // shown on Shopify billing page
};

const APP_PURCHASE_ONE_TIME_CREATE = `#graphql
  mutation AppPurchaseOneTimeCreate(
    $name: String!
    $price: MoneyInput!
    $returnUrl: URL!
    $test: Boolean
  ) {
    appPurchaseOneTimeCreate(
      name: $name
      price: $price
      returnUrl: $returnUrl
      test: $test
    ) {
      appPurchaseOneTime { id status }
      confirmationUrl
      userErrors { field message }
    }
  }
`;

/**
 * Create a Shopify one-time charge for the addon.
 * Returns { confirmationUrl, chargeId }.
 */
export const createAddonCharge = async (admin, returnUrl) => {
  const isTest = process.env.NODE_ENV !== "production";
  const response = await admin.graphql(APP_PURCHASE_ONE_TIME_CREATE, {
    variables: {
      name: ADDON.name,
      price: { amount: ADDON.price, currencyCode: "USD" },
      returnUrl,
      test: isTest,
    },
  });
  const payload = await response.json();
  const result = payload?.data?.appPurchaseOneTimeCreate;
  const errors = result?.userErrors ?? [];
  if (errors.length) {
    throw new Error(`Addon charge failed: ${errors.map((e) => e.message).join(", ")}`);
  }
  return {
    confirmationUrl: result.confirmationUrl,
    chargeId: result.appPurchaseOneTime?.id,
  };
};

/**
 * Activate the addon after Shopify confirms the charge.
 * Stores one row per purchase — multiple purchases stack.
 */
export const activateAddon = async (shop, chargeId) => {
  const month = new Date().toISOString().slice(0, 7);
  await prisma.addonPurchase.create({
    data: {
      shop,
      month,
      saves: ADDON.saves,
      price: ADDON.price,
      chargeId,
      status: "active",
    },
  });
};

/**
 * Total addon saves purchased for a shop in a given month.
 */
export const getMonthlyAddonSaves = async (shop, month) => {
  try {
    const rows = await prisma.addonPurchase.findMany({
      where: { shop, month, status: "active" },
    });
    return rows.reduce((sum, r) => sum + r.saves, 0);
  } catch (err) {
    if (err?.code === "P2021" || err?.message?.includes("does not exist")) return 0;
    throw err;
  }
};
