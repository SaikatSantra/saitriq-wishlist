import { useLoaderData, useFetcher } from "react-router";
import { useEffect } from "react";
import { Buffer } from "node:buffer";
import { env } from "node:process";
import { authenticate } from "../shopify.server";
import { PLANS } from "../plans";
import { currentUsage } from "../db.wishlist.server";
import { PLAN_RANK } from "../plan-entitlements";
import {
  getPlanEntitlement,
  monthKey,
  createSubscription,
  createPlanAllocationCharge,
  cancelPaidPlan,
  createAddonCharge,
  getMonthlyAddonSaves,
  getSubscriptionBillingDetails,
  ADDON,
} from "../billing.server";
import { detectLocale, createTranslator } from "../i18n.server";

const formatScheduleDate = (value) =>
  value ? new Date(value).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC") : null;

const formatDateTime = (value, locale = "en") => {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
};

const formatPurchaseDate = (value, locale = "en") => {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
};

const formatEndDate = (itemOrSub, locale = "en", i18n = {}) => {
  if (!itemOrSub) return i18n?.freeForever || "No Expiration (Lifetime Free)";
  if (itemOrSub.planId === "free") return i18n?.freeForever || "No Expiration (Lifetime Free)";
  if (itemOrSub.currentPeriodEnd) {
    return formatPurchaseDate(itemOrSub.currentPeriodEnd, locale);
  }
  if (itemOrSub.endDate) {
    return formatPurchaseDate(itemOrSub.endDate, locale);
  }
  if (itemOrSub.trialEndsOn && itemOrSub.isTrial) {
    return `${i18n?.trialEnds || "Trial ends"} ${formatPurchaseDate(itemOrSub.trialEndsOn, locale)}`;
  }
  return i18n?.every30Days || "Renews every 30 days";
};

const formatBillingType = (type, planId, i18n = {}) => {
  if (type === "cancellation") return i18n?.badgeCancelled || "Cancelled";
  if (planId === "free") return i18n?.freeTier || "Free Tier";
  switch (type) {
    case "manual_purchase":
      return i18n?.subscriptionActivation || "Subscription Activation";
    case "auto_renewal":
      return i18n?.monthlyAutoRenewal || "Monthly Auto-Renewal";
    case "extra_allocation":
      return i18n?.extraAllocation || "Extra Plan Allocation";
    default:
      return type?.replace(/_/g, " ") || i18n?.baseSubscription || "Base Subscription";
  }
};

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const month = monthKey();
  const locale = detectLocale({ request, session });
  const t = createTranslator(locale);

  const [entitlementRes, usedRes, addonSavesRes, billingDetailsRes] = await Promise.allSettled([
    getPlanEntitlement(shop, month, admin),
    currentUsage(shop, month),
    getMonthlyAddonSaves(shop, month),
    getSubscriptionBillingDetails(shop, admin),
  ]);

  const entitlement = entitlementRes.status === "fulfilled" && entitlementRes.value
    ? entitlementRes.value
    : { planId: "free", planLimit: 100 };
  const used = usedRes.status === "fulfilled" && Number.isFinite(usedRes.value) ? usedRes.value : 0;
  const addonSaves = addonSavesRes.status === "fulfilled" && Number.isFinite(addonSavesRes.value) ? addonSavesRes.value : 0;
  const subscriptionDetails = billingDetailsRes.status === "fulfilled" && billingDetailsRes.value
    ? billingDetailsRes.value
    : null;

  const activePlanId = entitlement?.planId || "free";
  const planLimit = entitlement?.planLimit ?? 100;
  const effectiveLimit = Number.isFinite(planLimit) ? planLimit + addonSaves : Infinity;

  const url = new URL(request.url);
  const addonStatus = url.searchParams.get("addon");
  const planActivated = url.searchParams.get("activated") === "1";
  const planDeclined = url.searchParams.get("declined") === "1";
  const planScheduled = url.searchParams.get("scheduled") === "1";
  const billingError = url.searchParams.get("billingError") === "1";
  const allocationAdded = url.searchParams.get("allocationAdded") === "1";

  const localizedPlans = PLANS.map((plan) => {
    const locPlan = t(`pricing.plans.${plan.id}`);
    return {
      ...plan,
      name: locPlan?.name || plan.name,
      description: locPlan?.description || plan.description,
      features: locPlan?.features || plan.features,
    };
  });

  return {
    plans: localizedPlans,
    activePlanId,
    scheduledPlanId: entitlement.scheduledPlanId,
    effectiveMonth: entitlement.effectiveMonth,
    effectiveAt: entitlement.effectiveAt,
    purchaseCount: entitlement.purchaseCount,
    addonSaves,
    addon: ADDON,
    addonStatus,
    planActivated,
    planDeclined,
    planScheduled,
    billingError,
    allocationAdded,
    locale,
    subscriptionDetails,
    usage: {
      used,
      limit: effectiveLimit,
      planLimit,
      remaining: Number.isFinite(effectiveLimit) ? Math.max(0, effectiveLimit - used) : null,
    },
    i18n: {
      title: t("pricing.title"),
      subtitle: t("pricing.subtitle"),
      currentPlanBadge: t("pricing.currentPlanBadge"),
      activeBadge: t("pricing.activeBadge"),
      perMonth: t("pricing.perMonth"),
      trialNote: (days) => t("pricing.trialNote", { days }),
      upgradeButton: (name) => t("pricing.upgradeBtn", { name }) || t("pricing.upgradeButton", { name }),
      downgradeButton: (name) => t("pricing.downgradeBtn", { name }) || t("pricing.downgradeButton", { name }),
      quotaUsed: t("pricing.quotaUsed"),
      extraAddonTitle: t("pricing.extraAddonTitle"),
      extraAddonDesc: t("pricing.extraAddonDesc"),
      extraAddonButton: t("pricing.extraAddonButton"),
      limitReachedWarning: t("pricing.limitReachedWarning"),

      // Guide
      guideHeading: t("pricing.guideHeading"),
      upgradeGuideTitle: t("pricing.upgradeGuideTitle"),
      upgradeGuideDesc: t("pricing.upgradeGuideDesc"),
      downgradeGuideTitle: t("pricing.downgradeGuideTitle"),
      downgradeGuideDesc: t("pricing.downgradeGuideDesc"),
      addonGuideTitle: t("pricing.addonGuideTitle"),
      addonGuideDesc: t("pricing.addonGuideDesc"),
      renewalGuideTitle: t("pricing.renewalGuideTitle"),
      renewalGuideDesc: t("pricing.renewalGuideDesc"),

      // Metrics & Labels
      activePlanRate: t("pricing.activePlanRate"),
      planPurchaseDate: t("pricing.planPurchaseDate"),
      endRenewalDate: t("pricing.endRenewalDate"),
      monthlySaveCapacity: t("pricing.monthlySaveCapacity"),
      every30Days: t("pricing.every30Days"),
      freeForever: t("pricing.freeForever"),
      subscriptionActivation: t("pricing.subscriptionActivation"),
      appInstallation: t("pricing.appInstallation"),
      downgradeEffective: t("pricing.downgradeEffective"),
      nextRenewal: t("pricing.nextRenewal"),
      quotaResetsMonthly: t("pricing.quotaResetsMonthly"),
      basePlanQuota: t("pricing.basePlanQuota"),
      boostActive: (count) => t("pricing.boostActive", { count }),
      cancelPlan: t("pricing.cancelPlan"),
      mostPopular: t("pricing.mostPopular"),
      downgradeScheduled: t("pricing.downgradeScheduled"),
      downgradeScheduledNotice: (date) => t("pricing.downgradeScheduledNotice", { date }),
      trialActive: t("pricing.trialActive"),
      activeSubscription: t("pricing.activeSubscription"),
      freeTier: t("pricing.freeTier"),
      capacityBadge: (pct) => t("pricing.capacityBadge", { pct }),
      remainingBadge: (count) => t("pricing.remainingBadge", { count }),
      savesUsedThisMonth: (used, limit) => t("pricing.savesUsedThisMonth", { used, limit }),
      includesBoost: (count) => t("pricing.includesBoost", { count }),
      savesPerMonth: (limit) => t("pricing.savesPerMonth", { limit }),
      unlimitedSaves: t("pricing.unlimitedSaves"),
      choosePlanHeading: t("pricing.choosePlanHeading"),
      activePlanBtn: t("pricing.activePlanBtn"),

      // History
      historyHeading: t("pricing.historyHeading"),
      historySubtitle: t("pricing.historySubtitle"),
      thMonth: t("pricing.thMonth"),
      thPlan: t("pricing.thPlan"),
      thPurchaseDate: t("pricing.thPurchaseDate"),
      thPeriodEnd: t("pricing.thPeriodEnd"),
      thAmount: t("pricing.thAmount"),
      thBillingType: t("pricing.thBillingType"),
      thStatus: t("pricing.thStatus"),
      badgeCurrent: t("pricing.badgeCurrent"),
      badgeActivePeriod: t("pricing.badgeActivePeriod"),
      badgeCancelled: t("pricing.badgeCancelled"),
      badgeCompleted: t("pricing.badgeCompleted"),
      noHistory: t("pricing.noHistory"),

      // Comparison
      comparePlans: t("pricing.comparePlans"),
      thFeature: t("pricing.thFeature"),
      fSavesQuota: t("pricing.fSavesQuota"),
      fThemeBlocks: t("pricing.fThemeBlocks"),
      fCustomCss: t("pricing.fCustomCss"),
      fAnalytics: t("pricing.fAnalytics"),
      fApi: t("pricing.fApi"),
      fSupport: t("pricing.fSupport"),
      supportStandard: t("pricing.supportStandard"),
      supportPriority: t("pricing.supportPriority"),
      supportDedicated: t("pricing.supportDedicated"),
      included: t("pricing.included"),
      notIncluded: t("pricing.notIncluded"),
    },
  };
};

export const headers = () => ({ "Cache-Control": "no-store, max-age=0" });

export const action = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent");
  const planId = String(formData.get("planId") || "");
  const targetPlan = PLANS.find((plan) => plan.id === planId);
  const currentPlan = await getPlanEntitlement(shop, monthKey(), admin);

  const makeReturnUrl = (changeType) => {
    const incomingUrl = new URL(request.url);
    const appUrl = env.SHOPIFY_APP_URL || incomingUrl.origin;
    const returnUrl = new URL("/app/billing", appUrl);
    const host = incomingUrl.searchParams.get("host") ||
      Buffer.from(`${shop}/admin`).toString("base64url");
    returnUrl.searchParams.set("shop", shop);
    returnUrl.searchParams.set("host", host);
    returnUrl.searchParams.set("planId", planId);
    returnUrl.searchParams.set("changeType", changeType);
    return returnUrl.toString();
  };

  if (intent === "cancel-plan") {
    if (currentPlan.planId === "free") {
      return { error: "There is no paid plan to cancel." };
    }

    try {
      await cancelPaidPlan(admin, shop);
      return {
        success: true,
        message: "Your subscription has been cancelled and your store returned to the Free plan.",
      };
    } catch (err) {
      console.error("Plan cancellation error:", err);
      return {
        error: err instanceof Error
          ? `Plan cancellation failed: ${err.message}`
          : "Could not cancel the plan. Please try again.",
      };
    }
  }

  if (intent === "upgrade" || intent === "downgrade") {
    if (!targetPlan) {
      return { error: "Invalid plan selected." };
    }

    if (targetPlan.id === "free") {
      if (currentPlan.planId === "free") {
        return { error: "You are already on the Free plan." };
      }
      try {
        await cancelPaidPlan(admin, shop);
        return {
          success: true,
          message: "Your subscription has been cancelled and your store returned to the Free plan.",
        };
      } catch (err) {
        console.error("Plan downgrade error:", err);
        return {
          error: err instanceof Error
            ? `Cancellation failed: ${err.message}`
            : "Could not downgrade to Free. Please try again.",
        };
      }
    }

    const currentRank = PLAN_RANK[currentPlan.planId] ?? 0;
    const targetRank = PLAN_RANK[targetPlan.id] ?? 0;
    const isPlanAllocation = currentPlan.planId === targetPlan.id && currentPlan.planId !== "unlimited";

    if (currentPlan.planId === targetPlan.id && !isPlanAllocation) {
      return { error: "You are already on this plan." };
    }

    const isDowngrade = targetRank < currentRank;
    const changeType = isPlanAllocation ? "allocation" : isDowngrade ? "downgrade" : "upgrade";
    const returnUrl = makeReturnUrl(changeType);

    try {
      if (isPlanAllocation) {
        const { confirmationUrl } = await createPlanAllocationCharge(
          admin,
          targetPlan.id,
          returnUrl,
        );
        return { confirmationUrl };
      }

      const { confirmationUrl } = await createSubscription(
        admin,
        targetPlan.id,
        returnUrl,
        "APPLY_IMMEDIATELY",
        targetPlan.trialDays,
      );
      return { confirmationUrl };
    } catch (err) {
      console.error("Subscription creation error:", err);
      return {
        error: err instanceof Error
          ? `Billing error: ${err.message}`
          : "Could not start the billing flow. Please try again.",
      };
    }
  }

  if (intent === "buy-addon") {
    const origin = new URL(request.url).origin;
    const appUrl = env.SHOPIFY_APP_URL || origin;
    const returnUrl = `${appUrl}/app/addon?shop=${shop}`;
    try {
      const { confirmationUrl } = await createAddonCharge(admin, returnUrl);
      return { confirmationUrl };
    } catch (err) {
      console.error("Addon charge error:", err);
      return { error: "Could not start the addon purchase. Please try again." };
    }
  }

  return { error: "Unknown action." };
};

export default function PricingPage() {
  const {
    plans,
    activePlanId,
    scheduledPlanId,
    effectiveMonth,
    effectiveAt,
    purchaseCount,
    allocationAdded,
    planActivated,
    planDeclined,
    planScheduled,
    billingError,
    usage,
    addonSaves,
    addon,
    addonStatus,
    subscriptionDetails,
    locale,
    i18n,
  } = useLoaderData();
  const fetcher = useFetcher();
  const actionData = fetcher.data;
  const isSubmitting = fetcher.state !== "idle";

  const activePlan = plans.find((p) => p.id === activePlanId);
  const effectiveAtLabel = formatScheduleDate(effectiveAt) ?? effectiveMonth;
  const effectiveLimit = usage?.limit ?? subscriptionDetails?.currentSubscription?.effectiveLimit ?? Infinity;

  useEffect(() => {
    if (actionData?.confirmationUrl) {
      window.top.location.href = actionData.confirmationUrl;
    }
  }, [actionData?.confirmationUrl]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isPostBilling =
      params.get("activated") === "1" ||
      params.get("scheduled") === "1" ||
      params.get("declined") === "1" ||
      params.get("billingError") === "1" ||
      params.get("addon") === "activated";
    const alreadyReloaded = sessionStorage.getItem("billing_reloaded") === "1";

    if (isPostBilling && !alreadyReloaded) {
      sessionStorage.setItem("billing_reloaded", "1");
      window.location.reload();
    } else if (!isPostBilling) {
      sessionStorage.removeItem("billing_reloaded");
    }
  }, []);

  const usedPct = Number.isFinite(usage.limit) && usage.limit > 0
    ? Math.min(100, Math.round((usage.used / usage.limit) * 100))
    : 0;

  return (
    <s-page heading={i18n?.title || "Plans & Pricing"}>
      {/* ── Status Feedback Banners ── */}
      {addonStatus === "activated" && (
        <s-banner tone="success" heading="Addon activated">
          +{addon.saves.toLocaleString(locale)} saves have been added to this month&apos;s limit.
        </s-banner>
      )}
      {planActivated && (
        <s-banner tone="success" heading="Plan activated">
          Your plan and monthly save limit have been updated.
        </s-banner>
      )}
      {actionData?.error && (
        <s-banner tone="critical" heading="Billing Error">
          {actionData.error}
        </s-banner>
      )}
      {actionData?.success && (
        <s-banner tone="success" heading="Plan Updated">
          {actionData.message}
        </s-banner>
      )}

      {/* ── Active Subscription & Quota Overview Card ── */}
      <s-section>
        <div style={{ background: "#ffffff", border: "1px solid #e1e3e5", borderRadius: "8px", padding: "14px 16px" }}>
          {/* Header Row: Plan Name, Status Badge, Subscription ID, Boost Button */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <s-heading>{activePlan?.name || "Free"} {i18n?.planTitle || "Plan"}</s-heading>
              <s-badge tone={activePlanId === "free" ? "neutral" : subscriptionDetails?.currentSubscription?.isTrial ? "info" : "success"}>
                {activePlanId === "free"
                  ? (i18n?.freeTier || "Free Tier")
                  : subscriptionDetails?.currentSubscription?.isTrial
                  ? (i18n?.trialActive || "Trial Active")
                  : (i18n?.activeSubscription || "Active Subscription")}
              </s-badge>
              {subscriptionDetails?.currentSubscription?.scheduledChange && (
                <s-badge tone="warning">{i18n?.downgradeScheduled || "Downgrade Scheduled"}</s-badge>
              )}
              {subscriptionDetails?.currentSubscription?.shortSubscriptionId && (
                <span
                  style={{
                    fontFamily: "monospace",
                    fontSize: "11px",
                    background: "#f1f2f4",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    color: "#5c5f62",
                  }}
                  title={subscriptionDetails.currentSubscription.subscriptionId}
                >
                  ID: {subscriptionDetails.currentSubscription.shortSubscriptionId}
                </span>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {Number.isFinite(usage.limit) && (
                <s-badge tone={usedPct >= 90 ? "critical" : usedPct >= 75 ? "warning" : "success"}>
                  {i18n?.capacityBadge ? i18n.capacityBadge(usedPct) : `${usedPct}% capacity`}
                </s-badge>
              )}
              {activePlanId === "growth" && (
                <fetcher.Form method="post" style={{ display: "inline" }}>
                  <input type="hidden" name="intent" value="buy-addon" />
                  <s-button type="submit" variant="secondary" loading={isSubmitting}>
                    +{addon.saves.toLocaleString(locale)} Boost (${addon.price})
                  </s-button>
                </fetcher.Form>
              )}
            </div>
          </div>

          {/* Quota Progress Bar */}
          {Number.isFinite(usage.limit) && (
            <div style={{ marginBottom: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#6d7175", marginBottom: "4px" }}>
                <span>
                  {i18n?.savesUsedThisMonth
                    ? i18n.savesUsedThisMonth(usage.used.toLocaleString(locale), usage.limit.toLocaleString(locale))
                    : `${usage.used.toLocaleString(locale)} of ${usage.limit.toLocaleString(locale)} saves used this month`}
                  {addonSaves > 0 && (i18n?.includesBoost ? i18n.includesBoost(addonSaves.toLocaleString(locale)) : ` (includes +${addonSaves.toLocaleString(locale)} boost)`)}
                </span>
                <span>{usage.remaining !== null ? (i18n?.remainingBadge ? i18n.remainingBadge(usage.remaining.toLocaleString(locale)) : `${usage.remaining.toLocaleString(locale)} remaining`) : ""}</span>
              </div>
              <div style={{ position: "relative", width: "100%", height: "6px", background: "#f1f2f4", borderRadius: "3px", overflow: "visible" }}>
                <div
                  style={{
                    width: `${usedPct}%`,
                    height: "100%",
                    background: usedPct >= 90 ? "#d72c0d" : usedPct >= 75 ? "#b98900" : "#008060",
                    borderRadius: "3px",
                    transition: "width 0.4s ease",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: "80%",
                    top: "-2px",
                    bottom: "-2px",
                    width: "2px",
                    background: "#d72c0d",
                    zIndex: 2,
                  }}
                  title="80% Warning email alert"
                />
              </div>
            </div>
          )}

          {/* 4 Details Metrics (Clean layout, no heavy border nesting) */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "8px",
              background: "#fafbfb",
              borderRadius: "8px",
              padding: "10px 14px",
            }}
          >
            <div>
              <div style={{ fontSize: "11px", color: "#6d7175", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                {i18n?.activePlanRate || "Active Plan & Rate"}
              </div>
              <div style={{ fontSize: "14px", fontWeight: "700", color: "#202223", marginTop: "2px" }}>
                {activePlan?.name || "Free"} (${activePlan?.price ?? 0}{i18n?.perMonth || "/mo"})
              </div>
              <div style={{ fontSize: "11px", color: "#8c9196" }}>
                {activePlanId === "free" ? (i18n?.freeForever || "Free Forever") : (i18n?.every30Days || "Every 30 days")}
              </div>
            </div>

            <div>
              <div style={{ fontSize: "11px", color: "#6d7175", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                {i18n?.planPurchaseDate || "Plan Purchase Date"}
              </div>
              <div style={{ fontSize: "14px", fontWeight: "700", color: "#202223", marginTop: "2px" }}>
                {formatPurchaseDate(subscriptionDetails?.currentSubscription?.purchaseDate, locale) || (i18n?.appInstallation || "Active Default")}
              </div>
              <div style={{ fontSize: "11px", color: "#8c9196" }}>
                {subscriptionDetails?.currentSubscription?.purchaseDate ? (i18n?.subscriptionActivation || "Subscription activation") : (i18n?.appInstallation || "App installation")}
              </div>
            </div>

            <div>
              <div style={{ fontSize: "11px", color: "#6d7175", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                {i18n?.endRenewalDate || "End / Renewal Date"}
              </div>
              <div style={{ fontSize: "14px", fontWeight: "700", color: subscriptionDetails?.currentSubscription?.scheduledChange ? "#b98900" : "#202223", marginTop: "2px" }}>
                {formatEndDate(subscriptionDetails?.currentSubscription, locale, i18n)}
              </div>
              <div style={{ fontSize: "11px", color: "#8c9196" }}>
                {subscriptionDetails?.currentSubscription?.scheduledChange
                  ? (i18n?.downgradeEffective || "Downgrade effective")
                  : activePlanId === "free"
                  ? (i18n?.quotaResetsMonthly || "Quota resets monthly")
                  : (i18n?.nextRenewal || "Next billing renewal")}
              </div>
            </div>

            <div>
              <div style={{ fontSize: "11px", color: "#6d7175", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                {i18n?.monthlySaveCapacity || "Monthly Save Capacity"}
              </div>
              <div style={{ fontSize: "14px", fontWeight: "700", color: "#008060", marginTop: "2px" }}>
                {Number.isFinite(effectiveLimit)
                  ? (i18n?.savesPerMonth ? i18n.savesPerMonth(effectiveLimit.toLocaleString(locale)) : `${effectiveLimit.toLocaleString(locale)} saves / mo`)
                  : (i18n?.unlimitedSaves || "Unlimited saves")}
              </div>
              <div style={{ fontSize: "11px", color: "#8c9196" }}>
                {addonSaves > 0
                  ? (i18n?.boostActive ? i18n.boostActive(addonSaves.toLocaleString(locale)) : `+${addonSaves.toLocaleString(locale)} boost active`)
                  : (i18n?.basePlanQuota || "Base plan quota")}
              </div>
            </div>
          </div>

          {/* Cancellation Notice if applicable */}
          {subscriptionDetails?.currentSubscription?.scheduledChange && (
            <div
              style={{
                marginTop: "10px",
                padding: "8px 12px",
                background: "#fffbf2",
                border: "1px solid #f9c642",
                borderRadius: "6px",
                fontSize: "12px",
                color: "#6c4e00",
              }}
            >
              ⚠️ <strong>{i18n?.downgradeScheduled || "Downgrade Scheduled"}:</strong>{" "}
              {i18n?.downgradeScheduledNotice
                ? i18n.downgradeScheduledNotice(
                    formatDateTime(subscriptionDetails.currentSubscription.scheduledChange.effectiveAt, locale) ||
                      subscriptionDetails.currentSubscription.scheduledChange.effectiveMonth
                  )
                : `Plan switches to Free on ${
                    formatDateTime(subscriptionDetails.currentSubscription.scheduledChange.effectiveAt, locale) ||
                    subscriptionDetails.currentSubscription.scheduledChange.effectiveMonth
                  }. Features remain active until then.`}
            </div>
          )}
        </div>
      </s-section>

      {/* ── Choose Your Plan Grid (Clean layout, no separator line clutter) ── */}
      <s-section heading={i18n?.choosePlanHeading || "Choose Your Plan"}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
            gap: "12px",
            alignItems: "stretch",
          }}
        >
          {plans.map((plan) => {
            const isActive = plan.id === activePlanId;
            const activePlanPrice = activePlan?.price ?? 0;
            const isDowngrade = plan.price < activePlanPrice && !isActive;
            const isUpgrade = plan.price > activePlanPrice && !isActive;
            const isStarter = plan.id === "starter";

            return (
              <div
                key={plan.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  border: isStarter && !isActive
                    ? "2px solid #008060"
                    : isActive
                    ? "2px solid #202223"
                    : "1px solid #e1e3e5",
                  borderRadius: "8px",
                  padding: "14px 12px",
                  background: isActive ? "#f8f9fa" : "#ffffff",
                  boxShadow: isStarter && !isActive ? "0 2px 8px rgba(0, 128, 96, 0.1)" : "none",
                  gap: "10px",
                }}
              >
                <div>
                  {isStarter && (
                    <div style={{ marginBottom: "6px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          background: "#e3f1df",
                          color: "#008060",
                          fontSize: "10px",
                          fontWeight: "700",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                        }}
                      >
                        ★ {i18n?.mostPopular || "Most Popular"}
                      </span>
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <s-heading>{plan.name}</s-heading>
                    {isActive ? (
                      <s-badge tone="success">{i18n?.badgeCurrent || "Current"}</s-badge>
                    ) : plan.trialDays > 0 ? (
                      <s-badge tone="info">{plan.trialDays}d trial</s-badge>
                    ) : null}
                  </div>
                  <div style={{ marginTop: "4px", display: "flex", alignItems: "baseline", gap: "4px" }}>
                    <span style={{ fontSize: "22px", fontWeight: "800", color: "#1a1a1a" }}>
                      ${plan.price}
                    </span>
                    <span style={{ color: "#6d7175", fontSize: "12px" }}>{i18n?.perMonth || "/ mo"}</span>
                  </div>
                  <div style={{ marginTop: "4px" }}>
                    <s-badge tone={isStarter ? "success" : "neutral"}>
                      {plan.limit === Infinity
                        ? (i18n?.unlimitedSaves || "Unlimited saves")
                        : (i18n?.savesPerMonth ? i18n.savesPerMonth(plan.limit.toLocaleString(locale)) : `${plan.limit.toLocaleString(locale)} saves / mo`)}
                    </s-badge>
                  </div>
                </div>

                {/* Feature highlights from localized plan configuration */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px", color: "#303030" }}>
                  {plan.features?.map((feat, idx) => (
                    <div key={idx} style={{ fontWeight: idx === 0 && plan.id !== "free" ? "700" : "normal" }}>
                      ✓ {feat}
                    </div>
                  ))}
                  {plan.trialDays > 0 && (
                    <div style={{ color: "#008060" }}>
                      ✓ {i18n?.trialNote ? i18n.trialNote(plan.trialDays) : `${plan.trialDays}-day free trial`}
                    </div>
                  )}
                </div>

                {/* Action CTA Button */}
                <div style={{ marginTop: "auto", paddingTop: "4px" }}>
                  {isActive && plan.id === "free" ? (
                    <s-button variant="secondary" disabled inlineSize="fill">
                      {i18n?.activePlanBtn || "Active Plan"}
                    </s-button>
                  ) : isActive ? (
                    <fetcher.Form method="post" style={{ width: "100%" }}>
                      <input type="hidden" name="intent" value="cancel-plan" />
                      <s-button type="submit" variant="primary" tone="critical" disabled={isSubmitting} inlineSize="fill">
                        {i18n?.cancelPlan || "Cancel Plan"}
                      </s-button>
                    </fetcher.Form>
                  ) : isUpgrade ? (
                    <fetcher.Form method="post" style={{ width: "100%" }}>
                      <input type="hidden" name="intent" value="upgrade" />
                      <input type="hidden" name="planId" value={plan.id} />
                      <s-button type="submit" variant="primary" loading={isSubmitting} inlineSize="fill">
                        {i18n?.upgradeButton ? i18n.upgradeButton(plan.name) : `Upgrade to ${plan.name}`}
                      </s-button>
                    </fetcher.Form>
                  ) : isDowngrade ? (
                    <fetcher.Form method="post" style={{ width: "100%" }}>
                      <input type="hidden" name="intent" value="downgrade" />
                      <input type="hidden" name="planId" value={plan.id} />
                      <s-button type="submit" variant="tertiary" tone="neutral" disabled={isSubmitting} inlineSize="fill">
                        {i18n?.downgradeButton ? i18n.downgradeButton(plan.name) : `Downgrade to ${plan.name}`}
                      </s-button>
                    </fetcher.Form>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </s-section>

      {/* ── Compact Feature Comparison Matrix Table ── */}
      <s-section heading={i18n?.comparePlans || "Compare Features Across Plans"}>
        <div style={{ background: "#ffffff", border: "1px solid #e1e3e5", borderRadius: "8px", padding: "12px 14px" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e1e3e5", background: "#fbfcfc" }}>
                  <th style={{ padding: "7px 8px" }}>{i18n?.thFeature || "Feature"}</th>
                  <th style={{ padding: "7px 8px" }}>Free</th>
                  <th style={{ padding: "7px 8px", color: "#008060" }}>Starter ($5) ★</th>
                  <th style={{ padding: "7px 8px" }}>Growth ($10)</th>
                  <th style={{ padding: "7px 8px" }}>Unlimited ($30)</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: "1px solid #f2f4f6" }}>
                  <td style={{ padding: "6px 8px", fontWeight: "600" }}>{i18n?.fSavesQuota || "Monthly Wishlist Saves"}</td>
                  <td style={{ padding: "6px 8px" }}>100</td>
                  <td style={{ padding: "6px 8px", color: "#008060", fontWeight: "700" }}>5,000</td>
                  <td style={{ padding: "6px 8px", fontWeight: "600" }}>10,000</td>
                  <td style={{ padding: "6px 8px", fontWeight: "600" }}>{i18n?.unlimitedSaves || "Unlimited"}</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #f2f4f6" }}>
                  <td style={{ padding: "6px 8px", fontWeight: "600" }}>{i18n?.fThemeBlocks || "Storefront App Blocks"}</td>
                  <td style={{ padding: "6px 8px", color: "#008060" }}>✓</td>
                  <td style={{ padding: "6px 8px", color: "#008060" }}>✓</td>
                  <td style={{ padding: "6px 8px", color: "#008060" }}>✓</td>
                  <td style={{ padding: "6px 8px", color: "#008060" }}>✓</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #f2f4f6" }}>
                  <td style={{ padding: "6px 8px", fontWeight: "600" }}>{i18n?.fCustomCss || "Collection Grid Icons"}</td>
                  <td style={{ padding: "6px 8px", color: "#008060" }}>✓</td>
                  <td style={{ padding: "6px 8px", color: "#008060" }}>✓</td>
                  <td style={{ padding: "6px 8px", color: "#008060" }}>✓</td>
                  <td style={{ padding: "6px 8px", color: "#008060" }}>✓</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #f2f4f6" }}>
                  <td style={{ padding: "6px 8px", fontWeight: "600" }}>{i18n?.fAnalytics || "Analytics & Trends Chart"}</td>
                  <td style={{ padding: "6px 8px", color: "#8c9196" }}>{i18n?.supportStandard || "Basic"}</td>
                  <td style={{ padding: "6px 8px", color: "#008060" }}>✓ {i18n?.supportPriority || "Full"}</td>
                  <td style={{ padding: "6px 8px", color: "#008060" }}>✓ {i18n?.supportPriority || "Full"}</td>
                  <td style={{ padding: "6px 8px", color: "#008060" }}>✓ {i18n?.supportPriority || "Full"}</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #f2f4f6" }}>
                  <td style={{ padding: "6px 8px", fontWeight: "600" }}>{i18n?.fApi || "80% Email Quota Alerts"}</td>
                  <td style={{ padding: "6px 8px", color: "#008060" }}>✓ {i18n?.included || "Included"}</td>
                  <td style={{ padding: "6px 8px", color: "#008060" }}>✓ {i18n?.included || "Included"}</td>
                  <td style={{ padding: "6px 8px", color: "#008060" }}>✓ {i18n?.included || "Included"}</td>
                  <td style={{ padding: "6px 8px", color: "#008060" }}>✓ {i18n?.included || "Included"}</td>
                </tr>
                <tr>
                  <td style={{ padding: "6px 8px", fontWeight: "600" }}>{i18n?.fSupport || "Support Level"}</td>
                  <td style={{ padding: "6px 8px" }}>{i18n?.supportStandard || "Standard"}</td>
                  <td style={{ padding: "6px 8px", color: "#008060", fontWeight: "600" }}>{i18n?.supportPriority || "Priority"}</td>
                  <td style={{ padding: "6px 8px" }}>{i18n?.supportPriority || "Priority"}</td>
                  <td style={{ padding: "6px 8px" }}>{i18n?.supportDedicated || "24/7 Dedicated"}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </s-section>

      {/* ── Billing & Plan Changes Quick Guide ── */}
      <s-section heading={i18n?.guideHeading || "Billing & Plan Changes Guide"}>
        <div style={{ background: "#ffffff", border: "1px solid #e1e3e5", borderRadius: "8px", padding: "12px 14px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px" }}>
            <div style={{ padding: "8px 10px", background: "#f8f9fa", borderRadius: "6px" }}>
              <div style={{ fontWeight: "700", fontSize: "12px", color: "#202223", display: "flex", alignItems: "center", gap: "6px" }}>
                <span>⚡ {i18n?.upgradeGuideTitle || "Instant Upgrades"}</span>
              </div>
              <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#6d7175", lineHeight: "1.4" }}>
                {i18n?.upgradeGuideDesc}
              </p>
            </div>

            <div style={{ padding: "8px 10px", background: "#f8f9fa", borderRadius: "6px" }}>
              <div style={{ fontWeight: "700", fontSize: "12px", color: "#202223", display: "flex", alignItems: "center", gap: "6px" }}>
                <span>📅 {i18n?.downgradeGuideTitle || "Scheduled Downgrades"}</span>
              </div>
              <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#6d7175", lineHeight: "1.4" }}>
                {i18n?.downgradeGuideDesc}
              </p>
            </div>

            <div style={{ padding: "8px 10px", background: "#f8f9fa", borderRadius: "6px" }}>
              <div style={{ fontWeight: "700", fontSize: "12px", color: "#202223", display: "flex", alignItems: "center", gap: "6px" }}>
                <span>🚀 {i18n?.addonGuideTitle || "Boost Addons (+5k)"}</span>
              </div>
              <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#6d7175", lineHeight: "1.4" }}>
                {i18n?.addonGuideDesc}
              </p>
            </div>

            <div style={{ padding: "8px 10px", background: "#f8f9fa", borderRadius: "6px" }}>
              <div style={{ fontWeight: "700", fontSize: "12px", color: "#202223", display: "flex", alignItems: "center", gap: "6px" }}>
                <span>🔄 {i18n?.renewalGuideTitle || "30-Day Renewal"}</span>
              </div>
              <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#6d7175", lineHeight: "1.4" }}>
                {i18n?.renewalGuideDesc}
              </p>
            </div>
          </div>
        </div>
      </s-section>

      {/* ── Month-wise Plan Usage & Billing History ── */}
      <s-section heading={i18n?.historyHeading || "Month-wise Plan History & Usage"}>
        <div style={{ background: "#ffffff", border: "1px solid #e1e3e5", borderRadius: "8px", padding: "12px 14px" }}>
          <div style={{ marginBottom: "8px" }}>
            <p style={{ margin: 0, fontSize: "13px", color: "#6d7175" }}>
              {i18n?.historySubtitle || "Detailed month-by-month breakdown of plans used, purchase dates, billing period ends, and invoiced amounts."}
            </p>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e1e3e5", background: "#fbfcfc" }}>
                  <th style={{ padding: "7px 8px" }}>{i18n?.thMonth || "Billing Month"}</th>
                  <th style={{ padding: "7px 8px" }}>{i18n?.thPlan || "Plan Used"}</th>
                  <th style={{ padding: "7px 8px" }}>{i18n?.thPurchaseDate || "Purchase Date"}</th>
                  <th style={{ padding: "7px 8px" }}>{i18n?.thPeriodEnd || "Period End / Renewal"}</th>
                  <th style={{ padding: "7px 8px" }}>{i18n?.thAmount || "Amount Billed"}</th>
                  <th style={{ padding: "7px 8px" }}>{i18n?.thBillingType || "Billing Type"}</th>
                  <th style={{ padding: "7px 8px" }}>{i18n?.thStatus || "Status"}</th>
                </tr>
              </thead>
              <tbody>
                {subscriptionDetails?.monthlyBreakdown?.length > 0 ? (
                  subscriptionDetails.monthlyBreakdown.map((item) => (
                    <tr key={item.month} style={{ borderBottom: "1px solid #f2f4f6" }}>
                      <td style={{ padding: "7px 8px", whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <strong style={{ color: "#202223" }}>{item.monthLabel}</strong>
                          {item.isCurrentMonth && (
                            <s-badge tone="success">{i18n?.badgeCurrent || "Current"}</s-badge>
                          )}
                        </div>
                        <span style={{ fontSize: "11px", color: "#8c9196" }}>{item.month}</span>
                      </td>

                      <td style={{ padding: "7px 8px", whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <s-badge tone={item.planId === "free" ? "neutral" : "info"}>
                            {item.planName}
                          </s-badge>
                          <span style={{ fontSize: "12px", color: "#6d7175" }}>
                            ({Number.isFinite(item.savesLimit) ? `${item.savesLimit.toLocaleString(locale)} saves` : (i18n?.unlimitedSaves || "Unlimited")})
                          </span>
                        </div>
                        {item.addons?.length > 0 && (
                          <div style={{ fontSize: "11px", color: "#008060", marginTop: "1px" }}>
                            +{item.addons.reduce((s, a) => s + a.saves, 0).toLocaleString(locale)} addon saves
                          </div>
                        )}
                      </td>

                      <td style={{ padding: "7px 8px", whiteSpace: "nowrap" }}>
                        <span style={{ color: "#202223" }}>
                          {formatPurchaseDate(item.purchaseDate, locale) || (i18n?.appInstallation || "Active Default")}
                        </span>
                      </td>

                      <td style={{ padding: "7px 8px", whiteSpace: "nowrap" }}>
                        <span style={{ color: "#202223" }}>
                          {formatEndDate(item, locale, i18n)}
                        </span>
                      </td>

                      <td style={{ padding: "7px 8px", whiteSpace: "nowrap" }}>
                        <strong style={{ color: "#202223" }}>
                          ${item.totalAmount.toFixed(2)} {item.currency}
                        </strong>
                        {item.addons?.length > 0 && (
                          <div style={{ fontSize: "11px", color: "#6d7175" }}>
                            (${item.basePrice.toFixed(2)} plan + ${item.addons.reduce((s, a) => s + a.price, 0).toFixed(2)} addon)
                          </div>
                        )}
                      </td>

                      <td style={{ padding: "7px 8px", whiteSpace: "nowrap" }}>
                        <span style={{
                          fontSize: "12px",
                          color: "#6d7175",
                          textTransform: "capitalize"
                        }}>
                          {formatBillingType(item.purchaseType, item.planId, i18n)}
                        </span>
                      </td>

                      <td style={{ padding: "7px 8px", whiteSpace: "nowrap" }}>
                        <s-badge tone={item.status === "active" ? "success" : item.status === "cancelled" ? "warning" : "neutral"}>
                          {item.status === "active"
                            ? (i18n?.badgeActivePeriod || "Active Period")
                            : item.status === "cancelled"
                            ? (i18n?.badgeCancelled || "Cancelled")
                            : (i18n?.badgeCompleted || "Completed")}
                        </s-badge>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} style={{ padding: "12px", textAlign: "center", color: "#6d7175" }}>
                      {i18n?.noHistory || "No billing history found for this store."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </s-section>
    </s-page>
  );
}
