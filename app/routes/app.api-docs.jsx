import { useState, useMemo } from "react";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { detectLocale, createTranslator } from "../i18n.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const locale = detectLocale({ request, session });
  const t = createTranslator(locale);

  return {
    shop: session.shop,
    locale,
    i18n: {
      title: t("apiDocs.title") || "Developer API Reference",
      subtitle: t("apiDocs.subtitle") || "Integrate wishlist endpoints with custom headless storefronts and theme scripts.",
      overviewTitle: t("apiDocs.overviewTitle") || "Overview & Architecture",
      overviewDesc: t("apiDocs.overviewDesc") || "Saitriq Wishlist provides an App Proxy API mounted at /apps/saitriq-wishlist. Requests sent with credentials: 'same-origin' are securely signed and authenticated by Shopify HMAC.",
      statusCodesTitle: t("apiDocs.statusCodesTitle") || "HTTP Status Codes & Quota Enforcement",
      code200: t("apiDocs.code200") || "Success - request completed normally.",
      code400: t("apiDocs.code400") || "Bad Request - missing required parameters.",
      code401: t("apiDocs.code401") || "Unauthorized - shopper session required.",
      code404: t("apiDocs.code404") || "Not Found - endpoint or item not found.",
      code429: t("apiDocs.code429") || "Too Many Requests - monthly plan quota exceeded.",
      code429Desc: t("apiDocs.code429Desc") || "When a merchant exceeds their monthly plan quota, mutating operations (such as adding saves) return HTTP 429 with limitReached: true. Removal and clear operations continue to function.",
    },
  };
};

const codeBoxStyle = {
  backgroundColor: "#1a1a1a",
  border: "1px solid #333333",
  borderRadius: "8px",
  color: "#d4d4d4",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSize: "12px",
  lineHeight: 1.55,
  margin: "8px 0 0 0",
  maxHeight: "26rem",
  overflow: "auto",
  padding: "14px",
  whiteSpace: "pre",
};

export default function ApiDocsPage() {
  const { shop, i18n } = useLoaderData() || {};
  const [activeTab, setActiveTab] = useState("proxy");
  const [copiedKey, setCopiedKey] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSdkModule, setActiveSdkModule] = useState("core");

  const handleCopy = (key, text) => {
    try {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  const sdkModules = {
    core: {
      title: "1 — Core Wishlist Client",
      filename: "assets/saitriq-wishlist.js",
      desc: "Drop this once into your theme JS. Exposes window.SaitriqWishlist used by all custom components.",
      code: `// assets/saitriq-wishlist.js
// Core wishlist client — add once to your theme JS bundle
window.SaitriqWishlist = (() => {
  const STORAGE_KEY  = 'saitriq_wishlist';
  const VISITOR_KEY  = 'saitriq_wishlist_visitor';
  const ENDPOINT     = '/apps/saitriq-wishlist';

  // ── localStorage ──────────────────────────────────────────────────────────
  const getItems = () => {
    try {
      const v = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(v) ? v : [];
    } catch { return []; }
  };

  const setItems = (items) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch {}
    window.dispatchEvent(new CustomEvent('saitriq:wishlist-updated'));
  };

  const getVisitorId = () => {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 14);
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  };

  // ── Auth & Sync State ─────────────────────────────────────────────────────
  let _authenticated = false;
  let _settings      = {};
  let _syncPromise   = null;

  // ── Fetch Helpers ─────────────────────────────────────────────────────────
  const apiFetch = async (path, options = {}) => {
    const res = await fetch(ENDPOINT + path, {
      credentials: 'same-origin',
      ...options,
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      if (res.status === 429) {
        window.dispatchEvent(new CustomEvent('saitriq:wishlist-limit-reached', { detail: errData }));
      }
      throw new Error(errData.error || \`Wishlist API error: \${res.status}\`);
    }
    return res.json();
  };

  const post = (body) =>
    apiFetch('', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorId: getVisitorId(), ...body }),
    });

  // ── Initial Single-Flight Sync ───────────────────────────────────────────
  const sync = () => {
    if (_syncPromise) return _syncPromise;
    _syncPromise = apiFetch('')
      .then((data) => {
        _authenticated = data.authenticated === true;
        if (data.settings) _settings = data.settings;
        if (_authenticated && Array.isArray(data.items)) {
          setItems(data.items.map(_mapItem));
        }
      })
      .catch(() => {})
      .finally(() => { _syncPromise = null; });
    return _syncPromise;
  };

  const _mapItem = (s) => ({
    id:       s.productId,
    handle:   s.productHandle,
    title:    s.productTitle,
    image:    s.productImage  || '',
    price:    s.productPrice  || '',
    addedAt:  s.createdAt     || '',
  });

  // ── Public API ─────────────────────────────────────────────────────────────
  const isSaved = (productId) =>
    getItems().some((i) => String(i.id) === String(productId));

  const add = async (item) => {
    if (!_authenticated) {
      post({ operation: 'add', ...item }).catch(() => {});
      const items = getItems();
      if (!items.some((i) => String(i.id) === String(item.productId))) {
        items.push({ id: item.productId, handle: item.productHandle, title: item.productTitle, image: item.productImage || '', price: item.productPrice || '', addedAt: new Date().toISOString() });
        setItems(items);
      }
      return items;
    }
    const data = await post({ operation: 'add', ...item });
    const synced = (data.items || []).map(_mapItem);
    setItems(synced);
    return synced;
  };

  const remove = async (item) => {
    if (!_authenticated) {
      post({ operation: 'remove', ...item }).catch(() => {});
      setItems(getItems().filter((i) => String(i.id) !== String(item.productId)));
      return getItems();
    }
    const data = await post({ operation: 'remove', ...item });
    const synced = (data.items || []).map(_mapItem);
    setItems(synced);
    return synced;
  };

  const toggle = async (item) =>
    isSaved(item.productId) ? remove(item) : add(item);

  const clear = async () => {
    const data = await post({ operation: 'clear' });
    const synced = (data.items || []).map(_mapItem);
    setItems(synced);
    return synced;
  };

  const getAll = () => getItems();
  const getSettings = () => _settings;
  const onChange = (fn) => window.addEventListener('saitriq:wishlist-updated', fn);
  const offChange = (fn) => window.removeEventListener('saitriq:wishlist-updated', fn);

  // Auto-sync on script execution
  sync();

  return { sync, isSaved, add, remove, toggle, clear, getAll, getSettings, onChange, offChange };
})();`,
    },
    button: {
      title: "2 — Custom Wishlist Button Hook",
      filename: "assets/custom-button.js",
      desc: "Wire up any custom HTML button as an interactive wishlist toggle.",
      code: `// Usage: Call on any button with data attributes:
// <button data-wishlist-btn data-product-id="123456" data-product-handle="silver-ring"
//         data-product-title="Silver Ring" data-product-image="https://..." data-product-price="$49.00">
//   ♡ Add to Wishlist
// </button>

function initWishlistButton(button) {
  const productId     = button.dataset.productId;
  const productHandle = button.dataset.productHandle;
  const productTitle  = button.dataset.productTitle;
  const productImage  = button.dataset.productImage || '';
  const productPrice  = button.dataset.productPrice || '';

  const refresh = () => {
    const saved = window.SaitriqWishlist?.isSaved(productId);
    button.classList.toggle('is-active', Boolean(saved));
    button.setAttribute('aria-pressed', String(Boolean(saved)));
    button.textContent = saved ? '♥ Saved in Wishlist' : '♡ Add to Wishlist';
  };

  button.addEventListener('click', async (e) => {
    e.preventDefault();
    if (button.disabled) return;
    button.disabled = true;
    try {
      await window.SaitriqWishlist?.toggle({ productId, productHandle, productTitle, productImage, productPrice });
    } catch (err) {
      console.warn('Wishlist toggle exception:', err.message);
    } finally {
      button.disabled = false;
    }
  });

  window.SaitriqWishlist?.onChange(refresh);
  refresh();
}

document.querySelectorAll('[data-wishlist-btn]').forEach(initWishlistButton);`,
    },
    counter: {
      title: "3 — Live Header Counter Badge",
      filename: "assets/counter-badge.js",
      desc: "Display a reactive wishlist item count that updates automatically without page reloads.",
      code: `// Usage: Place anywhere in your theme:
// <a href="/pages/wishlist">
//   Wishlist <span data-wishlist-count hidden>0</span>
// </a>

function initWishlistCounter(badge) {
  const update = () => {
    const count = window.SaitriqWishlist?.getAll().length || 0;
    badge.textContent = count;
    badge.hidden = count === 0;
  };

  window.SaitriqWishlist?.onChange(update);
  update();
}

document.querySelectorAll('[data-wishlist-count]').forEach(initWishlistCounter);`,
    },
    collection: {
      title: "4 — Collection Page Grid Hearts",
      filename: "assets/collection-hearts.js",
      desc: "Inject wishlist heart buttons dynamically into collection product cards with infinite scroll support.",
      code: `function initCollectionWishlist() {
  const cache = new Map();

  const getProductData = async (handle) => {
    if (cache.has(handle)) return cache.get(handle);
    const res = await fetch(\`/products/\${encodeURIComponent(handle)}.js\`);
    if (!res.ok) throw new Error('Product metadata fetch failed');
    const p = await res.json();
    const data = {
      productId:     String(p.id),
      productHandle: p.handle,
      productTitle:  p.title,
      productImage:  p.featured_image || p.images?.[0] || '',
      productPrice:  p.price ? (p.price / 100).toFixed(2) : '',
    };
    cache.set(handle, data);
    return data;
  };

  const handleFromLink = (link) => {
    const m = new URL(link.href, location.origin).pathname.match(/^\\/products\\/([^/?#]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  };

  const attach = async (link) => {
    const handle = handleFromLink(link);
    if (!handle) return;
    const card = link.closest('li, article, .card-wrapper, .product-card, .grid__item');
    if (!card || card.querySelector('[data-sai-col-btn]')) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sai-wishlist sai-wishlist--collection';
    btn.dataset.saiColBtn = '';
    btn.setAttribute('aria-label', 'Add to wishlist');
    card.style.position = card.style.position || 'relative';
    card.append(btn);

    let item;
    try {
      item = await getProductData(handle);
    } catch {
      btn.remove();
      return;
    }

    const refresh = () => {
      const saved = window.SaitriqWishlist?.isSaved(item.productId);
      btn.textContent = saved ? '♥' : '♡';
      btn.classList.toggle('is-active', Boolean(saved));
      btn.setAttribute('aria-label', saved ? 'Remove from wishlist' : 'Add to wishlist');
    };

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (btn.disabled) return;
      btn.disabled = true;
      try {
        await window.SaitriqWishlist?.toggle(item);
      } finally {
        btn.disabled = false;
      }
    });

    window.SaitriqWishlist?.onChange(refresh);
    refresh();
  };

  const scan = () => {
    document.querySelectorAll('a[href*="/products/"]').forEach(attach);
  };

  scan();
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
}

document.addEventListener('DOMContentLoaded', initCollectionWishlist);`,
    },
    events: {
      title: "5 — Custom Window Events Reference",
      filename: "assets/event-listeners.js",
      desc: "Listen for global wishlist updates and limit notifications anywhere in your theme.",
      code: `// 1. Fired whenever wishlist items are added, removed, or synced
window.addEventListener('saitriq:wishlist-updated', () => {
  const items = window.SaitriqWishlist?.getAll() || [];
  console.log('Wishlist synchronized. Active count:', items.length);
});

// 2. Fired when merchant monthly quota is reached (HTTP 429)
window.addEventListener('saitriq:wishlist-limit-reached', (event) => {
  console.warn('Monthly plan limit reached:', event.detail);
  // Optional: Trigger custom store banner or modal
});

// 3. Fired when toast notification is requested
window.addEventListener('saitriq:wishlist-toast', (event) => {
  console.log('Toast triggered:', event.detail.message);
});

// 4. Dispatch manually to force all theme buttons to refresh
window.dispatchEvent(new CustomEvent('saitriq:wishlist-updated'));`,
    },
  };

  const proxyEndpoints = [
    {
      id: "proxy-items",
      method: "GET",
      path: "/apps/saitriq-wishlist?api=items",
      title: "Get Customer Wishlist Items",
      desc: "Returns all saved items for the logged-in customer or guest session.",
      auth: "Automatic via App Proxy HMAC",
      params: [
        { name: "api", type: "string", required: true, desc: "Fixed value: 'items'" },
        { name: "logged_in_customer_id", type: "string", required: false, desc: "Appended automatically by Shopify App Proxy" },
      ],
      response: `{
  "items": [
    {
      "productId": "8192348572",
      "productHandle": "sapphire-pendant-necklace",
      "productTitle": "Sapphire Pendant Necklace",
      "productImage": "https://cdn.shopify.com/s/files/1/0000/products/sapphire.jpg",
      "productPrice": "$149.00",
      "customerId": "7192839182",
      "createdAt": "2026-10-15T12:00:00.000Z"
    }
  ]
}`,
    },
    {
      id: "proxy-check",
      method: "GET",
      path: "/apps/saitriq-wishlist?api=check&productId={id}",
      title: "Check If Product Is In Wishlist",
      desc: "Checks whether a specific product is saved. Useful for headless server rendering.",
      auth: "Automatic via App Proxy HMAC",
      params: [
        { name: "api", type: "string", required: true, desc: "Fixed value: 'check'" },
        { name: "productId", type: "string", required: true, desc: "Shopify numeric Product ID" },
      ],
      response: `{
  "saved": true,
  "authenticated": true,
  "productId": "8192348572"
}`,
    },
    {
      id: "proxy-settings",
      method: "GET",
      path: "/apps/saitriq-wishlist?api=settings",
      title: "Get Store Wishlist Settings",
      desc: "Returns merchant customization settings, button labels, toast configuration, and CSS.",
      auth: "Automatic via App Proxy HMAC",
      params: [
        { name: "api", type: "string", required: true, desc: "Fixed value: 'settings'" },
      ],
      response: `{
  "settings": {
    "heading": "My wishlist",
    "emptyMessage": "You have not saved any products yet.",
    "showPrices": true,
    "showRemove": true,
    "buttonLabel": "Remove",
    "showAddToCart": true,
    "addToCartLabel": "Add to cart",
    "toastBg": "#1a1a1a",
    "toastColor": "#ffffff",
    "toastPosition": "top-left"
  }
}`,
    },
    {
      id: "proxy-usage",
      method: "GET",
      path: "/apps/saitriq-wishlist?api=usage",
      title: "Get Current Month Usage & Capacity",
      desc: "Returns monthly used saves, plan limit, remaining allowance, and quota state.",
      auth: "Automatic via App Proxy HMAC",
      params: [
        { name: "api", type: "string", required: true, desc: "Fixed value: 'usage'" },
      ],
      response: `{
  "used": 420,
  "limit": 5000,
  "remaining": 4580,
  "planId": "starter"
}`,
    },
    {
      id: "proxy-mutate",
      method: "POST",
      path: "/apps/saitriq-wishlist",
      title: "Mutate Wishlist (Add, Remove, Clear)",
      desc: "Single unified POST mutation endpoint. Handles adding, removing, and clearing items with quota protection.",
      auth: "Automatic via App Proxy HMAC",
      params: [
        { name: "operation", type: "string", required: true, desc: "'add' | 'remove' | 'clear'" },
        { name: "productId", type: "string", required: "For add/remove", desc: "Shopify numeric Product ID" },
        { name: "productHandle", type: "string", required: "For add", desc: "Product URL slug" },
        { name: "productTitle", type: "string", required: "For add", desc: "Product Title" },
        { name: "productPrice", type: "string", required: "Optional", desc: "Formatted price string (e.g. '$29.00')" },
        { name: "productImage", type: "string", required: "Optional", desc: "CDN image URL" },
      ],
      response: `{
  "authenticated": true,
  "tracked": true,
  "items": [ /* Updated wishlist array */ ],
  "usage": {
    "used": 421,
    "limit": 5000,
    "remaining": 4579
  }
}`,
    },
  ];

  const adminEndpoints = [
    {
      id: "admin-items",
      method: "GET",
      path: "/app/api?resource=items&customerId={id}",
      title: "Admin: Customer Items",
      desc: "Fetch wishlist items for any specific customer inside the embedded admin app.",
      auth: "Shopify Admin Session Cookie",
      params: [
        { name: "resource", type: "string", required: true, desc: "Fixed: 'items'" },
        { name: "customerId", type: "string", required: true, desc: "Target Shopify Customer ID" },
      ],
      response: `{
  "customerId": "7192839182",
  "count": 3,
  "items": [ /* Array of product items */ ]
}`,
    },
    {
      id: "admin-all",
      method: "GET",
      path: "/app/api?resource=all&page=1&pageSize=50",
      title: "Admin: Paginated Store Wishlists",
      desc: "Retrieve all saved wishlist records across the entire shop with pagination metadata.",
      auth: "Shopify Admin Session Cookie",
      params: [
        { name: "resource", type: "string", required: true, desc: "Fixed: 'all'" },
        { name: "page", type: "number", required: false, desc: "Page index (defaults to 1)" },
        { name: "pageSize", type: "number", required: false, desc: "Items per page (max 100, default 50)" },
      ],
      response: `{
  "page": 1,
  "pageSize": 50,
  "total": 312,
  "totalPages": 7,
  "items": [ /* List of shop wishlist entries */ ]
}`,
    },
    {
      id: "admin-analytics",
      method: "GET",
      path: "/app/api?resource=analytics&month=2026-10",
      title: "Admin: Monthly Analytics Summary",
      desc: "Returns total add/remove operations and day-by-day activity trend history.",
      auth: "Shopify Admin Session Cookie",
      params: [
        { name: "resource", type: "string", required: true, desc: "Fixed: 'analytics'" },
        { name: "month", type: "string", required: false, desc: "Format: YYYY-MM (default: current month)" },
      ],
      response: `{
  "month": "2026-10",
  "adds": 640,
  "removes": 82,
  "history": [
    { "day": "2026-10-01", "adds": 24, "removes": 3 },
    { "day": "2026-10-02", "adds": 31, "removes": 5 }
  ],
  "usage": { "used": 640, "limit": 5000, "remaining": 4360 }
}`,
    },
    {
      id: "admin-mutate",
      method: "POST",
      path: "/app/api",
      title: "Admin: Mutate Customer Wishlist",
      desc: "Add, remove, or clear items on behalf of a customer from the Shopify Admin panel.",
      auth: "Shopify Admin Session Cookie",
      params: [
        { name: "resource", type: "string", required: true, desc: "Fixed: 'item'" },
        { name: "operation", type: "string", required: true, desc: "'add' | 'remove' | 'clear'" },
        { name: "customerId", type: "string", required: true, desc: "Target Customer ID" },
        { name: "productId", type: "string", required: "For add/remove", desc: "Product ID" },
      ],
      response: `{
  "success": true,
  "customerId": "7192839182",
  "operation": "add",
  "usage": { "used": 641, "limit": 5000, "remaining": 4359 }
}`,
    },
  ];

  const statusCodes = [
    {
      code: "200 OK",
      badgeTone: "success",
      badgeColor: "#008060",
      desc: i18n?.code200 || "Success - request completed normally.",
      details: "Returned for successful queries and operations. Payload includes updated item data and current usage counters.",
    },
    {
      code: "400 Bad Request",
      badgeTone: "warning",
      badgeColor: "#d97706",
      desc: i18n?.code400 || "Bad Request - missing required parameters.",
      details: "Returned when required fields like productId, customerId, or valid operation strings are omitted in mutation bodies.",
    },
    {
      code: "401 Unauthorized",
      badgeTone: "critical",
      badgeColor: "#dc2626",
      desc: i18n?.code401 || "Unauthorized - shopper session required.",
      details: "Returned if an Admin API endpoint is invoked without a valid Shopify Admin session cookie.",
    },
    {
      code: "404 Not Found",
      badgeTone: "warning",
      badgeColor: "#6b7280",
      desc: i18n?.code404 || "Not Found - endpoint or item not found.",
      details: "Returned if an unrecognized resource or non-existent endpoint path is called.",
    },
    {
      code: "429 Too Many Requests",
      badgeTone: "critical",
      badgeColor: "#b91c1c",
      desc: i18n?.code429 || "Too Many Requests - monthly plan quota exceeded.",
      details: i18n?.code429Desc || "When monthly capacity is exhausted on operation: 'add', the API responds with HTTP 429. Note: 'remove' and 'clear' are NEVER blocked.",
      example: `{
  "error": "Monthly limit reached. Please upgrade your plan.",
  "limitReached": true,
  "usage": {
    "used": 5000,
    "limit": 5000,
    "remaining": 0,
    "planId": "starter"
  }
}`,
    },
  ];

  const filteredProxy = useMemo(() => {
    if (!searchQuery.trim()) return proxyEndpoints;
    const q = searchQuery.toLowerCase();
    return proxyEndpoints.filter((ep) =>
      ep.title.toLowerCase().includes(q) ||
      ep.path.toLowerCase().includes(q) ||
      ep.desc.toLowerCase().includes(q)
    );
  }, [searchQuery, proxyEndpoints]);

  const filteredAdmin = useMemo(() => {
    if (!searchQuery.trim()) return adminEndpoints;
    const q = searchQuery.toLowerCase();
    return adminEndpoints.filter((ep) =>
      ep.title.toLowerCase().includes(q) ||
      ep.path.toLowerCase().includes(q) ||
      ep.desc.toLowerCase().includes(q)
    );
  }, [searchQuery, adminEndpoints]);

  return (
    <s-page heading={i18n?.title || "Developer API Reference"}>
      {/* ── Top Hero Card ── */}
      <s-section>
        <s-box border="base" borderRadius="base" padding="base" background="base">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                <span style={{ fontSize: "24px" }}>⚡</span>
                <s-heading>{i18n?.title || "Developer API Reference"}</s-heading>
              </div>
              <p style={{ margin: 0, fontSize: "14px", color: "#5c5f62", maxWidth: "680px", lineHeight: "1.5" }}>
                {i18n?.subtitle || "Build custom headless wishlists, theme drawers, and custom customer portal integrations with complete REST and JavaScript interfaces."}
              </p>
            </div>

            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ background: "#f0f7f5", border: "1px solid #cce8db", borderRadius: "8px", padding: "8px 14px", fontSize: "12px", color: "#006e52" }}>
                <strong>Storefront Base:</strong> <code>/apps/saitriq-wishlist</code>
              </div>
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "8px 14px", fontSize: "12px", color: "#1e293b" }}>
                <strong>Admin Route:</strong> <code>/app/api</code>
              </div>
            </div>
          </div>
        </s-box>
      </s-section>

      {/* ── Main Tabbed Content Section ── */}
      <s-section>
        <s-box border="base" borderRadius="base" padding="base" background="base">
          {/* Top Controls: Tabs & Search Bar */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
            borderBottom: "1px solid #e1e3e5",
            paddingBottom: "16px",
            marginBottom: "20px"
          }}>
            {/* Category Navigation Pills */}
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setActiveTab("proxy")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "9px 16px",
                  borderRadius: "8px",
                  border: activeTab === "proxy" ? "2px solid #008060" : "1px solid #d2d5d8",
                  background: activeTab === "proxy" ? "#f0f7f5" : "#ffffff",
                  color: activeTab === "proxy" ? "#008060" : "#202223",
                  fontWeight: activeTab === "proxy" ? "700" : "500",
                  fontSize: "13px",
                  cursor: "pointer",
                  boxShadow: activeTab === "proxy" ? "0 2px 4px rgba(0, 128, 96, 0.12)" : "none",
                  transition: "all 0.15s ease",
                }}
              >
                <span>🌐</span>
                Storefront App Proxy
                <span style={{ background: activeTab === "proxy" ? "#008060" : "#e4e5e7", color: activeTab === "proxy" ? "#ffffff" : "#4a4c4e", borderRadius: "10px", fontSize: "10px", padding: "1px 6px" }}>5</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("admin")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "9px 16px",
                  borderRadius: "8px",
                  border: activeTab === "admin" ? "2px solid #008060" : "1px solid #d2d5d8",
                  background: activeTab === "admin" ? "#f0f7f5" : "#ffffff",
                  color: activeTab === "admin" ? "#008060" : "#202223",
                  fontWeight: activeTab === "admin" ? "700" : "500",
                  fontSize: "13px",
                  cursor: "pointer",
                  boxShadow: activeTab === "admin" ? "0 2px 4px rgba(0, 128, 96, 0.12)" : "none",
                  transition: "all 0.15s ease",
                }}
              >
                <span>🔒</span>
                Admin Session API
                <span style={{ background: activeTab === "admin" ? "#008060" : "#e4e5e7", color: activeTab === "admin" ? "#ffffff" : "#4a4c4e", borderRadius: "10px", fontSize: "10px", padding: "1px 6px" }}>4</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("sdk")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "9px 16px",
                  borderRadius: "8px",
                  border: activeTab === "sdk" ? "2px solid #008060" : "1px solid #d2d5d8",
                  background: activeTab === "sdk" ? "#f0f7f5" : "#ffffff",
                  color: activeTab === "sdk" ? "#008060" : "#202223",
                  fontWeight: activeTab === "sdk" ? "700" : "500",
                  fontSize: "13px",
                  cursor: "pointer",
                  boxShadow: activeTab === "sdk" ? "0 2px 4px rgba(0, 128, 96, 0.12)" : "none",
                  transition: "all 0.15s ease",
                }}
              >
                <span>📦</span>
                Theme JavaScript SDK
                <span style={{ background: activeTab === "sdk" ? "#008060" : "#e4e5e7", color: activeTab === "sdk" ? "#ffffff" : "#4a4c4e", borderRadius: "10px", fontSize: "10px", padding: "1px 6px" }}>5</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("status")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "9px 16px",
                  borderRadius: "8px",
                  border: activeTab === "status" ? "2px solid #008060" : "1px solid #d2d5d8",
                  background: activeTab === "status" ? "#f0f7f5" : "#ffffff",
                  color: activeTab === "status" ? "#008060" : "#202223",
                  fontWeight: activeTab === "status" ? "700" : "500",
                  fontSize: "13px",
                  cursor: "pointer",
                  boxShadow: activeTab === "status" ? "0 2px 4px rgba(0, 128, 96, 0.12)" : "none",
                  transition: "all 0.15s ease",
                }}
              >
                <span>🚦</span>
                Status Codes & Quotas
              </button>
            </div>

            {/* Quick Filter Search Input */}
            {(activeTab === "proxy" || activeTab === "admin") && (
              <div style={{ position: "relative", minWidth: "220px" }}>
                <input
                  type="text"
                  placeholder="Filter endpoints..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "7px 12px",
                    borderRadius: "6px",
                    border: "1px solid #d2d5d8",
                    fontSize: "13px",
                    outline: "none"
                  }}
                />
              </div>
            )}
          </div>

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* TAB 1: STOREFRONT APP PROXY                                    */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {activeTab === "proxy" && (
            <div>
              <div style={{ background: "#f8faf9", border: "1px solid #e1e3e5", borderRadius: "8px", padding: "14px 18px", marginBottom: "20px" }}>
                <div style={{ fontSize: "13px", color: "#202223", lineHeight: "1.5" }}>
                  <strong>Storefront Authentication:</strong> All storefront requests are signed with Shopify&apos;s HMAC proxy verification.
                  No secret API keys are needed in theme client code. When a customer is logged in, Shopify automatically forwards their customer ID.
                </div>
              </div>

              <div style={{ display: "grid", gap: "18px" }}>
                {filteredProxy.map((ep) => (
                  <div
                    key={ep.id}
                    style={{
                      background: "#ffffff",
                      border: "1px solid #e1e3e5",
                      borderRadius: "10px",
                      padding: "18px",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.03)"
                    }}
                  >
                    {/* Endpoint Header Bar */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                        <span style={{
                          background: ep.method === "GET" ? "#0284c7" : "#059669",
                          color: "#ffffff",
                          fontWeight: "800",
                          fontSize: "11px",
                          padding: "3px 8px",
                          borderRadius: "4px",
                          letterSpacing: "0.5px"
                        }}>
                          {ep.method}
                        </span>
                        <code style={{ fontSize: "14px", fontWeight: "700", color: "#202223" }}>{ep.path}</code>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleCopy(ep.id, ep.path)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          background: copiedKey === ep.id ? "#008060" : "#f1f2f3",
                          color: copiedKey === ep.id ? "#ffffff" : "#202223",
                          border: "none",
                          borderRadius: "4px",
                          padding: "5px 10px",
                          fontSize: "11px",
                          fontWeight: "600",
                          cursor: "pointer",
                          transition: "all 0.15s ease"
                        }}
                      >
                        {copiedKey === ep.id ? "✓ Copied" : "Copy Path"}
                      </button>
                    </div>

                    <p style={{ margin: "0 0 14px 0", fontSize: "13px", color: "#5c5f62" }}>{ep.desc}</p>

                    {/* Parameters Table */}
                    {ep.params && ep.params.length > 0 && (
                      <div style={{ marginBottom: "14px", overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", textAlign: "left" }}>
                          <thead>
                            <tr style={{ background: "#f8faf9", borderBottom: "1px solid #e1e3e5" }}>
                              <th style={{ padding: "6px 10px", color: "#6d7175" }}>Parameter</th>
                              <th style={{ padding: "6px 10px", color: "#6d7175" }}>Type</th>
                              <th style={{ padding: "6px 10px", color: "#6d7175" }}>Required</th>
                              <th style={{ padding: "6px 10px", color: "#6d7175" }}>Description</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ep.params.map((p, idx) => (
                              <tr key={idx} style={{ borderBottom: "1px solid #f1f2f3" }}>
                                <td style={{ padding: "6px 10px", fontFamily: "monospace", color: "#008060", fontWeight: "600" }}>{p.name}</td>
                                <td style={{ padding: "6px 10px", color: "#6d7175" }}>{p.type}</td>
                                <td style={{ padding: "6px 10px", color: p.required === true ? "#dc2626" : "#6d7175", fontWeight: p.required === true ? "700" : "normal" }}>
                                  {String(p.required)}
                                </td>
                                <td style={{ padding: "6px 10px", color: "#202223" }}>{p.desc}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Response JSON */}
                    <div style={{ marginTop: "10px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: "11px", fontWeight: "700", color: "#6d7175", textTransform: "uppercase" }}>Response 200 OK</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(`${ep.id}-res`, ep.response)}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: copiedKey === `${ep.id}-res` ? "#008060" : "#6d7175",
                            fontSize: "11px",
                            cursor: "pointer",
                            fontWeight: "600"
                          }}
                        >
                          {copiedKey === `${ep.id}-res` ? "✓ Copied JSON" : "Copy JSON"}
                        </button>
                      </div>
                      <pre style={codeBoxStyle}>
                        <code>{ep.response}</code>
                      </pre>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* TAB 2: ADMIN SESSION API                                       */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {activeTab === "admin" && (
            <div>
              <div style={{ background: "#f8faf9", border: "1px solid #e1e3e5", borderRadius: "8px", padding: "14px 18px", marginBottom: "20px" }}>
                <div style={{ fontSize: "13px", color: "#202223", lineHeight: "1.5" }}>
                  <strong>Admin Session Security:</strong> <code>/app/api</code> routes require Shopify Admin session authentication (`authenticate.admin`).
                  These endpoints power the embedded app React interface and are not a public bearer-token API.
                </div>
              </div>

              <div style={{ display: "grid", gap: "18px" }}>
                {filteredAdmin.map((ep) => (
                  <div
                    key={ep.id}
                    style={{
                      background: "#ffffff",
                      border: "1px solid #e1e3e5",
                      borderRadius: "10px",
                      padding: "18px",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.03)"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                        <span style={{
                          background: ep.method === "GET" ? "#0284c7" : "#059669",
                          color: "#ffffff",
                          fontWeight: "800",
                          fontSize: "11px",
                          padding: "3px 8px",
                          borderRadius: "4px",
                          letterSpacing: "0.5px"
                        }}>
                          {ep.method}
                        </span>
                        <code style={{ fontSize: "14px", fontWeight: "700", color: "#202223" }}>{ep.path}</code>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleCopy(ep.id, ep.path)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          background: copiedKey === ep.id ? "#008060" : "#f1f2f3",
                          color: copiedKey === ep.id ? "#ffffff" : "#202223",
                          border: "none",
                          borderRadius: "4px",
                          padding: "5px 10px",
                          fontSize: "11px",
                          fontWeight: "600",
                          cursor: "pointer",
                          transition: "all 0.15s ease"
                        }}
                      >
                        {copiedKey === ep.id ? "✓ Copied" : "Copy Path"}
                      </button>
                    </div>

                    <p style={{ margin: "0 0 14px 0", fontSize: "13px", color: "#5c5f62" }}>{ep.desc}</p>

                    {/* Parameters Table */}
                    {ep.params && ep.params.length > 0 && (
                      <div style={{ marginBottom: "14px", overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", textAlign: "left" }}>
                          <thead>
                            <tr style={{ background: "#f8faf9", borderBottom: "1px solid #e1e3e5" }}>
                              <th style={{ padding: "6px 10px", color: "#6d7175" }}>Parameter</th>
                              <th style={{ padding: "6px 10px", color: "#6d7175" }}>Type</th>
                              <th style={{ padding: "6px 10px", color: "#6d7175" }}>Required</th>
                              <th style={{ padding: "6px 10px", color: "#6d7175" }}>Description</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ep.params.map((p, idx) => (
                              <tr key={idx} style={{ borderBottom: "1px solid #f1f2f3" }}>
                                <td style={{ padding: "6px 10px", fontFamily: "monospace", color: "#008060", fontWeight: "600" }}>{p.name}</td>
                                <td style={{ padding: "6px 10px", color: "#6d7175" }}>{p.type}</td>
                                <td style={{ padding: "6px 10px", color: p.required === true ? "#dc2626" : "#6d7175", fontWeight: p.required === true ? "700" : "normal" }}>
                                  {String(p.required)}
                                </td>
                                <td style={{ padding: "6px 10px", color: "#202223" }}>{p.desc}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Response JSON */}
                    <div style={{ marginTop: "10px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: "11px", fontWeight: "700", color: "#6d7175", textTransform: "uppercase" }}>Response 200 OK</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(`${ep.id}-res`, ep.response)}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: copiedKey === `${ep.id}-res` ? "#008060" : "#6d7175",
                            fontSize: "11px",
                            cursor: "pointer",
                            fontWeight: "600"
                          }}
                        >
                          {copiedKey === `${ep.id}-res` ? "✓ Copied JSON" : "Copy JSON"}
                        </button>
                      </div>
                      <pre style={codeBoxStyle}>
                        <code>{ep.response}</code>
                      </pre>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* TAB 3: THEME JAVASCRIPT SDK                                    */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {activeTab === "sdk" && (
            <div>
              <div style={{ marginBottom: "16px" }}>
                <h3 style={{ margin: "0 0 6px 0", fontSize: "16px", color: "#202223" }}>
                  Theme JavaScript Reference Modules
                </h3>
                <p style={{ margin: 0, fontSize: "13px", color: "#5c5f62" }}>
                  Use these ready-to-paste JavaScript snippets in your theme (e.g. <code>assets/theme.js</code>).
                </p>
              </div>

              {/* Module Selector Pills */}
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "18px" }}>
                {Object.entries(sdkModules).map(([key, mod]) => {
                  const isSelected = activeSdkModule === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setActiveSdkModule(key)}
                      style={{
                        padding: "7px 14px",
                        borderRadius: "20px",
                        border: isSelected ? "1.5px solid #008060" : "1px solid #d2d5d8",
                        background: isSelected ? "#008060" : "#ffffff",
                        color: isSelected ? "#ffffff" : "#202223",
                        fontSize: "12px",
                        fontWeight: isSelected ? "700" : "500",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {mod.title}
                    </button>
                  );
                })}
              </div>

              {/* Selected Module Card */}
              {(() => {
                const currentMod = sdkModules[activeSdkModule];
                return (
                  <div style={{ background: "#ffffff", border: "1px solid #e1e3e5", borderRadius: "10px", padding: "18px" }}>
                    <div style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "10px",
                      borderBottom: "1px solid #e1e3e5",
                      paddingBottom: "12px",
                      marginBottom: "12px"
                    }}>
                      <div>
                        <strong style={{ fontSize: "14px", color: "#202223", display: "block" }}>{currentMod.title}</strong>
                        <span style={{ fontSize: "12px", color: "#6d7175" }}>{currentMod.desc}</span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleCopy(`sdk-${activeSdkModule}`, currentMod.code)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          background: copiedKey === `sdk-${activeSdkModule}` ? "#008060" : "#202223",
                          color: "#ffffff",
                          border: "none",
                          borderRadius: "6px",
                          padding: "8px 16px",
                          fontSize: "13px",
                          fontWeight: "600",
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                        }}
                      >
                        {copiedKey === `sdk-${activeSdkModule}` ? "✓ Copied to clipboard!" : "📋 Copy Code"}
                      </button>
                    </div>

                    <pre style={codeBoxStyle}>
                      <code>{currentMod.code}</code>
                    </pre>
                  </div>
                );
              })()}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* TAB 4: HTTP STATUS CODES & QUOTAS                              */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {activeTab === "status" && (
            <div>
              <div style={{ marginBottom: "16px" }}>
                <h3 style={{ margin: "0 0 4px 0", fontSize: "16px", color: "#202223" }}>
                  {i18n?.statusCodesTitle || "HTTP Status Codes & Quota Enforcement"}
                </h3>
                <p style={{ margin: 0, fontSize: "13px", color: "#5c5f62" }}>
                  Detailed specifications of server responses and plan quota protection mechanisms.
                </p>
              </div>

              <div style={{ display: "grid", gap: "14px" }}>
                {statusCodes.map((sc, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: sc.code.startsWith("429") ? "#fffbeb" : "#ffffff",
                      border: sc.code.startsWith("429") ? "1.5px solid #f59e0b" : "1px solid #e1e3e5",
                      borderRadius: "8px",
                      padding: "16px 20px"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                      <span style={{
                        background: sc.badgeColor,
                        color: "#ffffff",
                        fontWeight: "700",
                        fontSize: "12px",
                        padding: "3px 8px",
                        borderRadius: "4px"
                      }}>
                        {sc.code}
                      </span>
                      <strong style={{ fontSize: "14px", color: "#202223" }}>{sc.desc}</strong>
                    </div>

                    <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#5c5f62", lineHeight: "1.5" }}>
                      {sc.details}
                    </p>

                    {sc.example && (
                      <div style={{ marginTop: "12px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: "11px", fontWeight: "700", color: "#b45309", textTransform: "uppercase" }}>
                            HTTP 429 Payload Structure
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopy("429-payload", sc.example)}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: copiedKey === "429-payload" ? "#008060" : "#b45309",
                              fontSize: "11px",
                              cursor: "pointer",
                              fontWeight: "600"
                            }}
                          >
                            {copiedKey === "429-payload" ? "✓ Copied" : "Copy Payload"}
                          </button>
                        </div>
                        <pre style={codeBoxStyle}>
                          <code>{sc.example}</code>
                        </pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </s-box>
      </s-section>
    </s-page>
  );
}
