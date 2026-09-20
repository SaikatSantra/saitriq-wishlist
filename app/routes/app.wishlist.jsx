import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  return {
    items: [],
  };
};

export default function WishlistOverview() {
  const { items } = useLoaderData();

  return (
    <s-page heading="Wishlist overview">
      <s-section heading="Saved items">
        <s-paragraph>
          Shopper wishlist items are intentionally not shown in this embedded
          admin page. They belong to each storefront visitor and are rendered
          dynamically by the Wishlist page theme block.
        </s-paragraph>
        <s-stack direction="block" gap="base">
          {items.length > 0 ? items.map((item) => (
            <s-box
              key={item.id}
              padding="base"
              borderWidth="base"
              borderRadius="base"
              background="subdued"
            >
              <s-stack direction="inline" gap="base">
                <img
                  src={item.image}
                  alt={item.title}
                  style={{
                    width: 80,
                    height: 80,
                    objectFit: "cover",
                    borderRadius: 12,
                  }}
                />
                <s-stack direction="block" gap="base">
                  <strong>{item.title}</strong>
                  <s-paragraph>{item.price}</s-paragraph>
                  <s-link href="/app">View in admin</s-link>
                </s-stack>
              </s-stack>
            </s-box>
          )) : (
            <s-paragraph>No server-side wishlist records are available yet.</s-paragraph>
          )}
        </s-stack>
      </s-section>
    </s-page>
  );
}
