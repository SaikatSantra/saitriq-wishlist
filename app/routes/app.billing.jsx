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
import { authenticate } from "../shopify.server";
import { activateSubscription, syncSubscriptionFromShopify } from "../billing.server";

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

export const loader = async ({ request }) => {
  console.log("[BILLING] Route hit! URL:", request.url);

  const url = new URL(request.url);
  const chargeId = url.searchParams.get("charge_id");
  const planId = url.searchParams.get("planId") || "free";
  const shop = url.searchParams.get("shop") || "";

  // Always authenticate — this re-establishes the session
  // after the external Shopify billing redirect
  const { session, admin } = await authenticate.admin(request);
  const authenticatedShop = session.shop;

  console.log("[BILLING] Authenticated shop:", authenticatedShop, "chargeId:", chargeId, "planId:", planId);

  if (!chargeId) {
    return redirect("/app/pricing?declined=1");
  }

  try {
    const response = await admin.graphql(SUBSCRIPTION_STATUS, {
      variables: { id: `gid://shopify/AppSubscription/${chargeId}` },
    });
    const payload = await response.json();
    const sub = payload?.data?.node;

    console.log("[BILLING] Subscription status:", sub?.status, "id:", sub?.id);

    if (!sub || sub.status !== "ACTIVE") {
      return redirect("/app/pricing?declined=1");
    }

    await activateSubscription(authenticatedShop, planId, sub.id, {
      trialEndsOn: sub.trialDays
        ? new Date(Date.now() + sub.trialDays * 86400000).toISOString()
        : null,
      currentPeriodEnd: sub.currentPeriodEnd ?? null,
    });
    console.log("[BILLING] Plan activated:", planId, "for shop:", authenticatedShop);

    // Redirect into the Shopify admin embedded context so App Bridge initializes correctly
    const host = Buffer.from(`${authenticatedShop}/admin`).toString("base64url");
    return redirect(`/app/pricing?activated=1&host=${host}`);
  } catch (err) {
    console.error("[BILLING] Error:", err.message);
    try {
      await syncSubscriptionFromShopify(admin, authenticatedShop);
    } catch (e) {
      console.error("[BILLING] Fallback sync failed:", e.message);
    }
    const host = Buffer.from(`${authenticatedShop}/admin`).toString("base64url");
    return redirect(`/app/pricing?activated=1&host=${host}`);
  }
};
