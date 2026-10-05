import { Form, useActionData, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const defaults = {
  heading:        "My wishlist",
  emptyMessage:   "You have not saved any products yet.",
  columns:        4,
  showPrices:     true,
  showRemove:     true,
  buttonLabel:    "Remove",
  showAddToCart:  false,
  addToCartLabel: "Add to cart",
  cardClass:      "sai-wishlist-page__item",
  customCss:      "",
  headerSelector: "",
  toastBg:        "#1a1a1a",
  toastColor:     "#ffffff",
  toastPosition:  "top-left",
};

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const settings = await prisma.wishlistSettings.findUnique({
    where: { shop: session.shop },
  });

  return { settings: settings || defaults };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const settings = {
    heading: String(formData.get("heading") || defaults.heading).trim(),
    emptyMessage: String(
      formData.get("emptyMessage") || defaults.emptyMessage
    ).trim(),
    columns: Math.min(
      6,
      Math.max(2, Number(formData.get("columns")) || 4)
    ),
    showPrices: formData.get("showPrices") === "on",
    showRemove: formData.get("showRemove") === "on",
    buttonLabel: String(
      formData.get("buttonLabel") || defaults.buttonLabel
    ).trim(),
    showAddToCart: formData.get("showAddToCart") === "on",
    addToCartLabel: String(
      formData.get("addToCartLabel") || defaults.addToCartLabel
    ).trim(),
    cardClass:
      String(formData.get("cardClass") || defaults.cardClass)
        .trim()
        .split(/\s+/)
        .filter((v) => /^[a-zA-Z0-9_-]+$/.test(v))
        .join(" ") || defaults.cardClass,
    customCss: String(formData.get("customCss") || "").slice(0, 5000),
    headerSelector: String(formData.get("headerSelector") || "").trim().slice(0, 300),
    toastBg: String(
      formData.get("toastBg") || defaults.toastBg
    ).trim(),
    toastColor: String(
      formData.get("toastColor") || defaults.toastColor
    ).trim(),
    toastPosition: [
      "top-left",
      "top-right",
      "bottom-left",
      "bottom-right",
    ].includes(formData.get("toastPosition"))
      ? String(formData.get("toastPosition"))
      : defaults.toastPosition,
  };

  await prisma.wishlistSettings.upsert({
    where: { shop: session.shop },
    create: { shop: session.shop, ...settings },
    update: settings,
  });

  return { saved: true };
};

export default function WishlistSettingsPage() {
  const { settings } = useLoaderData();
  const actionData = useActionData();

  return (
    <s-page heading="Wishlist settings">
      <Form method="post">
        <s-stack direction="block" gap="large">

          {/* Intro */}
          <s-section>
            <s-stack direction="block" gap="small">
              <s-heading>Customize your wishlist</s-heading>

              <s-text>
                Configure how your wishlist page looks and behaves for
                customers. You can customize the page content, product
                grid, remove button, and notification messages.
              </s-text>

              <s-text tone="subdued">
                Changes are applied to your storefront wishlist experience.
              </s-text>
            </s-stack>
          </s-section>

          {/* Wishlist */}
          <s-section heading="Wishlist page">
            <s-stack direction="block" gap="base">

              <s-text-field
                label="Page heading"
                name="heading"
                value={settings.heading}
                helpText="Shown at the top of the customer's wishlist page."
              />

              <s-text-field
                label="Empty state message"
                name="emptyMessage"
                value={settings.emptyMessage}
                helpText="Shown when the customer has no saved products."
              />

              <s-select
                label="Grid columns"
                name="columns"
                value={String(settings.columns)}
                helpText="Choose how many products appear in each row."
              >
                {[2, 3, 4, 5, 6].map((n) => (
                  <s-option key={n} value={String(n)}>
                    {n}
                  </s-option>
                ))}
              </s-select>

              <s-checkbox
                label="Show product prices"
                name="showPrices"
                checked={settings.showPrices}
              />

              <s-checkbox
                label="Show remove button"
                name="showRemove"
                checked={settings.showRemove}
              />

              <s-text-field
                label="Remove button label"
                name="buttonLabel"
                value={settings.buttonLabel}
              />

              <s-checkbox
                label="Show Add to cart button"
                name="showAddToCart"
                checked={settings.showAddToCart}
              />

              <s-text-field
                label="Add to cart button label"
                name="addToCartLabel"
                value={settings.addToCartLabel}
                helpText="Label shown on the add to cart button. Only visible when enabled above."
              />

              

            </s-stack>
          </s-section>

          <s-section heading="Header wishlist link">
            <s-stack direction="block" gap="base">
              <s-text>
                Optionally add a Wishlist link to your storefront header without editing theme code.
                The app embed must be enabled for this to appear.
              </s-text>
              <s-text-field
                label="Header CSS selector"
                name="headerSelector"
                value={settings.headerSelector}
                helpText="Enter a CSS selector for the header element to add the link to, for example .header__icons. The link is appended inside the first matching element. Leave blank to disable."
              />
              <s-text tone="subdued">
                The selector must exist on the storefront. Theme markup differs, so test it with your theme.
                Clearing this field removes the link on the next page load. Disabling the app embed also removes it.
              </s-text>
            </s-stack>
          </s-section>

          {/* Toast */}
          <s-section heading="Toast notification">
            <s-stack direction="block" gap="base">

              <s-text>
                Customize the notification shown when customers add
                or remove products from their wishlist.
              </s-text>

              <s-text-field
                label="Background color"
                name="toastBg"
                value={settings.toastBg}
                helpText="Example: #1a1a1a"
              />

              <s-text-field
                label="Text color"
                name="toastColor"
                value={settings.toastColor}
                helpText="Example: #ffffff"
              />

              

            </s-stack>
          </s-section>

          {/* Save feedback */}
          {actionData?.saved && (
            <s-banner
              tone="success"
              heading="Settings saved"
            >
              Your wishlist settings have been updated successfully.
            </s-banner>
          )}

          {/* Actions */}
          <s-section>
            <s-button type="submit" variant="primary">
              Save settings
            </s-button>
          </s-section>

        </s-stack>
      </Form>
    </s-page>
  );
}