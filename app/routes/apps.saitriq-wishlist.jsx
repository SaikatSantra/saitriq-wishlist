import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  getAnalytics,
  countWishlistSavesForMonth,
  listCustomerWishlists,
  monthlyLimit,
  recordAnalytics,
  upsertWishlist,
  deleteWishlist,
  deleteCustomerWishlists,
  guestWishlistHandle,
  wishlistHandle,
} from "../metaobjects.server";

const json = (data, init = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Saitriq-Wishlist-Version": "proxy-v10",
      ...(init.headers || {}),
    },
  });

const readPayload = async (request) => {
  const contentType = request.headers.get("content-type") || "";
  const rawBody = await request
    .clone()
    .text()
    .catch(() => "");
  if (rawBody.trim().startsWith("{")) {
    try {
      return JSON.parse(rawBody);
    } catch {
      return null;
    }
  }

  if (contentType.includes("application/json")) return null;
  const form = await request.formData().catch(() => null);
  return form ? Object.fromEntries(form.entries()) : null;
};

const getCustomerId = (request) => {
  const id = new URL(request.url).searchParams.get("logged_in_customer_id");
  if (id && /^\d+$/.test(id)) return id;
  const gidMatch = id?.match(/^gid:\/\/shopify\/Customer\/(\d+)$/);
  return gidMatch ? gidMatch[1] : null;
};

const monthKey = () => new Date().toISOString().slice(0, 7);

const usageFor = (used, limit) => ({
  used,
  limit,
  remaining: Number.isFinite(limit) ? Math.max(0, limit - used) : Infinity,
});

const defaultSettings = {
  heading: "My wishlist",
  emptyMessage: "You have not saved any products yet.",
  columns: 4,
  showPrices: true,
  showRemove: true,
  buttonLabel: "Remove",
};

const currentUsage = async (admin, month) => {
  const [analytics, savedRecords] = await Promise.all([
    getAnalytics(admin, month),
    countWishlistSavesForMonth(admin, month),
  ]);
  return {
    analytics,
    used: Math.max(analytics.adds, savedRecords),
  };
};

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.public.appProxy(request);
  const customerId = getCustomerId(request);
  if (!session || !admin || !customerId) {
    return json({ authenticated: false, items: [] });
  }

  const { used } = await currentUsage(admin, monthKey());
  const items = await listCustomerWishlists(admin, customerId);
  const settings = await prisma.wishlistSettings.findUnique({
    where: { shop: session.shop },
  });
  return json({
    authenticated: true,
    items,
    settings: settings || defaultSettings,
    usage: usageFor(used, monthlyLimit("free")),
  });
};

export const action = async ({ request }) => {
  try {
    const { session, admin } = await authenticate.public.appProxy(request);
    const customerId = getCustomerId(request);
    if (!session || !admin) {
      return json(
        { authenticated: false, error: "Wishlist service is unavailable." },
        { status: 502 },
      );
    }

    const payload = await readPayload(request);
    const operation = payload?.operation;
    const visitorId = String(payload?.visitorId || "")
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, "-")
      .slice(0, 80);
    const actorId = customerId || visitorId || null;
    if (!actorId) {
      return json(
        { authenticated: false, error: "A valid wishlist visitor is required." },
        { status: 400 },
      );
    }
    const handleFactory = customerId ? wishlistHandle : guestWishlistHandle;
    const month = monthKey();
    const limit = monthlyLimit("free");

    if (operation === "clear") {
      const removedCount = await deleteCustomerWishlists(
        admin,
        actorId,
        handleFactory,
      );
      if (removedCount > 0) {
        try {
          await recordAnalytics(admin, month, { removes: removedCount });
        } catch (error) {
          console.error("Wishlist clear analytics update failed", error);
        }
      }
      const { used: clearedUsage } = await currentUsage(admin, month);
      return json({
        authenticated: Boolean(customerId),
        tracked: true,
        items: customerId
          ? await listCustomerWishlists(admin, actorId)
          : [],
        usage: usageFor(clearedUsage, limit),
      });
    }

    const productId = String(payload?.productId || "").trim();
    const productHandle =
      String(payload?.productHandle || payload?.productId || "product").trim();
    const productTitle =
      String(payload?.productTitle || payload?.productHandle || "Product").trim();
    if (
      !productId ||
      !productHandle ||
      !productTitle ||
      !["add", "remove"].includes(operation)
    ) {
      return json(
        { error: "A valid wishlist operation and product details are required." },
        { status: 400 },
      );
    }

    const { used } = await currentUsage(admin, month);
    if (operation === "add" && used >= limit) {
      return json(
        {
          error: "This store has reached its monthly wishlist limit.",
          usage: { used, limit, remaining: 0 },
        },
        { status: 429 },
      );
    }

    if (operation === "add") {
      const result = await upsertWishlist(admin, {
        customerId: actorId,
        handleFactory,
        productId,
        productHandle,
        productTitle,
        productImage: payload.productImage,
        productPrice: payload.productPrice,
        addedAt: new Date().toISOString(),
      });
      if (result.created) {
        try {
          await recordAnalytics(admin, month, { adds: 1, uniqueCustomers: 1 });
        } catch (error) {
          console.error("Wishlist add analytics update failed", error);
        }
      }
    } else {
      const removed = await deleteWishlist(
        admin,
        actorId,
        productId,
        handleFactory,
      );
      if (removed) {
        try {
          await recordAnalytics(admin, month, { removes: 1 });
        } catch (error) {
          console.error("Wishlist remove analytics update failed", error);
        }
      }
    }

    const { used: finalUsage } = await currentUsage(admin, month);
    return json({
      authenticated: Boolean(customerId),
      tracked: true,
      items: customerId
        ? await listCustomerWishlists(admin, actorId)
        : [],
      usage: usageFor(finalUsage, limit),
    });
  } catch (error) {
    console.error("Wishlist proxy operation failed", error);
    return json(
      {
        authenticated: true,
        error: "The wishlist could not be synchronized.",
      },
      { status: 502 },
    );
  }
};
