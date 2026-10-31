import { useEffect, useState, useMemo } from "react";
import { useLoaderData, useRevalidator } from "react-router";
import { authenticate } from "../shopify.server";
import { getAnalyticsHistory, getAnalytics, listRecentWishlistItems } from "../db.wishlist.server";
import { detectLocale, createTranslator } from "../i18n.server";

const monthKey = () => new Date().toISOString().slice(0, 7);

const formatDateWithDay = (dayStr, locale = "en") => {
  if (!dayStr) return "";
  const [y, m, d] = dayStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
};

const formatTimeAgo = (dateStr, locale = "en") => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
};

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const month = monthKey();
  const locale = detectLocale({ request, session });
  const t = createTranslator(locale);

  const [historyRes, totalsRes, recentItemsRes] = await Promise.allSettled([
    getAnalyticsHistory(session.shop, month),
    getAnalytics(session.shop, month),
    listRecentWishlistItems(session.shop, 50),
  ]);

  const history = historyRes.status === "fulfilled" && Array.isArray(historyRes.value) ? historyRes.value : [];
  const totals = totalsRes.status === "fulfilled" && totalsRes.value ? totalsRes.value : { adds: 0, removes: 0 };
  const recentItems = recentItemsRes.status === "fulfilled" && Array.isArray(recentItemsRes.value) ? recentItemsRes.value : [];

  const maxAdds = Math.max(1, ...history.map((e) => e.adds));
  const totalAdds = totals?.adds || 0;
  const totalRemoves = totals?.removes || 0;
  const netSaves = Math.max(0, totalAdds - totalRemoves);
  const retentionRate = totalAdds > 0 ? Math.round((netSaves / totalAdds) * 100) : 100;

  return {
    month,
    history,
    recentItems,
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
      dailyBreakdownTab: (days) => t("activity.dailyBreakdownTab", { days }),
      shopperItemsTab: (count) => t("activity.shopperItemsTab", { count }),
      orderLabel: t("activity.orderLabel"),
      oldestFirst: t("activity.oldestFirst"),
      newestFirst: t("activity.newestFirst"),
      thDateDay: t("activity.thDateDay"),
      thSaves: t("activity.thSaves"),
      thRemovals: t("activity.thRemovals"),
      thNetGrowth: t("activity.thNetGrowth"),
      thRetention: t("activity.thRetention"),
      thTrafficLevel: t("activity.thTrafficLevel"),
      today: t("activity.today"),
      trafficHigh: t("activity.trafficHigh"),
      trafficModerate: t("activity.trafficModerate"),
      trafficLight: t("activity.trafficLight"),
      trafficQuiet: t("activity.trafficQuiet"),
      showAllDays: (count) => t("activity.showAllDays", { count }),
      showRecentDays: t("activity.showRecentDays"),
      thProduct: t("activity.thProduct"),
      thHandle: t("activity.thHandle"),
      thPrice: t("activity.thPrice"),
      thCustomerId: t("activity.thCustomerId"),
      thAddedAt: t("activity.thAddedAt"),
      thAction: t("activity.thAction"),
      viewProduct: t("activity.viewProduct"),
      noItems: t("activity.noItems"),
      overviewHeading: t("activity.overviewHeading"),
      shopperSavesHeading: t("activity.shopperSavesHeading"),
      totalSavesLabel: t("activity.totalSavesBadge", { count: totalAdds }),
      totalRemovalsLabel: t("activity.totalRemovalsBadge", { count: totalRemoves }),
      netSavesLabel: t("activity.netSavesBadge", { count: netSaves }),
      retentionRateLabel: t("activity.retentionRateBadge", { rate: retentionRate }),
    },
  };
};

export default function WishlistOverview() {
  const {
    month,
    history,
    recentItems = [],
    maxAdds,
    totalAdds,
    totalRemoves,
    netSaves,
    retentionRate,
    locale,
    translations,
  } = useLoaderData();
  const revalidator = useRevalidator();
  const [hoveredEntry, setHoveredEntry] = useState(null);
  const [activeTab, setActiveTab] = useState("daily");
  const [showAllDays, setShowAllDays] = useState(false);
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => revalidator.revalidate(), 10000);
    return () => window.clearInterval(timer);
  }, [revalidator]);

  const renderSaves = (count) => translations.savesLabel.replace("{count}", String(count));
  const renderRemovals = (count) => translations.removalsLabel.replace("{count}", String(count));

  const todayStr = new Date().toISOString().slice(0, 10);

  // Sorted history for data table: newest first by default
  const sortedHistory = useMemo(() => {
    const list = [...history];
    list.sort((a, b) => (sortAsc ? a.day.localeCompare(b.day) : b.day.localeCompare(a.day)));
    return list;
  }, [history, sortAsc]);

  const displayedHistory = showAllDays ? sortedHistory : sortedHistory.slice(0, 10);

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
              <s-text color="subdued">{translations.thSaves || "Total Saves this Month"}</s-text>
              <s-stack direction="inline" gap="small" alignItems="baseline">
                <s-heading>{totalAdds.toLocaleString(locale)}</s-heading>
                <s-badge tone="success">+{totalAdds.toLocaleString(locale)}</s-badge>
              </s-stack>
            </s-grid>
          </s-box>

          <s-box border="base" borderRadius="base" padding="base" background="base">
            <s-grid gap="small-200">
              <s-text color="subdued">{translations.thRemovals || "Total Removals"}</s-text>
              <s-stack direction="inline" gap="small" alignItems="baseline">
                <s-heading>{totalRemoves.toLocaleString(locale)}</s-heading>
                {totalRemoves > 0 && <s-badge tone="neutral">-{totalRemoves.toLocaleString(locale)}</s-badge>}
              </s-stack>
            </s-grid>
          </s-box>

          <s-box border="base" borderRadius="base" padding="base" background="base">
            <s-grid gap="small-200">
              <s-text color="subdued">{translations.thNetGrowth || "Net Wishlisted Products"}</s-text>
              <s-stack direction="inline" gap="small" alignItems="baseline">
                <s-heading>{netSaves.toLocaleString(locale)}</s-heading>
                <s-badge tone="info">{translations.retentionRateLabel ? translations.retentionRateLabel : `${retentionRate}% retained`}</s-badge>
              </s-stack>
            </s-grid>
          </s-box>

          <s-box border="base" borderRadius="base" padding="base" background="base">
            <s-grid gap="small-200">
              <s-text color="subdued">{translations.trafficHigh || "Peak Daily Saves"}</s-text>
              <s-stack direction="inline" gap="small" alignItems="baseline">
                <s-heading>{(maxAdds > 1 ? maxAdds : totalAdds).toLocaleString(locale)}</s-heading>
                <s-text color="subdued">{translations.savesLabel.replace("{count}", "").trim() || "saves / day"}</s-text>
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
          <s-box border="base" borderRadius="base" padding="base" background="base">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", flexWrap: "wrap", gap: "10px" }}>
              <s-stack direction="inline" gap="base" alignItems="center">
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ display: "inline-block", width: "12px", height: "12px", borderRadius: "3px", backgroundColor: "#008060" }} />
                  <s-text>{translations.thSaves || "Wishlist Saves"}</s-text>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ display: "inline-block", width: "12px", height: "12px", borderRadius: "3px", backgroundColor: "#8c9196" }} />
                  <s-text>{translations.thRemovals || "Removals"}</s-text>
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
              <div style={{ marginTop: "8px", padding: "8px 12px", background: "#f1f2f3", borderRadius: "8px", display: "inline-block" }}>
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

      {/* ── Activity Log (Modern Tabbed Analytics & Shopper Saves) ── */}
      <s-section heading={translations.shopperSavesHeading || "Activity Log & Shopper Saves"}>
        <div style={{ background: "#ffffff", border: "1px solid #e1e3e5", borderRadius: "8px", overflow: "hidden" }}>
          {/* Toolbar Header */}
          <div style={{
            padding: "10px 14px",
            borderBottom: "1px solid #e1e3e5",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "10px",
            background: "#fafbfb"
          }}>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setActiveTab("daily")}
                style={{
                  background: activeTab === "daily" ? "#202223" : "#ffffff",
                  color: activeTab === "daily" ? "#ffffff" : "#202223",
                  border: activeTab === "daily" ? "1px solid #202223" : "1px solid #c9cccf",
                  borderRadius: "6px",
                  padding: "5px 12px",
                  fontSize: "12px",
                  fontWeight: "600",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  transition: "all 0.15s ease",
                }}
              >
                <span>📊</span>
                <span>{translations.dailyBreakdownTab ? translations.dailyBreakdownTab(history.length) : `Daily Breakdown (${history.length}d)`}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("items")}
                style={{
                  background: activeTab === "items" ? "#202223" : "#ffffff",
                  color: activeTab === "items" ? "#ffffff" : "#202223",
                  border: activeTab === "items" ? "1px solid #202223" : "1px solid #c9cccf",
                  borderRadius: "6px",
                  padding: "5px 12px",
                  fontSize: "12px",
                  fontWeight: "600",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  transition: "all 0.15s ease",
                }}
              >
                <span>💎</span>
                <span>{translations.shopperItemsTab ? translations.shopperItemsTab(recentItems.length) : `Shopper Wishlisted Items (${recentItems.length})`}</span>
              </button>
            </div>

            {activeTab === "daily" && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "11.5px", color: "#6d7175" }}>{translations.orderLabel || "Order:"}</span>
                <button
                  type="button"
                  onClick={() => setSortAsc(!sortAsc)}
                  style={{
                    background: "#ffffff",
                    border: "1px solid #c9cccf",
                    borderRadius: "5px",
                    padding: "3px 8px",
                    fontSize: "11px",
                    fontWeight: "600",
                    color: "#202223",
                    cursor: "pointer",
                  }}
                >
                  {sortAsc ? (translations.oldestFirst || "Oldest First ↑") : (translations.newestFirst || "Newest First ↓")}
                </button>
              </div>
            )}
          </div>

          {/* Tab 1: Daily Breakdown Table */}
          {activeTab === "daily" && (
            <div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #e1e3e5", background: "#fbfcfc" }}>
                      <th style={{ padding: "7px 12px", fontWeight: "600", color: "#5c5f62" }}>{translations.thDateDay || "Date & Day"}</th>
                      <th style={{ padding: "7px 12px", fontWeight: "600", color: "#5c5f62" }}>{translations.thSaves || "Wishlist Saves"}</th>
                      <th style={{ padding: "7px 12px", fontWeight: "600", color: "#5c5f62" }}>{translations.thRemovals || "Removals"}</th>
                      <th style={{ padding: "7px 12px", fontWeight: "600", color: "#5c5f62" }}>{translations.thNetGrowth || "Net Growth"}</th>
                      <th style={{ padding: "7px 12px", fontWeight: "600", color: "#5c5f62" }}>{translations.thRetention || "Retention"}</th>
                      <th style={{ padding: "7px 12px", fontWeight: "600", color: "#5c5f62" }}>{translations.thTrafficLevel || "Traffic Level"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedHistory.length > 0 ? (
                      displayedHistory.map((entry) => {
                        const isToday = entry.day === todayStr;
                        const net = entry.adds - entry.removes;
                        const retRate = entry.adds > 0 ? Math.round((Math.max(0, net) / entry.adds) * 100) : 100;
                        const pctOfMax = maxAdds > 0 ? Math.min(100, Math.round((entry.adds / maxAdds) * 100)) : 0;

                        return (
                          <tr
                            key={entry.day}
                            style={{
                              borderBottom: "1px solid #f2f4f6",
                              background: isToday ? "#f6fef9" : "transparent"
                            }}
                          >
                            <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <strong style={{ color: "#202223" }}>{formatDateWithDay(entry.day, locale)}</strong>
                                {isToday && <s-badge tone="success">{translations.today || "Today"}</s-badge>}
                              </div>
                              <span style={{ fontSize: "11px", color: "#8c9196" }}>{entry.day}</span>
                            </td>

                            <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <span style={{ fontWeight: "700", color: "#008060", minWidth: "36px" }}>
                                  +{entry.adds}
                                </span>
                                <div style={{ width: "56px", height: "5px", background: "#f1f2f4", borderRadius: "3px", overflow: "hidden" }}>
                                  <div style={{ width: `${pctOfMax}%`, height: "100%", background: "#008060", borderRadius: "3px" }} />
                                </div>
                              </div>
                            </td>

                            <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                              {entry.removes > 0 ? (
                                <span style={{ color: "#6d7175", fontSize: "12.5px" }}>-{entry.removes}</span>
                              ) : (
                                <span style={{ color: "#c9cccf" }}>0</span>
                              )}
                            </td>

                            <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                              <s-badge tone={net > 0 ? "success" : net === 0 ? "neutral" : "critical"}>
                                {net > 0 ? `+${net}` : net} net
                              </s-badge>
                            </td>

                            <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                              <span style={{ fontSize: "12px", fontWeight: "600", color: retRate >= 80 ? "#008060" : "#6d7175" }}>
                                {retRate}%
                              </span>
                            </td>

                            <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                              <s-badge tone={entry.adds >= maxAdds * 0.85 ? "warning" : entry.adds >= maxAdds * 0.5 ? "info" : "neutral"}>
                                {entry.adds >= maxAdds * 0.85
                                  ? (translations.trafficHigh || "Peak Volume")
                                  : entry.adds >= maxAdds * 0.5
                                  ? (translations.trafficModerate || "Active")
                                  : (translations.trafficQuiet || "Normal")}
                              </s-badge>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={6} style={{ padding: "16px", textAlign: "center", color: "#6d7175" }}>
                          {translations.noActivityHeading || "No daily activity recorded for this period."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {history.length > 10 && (
                <div style={{
                  padding: "8px 14px",
                  borderTop: "1px solid #e1e3e5",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "#fafbfb"
                }}>
                  <span style={{ fontSize: "12px", color: "#6d7175" }}>
                    Showing {displayedHistory.length} of {history.length} days
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAllDays(!showAllDays)}
                    style={{
                      background: "#ffffff",
                      border: "1px solid #c9cccf",
                      borderRadius: "5px",
                      padding: "3px 10px",
                      fontSize: "11.5px",
                      fontWeight: "600",
                      color: "#202223",
                      cursor: "pointer",
                    }}
                  >
                    {showAllDays ? (translations.showRecentDays || "Show Latest 10 Days") : (translations.showAllDays ? translations.showAllDays(history.length) : `Show All ${history.length} Days`)}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Shopper Wishlisted Items Table */}
          {activeTab === "items" && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e1e3e5", background: "#fbfcfc" }}>
                    <th style={{ padding: "7px 12px", fontWeight: "600", color: "#5c5f62" }}>{translations.thProduct || "Product"}</th>
                    <th style={{ padding: "7px 12px", fontWeight: "600", color: "#5c5f62" }}>{translations.thHandle || "Variant / Options"}</th>
                    <th style={{ padding: "7px 12px", fontWeight: "600", color: "#5c5f62" }}>{translations.thPrice || "Price"}</th>
                    <th style={{ padding: "7px 12px", fontWeight: "600", color: "#5c5f62" }}>{translations.thCustomerId || "Shopper ID"}</th>
                    <th style={{ padding: "7px 12px", fontWeight: "600", color: "#5c5f62" }}>{translations.thAddedAt || "Saved Date"}</th>
                    <th style={{ padding: "7px 12px", fontWeight: "600", color: "#5c5f62" }}>{translations.thAction || "Status"}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentItems.length > 0 ? (
                    recentItems.map((item) => (
                      <tr key={`${item.productId}-${item.variantId}-${item.customerId}`} style={{ borderBottom: "1px solid #f2f4f6" }}>
                        <td style={{ padding: "8px 12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            {item.productImage ? (
                              <img
                                src={item.productImage}
                                alt={item.productTitle}
                                style={{ width: "36px", height: "36px", objectFit: "cover", borderRadius: "6px", border: "1px solid #e1e3e5" }}
                              />
                            ) : (
                              <div style={{ width: "36px", height: "36px", background: "#f1f2f4", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px" }}>
                                🛍️
                              </div>
                            )}
                            <div>
                              <strong style={{ color: "#202223", display: "block" }}>{item.productTitle}</strong>
                              <span style={{ fontSize: "11px", color: "#8c9196" }}>{item.productHandle}</span>
                            </div>
                          </div>
                        </td>

                        <td style={{ padding: "8px 12px", color: "#5c5f62" }}>
                          {item.variantTitle || "Default Title"}
                        </td>

                        <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                          <strong style={{ color: "#202223" }}>{item.productPrice || "—"}</strong>
                        </td>

                        <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                          <span style={{
                            fontFamily: "monospace",
                            fontSize: "11px",
                            background: "#f1f2f4",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            color: "#5c5f62",
                          }}>
                            {item.customerId.replace("gid://shopify/Customer/", "#")}
                          </span>
                        </td>

                        <td style={{ padding: "8px 12px", whiteSpace: "nowrap", color: "#6d7175", fontSize: "12px" }}>
                          {formatTimeAgo(item.createdAt, locale)}
                        </td>

                        <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                          <s-badge tone="success">{translations.viewProduct ? "In Wishlist" : "In Wishlist"}</s-badge>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} style={{ padding: "20px", textAlign: "center", color: "#6d7175" }}>
                        {translations.noItems || "No shopper wishlist items recorded yet."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </s-section>
    </s-page>
  );
}
