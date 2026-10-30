import { useEffect, useState } from "react";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { currentUsage, getAnalyticsHistory } from "../db.wishlist.server";
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

  const [entitlementRes, usedRes, embedRes, addonSavesRes, historyRes] = await Promise.allSettled([
    getPlanEntitlement(shop, month, admin),
    currentUsage(shop, month),
    checkEmbedEnabled(admin),
    getMonthlyAddonSaves(shop, month),
    getAnalyticsHistory(shop, month),
  ]);

  const entitlement = entitlementRes.status === "fulfilled" && entitlementRes.value
    ? entitlementRes.value
    : { planId: "free", planLimit: 100 };
  const used = usedRes.status === "fulfilled" && Number.isFinite(usedRes.value) ? usedRes.value : 0;
  const embed = embedRes.status === "fulfilled" && embedRes.value
    ? embedRes.value
    : { enabled: null, themeName: null, themeId: null };
  const addonSaves = addonSavesRes.status === "fulfilled" && Number.isFinite(addonSavesRes.value) ? addonSavesRes.value : 0;
  const history = historyRes.status === "fulfilled" && Array.isArray(historyRes.value) ? historyRes.value : [];

  const planId = entitlement?.planId || "free";
  const plan = getPlan(planId) || getPlan("free");
  const limit = entitlement?.planLimit ?? 100;
  const effLimit = Number.isFinite(limit) ? limit + addonSaves : Infinity;

  return {
    shop,
    locale,
    embed,
    history: history.slice(-14),
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
  const { shop, blocks, stats, embed, history, faqs, i18n } = useLoaderData();
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

  // Radial Gauge Calculations
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (usedPct / 100) * circumference;
  const gaugeColor = usedPct >= 90 ? "#d72c0d" : usedPct >= 75 ? "#b98900" : "#008060";

  // Sparkline calculation
  const sparkPoints = history.length > 1
    ? history.map((e, idx) => {
        const max = Math.max(1, ...history.map((h) => h.adds));
        const x = (idx / (history.length - 1)) * 140;
        const y = 35 - (e.adds / max) * 30;
        return `${x},${y}`;
      }).join(" ")
    : "0,25 70,25 140,25";

  return (
    <s-page heading={i18n.title}>
      {/* ── Hero Callout & Quick Launch ── */}
      <s-section>
        <s-box border="base" borderRadius="base" padding="large" background="base">
          <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
            <s-grid gap="small-300">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "20px" }}>✨</span>
                <s-heading>{i18n.title}</s-heading>
              </div>
              <s-paragraph>{i18n.subtitle}</s-paragraph>
              <s-stack direction="inline" gap="small-200">
                <s-button href="/app/how-to-use" variant="primary">Setup Guide</s-button>
                <s-button href="/app/wishlist" variant="secondary">View Analytics</s-button>
                <s-button href="/app/pricing" variant="tertiary">Upgrade Plan</s-button>
              </s-stack>
            </s-grid>
            {liveStats.planId === "free" && (
              <div style={{ background: "#f6fef9", border: "1px solid #cce8db", borderRadius: "10px", padding: "16px 20px", textAlign: "center" }}>
                <s-badge tone="success">Starter Plan Available</s-badge>
                <div style={{ margin: "8px 0 12px 0", fontSize: "13px", color: "#202223" }}>
                  5,000 saves/month for only $5.
                </div>
                <s-button href="/app/pricing" variant="primary">View Starter</s-button>
              </div>
            )}
          </s-grid>
        </s-box>
      </s-section>

      {/* ── Visual Quota Gauge & Key Metrics ── */}
      <s-section heading="Capacity & Activity">
        <s-grid gridTemplateColumns="repeat(auto-fit, minmax(260px, 1fr))" gap="base">
          {/* Radial Gauge Card */}
          <s-box border="base" borderRadius="base" padding="large" background="base">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <s-text color="subdued">Monthly Capacity</s-text>
                <div style={{ fontSize: "24px", fontWeight: "700", marginTop: "4px" }}>
                  {liveStats.used} <span style={{ fontSize: "14px", fontWeight: "normal", color: "#6d7175" }}>/ {Number.isFinite(liveStats.limit) ? liveStats.limit.toLocaleString() : "∞"}</span>
                </div>
                <div style={{ marginTop: "6px" }}>
                  <s-badge tone={usedPct >= 90 ? "critical" : usedPct >= 75 ? "warning" : "success"}>
                    {usedPct}% Consumed
                  </s-badge>
                </div>
              </div>

              {/* Circular Gauge SVG */}
              <div style={{ position: "relative", width: "96px", height: "96px" }}>
                <svg width="96" height="96" viewBox="0 0 96 96">
                  <circle
                    cx="48"
                    cy="48"
                    r={radius}
                    fill="none"
                    stroke="#e1e3e5"
                    strokeWidth="8"
                  />
                  <circle
                    cx="48"
                    cy="48"
                    r={radius}
                    fill="none"
                    stroke={gaugeColor}
                    strokeWidth="8"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    transform="rotate(-90 48 48)"
                    style={{ transition: "stroke-dashoffset 0.8s ease" }}
                  />
                </svg>
                <div style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "15px",
                  fontWeight: "700",
                  color: gaugeColor
                }}>
                  {usedPct}%
                </div>
              </div>
            </div>
          </s-box>

          {/* Activity Trend Sparkline Card */}
          <s-box border="base" borderRadius="base" padding="large" background="base">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <s-text color="subdued">14-Day Save Trend</s-text>
                <div style={{ fontSize: "24px", fontWeight: "700", marginTop: "4px" }}>
                  {history.reduce((acc, curr) => acc + curr.adds, 0)} <span style={{ fontSize: "14px", fontWeight: "normal", color: "#6d7175" }}>saves</span>
                </div>
              </div>
              <s-badge tone="info">Real-time</s-badge>
            </div>

            {/* Sparkline Curve */}
            <div style={{ marginTop: "12px", width: "100%" }}>
              <svg viewBox="0 0 140 40" style={{ width: "100%", height: "45px", overflow: "visible" }}>
                <polyline
                  fill="none"
                  stroke="#008060"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={sparkPoints}
                />
              </svg>
            </div>
          </s-box>

          {/* Active Plan Card */}
          <s-box border="base" borderRadius="base" padding="large" background="base">
            <s-grid gap="small-200">
              <s-text color="subdued">{i18n.activePlan}</s-text>
              <s-stack direction="inline" gap="small-200" alignItems="center">
                <s-heading>{liveStats.planName ?? "Free"}</s-heading>
                <s-badge tone={liveStats.planId === "free" ? "neutral" : "success"}>
                  {liveStats.planId === "free" ? "Free" : "Active Paid"}
                </s-badge>
              </s-stack>
              <s-text tone="subdued">
                {liveStats.remaining === null
                  ? i18n.unlimited
                  : `${liveStats.remaining.toLocaleString()} saves remaining`}
              </s-text>
              <div style={{ marginTop: "6px" }}>
                <s-button href="/app/pricing" variant="secondary">Manage Subscription</s-button>
              </div>
            </s-grid>
          </s-box>
        </s-grid>

        {Number.isFinite(liveStats.limit) && liveStats.remaining === 0 && (
          <div style={{ marginTop: "16px" }}>
            <s-banner tone="critical" heading="Monthly limit reached">
              Shoppers cannot add new wishlist items until next month.{" "}
              <s-link href="/app/pricing">Upgrade your plan</s-link> to restore capacity immediately.
            </s-banner>
          </div>
        )}
      </s-section>

      {/* ── App Embed Status ── */}
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

        <s-box border="base" borderRadius="base" padding="large" background="base">
          <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
            <s-grid gap="small-200">
              <s-heading>Theme App Embed</s-heading>
              <s-paragraph>
                The app embed loads your wishlist buttons and styles globally on all templates with zero theme code edits.
              </s-paragraph>
            </s-grid>
            <s-button
              href={`https://${shop}/admin/themes/current/editor?context=apps`}
              target="_blank"
              variant={embed.enabled === true ? "secondary" : "primary"}
            >
              {i18n.openThemeEditor}
            </s-button>
          </s-grid>
        </s-box>
      </s-section>

      {/* ── Setup Checklist ── */}
      <s-section heading={i18n.checklistTitle}>
        <s-paragraph>{i18n.checklistSubtitle}</s-paragraph>
        <s-grid gridTemplateColumns="repeat(auto-fit, minmax(220px, 1fr))" gap="base">
          {blocks.map((block, i) => (
            <s-box key={block.title} border="base" borderRadius="base" padding="base" background="base">
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

      {/* ── FAQ Accordion ── */}
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
