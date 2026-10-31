import { useState } from "react";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { detectLocale, createTranslator } from "../i18n.server";
import wishlistStyles from "../../extensions/wishlist-product/assets/wishlist.css?raw";
import wishlistProductScript from "../../extensions/wishlist-product/assets/wishlist-product.js?raw";
import wishlistCollectionScript from "../../extensions/wishlist-product/assets/wishlist-collection.js?raw";
import wishlistPageScript from "../../extensions/wishlist-product/assets/wishlist-page.js?raw";
import manualButtonSnippet from "../../extensions/wishlist-product/snippets/manual-wishlist-button.liquid?raw";
import manualCollectionSnippet from "../../extensions/wishlist-product/snippets/manual-wishlist-collection.liquid?raw";
import manualPageSnippet from "../../extensions/wishlist-product/snippets/manual-wishlist-page.liquid?raw";
import headerLinkSnippet from "../../extensions/wishlist-product/snippets/wishlist-header-link.liquid?raw";

const codeAreaStyle = {
  width: "100%",
  boxSizing: "border-box",
  backgroundColor: "#0d1117",
  color: "#e6edf3",
  border: "1px solid #30363d",
  borderRadius: "6px",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: "12px",
  lineHeight: "1.55",
  padding: "12px 14px",
  resize: "vertical",
  cursor: "text",
};

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const locale = detectLocale({ request, session });
  const t = createTranslator(locale);

  return {
    shop: session.shop,
    locale,
    i18n: {
      title: t("howToUse.title") || "Storefront Integration Guide",
      subtitle: t("howToUse.subtitle") || "Complete setup guide for Online Store 2.0 app blocks and vintage theme manual Liquid code.",
    },
  };
};

export default function HowToUsePage() {
  const { shop, i18n } = useLoaderData() || {};
  const [copiedKey, setCopiedKey] = useState(null);

  const copyToClipboard = (key, text, textareaId) => {
    let success = false;

    // 1. Direct synchronous selection on existing input/textarea if present
    if (textareaId) {
      try {
        const el = document.getElementById(textareaId);
        if (el) {
          el.focus();
          el.select();
          if (el.setSelectionRange) {
            el.setSelectionRange(0, el.value.length);
          }
          success = document.execCommand("copy");
        }
      } catch (e) {
        success = false;
      }
    }

    // 2. If not copied yet, use a temporary textarea synchronously during the click gesture
    if (!success) {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.top = "0";
        ta.style.left = "0";
        ta.style.width = "2em";
        ta.style.height = "2em";
        ta.style.padding = "0";
        ta.style.border = "none";
        ta.style.outline = "none";
        ta.style.boxShadow = "none";
        ta.style.background = "transparent";
        ta.style.opacity = "0.01";
        ta.style.zIndex = "-1";
        ta.setAttribute("readonly", "");
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        if (ta.setSelectionRange) {
          ta.setSelectionRange(0, ta.value.length);
        }
        success = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch (e) {
        success = false;
      }
    }

    // 3. Also invoke modern Clipboard API in case the iframe permits it
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }

    // 4. Update visual state
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey((curr) => (curr === key ? null : curr));
    }, 2000);
  };

  const snippets = [
    {
      id: "btn-file",
      title: "1. Product Page Button (Liquid Snippet)",
      filename: "snippets/manual-wishlist-button.liquid",
      placement: "Theme Editor → Edit code → Add snippet: snippets/manual-wishlist-button.liquid",
      content: manualButtonSnippet,
      open: true,
    },
    {
      id: "col-file",
      title: "2. Collection Card Hearts (Liquid Snippet)",
      filename: "snippets/manual-wishlist-collection.liquid",
      placement: "Theme Editor → Edit code → Add snippet: snippets/manual-wishlist-collection.liquid",
      content: manualCollectionSnippet,
      open: false,
    },
    {
      id: "page-file",
      title: "3. Dedicated Wishlist Page (Liquid Snippet)",
      filename: "snippets/manual-wishlist-page.liquid",
      placement: "Theme Editor → Edit code → Add snippet: snippets/manual-wishlist-page.liquid",
      content: manualPageSnippet,
      open: false,
    },
    {
      id: "hdr-file",
      title: "4. Header Link & Counter (Liquid Snippet)",
      filename: "snippets/wishlist-header-link.liquid",
      placement: "Theme Editor → Edit code → Add snippet: snippets/wishlist-header-link.liquid",
      content: headerLinkSnippet,
      open: false,
    },
    {
      id: "prod-js",
      title: "5. Product Button Client Script (JavaScript)",
      filename: "assets/wishlist-product.js",
      placement: "Theme Editor → Edit code → Add asset: assets/wishlist-product.js",
      content: wishlistProductScript,
      open: false,
    },
    {
      id: "col-js",
      title: "6. Collection Card Client Script (JavaScript)",
      filename: "assets/wishlist-collection.js",
      placement: "Theme Editor → Edit code → Add asset: assets/wishlist-collection.js",
      content: wishlistCollectionScript,
      open: false,
    },
    {
      id: "page-js",
      title: "7. Wishlist Page Client Script (JavaScript)",
      filename: "assets/wishlist-page.js",
      placement: "Theme Editor → Edit code → Add asset: assets/wishlist-page.js",
      content: wishlistPageScript,
      open: false,
    },
    {
      id: "css-file",
      title: "8. Wishlist Stylesheet (CSS)",
      filename: "assets/wishlist.css",
      placement: "Theme Editor → Edit code → Add asset: assets/wishlist.css",
      content: wishlistStyles,
      open: false,
    },
  ];

  return (
    <s-page heading={i18n?.title || "Storefront Integration Guide"}>
      {/* ── Top Header ── */}
      <s-section>
        <s-box border="base" borderRadius="base" padding="base" background="base">
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "16px"
          }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                <span style={{ fontSize: "22px" }}>🚀</span>
                <s-heading>{i18n?.title || "Storefront Integration Guide"}</s-heading>
              </div>
              <p style={{ margin: 0, fontSize: "14px", color: "#5c5f62" }}>
                Setup wishlist on your store. Use zero-code Online Store 2.0 app blocks or copy Liquid snippets for vintage themes.
              </p>
            </div>

            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <div style={{
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: "6px",
                padding: "6px 12px",
                fontSize: "12px",
                color: "#166534"
              }}>
                <strong>Proxy Active:</strong> <code>/apps/saitriq-wishlist</code>
              </div>

              <a
                href={`https://${shop}/admin/themes/current/editor?context=apps`}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  background: "#008060",
                  color: "#ffffff",
                  fontWeight: "600",
                  fontSize: "12.5px",
                  padding: "7px 14px",
                  borderRadius: "6px",
                  textDecoration: "none"
                }}
              >
                <span>Open Theme Editor ↗</span>
              </a>
            </div>
          </div>
        </s-box>
      </s-section>

      {/* ── PART 1: ONLINE STORE 2.0 (APP BLOCKS) ── */}
      <s-section>
        <s-box border="base" borderRadius="base" padding="base" background="base">
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "14px",
            borderBottom: "1px solid #e1e3e5",
            paddingBottom: "10px"
          }}>
            <span style={{ fontSize: "18px" }}>⚡</span>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "700", color: "#202223" }}>
              Online Store 2.0 Integration (Zero Code Edits)
            </h3>
            <span style={{
              background: "#e6f7f0",
              color: "#008060",
              fontSize: "11px",
              fontWeight: "700",
              padding: "2px 8px",
              borderRadius: "4px"
            }}>
              Recommended
            </span>
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "12px"
          }}>
            {/* Step 1 */}
            <div style={{ background: "#ffffff", border: "1px solid #e1e3e5", borderRadius: "8px", padding: "14px" }}>
              <strong style={{ fontSize: "13.5px", color: "#202223", display: "block", marginBottom: "4px" }}>
                1. Enable App Embed
              </strong>
              <p style={{ margin: "0 0 10px 0", fontSize: "12.5px", color: "#5c5f62", lineHeight: "1.4" }}>
                In Theme Editor, click <strong>App embeds</strong> on the left, switch <strong>Saitriq Wishlist</strong> to ON, and click Save.
              </p>
              <a
                href={`https://${shop}/admin/themes/current/editor?context=apps`}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: "12px", color: "#008060", fontWeight: "600", textDecoration: "none" }}
              >
                Open App Embeds Settings →
              </a>
            </div>

            {/* Step 2 */}
            <div style={{ background: "#ffffff", border: "1px solid #e1e3e5", borderRadius: "8px", padding: "14px" }}>
              <strong style={{ fontSize: "13.5px", color: "#202223", display: "block", marginBottom: "4px" }}>
                2. Product Page Button
              </strong>
              <p style={{ margin: "0 0 10px 0", fontSize: "12.5px", color: "#5c5f62", lineHeight: "1.4" }}>
                Go to <strong>Default product</strong> template in Theme Editor. Under Product information, click <strong>Add block</strong> and select <strong>Product Page Button</strong>.
              </p>
              <a
                href={`https://${shop}/admin/themes/current/editor`}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: "12px", color: "#008060", fontWeight: "600", textDecoration: "none" }}
              >
                Customize Product Page →
              </a>
            </div>

            {/* Step 3 */}
            <div style={{ background: "#ffffff", border: "1px solid #e1e3e5", borderRadius: "8px", padding: "14px" }}>
              <strong style={{ fontSize: "13.5px", color: "#202223", display: "block", marginBottom: "4px" }}>
                3. Collection Grid Hearts
              </strong>
              <p style={{ margin: "0 0 10px 0", fontSize: "12.5px", color: "#5c5f62", lineHeight: "1.4" }}>
                In <strong>Default collection</strong> template, click <strong>Add block</strong> inside the product grid to show wishlist heart icons.
              </p>
              <a
                href={`https://${shop}/admin/themes/current/editor`}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: "12px", color: "#008060", fontWeight: "600", textDecoration: "none" }}
              >
                Customize Collections →
              </a>
            </div>

            {/* Step 4 */}
            <div style={{ background: "#ffffff", border: "1px solid #e1e3e5", borderRadius: "8px", padding: "14px" }}>
              <strong style={{ fontSize: "13.5px", color: "#202223", display: "block", marginBottom: "4px" }}>
                4. Dedicated Wishlist Page
              </strong>
              <p style={{ margin: "0 0 10px 0", fontSize: "12.5px", color: "#5c5f62", lineHeight: "1.4" }}>
                In Shopify Admin → Pages, create a page with URL slug <code>wishlist</code> (<code>/pages/wishlist</code>). Then add the Wishlist page block in Theme Editor.
              </p>
              <a
                href={`https://${shop}/admin/pages/new`}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: "12px", color: "#008060", fontWeight: "600", textDecoration: "none" }}
              >
                Create Page in Admin →
              </a>
            </div>
          </div>
        </s-box>
      </s-section>

      {/* ── PART 2: MANUAL LIQUID INTEGRATION (VINTAGE THEMES) ── */}
      <s-section>
        <s-box border="base" borderRadius="base" padding="base" background="base">
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "10px",
            marginBottom: "14px",
            borderBottom: "1px solid #e1e3e5",
            paddingBottom: "10px"
          }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "18px" }}>🛠</span>
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "700", color: "#202223" }}>
                  Manual Liquid Theme Integration (Vintage Themes)
                </h3>
              </div>
              <p style={{ margin: "3px 0 0 0", fontSize: "13px", color: "#5c5f62" }}>
                For vintage themes (Debut, Brooklyn, Simple, Venture, etc.) that do not support app blocks.
              </p>
            </div>

            <a
              href={`https://${shop}/admin/themes/current/editor`}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                background: "#202223",
                color: "#ffffff",
                fontWeight: "600",
                fontSize: "12px",
                padding: "6px 14px",
                borderRadius: "6px",
                textDecoration: "none"
              }}
            >
              <span>Edit Theme Code ↗</span>
            </a>
          </div>

          {/* Liquid Tags Cheat Sheet */}
          <div style={{
            background: "#fffbeb",
            border: "1px solid #fde68a",
            borderRadius: "8px",
            padding: "16px",
            marginBottom: "20px"
          }}>
            <strong style={{ fontSize: "13.5px", color: "#92400e", display: "block", marginBottom: "8px" }}>
              📋 1-Line Liquid Tags (Paste into your theme files):
            </strong>

            <div style={{ display: "grid", gap: "8px" }}>
              {/* Product page */}
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "#ffffff",
                border: "1px solid #fde68a",
                borderRadius: "6px",
                padding: "10px 12px",
                flexWrap: "wrap",
                gap: "8px"
              }}>
                <div>
                  <strong style={{ fontSize: "13px", color: "#202223" }}>Product Page Button</strong>
                  <div style={{ fontSize: "11.5px", color: "#6d7175" }}>Paste in <code>sections/main-product.liquid</code> near Add to Cart</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input
                    type="text"
                    readOnly
                    id="tag-btn"
                    value="{% render 'manual-wishlist-button' %}"
                    onFocus={(e) => e.target.select()}
                    onClick={(e) => e.target.select()}
                    style={{
                      background: "#f3f4f6",
                      border: "1px solid #d1d5db",
                      borderRadius: "4px",
                      padding: "5px 8px",
                      fontSize: "12px",
                      color: "#008060",
                      fontWeight: "600",
                      width: "260px"
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => copyToClipboard("btn-tag", "{% render 'manual-wishlist-button' %}", "tag-btn")}
                    style={{
                      background: copiedKey === "btn-tag" ? "#008060" : "#202223",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "4px",
                      padding: "6px 12px",
                      fontSize: "12px",
                      fontWeight: "600",
                      cursor: "pointer"
                    }}
                  >
                    {copiedKey === "btn-tag" ? "✓ Copied" : "Copy"}
                  </button>
                </div>
              </div>

              {/* Collection cards */}
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "#ffffff",
                border: "1px solid #fde68a",
                borderRadius: "6px",
                padding: "10px 12px",
                flexWrap: "wrap",
                gap: "8px"
              }}>
                <div>
                  <strong style={{ fontSize: "13px", color: "#202223" }}>Collection Cards Heart Icon</strong>
                  <div style={{ fontSize: "11.5px", color: "#6d7175" }}>Paste in <code>snippets/product-card.liquid</code> inside card</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input
                    type="text"
                    readOnly
                    id="tag-col"
                    value="{% render 'manual-wishlist-collection' %}"
                    onFocus={(e) => e.target.select()}
                    onClick={(e) => e.target.select()}
                    style={{
                      background: "#f3f4f6",
                      border: "1px solid #d1d5db",
                      borderRadius: "4px",
                      padding: "5px 8px",
                      fontSize: "12px",
                      color: "#008060",
                      fontWeight: "600",
                      width: "260px"
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => copyToClipboard("col-tag", "{% render 'manual-wishlist-collection' %}", "tag-col")}
                    style={{
                      background: copiedKey === "col-tag" ? "#008060" : "#202223",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "4px",
                      padding: "6px 12px",
                      fontSize: "12px",
                      fontWeight: "600",
                      cursor: "pointer"
                    }}
                  >
                    {copiedKey === "col-tag" ? "✓ Copied" : "Copy"}
                  </button>
                </div>
              </div>

              {/* Wishlist page */}
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "#ffffff",
                border: "1px solid #fde68a",
                borderRadius: "6px",
                padding: "10px 12px",
                flexWrap: "wrap",
                gap: "8px"
              }}>
                <div>
                  <strong style={{ fontSize: "13px", color: "#202223" }}>Wishlist Page Template</strong>
                  <div style={{ fontSize: "11.5px", color: "#6d7175" }}>Paste in <code>templates/page.wishlist.liquid</code></div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input
                    type="text"
                    readOnly
                    id="tag-page"
                    value="{% render 'manual-wishlist-page' %}"
                    onFocus={(e) => e.target.select()}
                    onClick={(e) => e.target.select()}
                    style={{
                      background: "#f3f4f6",
                      border: "1px solid #d1d5db",
                      borderRadius: "4px",
                      padding: "5px 8px",
                      fontSize: "12px",
                      color: "#008060",
                      fontWeight: "600",
                      width: "260px"
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => copyToClipboard("page-tag", "{% render 'manual-wishlist-page' %}", "tag-page")}
                    style={{
                      background: copiedKey === "page-tag" ? "#008060" : "#202223",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "4px",
                      padding: "6px 12px",
                      fontSize: "12px",
                      fontWeight: "600",
                      cursor: "pointer"
                    }}
                  >
                    {copiedKey === "page-tag" ? "✓ Copied" : "Copy"}
                  </button>
                </div>
              </div>

              {/* Header link */}
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "#ffffff",
                border: "1px solid #fde68a",
                borderRadius: "6px",
                padding: "10px 12px",
                flexWrap: "wrap",
                gap: "8px"
              }}>
                <div>
                  <strong style={{ fontSize: "13px", color: "#202223" }}>Header Counter &amp; Link</strong>
                  <div style={{ fontSize: "11.5px", color: "#6d7175" }}>Paste in <code>sections/header.liquid</code> near cart or search</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input
                    type="text"
                    readOnly
                    id="tag-hdr"
                    value="{% render 'wishlist-header-link' %}"
                    onFocus={(e) => e.target.select()}
                    onClick={(e) => e.target.select()}
                    style={{
                      background: "#f3f4f6",
                      border: "1px solid #d1d5db",
                      borderRadius: "4px",
                      padding: "5px 8px",
                      fontSize: "12px",
                      color: "#008060",
                      fontWeight: "600",
                      width: "260px"
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => copyToClipboard("hdr-tag", "{% render 'wishlist-header-link' %}", "tag-hdr")}
                    style={{
                      background: copiedKey === "hdr-tag" ? "#008060" : "#202223",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "4px",
                      padding: "6px 12px",
                      fontSize: "12px",
                      fontWeight: "600",
                      cursor: "pointer"
                    }}
                  >
                    {copiedKey === "hdr-tag" ? "✓ Copied" : "Copy"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Full Code Snippets (Native HTML Details, No JavaScript Required to Expand) */}
          <div style={{ marginBottom: "10px" }}>
            <strong style={{ fontSize: "14px", color: "#202223", display: "block", marginBottom: "4px" }}>
              Full Code Files (Click to expand, click code box to select all):
            </strong>
            <span style={{ fontSize: "12.5px", color: "#6d7175" }}>
              Create these files in your theme under <code>snippets/</code> and <code>assets/</code>:
            </span>
          </div>

          <div style={{ display: "grid", gap: "10px" }}>
            {snippets.map((snip) => (
              <details
                key={snip.id}
                style={{
                  background: "#ffffff",
                  border: "1px solid #d2d5d8",
                  borderRadius: "8px",
                  padding: "12px 16px"
                }}
              >
                <summary style={{
                  cursor: "pointer",
                  fontWeight: "600",
                  fontSize: "13.5px",
                  color: "#202223",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  outline: "none"
                }}>
                  <span>📄 {snip.title}</span>
                  <span style={{
                    fontSize: "11.5px",
                    color: "#008060",
                    background: "#f0fdf4",
                    padding: "3px 8px",
                    borderRadius: "4px",
                    fontWeight: "500"
                  }}>
                    {snip.filename}
                  </span>
                </summary>

                <div style={{ marginTop: "12px" }}>
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "8px",
                    flexWrap: "wrap",
                    gap: "8px"
                  }}>
                    <span style={{ fontSize: "12px", color: "#5c5f62" }}>
                      <strong>Destination:</strong> {snip.placement}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(snip.id, snip.content, `textarea-${snip.id}`)}
                      style={{
                        background: copiedKey === snip.id ? "#008060" : "#202223",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: "5px",
                        padding: "5px 12px",
                        fontSize: "12px",
                        fontWeight: "600",
                        cursor: "pointer"
                      }}
                    >
                      {copiedKey === snip.id ? "✓ Copied to clipboard" : "📋 Copy File Content"}
                    </button>
                  </div>

                  <textarea
                    id={`textarea-${snip.id}`}
                    readOnly
                    rows={10}
                    value={snip.content}
                    onFocus={(e) => e.target.select()}
                    onClick={(e) => e.target.select()}
                    style={codeAreaStyle}
                  />
                  <div style={{ fontSize: "11px", color: "#6d7175", marginTop: "4px", textAlign: "right" }}>
                    Tip: Click inside the box to select all text, then press Ctrl+C
                  </div>
                </div>
              </details>
            ))}
          </div>
        </s-box>
      </s-section>
    </s-page>
  );
}