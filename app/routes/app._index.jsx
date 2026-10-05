import { useEffect, useState } from "react";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { currentUsage } from "../db.wishlist.server";
import { getPlanEntitlement, getMonthlyAddonSaves } from "../billing.server";
import { getPlan } from "../plans";
import { checkEmbedEnabled } from "../embed.server";

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const month = new Date().toISOString().slice(0, 7);

  const [entitlement, used, embed, addonSaves] = await Promise.all([
    getPlanEntitlement(shop, month, admin),
    currentUsage(shop, month),
    checkEmbedEnabled(admin),
    getMonthlyAddonSaves(shop, month),
  ]);

  const planId = entitlement.planId;
  const plan = getPlan(planId);
  const limit = entitlement.planLimit;
  const effLimit = Number.isFinite(limit) ? limit + addonSaves : Infinity;

  return {
    shop,
    embed, // { enabled: bool|null, themeName: string|null, themeId: string|null }
    stats: {
      used,
      limit: effLimit,
      planLimit: limit,
      addonSaves,
      remaining: Number.isFinite(effLimit) ? Math.max(0, effLimit - used) : null,
      planName: plan.name,
      planId,
    },
    blocks: [
      { title: "Product page", description: "Add the Wishlist block to the product template." },
      { title: "Collection page", description: "Add the Wishlist block inside the product-card section." },
      { title: "Wishlist page", description: "Create a page with handle wishlist, then add the Wishlist page block." },
      { title: "Header link", description: "Add a link to /pages/wishlist in your theme header or navigation." },
    ],
  };
};

export const headers = () => ({ "Cache-Control": "no-store, max-age=0" });
export const shouldRevalidate = () => true;

const FAQ_ITEMS = [
  {
    q: "Will this app slow down my site or break my theme?",
    a: "No. Saitriq Wishlist loads asynchronously — the heart buttons and wishlist page render after your theme and product images. The app uses localStorage for instant UI updates with no blocking network calls on page load. It has been tested with Dawn, Sense, Debut, Brooklyn, Craft, and other popular themes.",
  },
  {
    q: "How easy is it to install and customize the button to match my brand?",
    a: "For OS 2.0 themes (Dawn, Sense, Craft, etc.) installation takes under 2 minutes — open Theme Editor, add the Saitriq Wishlist app block, save. No code required. You can customize the button style (icon only, icon + text, or your own SVG), the remove button label, grid columns, and inject custom CSS — all from the Page design settings page.",
  },
  {
    q: "Is a credit card required for the trial, and will I be charged automatically?",
    a: "No credit card is required to start the 7-day free trial on paid plans. Shopify handles all billing. You will only be charged if you keep the plan active after the trial ends. You can downgrade to Free at any time from the Pricing page and you will not be charged.",
  },
  {
    q: "Will you help my developer with custom code, APIs, or conflicts?",
    a: "Yes. Saitriq Wishlist ships with a full Developer API accessible from the storefront at /apps/saitriq-wishlist. The Developer API page in this app documents every endpoint with copy-paste JavaScript examples. For custom integrations, conflicts, or theme-specific issues on paid plans, contact us and we will respond within 24 hours.",
  },
  {
    q: "Does Saitriq Wishlist integrate with marketing apps like Klaviyo or Mailchimp?",
    a: "Wishlist data is accessible via the API at /apps/saitriq-wishlist?api=items. Any marketing tool that can read a JSON endpoint can pull your customers' saved products. Server-to-server access is available via the Admin API at /app/api — see the Developer API page for full documentation.",
  },
  {
    q: "How do I know the app is actually driving sales?",
    a: "The Wishlist activity page shows daily saves and removals for the current month. You can track which products are being saved most by querying /app/api?resource=all to export all wishlist data. Shoppers who save products return to buy at higher rates — the wishlist page keeps those products one tap away.",
  },
  {
    q: "What happens to wishlist data if a shopper is not logged in?",
    a: "Guest saves are stored in the browser's localStorage immediately so the shopper sees instant feedback. When they log in, any locally saved items are automatically merged into their account on the server. Guest saves are also counted in your monthly analytics so usage is always accurate.",
  },
  {
    q: "Can shoppers share their wishlist with others?",
    a: "Yes. The wishlist page includes a Share button. On mobile it opens the native share sheet (WhatsApp, Messages, etc.). On desktop it copies a shareable link to the clipboard. The shared link shows the wishlist in read-only mode — the recipient can click any product to buy it.",
  },
];

export default function WishlistDashboard() {
  const { shop, blocks, stats, embed } = useLoaderData();
  const [liveStats, setLiveStats] = useState(stats);
  const [openFaq, setOpenFaq] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const res = await fetch(`/app/usage?ts=${Date.now()}`, {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!res.ok) return;
        const next = await res.json();
        if (!cancelled && Number.isFinite(next.used)) setLiveStats(next);
      } catch {}
    };
    refresh();
    const timer = window.setInterval(refresh, 5000);
    window.addEventListener("focus", refresh);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const usedPct = liveStats.limit && Number.isFinite(liveStats.limit)
    ? Math.min(100, Math.round((liveStats.used / liveStats.limit) * 100))
    : 0;

  return (
    <s-page heading="Saitriq Wishlist">

      {/* ── Hero callout ── */}
      <s-section>
        <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
          <s-grid gap="small-300">
            <s-heading>Turn wishlisted products into repeat sales</s-heading>
            <s-paragraph>
              Let shoppers save products, share their wishlist, and come back to buy.
              Works on any Shopify theme — no coding needed.
            </s-paragraph>
            <s-stack direction="inline" gap="small-200">
              <s-button href="/app/how-to-use" variant="primary">Get started</s-button>
              <s-button href="/app/pricing" variant="secondary">View plans</s-button>
            </s-stack>
          </s-grid>
          {liveStats.planId === "free" && (
            <s-box border="base" borderRadius="base" padding="base">
              <s-grid gap="small-200">
                <s-badge tone="info">Free trial</s-badge>
                <s-paragraph>Try Growth or Unlimited free for 7 days. No card required.</s-paragraph>
                <s-button href="/app/pricing" variant="primary">Start free trial</s-button>
              </s-grid>
            </s-box>
          )}
        </s-grid>
      </s-section>

      {/* ── Usage metrics ── */}
      <s-section heading="This month">
        <s-grid
          gridTemplateColumns="@container (inline-size <= 400px) 1fr, 1fr auto 1fr auto 1fr"
          gap="small"
        >
          <s-box padding="base">
            <s-grid gap="small-300">
              <s-text color="subdued">Saves used</s-text>
              <s-stack direction="inline" gap="small-200" alignItems="center">
                <s-heading>{liveStats.used}</s-heading>
                {liveStats.limit && Number.isFinite(liveStats.limit) && (
                  <s-badge tone={usedPct >= 90 ? "critical" : usedPct >= 70 ? "warning" : "success"}>
                    {usedPct}%
                  </s-badge>
                )}
              </s-stack>
            </s-grid>
          </s-box>
          <s-divider direction="block" />
          <s-box padding="base">
            <s-grid gap="small-300">
              <s-text color="subdued">Saves remaining</s-text>
              <s-heading>{liveStats.remaining === null ? "Unlimited" : liveStats.remaining}</s-heading>
            </s-grid>
          </s-box>
          <s-divider direction="block" />
          <s-box padding="base">
            <s-grid gap="small-300">
              <s-text color="subdued">Active plan</s-text>
              <s-stack direction="inline" gap="small-200" alignItems="center">
                <s-heading>{liveStats.planName ?? "Free"}</s-heading>
                {liveStats.planId !== "free" && <s-badge tone="success">Paid</s-badge>}
                {liveStats.addonSaves > 0 && (
                  <s-badge tone="info">+{liveStats.addonSaves?.toLocaleString()} addon</s-badge>
                )}
              </s-stack>
            </s-grid>
          </s-box>
        </s-grid>

        {liveStats.planId === "free" && liveStats.remaining !== null && liveStats.remaining < 20 && liveStats.remaining > 0 && (
          <s-banner tone="warning" heading="Running low">
            Only {liveStats.remaining} saves left this month.{" "}
            <s-link href="/app/pricing">Upgrade to avoid hitting the limit.</s-link>
          </s-banner>
        )}
        {liveStats.planId !== "free" && Number.isFinite(liveStats.limit) && liveStats.remaining !== null && liveStats.remaining < 500 && liveStats.remaining > 0 && (
          <s-banner tone="warning" heading="Approaching monthly limit">
            {liveStats.remaining} saves remaining this month on the {liveStats.planName} plan.
            When the limit is reached new wishlist adds will be declined until next month.{" "}
            <s-link href="/app/pricing">Upgrade to Unlimited</s-link> to remove the cap.
          </s-banner>
        )}
        {Number.isFinite(liveStats.limit) && liveStats.remaining === 0 && (
          <s-banner tone="critical" heading="Monthly limit reached">
            Shoppers can&apos;t add new wishlist items until next month.{" "}
            <s-link href="/app/pricing">Upgrade your plan</s-link> to restore capacity immediately.
          </s-banner>
        )}
      </s-section>

      {/* ── App embed status ── */}
      <s-section heading="App embed status">
        {embed.enabled === false && (
          <s-banner tone="critical" heading="App embed is not enabled">
            The wishlist button and CSS will not appear on your storefront until you enable
            the app embed in Theme Editor.{" "}
            <s-link href={`https://${shop}/admin/themes/current/editor?context=apps`} target="_blank">
              Enable it now
            </s-link>
          </s-banner>
        )}
        {embed.enabled === true && (
          <s-banner tone="success" heading="App embed is enabled">
            The Saitriq Wishlist embed is active on{" "}
            <strong>{embed.themeName ?? "your theme"}</strong>.
            Shoppers can see the wishlist buttons on your storefront.
          </s-banner>
        )}
        {embed.enabled === null && (
          <s-banner tone="warning" heading="App embed status could not be verified">
            We could not read your theme settings. If you have already enabled the app embed
            in Theme Editor, your storefront should be working.{" "}
            <s-link href="javascript:window.location.reload()">Refresh to check again</s-link>
          </s-banner>
        )}

        <s-grid gridTemplateColumns="repeat(auto-fit, minmax(260px, 1fr))" gap="base">
          {/* Embed toggle card */}
          <s-box border="base" borderRadius="base" padding="base">
            <s-grid gap="small-300">
              <s-stack direction="inline" gap="small-200" alignItems="center">
                <s-heading>App embed</s-heading>
                {embed.enabled === true && <s-badge tone="success">Enabled</s-badge>}
                {embed.enabled === false && <s-badge tone="critical">Not enabled</s-badge>}
                {embed.enabled === null && <s-badge tone="attention">Check Theme Editor</s-badge>}
              </s-stack>
              <s-paragraph>
                The app embed loads the wishlist CSS globally and activates the heart button
                on every page. Enable it once under <strong>App embeds</strong> in Theme Editor
                — it applies to your whole theme.
              </s-paragraph>
              <s-button
                href={`https://${shop}/admin/themes/current/editor?context=apps`}
                target="_blank"
                variant={embed.enabled === true ? "secondary" : "primary"}
              >
                {embed.enabled === true ? "Manage in Theme Editor" : "Open App Embeds"}
              </s-button>
            </s-grid>
          </s-box>

          {/* Blocks card */}
          <s-box border="base" borderRadius="base" padding="base">
            <s-grid gap="small-300">
              <s-heading>Wishlist blocks</s-heading>
              <s-paragraph>
                After enabling the embed, add the individual blocks to your templates:
                Wishlist button on the product page, Collection icons on the collection page,
                and Wishlist page on your dedicated wishlist page.
              </s-paragraph>
              <s-button
                href={`https://${shop}/admin/themes/current/editor`}
                target="_blank"
                variant="secondary"
              >
                Open Theme Editor
              </s-button>
            </s-grid>
          </s-box>
        </s-grid>
      </s-section>

      {/* ── Setup checklist ── */}
      <s-section heading="Setup checklist">
        <s-grid gridTemplateColumns="repeat(auto-fit, minmax(200px, 1fr))" gap="base">
          {blocks.map((block, i) => (
            <s-box key={block.title} border="base" borderRadius="base" padding="base">
              <s-grid gap="small-200">
                <s-stack direction="inline" gap="small-200" alignItems="center">
                  <s-badge tone="info">{i + 1}</s-badge>
                  <s-heading>{block.title}</s-heading>
                </s-stack>
                <s-paragraph>{block.description}</s-paragraph>
              </s-grid>
            </s-box>
          ))}
        </s-grid>
        <s-box padding="base">
          <s-stack direction="inline" gap="base">
            <s-button href="/app/how-to-use" variant="secondary">Full setup guide</s-button>
            <s-button href="/app/api-docs" variant="tertiary" tone="neutral">Developer API</s-button>
          </s-stack>
        </s-box>
      </s-section>

      {/* ── FAQ ── */}
      <s-section heading="Have questions?">
        <s-grid gap="small-200">
          {FAQ_ITEMS.map((item, i) => (
            <s-box
              key={i}
              border="base"
              borderRadius="base"
              background={openFaq === i ? "base" : "subdued"}
            >
              <s-box padding="base">
                <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
                  <s-text>{item.q}</s-text>
                  <s-button
                    variant="tertiary"
                    tone="neutral"
                    icon={openFaq === i ? "chevron-up" : "chevron-down"}
                    accessibilityLabel={openFaq === i ? "Collapse answer" : "Expand answer"}
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  />
                </s-grid>
              </s-box>
              {openFaq === i && (
                <s-box padding="base">
                  <s-paragraph>{item.a}</s-paragraph>
                </s-box>
              )}
            </s-box>
          ))}
        </s-grid>
      </s-section>

      {/* ── Help footer ── */}
      <s-section>
        <s-grid gridTemplateColumns="repeat(auto-fit, minmax(240px, 1fr))" gap="base">
          <s-box border="base" borderRadius="base" padding="base">
            <s-grid gap="small-300">
              <s-heading>Setup guide</s-heading>
              <s-paragraph>
                Step-by-step instructions for app blocks, manual snippet install, and the
                developer API with copy-paste code examples.
              </s-paragraph>
              <s-button href="/app/how-to-use" variant="secondary">View setup guide</s-button>
            </s-grid>
          </s-box>
          <s-box border="base" borderRadius="base" padding="base">
            <s-grid gap="small-300">
              <s-heading>Need help?</s-heading>
              <s-paragraph>
                Having trouble with installation, custom themes, or the API?
                We respond to all support requests within 24 hours.
              </s-paragraph>
              <s-button
                href="mailto:support@saitriq.com"
                variant="secondary"
              >
                Contact support
              </s-button>
            </s-grid>
          </s-box>
        </s-grid>
      </s-section>

    </s-page>
  );
}
