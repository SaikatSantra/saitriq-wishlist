import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const json = (data, init = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...(init.headers || {}),
    },
  });

const getCustomerId = (request) => {
  const customerId = new URL(request.url).searchParams.get(
    "logged_in_customer_id",
  );
  return customerId && /^\d+$/.test(customerId) ? customerId : null;
};

const defaultSettings = {
  heading: "My wishlist",
  emptyMessage: "You have not saved any products yet.",
  columns: 4,
  showPrices: true,
  showRemove: true,
  buttonLabel: "Remove",
  cardClass: "sai-wishlist-page__item",
  customCss: "",
  buttonMode: "icon-text",
  customSvg: "",
};

export const loader = async ({ request }) => {
  const { session } = await authenticate.public.appProxy(request);
  const customerId = getCustomerId(request);
  const settings = session
    ? await prisma.wishlistSettings.findUnique({ where: { shop: session.shop } })
    : null;

  if (!session || !customerId) {
    return json({ authenticated: false, items: [], settings: settings || defaultSettings });
  }

  const items = await prisma.wishlistItem.findMany({
    where: { shop: session.shop, customerId },
    orderBy: { createdAt: "desc" },
  });

  return json({ authenticated: true, items, settings: settings || defaultSettings });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.public.appProxy(request);
  const customerId = getCustomerId(request);

  if (!session || !customerId) {
    return json(
      { authenticated: false, error: "Log in to save a synced wishlist." },
      { status: 401 },
    );
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return json({ error: "Invalid wishlist request." }, { status: 400 });
  }

  const productId = String(payload.productId || "");
  const productHandle = String(payload.productHandle || "");
  const productTitle = String(payload.productTitle || "");
  const productImage = payload.productImage ? String(payload.productImage) : null;
  const productPrice = payload.productPrice ? String(payload.productPrice) : null;
  const operation = payload.operation;

  if (!productId || !productHandle || !productTitle) {
    return json({ error: "Product details are required." }, { status: 400 });
  }

  if (operation === "remove") {
    await prisma.wishlistItem.deleteMany({
      where: { shop: session.shop, customerId, productId },
    });
  } else if (operation === "add") {
    await prisma.wishlistItem.upsert({
      where: {
        shop_customerId_productId: { shop: session.shop, customerId, productId },
      },
      create: {
        shop: session.shop,
        customerId,
        productId,
        productHandle,
        productTitle,
        productImage,
        productPrice,
      },
      update: { productHandle, productTitle, productImage, productPrice },
    });
  } else {
    return json({ error: "Unsupported wishlist operation." }, { status: 400 });
  }

  const items = await prisma.wishlistItem.findMany({
    where: { shop: session.shop, customerId },
    orderBy: { createdAt: "desc" },
  });

  return json({ authenticated: true, items });
};
