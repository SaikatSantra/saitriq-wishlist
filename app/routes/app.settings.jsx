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
  buttonMode: "icon-text",
  customSvg: "",
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
  const uploadedSvg = formData.get("customSvgFile");
  let customSvg = String(formData.get("customSvg") || "").slice(0, 20000);
  if (uploadedSvg instanceof File && uploadedSvg.size > 0) {
    if (uploadedSvg.size > 20000 || uploadedSvg.type !== "image/svg+xml") {
      return { error: "Upload an SVG file smaller than 20 KB." };
    }
    customSvg = (await uploadedSvg.text()).slice(0, 20000);
  }
  customSvg = customSvg
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(?:href|xlink:href)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  if (customSvg && !/^<svg[\s>]/i.test(customSvg.trim())) {
    return { error: "Custom icon must contain a valid SVG root element." };
  }
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
    buttonMode: ["icon-only", "icon-text", "custom-svg"].includes(
      formData.get("buttonMode"),
    )
      ? String(formData.get("buttonMode"))
      : defaults.buttonMode,
    customSvg,
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
        <Form method="post" encType="multipart/form-data">
          <s-stack direction="block" gap="base">
            <s-text-field label="Heading" name="heading" value={settings.heading} />
            <s-text-field label="Empty message" name="emptyMessage" value={settings.emptyMessage} />
            <s-text-field label="Columns (2-6)" name="columns" value={settings.columns} />
            <s-text-field label="Card CSS class" name="cardClass" value={settings.cardClass} />
            <s-text-field label="Remove label" name="buttonLabel" value={settings.buttonLabel} />
            <s-checkbox label="Show prices" name="showPrices" checked={settings.showPrices} />
            <s-checkbox label="Show remove button" name="showRemove" checked={settings.showRemove} />
            <s-text-area label="Custom CSS" name="customCss" value={settings.customCss} rows={8} />
            <s-select label="Wishlist button style" name="buttonMode" value={settings.buttonMode}>
              <s-option value="icon-only">Icon only</s-option>
              <s-option value="icon-text">Icon with text</s-option>
              <s-option value="custom-svg">Custom SVG</s-option>
            </s-select>
            <s-paragraph>Upload an SVG icon (maximum 20 KB) or paste SVG markup below.</s-paragraph>
            <label>
              <s-button type="button">Choose SVG file</s-button>
              <input
                name="customSvgFile"
                type="file"
                accept=".svg,image/svg+xml"
                style={{ display: "none" }}
              />
            </label>
            <s-text-area label="Custom SVG markup" name="customSvg" value={settings.customSvg} rows={8} />
            <s-button type="submit" variant="primary">Save design settings</s-button>
            {actionData?.saved && <s-paragraph>Settings saved.</s-paragraph>}
            {actionData?.error && <s-paragraph>{actionData.error}</s-paragraph>}
          </s-stack>
        </Form>
      </s-section>
    </s-page>
  );
}
