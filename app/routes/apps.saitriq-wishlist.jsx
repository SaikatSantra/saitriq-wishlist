import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  upsertWishlistItem,
  deleteWishlistItem,
  clearCustomerWishlist,
  listCustomerWishlistItems,
  recordAnalytics,
  currentUsage,
  getAnalytics,
  getAnalyticsHistory,
} from "../db.wishlist.server";
import { getPlanEntitlement, getMonthlyAddonSaves, monthKey } from "../billing.server";

const effectiveLimit = (planLimit, addonSaves) =>
  Number.isFinite(planLimit) ? planLimit + addonSaves : Infinity;

const json = (data, init = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Saitriq-Wishlist-Version": "proxy-v13",
      ...(init.headers || {}),
    },
  });

const readPayload = async (request) => {
  const rawBody = await request.clone().text().catch(() => "");
  if (rawBody.trim().startsWith("{")) {
    try { return JSON.parse(rawBody); } catch { return null; }
  }
  const contentType = request.headers.get("content-type") || "";
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

const usageFor = (used, limit) => ({
  used,
  limit,
  remaining: Number.isFinite(limit) ? Math.max(0, limit - used) : null,
});

const defaultSettings = {
  heading:        "My wishlist",
  emptyMessage:   "You have not saved any products yet.",
  columns:        4,
  showPrices:     true,
  showRemove:     true,
  buttonLabel:    "Remove",
  showAddToCart:  false,
  addToCartLabel: "Add to cart",
  toastBg:        "#1a1a1a",
  toastColor:     "#ffffff",
  toastPosition:  "top-left",
};

// ─── ?api= routes ─────────────────────────────────────────────────────────────

const handleApiGet = async (api, url, session, customerId) => {
  const shop = session.shop;
  const month = url.searchParams.get("month") || monthKey();

  switch (api) {
    case "items": {
      if (!customerId) return json({ error: "Customer not authenticated." }, { status: 401 });
      const items = await listCustomerWishlistItems(shop, customerId);
      return json({ items });
    }
    case "check": {
      if (!customerId) return json({ saved: false, authenticated: false });
      const productId = url.searchParams.get("productId");
      if (!productId) return json({ error: "productId is required." }, { status: 400 });
      const items = await listCustomerWishlistItems(shop, customerId);
      return json({ saved: items.some((i) => String(i.productId) === String(productId)), authenticated: true, productId });
    }
    case "analytics": {
      const [totals, history, used] = await Promise.all([
        getAnalytics(shop, month),
        getAnalyticsHistory(shop, month),
        currentUsage(shop, month),
      ]);
      const [entitlement, addonSaves] = await Promise.all([
        getPlanEntitlement(shop, month),
        getMonthlyAddonSaves(shop, month),
      ]);
      const limit = effectiveLimit(entitlement.planLimit, addonSaves);
      return json({ month, adds: totals.adds, removes: totals.removes, history, usage: usageFor(used, limit) });
    }
    case "settings": {
      const settings = await prisma.wishlistSettings.findUnique({ where: { shop } });
      return json({ settings: settings || defaultSettings });
    }
    case "usage": {
      const [used, entitlement, addonSaves] = await Promise.all([
        currentUsage(shop, month),
        getPlanEntitlement(shop, month),
        getMonthlyAddonSaves(shop, month),
      ]);
      return json(usageFor(used, effectiveLimit(entitlement.planLimit, addonSaves)));
    }
    default:
      return json({ error: `Unknown api endpoint: ${api}` }, { status: 400 });
  }
};

// ─── Loader (GET) ─────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
  const { session } = await authenticate.public.appProxy(request);
  const url = new URL(request.url);
  const customerId = getCustomerId(request);

  if (!session) return json({ authenticated: false, items: [] });

  const api = url.searchParams.get("api");
  if (api) return handleApiGet(api, url, session, customerId);

  if (!customerId) return json({ authenticated: false, items: [] });

  const shop = session.shop;
  const month = monthKey();
  const [entitlement, used, items, settings, addonSaves] = await Promise.all([
    getPlanEntitlement(shop, month),
    currentUsage(shop, month),
    listCustomerWishlistItems(shop, customerId),
    prisma.wishlistSettings.findUnique({ where: { shop } }),
    getMonthlyAddonSaves(shop, month),
  ]);
  const limit = effectiveLimit(entitlement.planLimit, addonSaves);

  return json({
    authenticated: true,
    items,
    settings: settings || defaultSettings,
    usage: usageFor(used, limit),
  });
};

// ─── Action (POST) ────────────────────────────────────────────────────────────

export const action = async ({ request }) => {
  try {
    const { session } = await authenticate.public.appProxy(request);
    if (!session) {
      return json({ authenticated: false, error: "Wishlist service is unavailable." }, { status: 502 });
    }

    const shop = session.shop;
    const customerId = getCustomerId(request);
    const payload = await readPayload(request);
    const operation = payload?.operation;

    const visitorId = String(payload?.visitorId || "")
      .trim().replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80);
    const actorId = customerId || visitorId || null;
    if (!actorId) {
      return json({ authenticated: false, error: "A valid wishlist visitor is required." }, { status: 400 });
    }

    const month = monthKey();
    const [entitlement, addonSaves] = await Promise.all([
      getPlanEntitlement(shop, month),
      getMonthlyAddonSaves(shop, month),
    ]);
    const limit = effectiveLimit(entitlement.planLimit, addonSaves);

    // ── clear ─────────────────────────────────────────────────────────────────
    if (operation === "clear") {
      let removedCount = 0;
      if (customerId) removedCount = await clearCustomerWishlist(shop, customerId);
      if (removedCount > 0) {
        await recordAnalytics(shop, { removes: removedCount }).catch((e) =>
          console.error("Analytics update failed on clear", e));
      }
      const used = await currentUsage(shop, month);
      return json({
        authenticated: Boolean(customerId),
        tracked: true,
        items: customerId ? await listCustomerWishlistItems(shop, customerId) : [],
        usage: usageFor(used, limit),
      });
    }

    // ── add / remove ──────────────────────────────────────────────────────────
    const productId = String(payload?.productId || "").trim();
    const variantId = String(payload?.variantId || "").trim();
    const variantTitle = String(payload?.variantTitle || "").trim();
    const productHandle = String(payload?.productHandle || payload?.productId || "product").trim();
    const productTitle = String(payload?.productTitle || payload?.productHandle || "Product").trim();

    if (!productId || !productHandle || !productTitle || !["add", "remove"].includes(operation)) {
      return json({ error: "A valid wishlist operation and product details are required." }, { status: 400 });
    }

    if (operation === "add") {
      const used = await currentUsage(shop, month);
      if (Number.isFinite(limit) && used >= limit) {
        return json({
          error: "This store has reached its monthly wishlist limit.",
          usage: { used, limit, remaining: 0 },
        }, { status: 429 });
      }
    }

    if (operation === "add") {
      if (customerId) {
        const result = await upsertWishlistItem(shop, customerId, {
          productId, variantId, variantTitle, productHandle, productTitle,
          productImage: payload.productImage,
          productPrice: payload.productPrice,
        });
        if (result.created) {
          await recordAnalytics(shop, { adds: 1 }).catch((e) =>
            console.error("Analytics update failed on add", e));
        }
      } else {
        await recordAnalytics(shop, { adds: 1 }).catch((e) =>
          console.error("Analytics update failed on guest add", e));
      }
    } else {
      if (customerId) {
        const removed = await deleteWishlistItem(shop, customerId, productId, variantId);
        if (removed) {
          await recordAnalytics(shop, { removes: 1 }).catch((e) =>
            console.error("Analytics update failed on remove", e));
        }
      } else {
        await recordAnalytics(shop, { removes: 1 }).catch((e) =>
          console.error("Analytics update failed on guest remove", e));
      }
    }

    const used = await currentUsage(shop, month);
    return json({
      authenticated: Boolean(customerId),
      tracked: true,
      items: customerId ? await listCustomerWishlistItems(shop, customerId) : [],
      usage: usageFor(used, limit),
    });
  } catch (error) {
    console.error("Wishlist proxy operation failed", error);
    return json({ authenticated: true, error: "The wishlist could not be synchronized." }, { status: 502 });
  }
};
