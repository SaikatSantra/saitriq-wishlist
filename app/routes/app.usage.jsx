import { authenticate } from "../shopify.server";
import {
  countWishlistSavesForMonth,
  getAnalytics,
  monthlyLimit,
} from "../metaobjects.server";

const json = (data) =>
  new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
    },
  });

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const month = new Date().toISOString().slice(0, 7);
  const [analytics, savedRecords] = await Promise.all([
    getAnalytics(admin, month),
    countWishlistSavesForMonth(admin, month),
  ]);
  const used = Math.max(analytics.adds, savedRecords);
  const limit = monthlyLimit("free");

  return json({
    used,
    limit,
    remaining: Number.isFinite(limit) ? Math.max(0, limit - used) : null,
  });
};
