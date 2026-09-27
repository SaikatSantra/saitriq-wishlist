import { useEffect, useState } from "react";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { currentUsage } from "../db.wishlist.server";
import { getActivePlan, syncSubscriptionFromShopify } from "../billing.server";
import { monthlyLimit, getPlan } from "../plans";

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const month = new Date().toISOString().slice(0, 7);

  const planId = await syncSubscriptionFromShopify(admin, shop).catch(
    () => getActivePlan(shop),
  );
  const plan = getPlan(planId);
  const used = await currentUsage(shop, month);
  const limit = monthlyLimit(planId);

  return {
    stats: {
      used,
      limit,
      remaining: Number.isFinite(limit) ? Math.max(0, limit - used) : null,
      planName: plan.name,
      planId,
    },
    extensionName: "wishlist-product",
    blocks: [
      { title: "Product page", description: "Add the Wishlist block to the product template." },
      { title: "Collection page", description: "Add the Wishlist block inside the product-card section." },
      { title: "Wishlist page", description: "Create a page with handle wishlist, then add the Wishlist page block." },
      { title: "Header icon", description: "Add a link to /pages/wishlist in your theme header." },
    ],
  };
};

export const headers = () => ({ "Cache-Control": "no-store, max-age=0" });
export const shouldRevalidate = () => true;

export default function WishlistDashboard() {
  const { extensionName, blocks, stats } = useLoaderData();
  const [liveStats, setLiveStats] = useState(stats);

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
              <s-heading>
                {liveStats.remaining === null ? "Unlimited" : liveStats.remaining}
              </s-heading>
            </s-grid>
          </s-box>

          <s-divider direction="block" />

          <s-box padding="base">
            <s-grid gap="small-300">
              <s-text color="subdued">Active plan</s-text>
              <s-stack direction="inline" gap="small-200" alignItems="center">
                <s-heading>{liveStats.planName ?? "Free"}</s-heading>
                {liveStats.planId !== "free" && (
                  <s-badge tone="success">Paid</s-badge>
                )}
              </s-stack>
            </s-grid>
          </s-box>
        </s-grid>

        {liveStats.planId === "free" && (
          <s-banner tone="info" heading="On the Free plan">
            You have {liveStats.remaining} saves left this month.{" "}
            <s-link href="/app/pricing">Upgrade for more capacity.</s-link>
          </s-banner>
        )}

        {Number.isFinite(liveStats.limit) && liveStats.remaining === 0 && (
          <s-banner tone="critical" heading="Monthly limit reached">
            Shoppers can&apos;t add new wishlist items until next month.{" "}
            <s-link href="/app/pricing">Upgrade your plan</s-link> to restore capacity immediately.
          </s-banner>
        )}
      </s-section>

      {/* ── Theme extension info ── */}
      <s-section heading="Theme extension">
        <s-paragraph>
          The wishlist UI is delivered through the <strong>{extensionName}</strong> theme app
          extension. Open Online Store → Themes → Customize, pick the template, and add a
          Saitriq Wishlist block.
        </s-paragraph>
      </s-section>

      {/* ── Setup checklist ── */}
      <s-section heading="Setup checklist">
        <s-grid gridTemplateColumns="repeat(auto-fit, minmax(200px, 1fr))" gap="base">
          {blocks.map((block) => (
            <s-box key={block.title} border="base" borderRadius="base" padding="base">
              <s-grid gap="small-200">
                <s-heading>{block.title}</s-heading>
                <s-paragraph>{block.description}</s-paragraph>
              </s-grid>
            </s-box>
          ))}
        </s-grid>
      </s-section>

      {/* ── Quick links ── */}
      <s-section heading="Quick links">
        <s-stack direction="inline" gap="base">
          <s-button href="/app/settings" variant="secondary">Page design settings</s-button>
          <s-button href="/app/wishlist" variant="secondary">View activity</s-button>
          <s-button href="/app/pricing" variant="secondary">Manage plan</s-button>
          <s-button href="/app/how-to-use" variant="tertiary" tone="neutral">Setup guide</s-button>
        </s-stack>
      </s-section>

    </s-page>
  );
}
