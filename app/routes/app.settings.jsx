import { Form, useActionData, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { detectLocale, createTranslator } from "../i18n.server";

const defaults = {
  heading: "My wishlist",
  emptyMessage: "You have not saved any products yet.",
  showPrices: true,
  showRemove: true,
  buttonLabel: "Remove",
  showAddToCart: false,
  addToCartLabel: "Add to cart",
  cardClass: "sai-wishlist-page__item",
  customCss: "",
  headerSelector: "",
  toastBg: "#1a1a1a",
  toastColor: "#ffffff",
  toastPosition: "top-left",
};

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const locale = detectLocale({ request, session });
  const t = createTranslator(locale);

  const settings = await prisma.wishlistSettings.findUnique({
    where: { shop: session.shop },
    select: {
      heading: true,
      emptyMessage: true,
      showPrices: true,
      showRemove: true,
      buttonLabel: true,
      showAddToCart: true,
      addToCartLabel: true,
      cardClass: true,
      customCss: true,
      headerSelector: true,
      toastBg: true,
      toastColor: true,
      toastPosition: true,
    },
  });

  return {
    settings: settings || defaults,
    locale,
    i18n: {
      title: t("settings.title"),
      subtitle: t("settings.subtitle"),
      pageSection: t("settings.pageSection"),
      headingLabel: t("settings.headingLabel"),
      emptyMsgLabel: t("settings.emptyMsgLabel"),
      showPricesLabel: t("settings.showPricesLabel"),
      showRemoveLabel: t("settings.showRemoveLabel"),
      buttonLabelLabel: t("settings.buttonLabelLabel"),
      showAtcLabel: t("settings.showAtcLabel"),
      atcLabelLabel: t("settings.atcLabelLabel"),
      toastSection: t("settings.toastSection"),
      toastBgLabel: t("settings.toastBgLabel"),
      toastColorLabel: t("settings.toastColorLabel"),
      headerSection: t("settings.headerSection"),
      headerSelectorLabel: t("settings.headerSelectorLabel"),
      headerSelectorHelp: t("settings.headerSelectorHelp"),
      saveButton: t("settings.saveButton"),
      savedToast: t("settings.savedToast"),
    },
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const settings = {
    heading: String(formData.get("heading") || defaults.heading).trim(),
    emptyMessage: String(
      formData.get("emptyMessage") || defaults.emptyMessage
    ).trim(),
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
  const { settings, i18n } = useLoaderData();
  const actionData = useActionData();

  return (
    <s-page heading={i18n.title}>
      <Form method="post">
        <s-stack direction="block" gap="large">
          <s-section>
            <s-stack direction="block" gap="small">
              <s-heading>{i18n.title}</s-heading>
              <s-text>{i18n.subtitle}</s-text>
            </s-stack>
          </s-section>

          {/* Wishlist Page Appearance */}
          <s-section heading={i18n.pageSection}>
            <s-stack direction="block" gap="base">
              <s-text-field
                label={i18n.headingLabel}
                name="heading"
                value={settings.heading}
              />
              <s-text-field
                label={i18n.emptyMsgLabel}
                name="emptyMessage"
                value={settings.emptyMessage}
              />
              <s-checkbox
                label={i18n.showPricesLabel}
                name="showPrices"
                checked={settings.showPrices}
              />
              <s-checkbox
                label={i18n.showRemoveLabel}
                name="showRemove"
                checked={settings.showRemove}
              />
              <s-text-field
                label={i18n.buttonLabelLabel}
                name="buttonLabel"
                value={settings.buttonLabel}
              />
              <s-checkbox
                label={i18n.showAtcLabel}
                name="showAddToCart"
                checked={settings.showAddToCart}
              />
              <s-text-field
                label={i18n.atcLabelLabel}
                name="addToCartLabel"
                value={settings.addToCartLabel}
              />
            </s-stack>
          </s-section>

          {/* Header Link */}
          <s-section heading={i18n.headerSection}>
            <s-stack direction="block" gap="base">
              <s-text-field
                label={i18n.headerSelectorLabel}
                name="headerSelector"
                value={settings.headerSelector}
                helpText={i18n.headerSelectorHelp}
              />
            </s-stack>
          </s-section>

          {/* Toast */}
          <s-section heading={i18n.toastSection}>
            <s-stack direction="block" gap="base">
              <s-text-field
                label={i18n.toastBgLabel}
                name="toastBg"
                value={settings.toastBg}
              />
              <s-text-field
                label={i18n.toastColorLabel}
                name="toastColor"
                value={settings.toastColor}
              />
            </s-stack>
          </s-section>

          {actionData?.saved && (
            <s-banner tone="success" heading={i18n.savedToast}>
              {i18n.savedToast}
            </s-banner>
          )}

          <s-section>
            <s-button type="submit" variant="primary">
              {i18n.saveButton}
            </s-button>
          </s-section>
        </s-stack>
      </Form>
    </s-page>
  );
}
