import { authenticate } from "../shopify.server";
import { currentUsage, getMonthlyAddonSaves } from "../db.wishlist.server";
import { getPlanEntitlement } from "../billing.server";
import { getPlan } from "../plans";

const json = (data) =>
  new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
    },
  });

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const month = new Date().toISOString().slice(0, 7);

  const [entitlement, used, addonSaves] = await Promise.all([
    getPlanEntitlement(shop, month),
    currentUsage(shop, month),
    getMonthlyAddonSaves(shop, month),
  ]);

  const planId = entitlement.planId;
  const planLimit = entitlement.planLimit;
  const plan = getPlan(planId);
  const effectiveLimit = Number.isFinite(planLimit) ? planLimit + addonSaves : Infinity;

  return json({
    used,
    limit: effectiveLimit,
    planLimit,
    addonSaves,
    remaining: Number.isFinite(effectiveLimit) ? Math.max(0, effectiveLimit - used) : null,
    planName: plan.name,
    planId,
  });
};
