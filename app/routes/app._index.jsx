import { useEffect } from "react";
import { useLoaderData, useRevalidator } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getAnalytics, monthlyLimit } from "../metaobjects.server";

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const analytics = await getAnalytics(admin, new Date().toISOString().slice(0, 7));
  const settings =
    (await prisma.wishlistSettings.findUnique({ where: { shop: session.shop } })) ||
    {
      heading: "My wishlist",
      emptyMessage: "You have not saved any products yet.",
      columns: 4,
      showPrices: true,
      showRemove: true,
      buttonLabel: "Remove",
    };

  return {
    stats: { used: analytics.adds, remaining: Math.max(0, monthlyLimit("free") - analytics.adds), limit: monthlyLimit("free") },
    settings,
    extensionName: "wishlist-product",
    blocks: [
      {
        title: "Product page",
        description: "Add the Wishlist block to the product template.",
      },
      {
        title: "Collection page",
        description:
          "Add the Wishlist block inside the product-card or collection product section.",
      },
      {
        title: "Wishlist page",
        description:
          "Create a page with handle wishlist, then add the Wishlist page block.",
      },
      {
        title: "Header icon",
        description:
          "Add a link in the theme header to /pages/wishlist. Use the heart icon in your theme editor.",
      },
    ],
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const columns = Math.min(6, Math.max(2, Number(formData.get("columns")) || 4));

  await prisma.wishlistSettings.upsert({
    where: { shop: session.shop },
    create: {
      shop: session.shop,
      heading: String(formData.get("heading") || "My wishlist").trim(),
      emptyMessage: String(
        formData.get("emptyMessage") || "You have not saved any products yet.",
      ).trim(),
      columns,
      showPrices: formData.get("showPrices") === "on",
      showRemove: formData.get("showRemove") === "on",
      buttonLabel: String(formData.get("buttonLabel") || "Remove").trim(),
    },
    update: {
      heading: String(formData.get("heading") || "My wishlist").trim(),
      emptyMessage: String(
        formData.get("emptyMessage") || "You have not saved any products yet.",
      ).trim(),
      columns,
      showPrices: formData.get("showPrices") === "on",
      showRemove: formData.get("showRemove") === "on",
      buttonLabel: String(formData.get("buttonLabel") || "Remove").trim(),
    },
  });

  return { saved: true };
};

export default function WishlistDashboard() {
  const { extensionName, blocks, stats } = useLoaderData();
  const revalidator = useRevalidator();

  useEffect(() => {
    const refreshTimer = window.setInterval(() => {
      revalidator.revalidate();
    }, 10000);

    return () => window.clearInterval(refreshTimer);
  }, [revalidator]);

  return (
    <s-page heading="Saitriq Wishlist">
      <s-section heading="Theme extension">
        <s-paragraph>
          The wishlist UI is delivered through the{" "}
          <s-heading>{extensionName}</s-heading> theme app extension. This is why it
          appears under your Shopify app: it is the installable storefront
          component that merchants add through Theme Editor.
        </s-paragraph>
        <s-paragraph>
          Open Online Store → Themes → Customize, choose the required template,
          and add a Saitriq Wishlist app block.
        </s-paragraph>
      </s-section>

      <s-section heading="Wishlist activity">
        <s-stack direction="inline" gap="base">
          <s-box background="subdued" borderRadius="base" padding="base">
            <s-paragraph>Wishlist saves used this month</s-paragraph>
            <s-paragraph>{stats.used}</s-paragraph>
          </s-box>
          <s-box background="subdued" borderRadius="base" padding="base">
            <s-paragraph>Wishlist saves remaining</s-paragraph>
            <s-paragraph>{stats.remaining === Infinity ? "Unlimited" : stats.remaining}</s-paragraph>
          </s-box>
        </s-stack>
      </s-section>

      <s-section heading="Setup checklist">
        <s-stack direction="block" gap="base">
          {blocks.map((block) => (
            <s-box
              key={block.title}
              padding="base"
              borderWidth="base"
              borderRadius="base"
              background="subdued"
            >
              <s-paragraph>
                <s-heading>{block.title}</s-heading>
              </s-paragraph>
              <s-paragraph>{block.description}</s-paragraph>
            </s-box>
          ))}
        </s-stack>
      </s-section>

      <s-section heading="Wishlist page settings">
        <s-paragraph>
          Page content and visual settings are managed from the dedicated
          Page design settings section in the app navigation.
        </s-paragraph>
        <s-link href="/app/settings">Open page design settings</s-link>
      </s-section>

      <s-section heading="Current data mode">
        <s-paragraph>
          Wishlist saves are stored in Shopify metaobjects through the app
          proxy. The storefront keeps a local copy for immediate UI updates,
          while the dashboard reads the server-side analytics record.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
