import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  getAnalytics,
  listCustomerWishlists,
  monthlyLimit,
  recordAnalytics,
  upsertWishlist,
  deleteWishlist,
  deleteCustomerWishlists,
} from "../metaobjects.server";

const json = (data, init = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Saitriq-Wishlist-Version": "proxy-v7",
      ...(init.headers || {}),
    },
  });

const readPayload = async (request) => {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return request.json().catch(() => null);
  }

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

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.public.appProxy(request);
  const customerId = getCustomerId(request);
  if (!session || !admin || !customerId) {
    return json({ authenticated: false, items: [] });
  }

  const analytics = await getAnalytics(admin, monthKey());
  const items = await listCustomerWishlists(admin, customerId);
  const settings = await prisma.wishlistSettings.findUnique({
    where: { shop: session.shop },
  });
  return json({
    authenticated: true,
    items,
    settings: settings || defaultSettings,
    usage: usageFor(analytics.adds, monthlyLimit("free")),
  });
};

export const action = async ({ request }) => {
  try {
    const { session, admin } = await authenticate.public.appProxy(request);
    const customerId = getCustomerId(request);
    if (!session || !admin || !customerId) {
      return json(
        { authenticated: false, error: "Log in to save a synced wishlist." },
        { status: 401 },
      );
    }

    const payload = await readPayload(request);
    const operation = payload?.operation;
    const month = monthKey();
    const limit = monthlyLimit("free");

    if (operation === "clear") {
      const removedCount = await deleteCustomerWishlists(admin, customerId);
      if (removedCount > 0) {
        await recordAnalytics(admin, month, { removes: removedCount });
      }
      const analytics = await getAnalytics(admin, month);
      return json({
        authenticated: true,
        items: [],
        usage: usageFor(analytics.adds, limit),
      });
    }

    const productId = String(payload?.productId || "");
    const productHandle = String(payload?.productHandle || "");
    const productTitle = String(payload?.productTitle || "");
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

    const analytics = await getAnalytics(admin, month);
    if (operation === "add" && analytics.adds >= limit) {
      return json(
        {
          error: "This store has reached its monthly wishlist limit.",
          usage: { used: analytics.adds, limit, remaining: 0 },
        },
        { status: 429 },
      );
    }

    if (operation === "add") {
      const result = await upsertWishlist(admin, {
        customerId,
        productId,
        productHandle,
        productTitle,
        productImage: payload.productImage,
        productPrice: payload.productPrice,
        addedAt: new Date().toISOString(),
      });
      if (result.created) {
        await recordAnalytics(admin, month, { adds: 1, uniqueCustomers: 1 });
      }
    } else {
      await deleteWishlist(admin, customerId, productId);
      await recordAnalytics(admin, month, { removes: 1 });
    }

    const updated = await getAnalytics(admin, month);
    return json({
      authenticated: true,
      items: await listCustomerWishlists(admin, customerId),
      usage: usageFor(updated.adds, limit),
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
