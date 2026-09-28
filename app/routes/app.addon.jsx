/**
 * Addon callback route — /app/addon
 *
 * Shopify redirects here after the merchant approves (or declines)
 * the one-time +5,000 saves charge.
 *
 * Query params from Shopify:
 *   charge_id — the AppPurchaseOneTime GID numeric portion
 */

import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import { activateAddon } from "../billing.server";

const VERIFY_CHARGE = `#graphql
  query VerifyAddonCharge($id: ID!) {
    node(id: $id) {
      ... on AppPurchaseOneTime {
        id
        status
        name
      }
    }
  }
`;

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const chargeId = url.searchParams.get("charge_id");

  if (!chargeId) return redirect("/app/pricing?addon=declined");

  try {
    const response = await admin.graphql(VERIFY_CHARGE, {
      variables: { id: `gid://shopify/AppPurchaseOneTime/${chargeId}` },
    });
    const payload = await response.json();
    const charge = payload?.data?.node;

    if (!charge || charge.status !== "ACTIVE") {
      return redirect("/app/pricing?addon=declined");
    }

    await activateAddon(shop, charge.id);
    return redirect("/app/pricing?addon=activated");
  } catch (err) {
    console.error("Addon callback error:", err);
    return redirect("/app/pricing?addon=error");
  }
};
