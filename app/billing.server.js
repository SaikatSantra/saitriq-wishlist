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
  if (purchaseType === "base") {
    await prisma.monthlyPlanPurchase.deleteMany({
      where: { shop, month: monthKey(), purchaseType: "base" },
    });
  }
  await prisma.monthlyPlanPurchase.upsert({
    where: { billingId },
    create: {
      shop,
      month: monthKey(),
      planId,
      billingId,
      purchaseType,
    },
    update: {
      planId,
      purchaseType,
    },
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
  if (purchaseType === "base") {
    await prisma.monthlyPlanPurchase.deleteMany({ where: { shop, month: monthKey(), purchaseType: "base" } });
  }
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

/**
 * Retrieve comprehensive plan purchase and billing details for a shop,
 * including active subscription status, purchase date, renewal/end date,
 * and a full month-wise breakdown of plan usage.
 */
export const getSubscriptionBillingDetails = async (shop, admin = null) => {
  const currentMonth = monthKey();

  // If active subscription record is missing in DB and admin is provided, try sync
  let activeSub = await prisma.activeSubscription.findUnique({ where: { shop } });
  if (!activeSub && admin) {
    try {
      await syncSubscriptionFromShopify(admin, shop);
      activeSub = await prisma.activeSubscription.findUnique({ where: { shop } });
    } catch (e) {
      console.warn("Could not sync subscription from Shopify:", e?.message);
    }
  }

  const [scheduledChange, historyRows, monthlyPurchases, addonPurchases] = await Promise.all([
    prisma.scheduledPlanChange.findUnique({ where: { shop } }),
    prisma.planPurchaseHistory.findMany({
      where: { shop },
      orderBy: { occurredAt: "desc" },
      take: 50,
    }),
    prisma.monthlyPlanPurchase.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
    }),
    prisma.addonPurchase.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const entitlement = await getPlanEntitlement(shop, currentMonth, admin);
  const planId = entitlement.planId || activeSub?.planId || "free";
  const planMeta = getPlan(planId) || getPlan("free");
  const activeHistory = activeSub?.subscriptionId
    ? historyRows.find((h) => h.subscriptionId === activeSub.subscriptionId)
    : historyRows.find((h) => h.planId === planId && h.purchaseType !== "cancellation");
  const purchaseDate = planId === "free"
    ? null
    : (activeHistory?.occurredAt ? activeHistory.occurredAt.toISOString() : (activeSub?.updatedAt ? activeSub.updatedAt.toISOString() : null));
  const currentPeriodEnd = activeSub?.currentPeriodEnd ? activeSub.currentPeriodEnd.toISOString() : null;
  const trialEndsOn = activeSub?.trialEndsOn ? activeSub.trialEndsOn.toISOString() : null;
  const subscriptionId = activeSub?.subscriptionId || null;
  const shortSubscriptionId = subscriptionId
    ? subscriptionId.replace("gid://shopify/AppSubscription/", "#")
    : null;

  const currentMonthAddons = addonPurchases.filter((a) => a.month === currentMonth && a.status === "active");
  const addonSaves = currentMonthAddons.reduce((sum, a) => sum + a.saves, 0);

  // If a paid subscription exists but historyRows has no record for this subscription, record it
  if (
    activeSub?.subscriptionId &&
    planId !== "free" &&
    !historyRows.some((h) => h.subscriptionId === activeSub.subscriptionId)
  ) {
    try {
      await recordPlanPurchaseHistory({
        shop,
        planId,
        purchaseType: "manual_purchase",
        amount: planMeta.price,
        eventKey: `subscription-start:${activeSub.subscriptionId}`,
        subscriptionId: activeSub.subscriptionId,
        billingPeriodEnd: activeSub.currentPeriodEnd,
        occurredAt: activeSub.createdAt || new Date(),
      });
      const refreshedHistory = await prisma.planPurchaseHistory.findMany({
        where: { shop },
        orderBy: { occurredAt: "desc" },
        take: 50,
      });
      historyRows.length = 0;
      historyRows.push(...refreshedHistory);
    } catch (err) {
      console.warn("Could not backfill subscription history:", err?.message);
    }
  }

  const currentSubscription = {
    planId,
    planName: planMeta.name,
    price: planMeta.price,
    currency: "USD",
    status: activeSub?.status || "active",
    purchaseDate,
    currentPeriodEnd,
    trialEndsOn,
    isTrial: trialEndsOn ? new Date(trialEndsOn) > new Date() : false,
    subscriptionId,
    shortSubscriptionId,
    interval: planMeta.price > 0 ? "Every 30 days" : "Free Forever",
    savesLimit: entitlement.planLimit,
    addonSaves,
    effectiveLimit: Number.isFinite(entitlement.planLimit) ? entitlement.planLimit + addonSaves : Infinity,
    scheduledChange: scheduledChange
      ? {
          planId: scheduledChange.planId,
          planName: getPlan(scheduledChange.planId)?.name || scheduledChange.planId,
          effectiveMonth: scheduledChange.effectiveMonth,
          effectiveAt: scheduledChange.effectiveAt ? scheduledChange.effectiveAt.toISOString() : null,
        }
      : null,
  };

  // Collect distinct months
  const monthSet = new Set();
  monthSet.add(currentMonth);
  if (purchaseDate) monthSet.add(purchaseDate.slice(0, 7));
  for (const h of historyRows) {
    if (h.occurredAt) monthSet.add(h.occurredAt.toISOString().slice(0, 7));
  }
  for (const m of monthlyPurchases) {
    if (m.month) monthSet.add(m.month);
  }
  for (const a of addonPurchases) {
    if (a.month) monthSet.add(a.month);
  }

  const sortedMonths = Array.from(monthSet).sort().reverse();

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  const formatMonthLabel = (mKey) => {
    const [year, monthNum] = mKey.split("-");
    const monthIndex = parseInt(monthNum, 10) - 1;
    return `${monthNames[monthIndex] || monthNum} ${year}`;
  };

  const monthlyBreakdown = sortedMonths.map((m) => {
    const isCurrent = m === currentMonth;
    const historyForMonth = historyRows.filter(
      (h) => h.occurredAt && h.occurredAt.toISOString().slice(0, 7) === m,
    );
    const monthlyPurchase = monthlyPurchases.find((p) => p.month === m);
    const addonsForMonth = addonPurchases.filter((a) => a.month === m);
    const addonTotal = addonsForMonth.reduce((sum, a) => sum + (a.price || 0), 0);

    let mPlanId = isCurrent ? planId : (monthlyPurchase?.planId || historyForMonth[0]?.planId || "free");
    const mPlan = getPlan(mPlanId) || getPlan("free");

    let mPurchaseDate = null;
    let mEndDate = null;
    let mSubId = null;
    let mType = "manual_purchase";

    if (isCurrent) {
      mPurchaseDate = purchaseDate || (historyForMonth[0]?.occurredAt ? historyForMonth[0].occurredAt.toISOString() : null);
      mEndDate = currentPeriodEnd || (historyForMonth[0]?.billingPeriodEnd ? historyForMonth[0].billingPeriodEnd.toISOString() : null);
      mSubId = subscriptionId;
      const cancellationEvent = historyForMonth.find((h) => h.purchaseType === "cancellation");
      mType = mPlanId === "free" ? (cancellationEvent ? "cancellation" : "free") : (historyForMonth[0]?.purchaseType || "manual_purchase");
    } else if (historyForMonth.length > 0) {
      const primary = historyForMonth[0];
      mPurchaseDate = primary.occurredAt ? primary.occurredAt.toISOString() : null;
      mEndDate = primary.billingPeriodEnd ? primary.billingPeriodEnd.toISOString() : null;
      mSubId = primary.subscriptionId;
      mType = primary.purchaseType;
    } else if (monthlyPurchase) {
      mPurchaseDate = monthlyPurchase.createdAt ? monthlyPurchase.createdAt.toISOString() : null;
      mSubId = monthlyPurchase.billingId;
      mType = monthlyPurchase.purchaseType;
    }

    const baseAmount = mPlan.price || 0;
    const totalAmount = baseAmount + addonTotal;

    return {
      month: m,
      monthLabel: formatMonthLabel(m),
      isCurrentMonth: isCurrent,
      planId: mPlanId,
      planName: mPlan.name,
      basePrice: baseAmount,
      totalAmount,
      currency: "USD",
      purchaseDate: mPurchaseDate,
      endDate: mEndDate,
      subscriptionId: mSubId,
      shortSubscriptionId: mSubId ? mSubId.replace("gid://shopify/AppSubscription/", "#") : null,
      purchaseType: mType,
      status: isCurrent ? (mType === "cancellation" ? "cancelled" : (activeSub?.status || "active")) : "completed",
      savesLimit: mPlan.limit,
      addons: addonsForMonth.map((a) => ({
        saves: a.saves,
        price: a.price,
        status: a.status,
        createdAt: a.createdAt ? a.createdAt.toISOString() : null,
      })),
    };
  });

  return {
    currentSubscription,
    monthlyBreakdown,
    historyRows: historyRows.map((h) => ({
      id: h.id,
      planId: h.planId,
      planName: getPlan(h.planId)?.name || h.planId,
      purchaseType: h.purchaseType,
      amount: h.amount,
      currencyCode: h.currencyCode,
      subscriptionId: h.subscriptionId,
      shortSubscriptionId: h.subscriptionId ? h.subscriptionId.replace("gid://shopify/AppSubscription/", "#") : null,
      billingPeriodEnd: h.billingPeriodEnd ? h.billingPeriodEnd.toISOString() : null,
      occurredAt: h.occurredAt ? h.occurredAt.toISOString() : null,
    })),
  };
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

/**
 * Cancel a paid subscription immediately, cancel recurring renewals on Shopify,
 * and revert the store to the Free tier.
 */
export const cancelPaidPlan = async (admin, shop) => {
  const [record, subscriptions] = await Promise.all([
    prisma.activeSubscription.findUnique({ where: { shop } }),
    admin ? fetchActiveSubscriptions(admin).catch(() => []) : [],
  ]);

  for (const subscription of subscriptions) {
    if (subscription.status === "ACTIVE" && admin) {
      try {
        await cancelSubscription(admin, subscription.id);
      } catch (e) {
        console.warn(`Could not cancel subscription ${subscription.id} on Shopify:`, e?.message);
      }
    }
  }

  if (record?.subscriptionId && admin) {
    try {
      await cancelSubscription(admin, record.subscriptionId);
    } catch (e) {
      console.warn(`Could not cancel cached subscription ${record.subscriptionId} on Shopify:`, e?.message);
    }
  }

  await prisma.activeSubscription.upsert({
    where: { shop },
    create: {
      shop,
      planId: "free",
      status: "active",
      subscriptionId: null,
      currentPeriodEnd: null,
      trialEndsOn: null,
    },
    update: {
      planId: "free",
      status: "active",
      subscriptionId: null,
      currentPeriodEnd: null,
      trialEndsOn: null,
    },
  });

  await prisma.scheduledPlanChange.deleteMany({ where: { shop } });
  await prisma.monthlyPlanPurchase.deleteMany({ where: { shop, month: monthKey() } });

  try {
    await recordPlanPurchaseHistory({
      shop,
      planId: "free",
      purchaseType: "cancellation",
      amount: 0,
      eventKey: `cancellation:${shop}:${Date.now()}`,
      occurredAt: new Date(),
    });
  } catch (e) {
    console.warn("Could not record cancellation history:", e?.message);
  }

  return { success: true };
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

export const planAllocationName = (planId) => {
  const plan = getPlan(planId);
  if (!plan || plan.price === 0 || !Number.isFinite(plan.limit)) {
    throw new Error(`Plan does not support extra allocations: ${planId}`);
  }
  return `Saitriq Wishlist: ${plan.name} allocation (${plan.limit.toLocaleString()} saves)`;
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
