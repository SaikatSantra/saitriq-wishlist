import { Form, useActionData, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const defaults = {
  heading: "My wishlist",
  emptyMessage: "You have not saved any products yet.",
  columns: 4,
  showPrices: true,
  showRemove: true,
  buttonLabel: "Remove",
  cardClass: "sai-wishlist-page__item",
  customCss: "",
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
      formData.get("emptyMessage") || defaults.emptyMessage,
    ).trim(),
    columns: Math.min(6, Math.max(2, Number(formData.get("columns")) || 4)),
    showPrices: formData.get("showPrices") === "on",
    showRemove: formData.get("showRemove") === "on",
    buttonLabel: String(
      formData.get("buttonLabel") || defaults.buttonLabel,
    ).trim(),
    cardClass:
      String(formData.get("cardClass") || defaults.cardClass)
        .trim()
        .split(/\s+/)
        .filter((value) => /^[a-zA-Z0-9_-]+$/.test(value))
        .join(" ") || defaults.cardClass,
    customCss: String(formData.get("customCss") || "").slice(0, 5000),
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
    <s-page heading="Wishlist page design">
      <s-section heading="Collection-style layout">
        <s-paragraph>
          Use your theme&apos;s collection card class here if you want the
          wishlist cards to inherit the same theme styling. The class is
          applied in addition to the Saitriq wishlist class.
        </s-paragraph>
        <Form method="post">
          <s-stack direction="block" gap="base">
            <label>Heading<input name="heading" defaultValue={settings.heading} /></label>
            <label>Empty message<input name="emptyMessage" defaultValue={settings.emptyMessage} /></label>
            <label>Columns<input name="columns" type="number" min="2" max="6" defaultValue={settings.columns} /></label>
            <label>Card CSS class<input name="cardClass" defaultValue={settings.cardClass} /></label>
            <label>Remove label<input name="buttonLabel" defaultValue={settings.buttonLabel} /></label>
            <label><input name="showPrices" type="checkbox" defaultChecked={settings.showPrices} /> Show prices</label>
            <label><input name="showRemove" type="checkbox" defaultChecked={settings.showRemove} /> Show remove button</label>
            <label>Custom CSS<textarea name="customCss" defaultValue={settings.customCss} rows="8" /></label>
            <button type="submit">Save design settings</button>
            {actionData?.saved && <s-paragraph>Settings saved.</s-paragraph>}
          </s-stack>
        </Form>
      </s-section>
    </s-page>
  );
}
