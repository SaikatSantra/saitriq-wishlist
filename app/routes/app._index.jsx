import { useEffect, useState } from "react";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { currentUsage } from "../db.wishlist.server";
import { getPlanEntitlement, getMonthlyAddonSaves } from "../billing.server";
import { getPlan } from "../plans";
import { checkEmbedEnabled } from "../embed.server";
import { detectLocale, createTranslator } from "../i18n.server";

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const month = new Date().toISOString().slice(0, 7);
  const locale = detectLocale({ request, session });
  const t = createTranslator(locale);

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
    locale,
    embed,
    stats: {
      used,
      limit: effLimit,
      planLimit: limit,
      addonSaves,
      remaining: Number.isFinite(effLimit) ? Math.max(0, effLimit - used) : null,
      planName: t(`pricing.plans.${planId}.name`) || plan.name,
      planId,
    },
    blocks: [
      { title: t("dashboard.step1Title"), description: t("dashboard.step1Desc") },
      { title: t("dashboard.step2Title"), description: t("dashboard.step2Desc") },
      { title: t("dashboard.step3Title"), description: t("dashboard.step3Desc") },
      { title: t("dashboard.step4Title"), description: t("dashboard.step4Desc") },
    ],
    faqs: t("dashboard.faqs") || [],
    i18n: {
      title: t("dashboard.title"),
      subtitle: t("dashboard.subtitle"),
      monthlySaves: t("dashboard.monthlySaves"),
      remaining: t("dashboard.remaining"),
      unlimited: t("dashboard.unlimited"),
      activePlan: t("dashboard.activePlan"),
      embedStatus: t("dashboard.embedStatus"),
      embedActive: t("dashboard.embedActive"),
      embedInactive: t("dashboard.embedInactive"),
      openThemeEditor: t("dashboard.openThemeEditor"),
      checklistTitle: t("dashboard.checklistTitle"),
      checklistSubtitle: t("dashboard.checklistSubtitle"),
      faqTitle: t("dashboard.faqTitle"),
    },
  };
};

export const headers = () => ({ "Cache-Control": "no-store, max-age=0" });
export const shouldRevalidate = () => true;

export default function WishlistDashboard() {
  const { shop, blocks, stats, embed, faqs, i18n } = useLoaderData();
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
    <s-page heading={i18n.title}>
      {/* ── Hero callout ── */}
      <s-section>
        <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
          <s-grid gap="small-300">
            <s-heading>{i18n.title}</s-heading>
            <s-paragraph>{i18n.subtitle}</s-paragraph>
            <s-stack direction="inline" gap="small-200">
              <s-button href="/app/how-to-use" variant="primary">Get started</s-button>
              <s-button href="/app/pricing" variant="secondary">View plans</s-button>
            </s-stack>
          </s-grid>
          {liveStats.planId === "free" && (
            <s-box border="base" borderRadius="base" padding="base">
              <s-grid gap="small-200">
                <s-badge tone="info">Free trial</s-badge>
                <s-paragraph>Try Starter or Growth free for 5-7 days. No card required.</s-paragraph>
                <s-button href="/app/pricing" variant="primary">View plans</s-button>
              </s-grid>
            </s-box>
          )}
        </s-grid>
      </s-section>

      {/* ── Usage metrics ── */}
      <s-section heading={i18n.monthlySaves}>
        <s-grid
          gridTemplateColumns="@container (inline-size <= 400px) 1fr, 1fr auto 1fr auto 1fr"
          gap="small"
        >
          <s-box padding="base">
            <s-grid gap="small-300">
              <s-text color="subdued">{i18n.monthlySaves}</s-text>
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
              <s-text color="subdued">{i18n.remaining}</s-text>
              <s-heading>{liveStats.remaining === null ? i18n.unlimited : liveStats.remaining}</s-heading>
            </s-grid>
          </s-box>
          <s-divider direction="block" />
          <s-box padding="base">
            <s-grid gap="small-300">
              <s-text color="subdued">{i18n.activePlan}</s-text>
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

        {Number.isFinite(liveStats.limit) && liveStats.remaining === 0 && (
          <s-banner tone="critical" heading="Monthly limit reached">
            Shoppers cannot add new wishlist items until next month.{" "}
            <s-link href="/app/pricing">Upgrade your plan</s-link> to restore capacity immediately.
          </s-banner>
        )}
      </s-section>

      {/* ── App embed status ── */}
      <s-section heading={i18n.embedStatus}>
        {embed.enabled === false && (
          <s-banner tone="critical" heading={i18n.embedInactive}>
            The wishlist button and CSS will not appear on your storefront until you enable
            the app embed in Theme Editor.{" "}
            <s-link href={`https://${shop}/admin/themes/current/editor?context=apps`} target="_blank">
              Enable it now
            </s-link>
          </s-banner>
        )}
        {embed.enabled === true && (
          <s-banner tone="success" heading={i18n.embedActive}>
            The Saitriq Wishlist embed is active on{" "}
            <strong>{embed.themeName ?? "your theme"}</strong>.
          </s-banner>
        )}

        <s-grid gridTemplateColumns="repeat(auto-fit, minmax(260px, 1fr))" gap="base">
          <s-box border="base" borderRadius="base" padding="base">
            <s-grid gap="small-300">
              <s-stack direction="inline" gap="small-200" alignItems="center">
                <s-heading>{i18n.embedStatus}</s-heading>
                {embed.enabled === true && <s-badge tone="success">Enabled</s-badge>}
                {embed.enabled === false && <s-badge tone="critical">Not enabled</s-badge>}
                {embed.enabled === null && <s-badge tone="attention">Check Theme Editor</s-badge>}
              </s-stack>
              <s-paragraph>
                Enable the Saitriq Wishlist app embed in Theme Editor to activate wishlist buttons across your store.
              </s-paragraph>
              <s-button
                href={`https://${shop}/admin/themes/current/editor?context=apps`}
                target="_blank"
                variant={embed.enabled === true ? "secondary" : "primary"}
              >
                {i18n.openThemeEditor}
              </s-button>
            </s-grid>
          </s-box>
        </s-grid>
      </s-section>

      {/* ── Setup checklist ── */}
      <s-section heading={i18n.checklistTitle}>
        <s-paragraph>{i18n.checklistSubtitle}</s-paragraph>
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
      </s-section>

      {/* ── FAQ ── */}
      {faqs.length > 0 && (
        <s-section heading={i18n.faqTitle}>
          <s-grid gap="small-200">
            {faqs.map((item, i) => (
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
                      accessibilityLabel={openFaq === i ? "Collapse" : "Expand"}
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
      )}
    </s-page>
  );
}
