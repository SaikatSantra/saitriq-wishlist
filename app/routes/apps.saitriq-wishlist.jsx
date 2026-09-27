import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  upsertWishlistItem,
  deleteWishlistItem,
  clearCustomerWishlist,
  listCustomerWishlistItems,
  recordAnalytics,
  currentUsage,
  monthlyLimit,
} from "../db.wishlist.server";

const json = (data, init = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Saitriq-Wishlist-Version": "proxy-v11",
      ...(init.headers || {}),
    },
  });

const readPayload = async (request) => {
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

// ─── Loader (GET) ─────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
  const { session } = await authenticate.public.appProxy(request);
  const customerId = getCustomerId(request);

  if (!session || !customerId) {
    return json({ authenticated: false, items: [] });
  }

  const shop = session.shop;
  const month = monthKey();
  const [used, items, settings] = await Promise.all([
    currentUsage(shop, month),
    listCustomerWishlistItems(shop, customerId),
    prisma.wishlistSettings.findUnique({ where: { shop } }),
  ]);

  return json({
    authenticated: true,
    items,
    settings: settings || defaultSettings,
    usage: usageFor(used, monthlyLimit("free")),
  });
};

// ─── Action (POST) ────────────────────────────────────────────────────────────

export const action = async ({ request }) => {
  try {
    const { session } = await authenticate.public.appProxy(request);
    if (!session) {
      return json(
        { authenticated: false, error: "Wishlist service is unavailable." },
        { status: 502 },
      );
    }

    const shop = session.shop;
    const customerId = getCustomerId(request);
    const payload = await readPayload(request);
    const operation = payload?.operation;

    // Guest visitor ID (used for analytics tracking even when not logged in)
    const visitorId = String(payload?.visitorId || "")
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, "-")
      .slice(0, 80);

    // Guests: track analytics but don't persist wishlist items server-side
    const actorId = customerId || visitorId || null;
    if (!actorId) {
      return json(
        { authenticated: false, error: "A valid wishlist visitor is required." },
        { status: 400 },
      );
    }

    const month = monthKey();
    const limit = monthlyLimit("free");

    // ── clear ────────────────────────────────────────────────────────────────
    if (operation === "clear") {
      let removedCount = 0;
      if (customerId) {
        removedCount = await clearCustomerWishlist(shop, customerId);
      }
      if (removedCount > 0) {
        await recordAnalytics(shop, { removes: removedCount }).catch((err) =>
          console.error("Analytics update failed on clear", err),
        );
      }
      const used = await currentUsage(shop, month);
      return json({
        authenticated: Boolean(customerId),
        tracked: true,
        items: customerId ? await listCustomerWishlistItems(shop, customerId) : [],
        usage: usageFor(used, limit),
      });
    }

    // ── add / remove ─────────────────────────────────────────────────────────
    const productId = String(payload?.productId || "").trim();
    const productHandle = String(
      payload?.productHandle || payload?.productId || "product",
    ).trim();
    const productTitle = String(
      payload?.productTitle || payload?.productHandle || "Product",
    ).trim();

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

    // Rate-limit check (only for logged-in customers persisting to DB)
    if (operation === "add" && customerId) {
      const used = await currentUsage(shop, month);
      if (used >= limit) {
        return json(
          {
            error: "This store has reached its monthly wishlist limit.",
            usage: { used, limit, remaining: 0 },
          },
          { status: 429 },
        );
      }
    }

    if (operation === "add") {
      if (customerId) {
        const result = await upsertWishlistItem(shop, customerId, {
          productId,
          productHandle,
          productTitle,
          productImage: payload.productImage,
          productPrice: payload.productPrice,
        });
        if (result.created) {
          await recordAnalytics(shop, { adds: 1 }).catch((err) =>
            console.error("Analytics update failed on add", err),
          );
        }
      } else {
        // Guest: just track analytics
        await recordAnalytics(shop, { adds: 1 }).catch((err) =>
          console.error("Analytics update failed on guest add", err),
        );
      }
    } else {
      // remove
      if (customerId) {
        const removed = await deleteWishlistItem(shop, customerId, productId);
        if (removed) {
          await recordAnalytics(shop, { removes: 1 }).catch((err) =>
            console.error("Analytics update failed on remove", err),
          );
        }
      } else {
        await recordAnalytics(shop, { removes: 1 }).catch((err) =>
          console.error("Analytics update failed on guest remove", err),
        );
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
    return json(
      { authenticated: true, error: "The wishlist could not be synchronized." },
      { status: 502 },
    );
  }
};
