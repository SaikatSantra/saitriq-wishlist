import { authenticate } from "../shopify.server";
import { currentUsage } from "../db.wishlist.server";
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

  const [planId, used] = await Promise.all([
    getActivePlan(shop),
    currentUsage(shop, month),
  ]);

  const limit = monthlyLimit(planId);
  const plan = getPlan(planId);

  return json({
    used,
    limit,
    remaining: Number.isFinite(limit) ? Math.max(0, limit - used) : null,
    planName: plan.name,
    planId,
  });
};
