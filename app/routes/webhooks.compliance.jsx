import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }) => {
  const { payload, shop, topic } = await authenticate.webhook(request);

  switch (topic) {
    case "CUSTOMERS_REDACT": {
      const customerId = String(payload?.customer?.id ?? "");
      if (/^\d+$/.test(customerId)) {
        await prisma.wishlistItem.deleteMany({
          where: { shop, customerId },
        });
      }
      break;
    }
    case "SHOP_REDACT":
      await prisma.$transaction([
        prisma.wishlistItem.deleteMany({ where: { shop } }),
        prisma.wishlistAnalytics.deleteMany({ where: { shop } }),
        prisma.wishlistSettings.deleteMany({ where: { shop } }),
        prisma.activeSubscription.deleteMany({ where: { shop } }),
        prisma.monthlyPlanPurchase.deleteMany({ where: { shop } }),
        prisma.planPurchaseHistory.deleteMany({ where: { shop } }),
        prisma.scheduledPlanChange.deleteMany({ where: { shop } }),
        prisma.addonPurchase.deleteMany({ where: { shop } }),
        prisma.session.deleteMany({ where: { shop } }),
      ]);
      break;
    case "CUSTOMERS_DATA_REQUEST":
      console.info("Received Shopify customer data request", {
        shop,
        requestId: payload?.data_request?.id,
        customerId: payload?.customer?.id,
      });
      break;
    default:
      return new Response("Unsupported compliance webhook topic", { status: 400 });
  }

  return new Response(null, { status: 200 });
};
