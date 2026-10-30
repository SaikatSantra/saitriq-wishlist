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
  scheduleFreeDowngrade,
  createAddonCharge,
  getMonthlyAddonSaves,
  ADDON,
} from "../billing.server";
import { detectLocale, createTranslator } from "../i18n.server";

const formatScheduleDate = (value) =>
  value ? new Date(value).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC") : null;

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const month = monthKey();
  const locale = detectLocale({ request, session });
  const t = createTranslator(locale);

  const [entitlementRes, usedRes, addonSavesRes] = await Promise.allSettled([
    getPlanEntitlement(shop, month, admin),
    currentUsage(shop, month),
    getMonthlyAddonSaves(shop, month),
  ]);

  const entitlement = entitlementRes.status === "fulfilled" && entitlementRes.value
    ? entitlementRes.value
    : { planId: "free", planLimit: 100 };
  const used = usedRes.status === "fulfilled" && Number.isFinite(usedRes.value) ? usedRes.value : 0;
  const addonSaves = addonSavesRes.status === "fulfilled" && Number.isFinite(addonSavesRes.value) ? addonSavesRes.value : 0;

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
      upgradeButton: (name) => t("pricing.upgradeButton", { name }),
      downgradeButton: (name) => t("pricing.downgradeButton", { name }),
      quotaUsed: t("pricing.quotaUsed"),
      extraAddonTitle: t("pricing.extraAddonTitle"),
      extraAddonDesc: t("pricing.extraAddonDesc"),
      extraAddonButton: t("pricing.extraAddonButton"),
      limitReachedWarning: t("pricing.limitReachedWarning"),
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
    if (currentPlan.scheduledPlanId === "free") {
      const effectiveAt = formatScheduleDate(currentPlan.effectiveAt) ?? currentPlan.effectiveMonth;
      return {
        success: true,
        message: `Your plan is already scheduled to end at ${effectiveAt}.`,
      };
    }

    try {
      const { effectiveAt } = await scheduleFreeDowngrade(admin, shop, currentPlan.planId);
      return {
        success: true,
        message: `Your paid plan is canceled for renewal. Your current plan remains active until ${formatScheduleDate(effectiveAt)}; Free starts then.`,
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
    if (!targetPlan || targetPlan.id === "free") {
      return { error: "Invalid plan selected." };
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
          targetPlan.name,
          targetPlan.price,
          returnUrl,
        );
        return { confirmationUrl };
      }

      const { confirmationUrl } = await createSubscription(
        admin,
        targetPlan.name,
        targetPlan.price,
        returnUrl,
        targetPlan.trialDays,
        isDowngrade,
      );
      return { confirmationUrl };
    } catch (err) {
      console.error("Subscription creation error:", err);
      return { error: "Could not start the billing flow. Please try again." };
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
    i18n,
  } = useLoaderData();
  const fetcher = useFetcher();
  const actionData = fetcher.data;
  const isSubmitting = fetcher.state !== "idle";

  const activePlan = plans.find((p) => p.id === activePlanId);
  const effectiveAtLabel = formatScheduleDate(effectiveAt) ?? effectiveMonth;

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
          +{addon.saves.toLocaleString()} saves have been added to this month&apos;s limit.
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

      {/* ── Compact Quota & Usage Bar with 80% Threshold Marker ── */}
      <s-section>
        <s-box border="base" borderRadius="base" padding="base" background="base">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <s-heading>{activePlan?.name || "Free"} Plan</s-heading>
              <s-badge tone={activePlanId === "free" ? "neutral" : "success"}>
                {activePlanId === "free" ? "Free Tier" : "Active Subscription"}
              </s-badge>
              {addonSaves > 0 && <s-badge tone="info">+{addonSaves.toLocaleString()} addon saves</s-badge>}
              <span style={{ fontSize: "13px", color: "#6d7175" }}>
                {Number.isFinite(usage.limit)
                  ? `${usage.used.toLocaleString()} / ${usage.limit.toLocaleString()} saves used this month`
                  : "Unlimited wishlist saves active"}
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {Number.isFinite(usage.limit) && (
                <s-badge tone={usedPct >= 90 ? "critical" : usedPct >= 75 ? "warning" : "success"}>
                  {usedPct}% capacity
                </s-badge>
              )}
              {activePlanId === "growth" && (
                <fetcher.Form method="post" style={{ display: "inline" }}>
                  <input type="hidden" name="intent" value="buy-addon" />
                  <s-button type="submit" variant="secondary" loading={isSubmitting}>
                    +{addon.saves.toLocaleString()} Saves Boost (${addon.price})
                  </s-button>
                </fetcher.Form>
              )}
            </div>
          </div>

          {/* Visual Progress Bar with 80% Email Threshold */}
          {Number.isFinite(usage.limit) && (
            <div style={{ position: "relative", width: "100%", height: "8px", background: "#f1f2f3", borderRadius: "4px", overflow: "visible" }}>
              <div
                style={{
                  width: `${usedPct}%`,
                  height: "100%",
                  background: usedPct >= 90 ? "#d72c0d" : usedPct >= 75 ? "#b98900" : "#008060",
                  borderRadius: "4px",
                  transition: "width 0.4s ease",
                }}
              />
              {/* 80% Alert Threshold Line */}
              <div
                style={{
                  position: "absolute",
                  left: "80%",
                  top: "-3px",
                  bottom: "-3px",
                  width: "2px",
                  background: "#d72c0d",
                  zIndex: 2,
                }}
                title="80% Email Alert Threshold (Warning email dispatched via Resend)"
              />
              <span
                style={{
                  position: "absolute",
                  left: "80%",
                  top: "10px",
                  transform: "translateX(-50%)",
                  fontSize: "10px",
                  fontWeight: "600",
                  color: "#d72c0d",
                  whiteSpace: "nowrap",
                }}
              >
                ▲ 80% Email Alert
              </span>
            </div>
          )}
        </s-box>
      </s-section>

      {/* ── Visual Store Growth & Plan Recommendation Guide ── */}
      <s-section>
        <s-box border="base" borderRadius="base" padding="base" background="base">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
            <div>
              <s-heading>Store Size & Plan Matcher</s-heading>
              <p style={{ margin: "2px 0 0 0", fontSize: "13px", color: "#6d7175" }}>
                Select the tier tailored to your monthly store traffic. All paid plans include a 7-day risk-free trial.
              </p>
            </div>
            <s-badge tone="success">7-Day Free Trial on All Paid Plans</s-badge>
          </div>

          {/* 4-Stage Visual Store Fit Cards */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "10px",
          }}>
            {/* Stage 1: Free */}
            <div style={{
              background: "#ffffff",
              border: "1px solid #d2d5d8",
              borderRadius: "8px",
              padding: "12px",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ fontSize: "14px" }}>🌱</span>
                <strong style={{ fontSize: "12px", color: "#202223", whiteSpace: "nowrap" }}>New Store / Launch</strong>
              </div>
              <div style={{ fontSize: "11px", color: "#6d7175" }}>0 – 50 orders / mo</div>
              <div style={{ marginTop: "4px", fontWeight: "700", fontSize: "13px", color: "#202223" }}>
                Free Tier ($0)
              </div>
              <div style={{ fontSize: "11px", color: "#6d7175" }}>100 saves / month</div>
            </div>

            {/* Stage 2: Starter (Highlighted) */}
            <div style={{
              background: "#fbfdfc",
              border: "2px solid #008060",
              borderRadius: "8px",
              padding: "12px",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
              boxShadow: "0 2px 8px rgba(0, 128, 96, 0.08)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "4px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "4px", minWidth: 0 }}>
                  <span style={{ fontSize: "14px" }}>🚀</span>
                  <strong style={{ fontSize: "12px", color: "#008060", whiteSpace: "nowrap" }}>Growing Brand</strong>
                </div>
                <span style={{
                  fontSize: "9px",
                  fontWeight: "700",
                  background: "#e3f1df",
                  color: "#008060",
                  padding: "1px 5px",
                  borderRadius: "4px",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                  letterSpacing: "0.2px"
                }}>
                  ★ Best Match
                </span>
              </div>
              <div style={{ fontSize: "11px", color: "#6d7175" }}>50 – 1,000 orders / mo</div>
              <div style={{ marginTop: "4px", fontWeight: "700", fontSize: "13px", color: "#008060" }}>
                Starter ($5/mo)
              </div>
              <div style={{ fontSize: "11px", color: "#008060", fontWeight: "600" }}>
                5,000 saves (50x boost) • 7d trial
              </div>
            </div>

            {/* Stage 3: Growth */}
            <div style={{
              background: "#ffffff",
              border: "1px solid #d2d5d8",
              borderRadius: "8px",
              padding: "12px",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ fontSize: "14px" }}>📈</span>
                <strong style={{ fontSize: "12px", color: "#202223", whiteSpace: "nowrap" }}>Scaling Catalog</strong>
              </div>
              <div style={{ fontSize: "11px", color: "#6d7175" }}>1,000 – 5,000 orders / mo</div>
              <div style={{ marginTop: "4px", fontWeight: "700", fontSize: "13px", color: "#202223" }}>
                Growth ($10/mo)
              </div>
              <div style={{ fontSize: "11px", color: "#6d7175" }}>
                10,000 saves • 7d trial
              </div>
            </div>

            {/* Stage 4: Unlimited */}
            <div style={{
              background: "#ffffff",
              border: "1px solid #d2d5d8",
              borderRadius: "8px",
              padding: "12px",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ fontSize: "14px" }}>👑</span>
                <strong style={{ fontSize: "12px", color: "#202223", whiteSpace: "nowrap" }}>High-Volume / Plus</strong>
              </div>
              <div style={{ fontSize: "11px", color: "#6d7175" }}>5,000+ orders / mo</div>
              <div style={{ marginTop: "4px", fontWeight: "700", fontSize: "13px", color: "#5c6ac4" }}>
                Unlimited ($30/mo)
              </div>
              <div style={{ fontSize: "11px", color: "#5c6ac4", fontWeight: "600" }}>
                Unlimited saves • 7d trial
              </div>
            </div>
          </div>
        </s-box>
      </s-section>

      {/* ── Compact 4-Tier Plan Cards Grid ── */}
      <s-section heading="Choose Your Plan">
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: "12px",
          alignItems: "stretch",
        }}>
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
                    : "1px solid #d2d5d8",
                  borderRadius: "10px",
                  padding: "16px 14px",
                  background: isStarter && !isActive
                    ? "#fbfdfc"
                    : isActive
                    ? "#f6f6f7"
                    : "#ffffff",
                  boxShadow: isStarter ? "0 4px 12px rgba(0, 128, 96, 0.12)" : "0 1px 4px rgba(0,0,0,0.04)",
                  gap: "12px",
                }}
              >
                {/* Card Header with non-overlapping inline badge */}
                <div>
                  {isStarter && (
                    <div style={{ marginBottom: "6px" }}>
                      <span style={{
                        display: "inline-block",
                        background: "#e3f1df",
                        color: "#008060",
                        fontSize: "10px",
                        fontWeight: "700",
                        padding: "2px 8px",
                        borderRadius: "6px",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px"
                      }}>
                        ★ Most Popular
                      </span>
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <s-heading>{plan.name}</s-heading>
                    {isActive ? (
                      <s-badge tone="success">Current</s-badge>
                    ) : plan.trialDays > 0 ? (
                      <s-badge tone="info">{plan.trialDays}d trial</s-badge>
                    ) : null}
                  </div>
                  <div style={{ marginTop: "6px", display: "flex", alignItems: "baseline", gap: "4px" }}>
                    <span style={{ fontSize: "26px", fontWeight: "800", color: "#1a1a1a" }}>
                      ${plan.price}
                    </span>
                    <span style={{ color: "#6d7175", fontSize: "13px" }}>/ mo</span>
                  </div>
                  <div style={{ marginTop: "4px" }}>
                    <s-badge tone={isStarter ? "success" : "neutral"}>
                      {plan.limit === Infinity ? "Unlimited saves" : `${plan.limit.toLocaleString()} saves / mo`}
                    </s-badge>
                  </div>
                </div>

                <div style={{ height: "1px", background: "#f1f2f3" }} />

                {/* Concise Feature Highlights */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px" }}>
                  {plan.id === "free" && (
                    <>
                      <div>✓ 100 saves / month</div>
                      <div>✓ All storefront theme blocks</div>
                      <div>✓ Basic activity log</div>
                      <div style={{ color: "#6d7175" }}>• Standard support</div>
                    </>
                  )}
                  {plan.id === "starter" && (
                    <>
                      <div style={{ fontWeight: "700", color: "#008060" }}>✓ 5,000 saves / month</div>
                      <div>✓ 7-day free trial</div>
                      <div>✓ Interactive analytics & charts</div>
                      <div>✓ 80% quota warning email</div>
                      <div style={{ fontWeight: "600" }}>✓ Priority merchant support</div>
                    </>
                  )}
                  {plan.id === "growth" && (
                    <>
                      <div style={{ fontWeight: "700" }}>✓ 10,000 saves / month</div>
                      <div>✓ 7-day free trial</div>
                      <div>✓ Full analytics & CSV exports</div>
                      <div>✓ One-time save boosts available</div>
                      <div>✓ Priority merchant support</div>
                    </>
                  )}
                  {plan.id === "unlimited" && (
                    <>
                      <div style={{ fontWeight: "700", color: "#5c6ac4" }}>✓ Unlimited wishlist saves</div>
                      <div>✓ 7-day free trial</div>
                      <div>✓ Unrestricted high-traffic capacity</div>
                      <div>✓ Zero rate limits</div>
                      <div style={{ fontWeight: "600" }}>✓ 24/7 dedicated support</div>
                    </>
                  )}
                </div>

                <div style={{ height: "1px", background: "#f1f2f3" }} />

                {/* Action CTA Button */}
                <div>
                  {isActive && plan.id === "free" ? (
                    <s-button variant="secondary" disabled inlineSize="fill">
                      Active Plan
                    </s-button>
                  ) : isActive ? (
                    <fetcher.Form method="post" style={{ width: "100%" }}>
                      <input type="hidden" name="intent" value="cancel-plan" />
                      <s-button type="submit" variant="primary" tone="critical" disabled={isSubmitting} inlineSize="fill">
                        Cancel Plan
                      </s-button>
                    </fetcher.Form>
                  ) : isUpgrade ? (
                    <fetcher.Form method="post" style={{ width: "100%" }}>
                      <input type="hidden" name="intent" value="upgrade" />
                      <input type="hidden" name="planId" value={plan.id} />
                      <s-button type="submit" variant="primary" loading={isSubmitting} inlineSize="fill">
                        Upgrade to {plan.name}
                      </s-button>
                    </fetcher.Form>
                  ) : isDowngrade ? (
                    <fetcher.Form method="post" style={{ width: "100%" }}>
                      <input type="hidden" name="intent" value="downgrade" />
                      <input type="hidden" name="planId" value={plan.id} />
                      <s-button type="submit" variant="tertiary" tone="neutral" disabled={isSubmitting} inlineSize="fill">
                        Downgrade to {plan.name}
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
      <s-section heading="Compare Features Across Plans">
        <s-box border="base" borderRadius="base" padding="base" background="base">
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e1e3e5" }}>
                  <th style={{ padding: "8px 12px" }}>Feature</th>
                  <th style={{ padding: "8px 12px" }}>Free</th>
                  <th style={{ padding: "8px 12px", color: "#008060" }}>Starter ($5) ★</th>
                  <th style={{ padding: "8px 12px" }}>Growth ($10)</th>
                  <th style={{ padding: "8px 12px" }}>Unlimited ($30)</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: "1px solid #f1f2f3" }}>
                  <td style={{ padding: "8px 12px", fontWeight: "600" }}>Monthly Wishlist Saves</td>
                  <td style={{ padding: "8px 12px" }}>100</td>
                  <td style={{ padding: "8px 12px", color: "#008060", fontWeight: "700" }}>5,000</td>
                  <td style={{ padding: "8px 12px", fontWeight: "600" }}>10,000</td>
                  <td style={{ padding: "8px 12px", fontWeight: "600" }}>Unlimited</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #f1f2f3" }}>
                  <td style={{ padding: "8px 12px", fontWeight: "600" }}>Storefront App Blocks</td>
                  <td style={{ padding: "8px 12px", color: "#008060" }}>✓</td>
                  <td style={{ padding: "8px 12px", color: "#008060" }}>✓</td>
                  <td style={{ padding: "8px 12px", color: "#008060" }}>✓</td>
                  <td style={{ padding: "8px 12px", color: "#008060" }}>✓</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #f1f2f3" }}>
                  <td style={{ padding: "8px 12px", fontWeight: "600" }}>Collection Grid Icons</td>
                  <td style={{ padding: "8px 12px", color: "#008060" }}>✓</td>
                  <td style={{ padding: "8px 12px", color: "#008060" }}>✓</td>
                  <td style={{ padding: "8px 12px", color: "#008060" }}>✓</td>
                  <td style={{ padding: "8px 12px", color: "#008060" }}>✓</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #f1f2f3" }}>
                  <td style={{ padding: "8px 12px", fontWeight: "600" }}>Analytics & Trends Chart</td>
                  <td style={{ padding: "8px 12px", color: "#8c9196" }}>Basic</td>
                  <td style={{ padding: "8px 12px", color: "#008060" }}>✓ Full</td>
                  <td style={{ padding: "8px 12px", color: "#008060" }}>✓ Full</td>
                  <td style={{ padding: "8px 12px", color: "#008060" }}>✓ Full</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #f1f2f3" }}>
                  <td style={{ padding: "8px 12px", fontWeight: "600" }}>80% Email Quota Alerts</td>
                  <td style={{ padding: "8px 12px", color: "#008060" }}>✓ Included</td>
                  <td style={{ padding: "8px 12px", color: "#008060" }}>✓ Included</td>
                  <td style={{ padding: "8px 12px", color: "#008060" }}>✓ Included</td>
                  <td style={{ padding: "8px 12px", color: "#008060" }}>✓ Included</td>
                </tr>
                <tr>
                  <td style={{ padding: "8px 12px", fontWeight: "600" }}>Support Level</td>
                  <td style={{ padding: "8px 12px" }}>Standard</td>
                  <td style={{ padding: "8px 12px", color: "#008060", fontWeight: "600" }}>Priority</td>
                  <td style={{ padding: "8px 12px" }}>Priority</td>
                  <td style={{ padding: "8px 12px" }}>24/7 Dedicated</td>
                </tr>
              </tbody>
            </table>
          </div>
        </s-box>
      </s-section>
    </s-page>
  );
}
