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
import { PLAN_RANK, resolvePlanEntitlement } from "./plan-entitlements";

export const monthKey = (date = new Date()) => date.toISOString().slice(0, 7);

export const nextMonthKey = (date = new Date()) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1))
    .toISOString()
    .slice(0, 7);

const nextMonthStart = (date = new Date()) =>
  new Date(`${nextMonthKey(date)}-01T00:00:00.000Z`);

const planEndDate = (subscription) =>
  subscription?.currentPeriodEnd ??
  subscription?.trialEndsOn ??
  nextMonthStart();

// ─── GraphQL mutations ────────────────────────────────────────────────────────

const APP_SUBSCRIPTION_CREATE = `#graphql
  mutation AppSubscriptionCreate(
    $name: String!
    $lineItems: [AppSubscriptionLineItemInput!]!
    $returnUrl: URL!
    $trialDays: Int
    $test: Boolean
    $replacementBehavior: AppSubscriptionReplacementBehavior
  ) {
    appSubscriptionCreate(
      name: $name
      lineItems: $lineItems
      returnUrl: $returnUrl
      trialDays: $trialDays
      test: $test
      replacementBehavior: $replacementBehavior
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
        createdAt
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

const fetchActiveSubscriptions = async (admin) => {
  const response = await admin.graphql(APP_SUBSCRIPTIONS_ACTIVE);
  const payload = await response.json();
  if (payload?.errors?.length) {
    throw new Error(
      `Subscription lookup failed: ${payload.errors.map((error) => error.message).join(", ")}`,
    );
  }
  const installation = payload?.data?.currentAppInstallation;
  if (!installation) throw new Error("Shopify returned no current app installation.");
  return installation.activeSubscriptions ?? [];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Map Shopify subscription name back to our plan id */
export const planIdFromName = (name) => {
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
export const createSubscription = async (
  admin,
  planId,
  returnUrl,
  replacementBehavior = "APPLY_IMMEDIATELY",
  trialDays,
) => {
  const plan = getPlan(planId);
  if (!plan || plan.price === 0) {
    throw new Error(`Cannot create a billing subscription for plan: ${planId}`);
  }

  const isTest = process.env.NODE_ENV !== "production";

  const response = await admin.graphql(APP_SUBSCRIPTION_CREATE, {
    variables: {
      name: plan.name,
      returnUrl,
      trialDays: trialDays ?? plan.trialDays ?? 0,
      test: isTest,
      replacementBehavior,
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
  if (payload?.errors?.length) {
    throw new Error(
      `Subscription cancellation failed: ${payload.errors.map((error) => error.message).join(", ")}`,
    );
  }
  const result = payload?.data?.appSubscriptionCancel;
  if (!result?.appSubscription) {
    throw new Error("Shopify did not return a canceled subscription.");
  }
  const errors = result.userErrors ?? [];
  if (errors.length) {
    throw new Error(
      `Subscription cancellation failed: ${errors.map((e) => e.message).join(", ")}`,
    );
  }
  if (result.appSubscription.status !== "CANCELLED") {
    throw new Error(`Shopify returned unexpected cancellation status: ${result.appSubscription.status}`);
  }
  return true;
};

export const recordMonthlyPlanPurchase = async (
  shop,
  planId,
  billingId,
  purchaseType = "base",
) => {
  await prisma.monthlyPlanPurchase.upsert({
    where: { billingId },
    create: {
      shop,
      month: monthKey(),
      planId,
      billingId,
      purchaseType,
    },
    update: {},
  });
};

export const recordPlanPurchaseHistory = async ({
  shop,
  planId,
  purchaseType,
  amount,
  eventKey,
  subscriptionId = null,
  billingPeriodEnd = null,
  occurredAt = new Date(),
}) => {
  try {
    await prisma.planPurchaseHistory.upsert({
      where: { eventKey },
      create: {
        shop,
        planId,
        purchaseType,
        amount,
        eventKey,
        subscriptionId,
        billingPeriodEnd,
        occurredAt,
      },
      update: {},
    });
  } catch (err) {
    // P2002 = unique constraint violation — a concurrent request already inserted
    // this event. Treat as success: the record exists, nothing to do.
    if (err?.code === "P2002") return;
    throw err;
  }
};

export const getPlanPurchaseHistory = (shop, take = 50) =>
  prisma.planPurchaseHistory.findMany({
    where: { shop },
    orderBy: { occurredAt: "desc" },
    take,
  });

const recordSubscriptionHistory = async (shop, subscription, occurredAt = new Date()) => {
  const planId = planIdFromName(subscription.name);
  if (planId === "free") return;

  const billingPeriodEnd = subscription.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd)
    : null;
  const manualEventKey = `subscription-start:${subscription.id}`;

  // Check & insert in a single try/catch — the P2002 guard in
  // recordPlanPurchaseHistory handles concurrent duplicate inserts.
  const manualEvent = await prisma.planPurchaseHistory.findUnique({
    where: { eventKey: manualEventKey },
  });

  if (!manualEvent) {
    await recordPlanPurchaseHistory({
      shop,
      planId,
      purchaseType: "manual_purchase",
      amount: getPlan(planId).price,
      eventKey: manualEventKey,
      subscriptionId: subscription.id,
      billingPeriodEnd,
      occurredAt: subscription.createdAt ? new Date(subscription.createdAt) : occurredAt,
    });
    return;
  }

  // Already have the initial event — check for a new billing period
  const lastPeriodEvent = await prisma.planPurchaseHistory.findFirst({
    where: {
      shop,
      subscriptionId: subscription.id,
      purchaseType: { in: ["manual_purchase", "auto_renewal"] },
      billingPeriodEnd: { not: null },
    },
    orderBy: { billingPeriodEnd: "desc" },
  });

  if (
    billingPeriodEnd &&
    (!lastPeriodEvent?.billingPeriodEnd || billingPeriodEnd > lastPeriodEvent.billingPeriodEnd)
  ) {
    await recordPlanPurchaseHistory({
      shop,
      planId,
      purchaseType: "auto_renewal",
      amount: getPlan(planId).price,
      eventKey: `auto-renewal:${subscription.id}:${billingPeriodEnd.toISOString()}`,
      subscriptionId: subscription.id,
      billingPeriodEnd,
      occurredAt,
    });
  }
};

/**
 * Read the active subscription from Shopify and sync it to our DB.
 * Returns the planId string.
 */
export const syncSubscriptionFromShopify = async (
  admin,
  shop,
  { eventOccurredAt = new Date() } = {},
) => {
  try {
    const subs = await fetchActiveSubscriptions(admin);
    for (const subscription of subs) {
      await recordSubscriptionHistory(shop, subscription, eventOccurredAt);
    }

    if (subs.length === 0) {
      const cached = await prisma.activeSubscription.findUnique({ where: { shop } });
      const now = new Date();
      const paidThrough = cached?.currentPeriodEnd ?? cached?.trialEndsOn;
      const recentlyActivated = cached && now - cached.updatedAt < 5 * 60 * 1000;
      if (
        cached?.status === "active" &&
        cached.planId !== "free" &&
        (paidThrough ? paidThrough > now : recentlyActivated)
      ) {
        return cached.planId;
      }

      await prisma.activeSubscription.upsert({
        where: { shop },
        create: { shop, planId: "free", status: "active" },
        update: { planId: "free", subscriptionId: null, status: "active" },
      });
      return "free";
    }

    const sub = [...subs].sort(
      (a, b) =>
        (PLAN_RANK[planIdFromName(b.name)] ?? 0) -
        (PLAN_RANK[planIdFromName(a.name)] ?? 0),
    )[0];
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
export const activateSubscription = async (
  shop,
  planId,
  subscriptionId,
  {
    trialEndsOn,
    currentPeriodEnd,
    isDowngrade = false,
    previousPlanId = "free",
    purchaseType = "base",
  } = {},
) => {
  if (isDowngrade) {
    const currentSubscription = await prisma.activeSubscription.findUnique({
      where: { shop },
    });
    const effectiveAt = planEndDate(currentSubscription);
    const scheduled = await prisma.scheduledPlanChange.upsert({
      where: { shop },
      create: {
        shop,
        planId,
        previousPlanId,
        effectiveMonth: monthKey(effectiveAt),
        effectiveAt,
        subscriptionId,
      },
      update: {
        planId,
        previousPlanId,
        effectiveMonth: monthKey(effectiveAt),
        effectiveAt,
        subscriptionId,
      },
    });
    await recordPlanPurchaseHistory({
      shop,
      planId,
      purchaseType: "manual_purchase",
      amount: getPlan(planId).price,
      eventKey: `subscription-start:${subscriptionId}`,
      subscriptionId,
      billingPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd) : null,
      occurredAt: new Date(),
    });
    return scheduled;
  }

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

  await prisma.scheduledPlanChange.deleteMany({ where: { shop } });
  await recordMonthlyPlanPurchase(shop, planId, subscriptionId, purchaseType);
  await recordPlanPurchaseHistory({
    shop,
    planId,
    purchaseType: "manual_purchase",
    amount: getPlan(planId).price,
    eventKey: `subscription-start:${subscriptionId}`,
    subscriptionId,
    billingPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd) : null,
    occurredAt: new Date(),
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
 * Resolve the highest plan entitlement for a calendar month.
 * Same-tier purchases stack only within the month they were approved.
 */
  export const getPlanEntitlement = async (shop, month = monthKey(), admin = null) => {
    const [activePlanId, scheduled, purchases] = await Promise.all([
      admin ? syncSubscriptionFromShopify(admin, shop) : getActivePlan(shop),
      prisma.scheduledPlanChange.findUnique({ where: { shop } }),
      prisma.monthlyPlanPurchase.findMany({ where: { shop, month } }),
    ]);

    return resolvePlanEntitlement({ activePlanId, month, scheduled, purchases });
  };

/** Schedule a Free downgrade for next month while stopping future renewals. */
export const scheduleFreeDowngrade = async (admin, shop, previousPlanId) => {
  const [record, subscriptions] = await Promise.all([
    prisma.activeSubscription.findUnique({ where: { shop } }),
    fetchActiveSubscriptions(admin),
  ]);
  const effectiveAt = planEndDate(record);
  for (const subscription of subscriptions) {
    if (subscription.status === "ACTIVE") {
      await cancelSubscription(admin, subscription.id);
    }
  }

  await prisma.scheduledPlanChange.upsert({
    where: { shop },
    create: {
      shop,
      planId: "free",
      previousPlanId,
      effectiveMonth: monthKey(effectiveAt),
      effectiveAt,
    },
    update: {
      planId: "free",
      previousPlanId,
      effectiveMonth: monthKey(effectiveAt),
      effectiveAt,
      subscriptionId: null,
    },
  });
  return { effectiveAt };
};

// ─── Addon (one-time purchase) ────────────────────────────────────────────────
// Change these values to update the addon price and saves granted.

export const ADDON = {
  saves: 5000,   // extra saves granted per purchase
  price: 5,      // price in USD (e.g. 5 = $5.00)
  name: "Silverclouding Wishlist: +5,000 saves", // shown on Shopify billing page
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

export const planAllocationName = (planId) => {
  const plan = getPlan(planId);
  if (!plan || plan.price === 0 || !Number.isFinite(plan.limit)) {
    throw new Error(`Plan does not support extra allocations: ${planId}`);
  }
  return `Silverclouding Wishlist: ${plan.name} allocation (${plan.limit.toLocaleString()} saves)`;
};

const createOneTimeCharge = async (admin, name, amount, returnUrl) => {
  const isTest = process.env.NODE_ENV !== "production";
  const response = await admin.graphql(APP_PURCHASE_ONE_TIME_CREATE, {
    variables: {
      name,
      price: { amount, currencyCode: "USD" },
      returnUrl,
      test: isTest,
    },
  });
  const payload = await response.json();
  const result = payload?.data?.appPurchaseOneTimeCreate;
  const errors = result?.userErrors ?? [];
  if (errors.length) {
    throw new Error(`One-time charge failed: ${errors.map((e) => e.message).join(", ")}`);
  }
  return {
    confirmationUrl: result.confirmationUrl,
    chargeId: result.appPurchaseOneTime?.id,
  };
};

export const createPlanAllocationCharge = async (admin, planId, returnUrl) => {
  const plan = getPlan(planId);
  const name = planAllocationName(planId);
  return createOneTimeCharge(admin, name, plan.price, returnUrl);
};

/**
 * Create a Shopify one-time charge for the addon.
 * Returns { confirmationUrl, chargeId }.
 */
export const createAddonCharge = async (admin, returnUrl) => {
  return createOneTimeCharge(admin, ADDON.name, ADDON.price, returnUrl);
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
