/**
 * Billing callback route — /app/billing
 *
 * Shopify redirects here after the merchant approves or declines
 * a subscription on the Shopify billing approval page.
 *
 * Query params from Shopify:
 *   charge_id  — the AppSubscription GID (gid://shopify/AppSubscription/...)
 *   shop       — the shop domain
 *
 * Our own return URL also passes:
 *   planId     — the plan id we tried to activate
 */

import { redirect } from "react-router";
import { Buffer } from "node:buffer";
import { authenticate } from "../shopify.server";
import {
  activateSubscription,
  getPlanEntitlement,
  monthKey,
  planIdFromName,
  planAllocationName,
  recordMonthlyPlanPurchase,
  recordPlanPurchaseHistory,
  syncSubscriptionFromShopify,
} from "../billing.server";
import { PLANS } from "../plans";

const SUBSCRIPTION_STATUS = `#graphql
  query GetSubscription($id: ID!) {
    node(id: $id) {
      ... on AppSubscription {
        id
        status
        name
        currentPeriodEnd
        trialDays
      }
    }
  }
`;

const ONE_TIME_PURCHASE_STATUS = `#graphql
  query GetOneTimePurchase($id: ID!) {
    node(id: $id) {
      ... on AppPurchaseOneTime {
        id
        name
        status
      }
    }
  }
`;

export const loader = async ({ request }) => {
  console.log("[BILLING] Route hit! URL:", request.url);

  const url = new URL(request.url);
  const chargeId = url.searchParams.get("charge_id");
  const requestedChangeType = url.searchParams.get("changeType");
  const callbackHost = url.searchParams.get("host");

  // Always authenticate — this re-establishes the session
  // after the external Shopify billing redirect
  const { session, admin } = await authenticate.admin(request);
  const authenticatedShop = session.shop;
  const host = callbackHost || Buffer.from(`${authenticatedShop}/admin`).toString("base64url");
  const pricingRedirect = (state) => {
    const params = new URLSearchParams({
      shop: authenticatedShop,
      host,
      embedded: "1",
      ...state,
    });
    return redirect(`/app/pricing?${params.toString()}`);
  };

  console.log("[BILLING] Authenticated shop:", authenticatedShop, "chargeId:", chargeId);

  if (!chargeId) {
    return pricingRedirect({ declined: "1" });
  }

  try {
    if (requestedChangeType === "extra") {
      const purchaseId = chargeId.startsWith("gid://shopify/AppPurchaseOneTime/")
        ? chargeId
        : `gid://shopify/AppPurchaseOneTime/${chargeId}`;
      const response = await admin.graphql(ONE_TIME_PURCHASE_STATUS, {
        variables: { id: purchaseId },
      });
      const payload = await response.json();
      if (payload?.errors?.length) {
        throw new Error(
          `One-time purchase verification failed: ${payload.errors.map((error) => error.message).join(", ")}`,
        );
      }
      const purchase = payload?.data?.node;
      if (!purchase || purchase.status !== "ACTIVE") {
        return pricingRedirect({ declined: "1" });
      }

      const planId = url.searchParams.get("planId") || "";
      if (purchase.name !== planAllocationName(planId)) {
        throw new Error("Approved allocation name does not match the requested plan.");
      }
      const entitlement = await getPlanEntitlement(authenticatedShop, monthKey(), admin);
      if (entitlement.planId !== planId) {
        throw new Error("The plan changed before the allocation purchase was approved.");
      }

      await recordMonthlyPlanPurchase(authenticatedShop, planId, purchase.id, "extra");
      await recordPlanPurchaseHistory({
        shop: authenticatedShop,
        planId,
        purchaseType: "extra_allocation",
        amount: PLANS.find((plan) => plan.id === planId).price,
        eventKey: `extra-allocation:${purchase.id}`,
      });
      return pricingRedirect({ allocationAdded: "1" });
    }

    const subscriptionId = chargeId.startsWith("gid://shopify/AppSubscription/")
      ? chargeId
      : `gid://shopify/AppSubscription/${chargeId}`;
    const response = await admin.graphql(SUBSCRIPTION_STATUS, {
      variables: { id: subscriptionId },
    });
    const payload = await response.json();
    const sub = payload?.data?.node;

    console.log("[BILLING] Subscription status:", sub?.status, "id:", sub?.id);

    if (!sub || sub.status !== "ACTIVE") {
      return pricingRedirect({ declined: "1" });
    }

    const planId = planIdFromName(sub.name);
    if (planId === "free") {
      throw new Error(`Approved subscription has an unrecognized plan name: ${sub.name}`);
    }
    const currentEntitlement = await getPlanEntitlement(
      authenticatedShop,
      monthKey(),
      admin,
    );
    const requestedPlan = PLANS.find((plan) => plan.id === planId);
    const currentPlan = PLANS.find((plan) => plan.id === currentEntitlement.planId);
    const isDowngrade =
      requestedChangeType === "downgrade" &&
      requestedPlan.price < (currentPlan?.price ?? 0);

    await activateSubscription(authenticatedShop, planId, sub.id, {
      trialEndsOn: sub.trialDays
        ? new Date(Date.now() + sub.trialDays * 86400000).toISOString()
        : null,
      currentPeriodEnd: sub.currentPeriodEnd ?? null,
      isDowngrade,
      previousPlanId: currentEntitlement.planId,
      purchaseType: requestedChangeType === "extra" ? "extra" : "base",
    });
    console.log("[BILLING] Plan activated:", planId, "for shop:", authenticatedShop);

    return pricingRedirect({ [isDowngrade ? "scheduled" : "activated"]: "1" });
  } catch (err) {
    console.error("[BILLING] Error:", err.message);
    try {
      await syncSubscriptionFromShopify(admin, authenticatedShop);
    } catch (e) {
      console.error("[BILLING] Fallback sync failed:", e.message);
    }
    return pricingRedirect({ billingError: "1" });
  }
};
