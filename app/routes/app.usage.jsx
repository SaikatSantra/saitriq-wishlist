import { authenticate } from "../shopify.server";
import { currentUsage, monthlyLimit } from "../db.wishlist.server";

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
  const month = new Date().toISOString().slice(0, 7);
  const used = await currentUsage(session.shop, month);
  const limit = monthlyLimit("free");

  return json({
    used,
    limit,
    remaining: Number.isFinite(limit) ? Math.max(0, limit - used) : null,
  });
};
