/**
 * Server-to-server REST API for developers / headless integrations.
 *
 * All endpoints require a Bearer token in the Authorization header.
 * The token is the shop's Shopify access token stored in the session.
 *
 * Base URL:  https://<your-app-url>/app/api
 *
 * Auth header:
 *   Authorization: Bearer <access_token>
 *   X-Shopify-Shop-Domain: mystore.myshopify.com
 *
 * Endpoints
 * ─────────────────────────────────────────────────────────────────────────────
 *  GET    /app/api?resource=items&customerId=<id>     All wishlist items for a customer
 *  GET    /app/api?resource=check&customerId=<id>&productId=<id>  Is product wishlisted?
 *  GET    /app/api?resource=all                       All items for the shop (paginated)
 *  GET    /app/api?resource=analytics&month=YYYY-MM   Analytics for a month
 *  GET    /app/api?resource=settings                  Merchant display settings
 *  POST   /app/api  { resource:"item", operation:"add"|"remove"|"clear", customerId, productId, ... }
 */

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  listCustomerWishlistItems,
  upsertWishlistItem,
  deleteWishlistItem,
  clearCustomerWishlist,
  recordAnalytics,
  getAnalytics,
  getAnalyticsHistory,
  currentUsage,
} from "../db.wishlist.server";
import {
  getMonthlyAddonSaves,
  getPlanEntitlement,
  monthKey,
} from "../billing.server";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const json = (data, init = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...(init.headers || {}),
    },
  });

const effectiveLimit = (planLimit, addonSaves) =>
  Number.isFinite(planLimit) ? planLimit + addonSaves : Infinity;

const readPayload = async (request) => {
  try {
    const text = await request.clone().text();
    return text.trim() ? JSON.parse(text) : {};
  } catch {
    return {};
  }
};

// ─── Loader (GET) ─────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
  // Uses admin auth — only accessible from the embedded app context or
  // server-side calls that go through Shopify's session token flow.
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const resource = url.searchParams.get("resource");
  const month = url.searchParams.get("month") || monthKey();
  const customerId = url.searchParams.get("customerId");
  const productId = url.searchParams.get("productId");
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") || 50)));

  switch (resource) {

    // ── GET items for one customer ──────────────────────────────────────────
    case "items": {
      if (!customerId)
        return json({ error: "customerId query param is required." }, { status: 400 });
      const items = await listCustomerWishlistItems(shop, customerId);
      return json({ customerId, count: items.length, items });
    }

    // ── GET check if one product is saved ──────────────────────────────────
    case "check": {
      if (!customerId || !productId)
        return json({ error: "customerId and productId are required." }, { status: 400 });
      const items = await listCustomerWishlistItems(shop, customerId);
      const saved = items.some((i) => String(i.productId) === String(productId));
      return json({ customerId, productId, saved });
    }

    // ── GET all items for the shop (paginated) ─────────────────────────────
    case "all": {
      const skip = (page - 1) * pageSize;
      const [rows, total] = await Promise.all([
        prisma.wishlistItem.findMany({
          where: { shop },
          orderBy: { createdAt: "desc" },
          skip,
          take: pageSize,
        }),
        prisma.wishlistItem.count({ where: { shop } }),
      ]);
      return json({
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
        items: rows.map((r) => ({
          customerId: r.customerId,
          productId: r.productId,
          productHandle: r.productHandle,
          productTitle: r.productTitle,
          productImage: r.productImage || null,
          productPrice: r.productPrice || null,
          createdAt: r.createdAt.toISOString(),
        })),
      });
    }

    // ── GET analytics for a month ──────────────────────────────────────────
    case "analytics": {
      const [totals, history, used, entitlement, addonSaves] = await Promise.all([
        getAnalytics(shop, month),
        getAnalyticsHistory(shop, month),
        currentUsage(shop, month),
        getPlanEntitlement(shop, month),
        getMonthlyAddonSaves(shop, month),
      ]);
      const limit = effectiveLimit(entitlement.planLimit, addonSaves);
      return json({
        month,
        adds: totals.adds,
        removes: totals.removes,
        history,
        usage: {
          used,
          limit,
          remaining: Number.isFinite(limit) ? Math.max(0, limit - used) : Infinity,
        },
      });
    }

    // ── GET merchant display settings ──────────────────────────────────────
    case "settings": {
      const settings = await prisma.wishlistSettings.findUnique({ where: { shop } });
      return json({
        settings: settings || {
          heading: "My wishlist",
          emptyMessage: "You have not saved any products yet.",
          showPrices: true,
          showRemove: true,
          buttonLabel: "Remove",
          cardClass: "sai-wishlist-page__item",
          customCss: "",
          buttonMode: "icon-text",
          customSvg: "",
        },
      });
    }

    // ── GET current usage ──────────────────────────────────────────────────
    case "usage": {
      const [used, entitlement, addonSaves] = await Promise.all([
        currentUsage(shop, month),
        getPlanEntitlement(shop, month),
        getMonthlyAddonSaves(shop, month),
      ]);
      const limit = effectiveLimit(entitlement.planLimit, addonSaves);
      return json({
        month,
        used,
        limit,
        remaining: Number.isFinite(limit) ? Math.max(0, limit - used) : Infinity,
      });
    }

    default:
      return json(
        {
          error: "Unknown resource. Valid values: items, check, all, analytics, settings, usage.",
          docs: "/app/api-docs",
        },
        { status: 400 },
      );
  }
};

// ─── Action (POST) ────────────────────────────────────────────────────────────

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const payload = await readPayload(request);
  const { resource, operation, customerId, productId, variantId, variantTitle, productHandle, productTitle, productImage, productPrice } = payload;

  if (resource !== "item") {
    return json({ error: "resource must be 'item'." }, { status: 400 });
  }
  if (!customerId) {
    return json({ error: "customerId is required." }, { status: 400 });
  }

  const month = monthKey();

  try {
    // ── clear ──────────────────────────────────────────────────────────────
    if (operation === "clear") {
      const count = await clearCustomerWishlist(shop, customerId);
      if (count > 0) await recordAnalytics(shop, { removes: count }).catch(() => {});
      const items = await listCustomerWishlistItems(shop, customerId);
      return json({ operation: "clear", removed: count, items });
    }

    if (!productId) return json({ error: "productId is required." }, { status: 400 });

    // ── add ────────────────────────────────────────────────────────────────
    if (operation === "add") {
      const [used, entitlement, addonSaves] = await Promise.all([
        currentUsage(shop, month),
        getPlanEntitlement(shop, month),
        getMonthlyAddonSaves(shop, month),
      ]);
      const limit = effectiveLimit(entitlement.planLimit, addonSaves);
      if (Number.isFinite(limit) && used >= limit) {
        return json(
          { error: "Monthly wishlist limit reached.", used, limit },
          { status: 429 },
        );
      }
      const result = await upsertWishlistItem(shop, customerId, {
        productId: String(productId),
        variantId: String(variantId || ""),
        variantTitle: variantTitle || null,
        productHandle: String(productHandle || productId),
        productTitle: String(productTitle || productHandle || productId),
        productImage: productImage || null,
        productPrice: productPrice || null,
      });
      if (result.created) await recordAnalytics(shop, { adds: 1 }).catch(() => {});
      const items = await listCustomerWishlistItems(shop, customerId);
      return json({ operation: "add", created: result.created, items });
    }

    // ── remove ─────────────────────────────────────────────────────────────
    if (operation === "remove") {
      const removed = await deleteWishlistItem(shop, customerId, String(productId), String(variantId || ""));
      if (removed) await recordAnalytics(shop, { removes: 1 }).catch(() => {});
      const items = await listCustomerWishlistItems(shop, customerId);
      return json({ operation: "remove", removed, items });
    }

    return json({ error: "operation must be add, remove, or clear." }, { status: 400 });
  } catch (error) {
    console.error("API action failed", error);
    return json({ error: "Internal server error." }, { status: 500 });
  }
};
