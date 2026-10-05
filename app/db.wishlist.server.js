import prisma from "./db.server";

// ─── Wishlist items ───────────────────────────────────────────────────────────

export const upsertWishlistItem = async (shop, customerId, item) => {
  const variantId = item.variantId || "";
  const existing = await prisma.wishlistItem.findUnique({
    where: { shop_customerId_productId_variantId: { shop, customerId, productId: item.productId, variantId } },
  });

  const data = {
    variantTitle: item.variantTitle || null,
    productHandle: item.productHandle,
    productTitle: item.productTitle,
    productImage: item.productImage || null,
    productPrice: item.productPrice || null,
  };

  if (existing) {
    await prisma.wishlistItem.update({
      where: { shop_customerId_productId_variantId: { shop, customerId, productId: item.productId, variantId } },
      data,
    });
    return { created: false };
  }

  await prisma.wishlistItem.create({
    data: { shop, customerId, productId: item.productId, variantId, ...data },
  });
  return { created: true };
};

export const deleteWishlistItem = async (shop, customerId, productId, variantId = "") => {
  const existing = await prisma.wishlistItem.findUnique({
    where: { shop_customerId_productId_variantId: { shop, customerId, productId, variantId: variantId || "" } },
  });
  if (!existing) return false;
  await prisma.wishlistItem.delete({
    where: { shop_customerId_productId_variantId: { shop, customerId, productId, variantId: variantId || "" } },
  });
  return true;
};

export const clearCustomerWishlist = async (shop, customerId) => {
  const { count } = await prisma.wishlistItem.deleteMany({
    where: { shop, customerId },
  });
  return count;
};

export const listCustomerWishlistItems = async (shop, customerId) => {
  const rows = await prisma.wishlistItem.findMany({
    where: { shop, customerId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toItem);
};

export const countWishlistSavesForMonth = async (shop, month) => {
  // month = "YYYY-MM"
  const from = new Date(`${month}-01T00:00:00.000Z`);
  const to = new Date(from);
  to.setUTCMonth(to.getUTCMonth() + 1);
  return prisma.wishlistItem.count({
    where: { shop, createdAt: { gte: from, lt: to } },
  });
};

const toItem = (row) => ({
  productId: row.productId,
  variantId: row.variantId,
  variantTitle: row.variantTitle || null,
  productHandle: row.productHandle,
  productTitle: row.productTitle,
  productImage: row.productImage || null,
  productPrice: row.productPrice || null,
  customerId: row.customerId,
  createdAt: row.createdAt.toISOString(),
});

// ─── Analytics ────────────────────────────────────────────────────────────────

const monthOf = (day) => day.slice(0, 7); // "YYYY-MM-DD" → "YYYY-MM"

export const recordAnalytics = async (shop, changes) => {
  const day = new Date().toISOString().slice(0, 10);
  const month = monthOf(day);
  await prisma.wishlistAnalytics.upsert({
    where: { shop_day: { shop, day } },
    create: {
      shop,
      month,
      day,
      adds: changes.adds || 0,
      removes: changes.removes || 0,
    },
    update: {
      adds: { increment: changes.adds || 0 },
      removes: { increment: changes.removes || 0 },
    },
  });
};

export const getAnalytics = async (shop, month) => {
  const rows = await prisma.wishlistAnalytics.findMany({
    where: { shop, month },
  });
  const adds = rows.reduce((s, r) => s + r.adds, 0);
  const removes = rows.reduce((s, r) => s + r.removes, 0);
  return { adds, removes };
};

export const getAnalyticsHistory = async (shop, month) => {
  const rows = await prisma.wishlistAnalytics.findMany({
    where: { shop, month },
    orderBy: { day: "asc" },
  });
  return rows.map((r) => ({ day: r.day, adds: r.adds, removes: r.removes }));
};

export const currentUsage = async (shop, month) => {
  const [{ adds }, savedRecords] = await Promise.all([
    getAnalytics(shop, month),
    countWishlistSavesForMonth(shop, month),
  ]);
  return Math.max(adds, savedRecords);
};

// Re-export so callers can get effective limit from one place
export { getMonthlyAddonSaves } from "./billing.server";
