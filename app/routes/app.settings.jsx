import { useState } from "react";
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

  const isChecked = (name) => {
    const val = formData.get(name);
    return val === "on" || val === "true" || val === "1" || val === true;
  };

  const settings = {
    heading: String(formData.get("heading") || defaults.heading).trim(),
    emptyMessage: String(
      formData.get("emptyMessage") || defaults.emptyMessage
    ).trim(),
    showPrices: isChecked("showPrices"),
    showRemove: isChecked("showRemove"),
    buttonLabel: String(
      formData.get("buttonLabel") || defaults.buttonLabel
    ).trim(),
    showAddToCart: isChecked("showAddToCart"),
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
    toastBg: String(formData.get("toastBg") || defaults.toastBg).trim(),
    toastColor: String(formData.get("toastColor") || defaults.toastColor).trim(),
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

  const [preview, setPreview] = useState({
    heading: settings.heading,
    emptyMessage: settings.emptyMessage,
    showPrices: settings.showPrices,
    showRemove: settings.showRemove,
    buttonLabel: settings.buttonLabel,
    showAddToCart: settings.showAddToCart,
    addToCartLabel: settings.addToCartLabel,
    toastBg: settings.toastBg,
    toastColor: settings.toastColor,
  });

  return (
    <s-page heading={i18n.title}>
      {actionData?.saved && (
        <div style={{ marginBottom: "16px" }}>
          <s-banner tone="success" heading={i18n.savedToast}>
            {i18n.savedToast}
          </s-banner>
        </div>
      )}

      <s-grid gridTemplateColumns="repeat(auto-fit, minmax(320px, 1fr))" gap="large">
        {/* Left Column: Form Controls */}
        <Form method="post">
          <s-stack direction="block" gap="large">
            <s-section heading={i18n.pageSection}>
              <s-stack direction="block" gap="base">
                <s-text-field
                  label={i18n.headingLabel}
                  name="heading"
                  value={preview.heading}
                  onInput={(e) => setPreview({ ...preview, heading: e.target.value })}
                />
                <s-text-field
                  label={i18n.emptyMsgLabel}
                  name="emptyMessage"
                  value={preview.emptyMessage}
                  onInput={(e) => setPreview({ ...preview, emptyMessage: e.target.value })}
                />
                <input type="hidden" name="showPrices" value={preview.showPrices ? "true" : "false"} />
                <s-checkbox
                  label={i18n.showPricesLabel}
                  checked={preview.showPrices}
                  onChange={(e) => setPreview({ ...preview, showPrices: e.target.checked })}
                />
                <input type="hidden" name="showRemove" value={preview.showRemove ? "true" : "false"} />
                <s-checkbox
                  label={i18n.showRemoveLabel}
                  checked={preview.showRemove}
                  onChange={(e) => setPreview({ ...preview, showRemove: e.target.checked })}
                />
                {preview.showRemove && (
                  <s-text-field
                    label={i18n.buttonLabelLabel}
                    name="buttonLabel"
                    value={preview.buttonLabel}
                    onInput={(e) => setPreview({ ...preview, buttonLabel: e.target.value })}
                  />
                )}
                <input type="hidden" name="showAddToCart" value={preview.showAddToCart ? "true" : "false"} />
                <s-checkbox
                  label={i18n.showAtcLabel}
                  checked={preview.showAddToCart}
                  onChange={(e) => setPreview({ ...preview, showAddToCart: e.target.checked })}
                />
                {preview.showAddToCart && (
                  <s-text-field
                    label={i18n.atcLabelLabel}
                    name="addToCartLabel"
                    value={preview.addToCartLabel}
                    onInput={(e) => setPreview({ ...preview, addToCartLabel: e.target.value })}
                  />
                )}
              </s-stack>
            </s-section>

            <s-section heading={i18n.toastSection}>
              <s-stack direction="block" gap="base">
                <s-text-field
                  label={i18n.toastBgLabel}
                  name="toastBg"
                  value={preview.toastBg}
                  onInput={(e) => setPreview({ ...preview, toastBg: e.target.value })}
                />
                <s-text-field
                  label={i18n.toastColorLabel}
                  name="toastColor"
                  value={preview.toastColor}
                  onInput={(e) => setPreview({ ...preview, toastColor: e.target.value })}
                />
              </s-stack>
            </s-section>

            <s-section heading={i18n.headerSection}>
              <s-stack direction="block" gap="base">
                <s-text-field
                  label={i18n.headerSelectorLabel}
                  name="headerSelector"
                  defaultValue={settings.headerSelector}
                  helpText={i18n.headerSelectorHelp}
                />
              </s-stack>
            </s-section>

            <s-section>
              <s-button type="submit" variant="primary">
                {i18n.saveButton}
              </s-button>
            </s-section>
          </s-stack>
        </Form>

        {/* Right Column: Interactive Live Preview */}
        <div>
          <s-box border="base" borderRadius="base" padding="large" background="base" style={{ position: "sticky", top: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <s-heading>Live Storefront Preview</s-heading>
              <s-badge tone="info">Real-time</s-badge>
            </div>

            {/* Simulated Wishlist Page Item Card */}
            <div style={{
              background: "#fdfdfd",
              border: "1px solid #e1e3e5",
              borderRadius: "12px",
              padding: "16px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.03)"
            }}>
              <div style={{
                width: "100%",
                height: "170px",
                background: "linear-gradient(135deg, #f1f2f3 0%, #e5e6e7 100%)",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative"
              }}>
                <span style={{ fontSize: "36px" }}>🛍️</span>
                <span style={{
                  position: "absolute",
                  top: "10px",
                  right: "10px",
                  background: "#ffffff",
                  borderRadius: "50%",
                  width: "32px",
                  height: "32px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
                  color: "#fe847f"
                }}>
                  ♥
                </span>
              </div>

              <div style={{ marginTop: "12px" }}>
                <div style={{ fontWeight: "600", fontSize: "15px" }}>Classic Cotton T-Shirt</div>
                {preview.showPrices && (
                  <div style={{ color: "#6d7175", fontSize: "14px", marginTop: "2px" }}>$34.00</div>
                )}
              </div>

              <div style={{ display: "flex", gap: "8px", marginTop: "14px" }}>
                {preview.showAddToCart && (
                  <button type="button" style={{
                    flex: 1,
                    backgroundColor: "#008060",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "6px",
                    padding: "8px 12px",
                    fontSize: "13px",
                    fontWeight: "600",
                    cursor: "pointer"
                  }}>
                    {preview.addToCartLabel || "Add to cart"}
                  </button>
                )}
                {preview.showRemove && (
                  <button type="button" style={{
                    flex: preview.showAddToCart ? 0.7 : 1,
                    backgroundColor: "#f1f2f3",
                    color: "#202223",
                    border: "1px solid #d2d5d8",
                    borderRadius: "6px",
                    padding: "8px 12px",
                    fontSize: "13px",
                    fontWeight: "500",
                    cursor: "pointer"
                  }}>
                    {preview.buttonLabel || "Remove"}
                  </button>
                )}
              </div>
            </div>

            {/* Simulated Live Toast Preview */}
            <div style={{ marginTop: "24px" }}>
              <s-text color="subdued">Live Notification Toast Preview</s-text>
              <div style={{
                marginTop: "8px",
                backgroundColor: preview.toastBg || "#1a1a1a",
                color: preview.toastColor || "#ffffff",
                padding: "10px 16px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: "500",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                boxShadow: "0 4px 14px rgba(0,0,0,0.18)"
              }}>
                <span>✓</span> Added to wishlist
              </div>
            </div>
          </s-box>
        </div>
      </s-grid>
    </s-page>
  );
}
