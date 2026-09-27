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
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);

  const chargeId = url.searchParams.get("charge_id");
  const planId = url.searchParams.get("planId") || "free";

  if (!chargeId) {
    // No charge_id — merchant declined or navigated directly
    return redirect("/app/pricing?declined=1");
  }

  try {
    // Verify the subscription is actually ACTIVE with Shopify
    const response = await admin.graphql(SUBSCRIPTION_STATUS, {
      variables: { id: `gid://shopify/AppSubscription/${chargeId}` },
    });
    const payload = await response.json();
    const sub = payload?.data?.node;

    if (!sub || sub.status !== "ACTIVE") {
      // Merchant declined or subscription is not active
      return redirect("/app/pricing?declined=1");
    }

    // Persist to our DB
    await activateSubscription(shop, planId, sub.id);

    return redirect("/app/pricing?activated=1");
  } catch (err) {
    console.error("Billing callback error:", err);
    // Fall back to syncing from Shopify directly
    try {
      await syncSubscriptionFromShopify(admin, shop);
    } catch {}
    return redirect("/app/pricing?activated=1");
  }
};
