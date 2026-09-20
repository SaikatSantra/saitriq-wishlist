import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const [savedItems, customers] = await Promise.all([
    prisma.wishlistItem.count({ where: { shop: session.shop } }),
    prisma.wishlistItem.findMany({
      where: { shop: session.shop },
      distinct: ["customerId"],
      select: { customerId: true },
    }),
  ]);
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
    stats: { savedItems, customers: customers.length },
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
  const { extensionName, blocks, stats, settings } = useLoaderData();

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
            <s-paragraph>Synced wishlist items</s-paragraph>
            <s-paragraph>{stats.savedItems}</s-paragraph>
          </s-box>
          <s-box background="subdued" borderRadius="base" padding="base">
            <s-paragraph>Customers with wishlists</s-paragraph>
            <s-paragraph>{stats.customers}</s-paragraph>
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
          The storefront currently keeps wishlist items in the shopper&apos;s
          browser so the product buttons, collection buttons, header link, and
          wishlist page update immediately without fake dashboard numbers.
          Cross-device customer syncing requires a customer-authenticated
          backend API and is the next production data layer.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
