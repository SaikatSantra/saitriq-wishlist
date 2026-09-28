import { authenticate } from "../shopify.server";
import { currentUsage, getMonthlyAddonSaves } from "../db.wishlist.server";
import { getActivePlan } from "../billing.server";
import { monthlyLimit, getPlan } from "../plans";

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

  const [planId, used, addonSaves] = await Promise.all([
    getActivePlan(shop),
    currentUsage(shop, month),
    getMonthlyAddonSaves(shop, month),
  ]);

  const planLimit = monthlyLimit(planId);
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
