import { useEffect, useState } from "react";
import { useLoaderData, useRevalidator } from "react-router";
import { authenticate } from "../shopify.server";
import { getAnalyticsHistory, getAnalytics } from "../db.wishlist.server";
import { detectLocale, createTranslator } from "../i18n.server";

const monthKey = () => new Date().toISOString().slice(0, 7);

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const month = monthKey();
  const locale = detectLocale({ request, session });
  const t = createTranslator(locale);

  const [historyRes, totalsRes] = await Promise.allSettled([
    getAnalyticsHistory(session.shop, month),
    getAnalytics(session.shop, month),
  ]);

  const history = historyRes.status === "fulfilled" && Array.isArray(historyRes.value) ? historyRes.value : [];
  const totals = totalsRes.status === "fulfilled" && totalsRes.value ? totalsRes.value : { adds: 0, removes: 0 };

  const maxAdds = Math.max(1, ...history.map((e) => e.adds));
  const totalAdds = totals?.adds || 0;
  const totalRemoves = totals?.removes || 0;
  const netSaves = Math.max(0, totalAdds - totalRemoves);
  const retentionRate = totalAdds > 0 ? Math.round((netSaves / totalAdds) * 100) : 100;

  return {
    month,
    history,
    maxAdds,
    totalAdds,
    totalRemoves,
    netSaves,
    retentionRate,
    locale,
    translations: {
      title: t("activity.title"),
      subtitle: t("activity.subtitle"),
      dailySavesHeading: t("activity.dailySavesHeading", { month }),
      noActivityHeading: t("activity.noActivityHeading"),
      noActivityMessage: t("activity.noActivityMessage"),
      liveUpdating: t("activity.liveUpdating"),
      savesLabel: t("activity.savesBadge", { count: "{count}" }),
      removalsLabel: t("activity.removalsBadge", { count: "{count}" }),
    },
  };
};

export default function WishlistOverview() {
  const {
    month,
    history,
    maxAdds,
    totalAdds,
    totalRemoves,
    netSaves,
    retentionRate,
    translations,
  } = useLoaderData();
  const revalidator = useRevalidator();
  const [hoveredEntry, setHoveredEntry] = useState(null);

  useEffect(() => {
    const timer = window.setInterval(() => revalidator.revalidate(), 10000);
    return () => window.clearInterval(timer);
  }, [revalidator]);

  const renderSaves = (count) => translations.savesLabel.replace("{count}", String(count));
  const renderRemovals = (count) => translations.removalsLabel.replace("{count}", String(count));

  // Chart layout dimensions
  const chartWidth = 720;
  const chartHeight = 220;
  const paddingX = 40;
  const paddingY = 30;
  const plotWidth = chartWidth - paddingX * 2;
  const plotHeight = chartHeight - paddingY * 2;

  const yMax = Math.max(5, Math.ceil(maxAdds * 1.25));
  const displayHistory = history.length > 0 ? history : [{ day: `${month}-01`, adds: 0, removes: 0 }];
  const barSlotWidth = plotWidth / Math.max(displayHistory.length, 1);
  const barWidth = Math.min(22, Math.max(8, barSlotWidth * 0.45));

  return (
    <s-page heading={translations.title}>
      {/* ── Top Metric KPI Cards ── */}
      <s-section>
        <s-grid gridTemplateColumns="repeat(auto-fit, minmax(200px, 1fr))" gap="base">
          <s-box border="base" borderRadius="base" padding="base" background="base">
            <s-grid gap="small-200">
              <s-text color="subdued">Total Saves this Month</s-text>
              <s-stack direction="inline" gap="small" alignItems="baseline">
                <s-heading>{totalAdds.toLocaleString()}</s-heading>
                <s-badge tone="success">+{totalAdds}</s-badge>
              </s-stack>
            </s-grid>
          </s-box>

          <s-box border="base" borderRadius="base" padding="base" background="base">
            <s-grid gap="small-200">
              <s-text color="subdued">Total Removals</s-text>
              <s-stack direction="inline" gap="small" alignItems="baseline">
                <s-heading>{totalRemoves.toLocaleString()}</s-heading>
                {totalRemoves > 0 && <s-badge tone="neutral">-{totalRemoves}</s-badge>}
              </s-stack>
            </s-grid>
          </s-box>

          <s-box border="base" borderRadius="base" padding="base" background="base">
            <s-grid gap="small-200">
              <s-text color="subdued">Net Wishlisted Products</s-text>
              <s-stack direction="inline" gap="small" alignItems="baseline">
                <s-heading>{netSaves.toLocaleString()}</s-heading>
                <s-badge tone="info">{retentionRate}% retained</s-badge>
              </s-stack>
            </s-grid>
          </s-box>

          <s-box border="base" borderRadius="base" padding="base" background="base">
            <s-grid gap="small-200">
              <s-text color="subdued">Peak Daily Saves</s-text>
              <s-stack direction="inline" gap="small" alignItems="baseline">
                <s-heading>{maxAdds > 1 ? maxAdds : totalAdds}</s-heading>
                <s-text color="subdued">saves / day</s-text>
              </s-stack>
            </s-grid>
          </s-box>
        </s-grid>
      </s-section>

      {/* ── SVG Analytics Graph ── */}
      <s-section heading={translations.dailySavesHeading}>
        {history.length === 0 ? (
          <s-banner tone="info" heading={translations.noActivityHeading}>
            {translations.noActivityMessage}
          </s-banner>
        ) : (
          <s-box border="base" borderRadius="base" padding="large" background="base">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
              <s-stack direction="inline" gap="base" alignItems="center">
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ display: "inline-block", width: "12px", height: "12px", borderRadius: "3px", backgroundColor: "#008060" }} />
                  <s-text>Wishlist Saves</s-text>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ display: "inline-block", width: "12px", height: "12px", borderRadius: "3px", backgroundColor: "#8c9196" }} />
                  <s-text>Removals</s-text>
                </div>
              </s-stack>
              <s-text tone="subdued">{translations.liveUpdating}</s-text>
            </div>

            {/* SVG Chart */}
            <div style={{ width: "100%", overflowX: "auto" }}>
              <svg
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                style={{ width: "100%", height: "auto", minWidth: "500px", display: "block" }}
              >
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#008060" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#004c3f" stopOpacity="0.8" />
                  </linearGradient>
                  <linearGradient id="removeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8c9196" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#5c5f62" stopOpacity="0.8" />
                  </linearGradient>
                </defs>

                {/* Y-axis gridlines & markers */}
                {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
                  const y = paddingY + plotHeight * (1 - pct);
                  const val = Math.round(yMax * pct);
                  return (
                    <g key={i}>
                      <line
                        x1={paddingX}
                        y1={y}
                        x2={chartWidth - paddingX}
                        y2={y}
                        stroke="#e1e3e5"
                        strokeDasharray={pct === 0 ? "none" : "3,3"}
                      />
                      <text
                        x={paddingX - 8}
                        y={y + 4}
                        fill="#8c9196"
                        fontSize="11"
                        textAnchor="end"
                        fontFamily="-apple-system, sans-serif"
                      >
                        {val}
                      </text>
                    </g>
                  );
                })}

                {/* Bars for each day */}
                {displayHistory.map((entry, index) => {
                  const slotX = paddingX + index * barSlotWidth;
                  const centerX = slotX + barSlotWidth / 2;

                  const addsHeight = Math.max(2, (entry.adds / yMax) * plotHeight);
                  const addsY = paddingY + plotHeight - addsHeight;

                  const removesHeight = entry.removes > 0 ? Math.max(2, (entry.removes / yMax) * plotHeight) : 0;
                  const removesY = paddingY + plotHeight - removesHeight;

                  const isHovered = hoveredEntry?.day === entry.day;

                  return (
                    <g
                      key={entry.day}
                      onMouseEnter={() => setHoveredEntry(entry)}
                      onMouseLeave={() => setHoveredEntry(null)}
                      style={{ cursor: "pointer" }}
                    >
                      {/* Background highlight on hover */}
                      {isHovered && (
                        <rect
                          x={slotX}
                          y={paddingY}
                          width={barSlotWidth}
                          height={plotHeight}
                          fill="#f6f6f7"
                          opacity="0.6"
                        />
                      )}

                      {/* Adds Bar */}
                      <rect
                        x={entry.removes > 0 ? centerX - barWidth : centerX - barWidth / 2}
                        y={addsY}
                        width={entry.removes > 0 ? barWidth * 0.9 : barWidth}
                        height={addsHeight}
                        rx="3"
                        fill="url(#barGradient)"
                      />

                      {/* Removes Bar (if any) */}
                      {entry.removes > 0 && (
                        <rect
                          x={centerX + 1}
                          y={removesY}
                          width={barWidth * 0.9}
                          height={removesHeight}
                          rx="3"
                          fill="url(#removeGradient)"
                        />
                      )}

                      {/* X-axis date label */}
                      <text
                        x={centerX}
                        y={chartHeight - 8}
                        fill={isHovered ? "#202223" : "#8c9196"}
                        fontWeight={isHovered ? "bold" : "normal"}
                        fontSize="10"
                        textAnchor="middle"
                        fontFamily="-apple-system, sans-serif"
                      >
                        {entry.day.slice(-2)}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Hover tooltip details */}
            {hoveredEntry && (
              <div style={{ marginTop: "12px", padding: "10px 14px", background: "#f1f2f3", borderRadius: "8px", display: "inline-block" }}>
                <s-stack direction="inline" gap="base" alignItems="center">
                  <s-text><strong>{hoveredEntry.day}</strong>:</s-text>
                  <s-badge tone="success">{renderSaves(hoveredEntry.adds)}</s-badge>
                  {hoveredEntry.removes > 0 && (
                    <s-badge tone="neutral">{renderRemovals(hoveredEntry.removes)}</s-badge>
                  )}
                </s-stack>
              </div>
            )}
          </s-box>
        )}
      </s-section>

      {/* ── Daily Breakdown Table ── */}
      <s-section heading="Activity Log">
        <s-box border="base" borderRadius="base" padding="base" background="base">
          <s-grid gap="small">
            {history.map((entry) => (
              <div
                key={entry.day}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 12px",
                  borderBottom: "1px solid #f1f2f3",
                }}
              >
                <s-text><strong>{entry.day}</strong></s-text>
                <s-stack direction="inline" gap="small" alignItems="center">
                  <s-badge tone="success">{renderSaves(entry.adds)}</s-badge>
                  {entry.removes > 0 && (
                    <s-badge tone="neutral">{renderRemovals(entry.removes)}</s-badge>
                  )}
                </s-stack>
              </div>
            ))}
          </s-grid>
        </s-box>
      </s-section>
    </s-page>
  );
}
