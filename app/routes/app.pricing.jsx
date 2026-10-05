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

const formatScheduleDate = (value) =>
  value ? new Date(value).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC") : null;

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const month = monthKey();

  const [entitlement, used, addonSaves] = await Promise.all([
    getPlanEntitlement(shop, month, admin),
    currentUsage(shop, month),
    getMonthlyAddonSaves(shop, month),
  ]);

  const activePlanId = entitlement.planId;
  const planLimit = entitlement.planLimit;
  const effectiveLimit = Number.isFinite(planLimit) ? planLimit + addonSaves : Infinity;

  // read query params for post-purchase feedback
  const url = new URL(request.url);
  const addonStatus = url.searchParams.get("addon"); // activated | declined | error
  const planActivated = url.searchParams.get("activated") === "1";
  const planDeclined = url.searchParams.get("declined") === "1";
  const planScheduled = url.searchParams.get("scheduled") === "1";
  const billingError = url.searchParams.get("billingError") === "1";
  const allocationAdded = url.searchParams.get("allocationAdded") === "1";

  return {
    plans: PLANS,
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
    usage: {
      used,
      limit: effectiveLimit,
      planLimit,
      remaining: Number.isFinite(effectiveLimit) ? Math.max(0, effectiveLimit - used) : null,
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

  if (intent === "downgrade") {
    if (!targetPlan || (PLAN_RANK[planId] ?? 0) >= (PLAN_RANK[currentPlan.planId] ?? 0)) {
      return { error: "Select a lower plan to schedule a downgrade." };
    }
    if (currentPlan.scheduledPlanId === planId) {
      const effectiveAt = formatScheduleDate(currentPlan.effectiveAt) ?? currentPlan.effectiveMonth;
      return {
        success: true,
        message: `${targetPlan.name} is already scheduled for ${effectiveAt}.`,
      };
    }

    if (planId === "free") {
      try {
        const { effectiveAt } = await scheduleFreeDowngrade(admin, shop, currentPlan.planId);
        return {
          success: true,
          message: `Free starts at ${formatScheduleDate(effectiveAt)}. Your current plan remains active until then.`,
        };
      } catch (err) {
        console.error("Free downgrade scheduling error:", err);
        return { error: "Could not schedule the Free plan. Please try again." };
      }
    }

    try {
      const { confirmationUrl } = await createSubscription(
        admin,
        planId,
        makeReturnUrl("downgrade"),
        "APPLY_ON_NEXT_BILLING_CYCLE",
        0,
      );
      return { confirmationUrl };
    } catch (err) {
      console.error("Plan downgrade subscription error:", err);
      return { error: "Could not start the plan change. Please try again." };
    }
  }

  if (intent === "buy-plan") {
    if (
      !targetPlan ||
      targetPlan.id !== currentPlan.planId ||
      !Number.isFinite(targetPlan.limit)
    ) {
      return { error: "Extra allocations are only available for your current finite plan." };
    }

    try {
      const { confirmationUrl } = await createPlanAllocationCharge(
        admin,
        planId,
        makeReturnUrl("extra"),
      );
      return { confirmationUrl };
    } catch (err) {
      console.error("Plan allocation charge error:", err);
      return { error: "Could not start the extra allocation purchase. Please try again." };
    }
  }

  if (intent === "upgrade") {
    if (!targetPlan || targetPlan.price === 0) return { error: "Invalid plan selected." };
    if ((PLAN_RANK[planId] ?? 0) < (PLAN_RANK[currentPlan.planId] ?? 0)) {
      return { error: "Choose the downgrade action to schedule a lower plan." };
    }

    try {
      const { confirmationUrl } = await createSubscription(
        admin,
        planId,
        makeReturnUrl("purchase"),
        "APPLY_IMMEDIATELY",
        currentPlan.planId === "free" ? targetPlan.trialDays : 0,
      );
      // Return the URL to the client — the frontend will open it in the top frame
      // to avoid X-Frame-Options: deny from admin.shopify.com
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
  } = useLoaderData();
  const fetcher = useFetcher();
  const actionData = fetcher.data;
  const isSubmitting = fetcher.state !== "idle";

  const activePlan = plans.find((p) => p.id === activePlanId);
  const effectiveAtLabel = formatScheduleDate(effectiveAt) ?? effectiveMonth;

  // When server returns a confirmationUrl, break out of the iframe
  // and open it in the top-level window (required by Shopify)
  useEffect(() => {
    if (actionData?.confirmationUrl) {
      window.top.location.href = actionData.confirmationUrl;
    }
  }, [actionData?.confirmationUrl]);

  // After billing redirect, page may load blank outside embedded context.
  // Reload once to re-establish App Bridge session.
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

  return (
    <s-page heading="Pricing">

      {/* ── Usage summary ── */}
      <s-section heading="Current usage">
        <s-grid
          gridTemplateColumns="@container (inline-size <= 400px) 1fr, 1fr auto 1fr auto 1fr"
          gap="small"
        >
          <s-box padding="base">
            <s-grid gap="small-300">
              <s-text color="subdued">Plan</s-text>
              <s-stack direction="inline" gap="small-200" alignItems="center">
                <s-heading>{activePlan?.name ?? "Free"}</s-heading>
                {activePlanId !== "free" && <s-badge tone="success">Paid</s-badge>}
              </s-stack>
            </s-grid>
          </s-box>
          <s-divider direction="block" />
          <s-box padding="base">
            <s-grid gap="small-300">
              <s-text color="subdued">Saves used</s-text>
              <s-heading>{usage.used}</s-heading>
            </s-grid>
          </s-box>
          <s-divider direction="block" />
          <s-box padding="base">
            <s-grid gap="small-300">
              <s-text color="subdued">Remaining</s-text>
              <s-stack direction="inline" gap="small-200" alignItems="center">
                <s-heading>{usage.remaining === null ? "Unlimited" : usage.remaining}</s-heading>
                {addonSaves > 0 && (
                  <s-badge tone="info">+{addonSaves.toLocaleString()} addon</s-badge>
                )}
              </s-stack>
            </s-grid>
            <s-text color="subdued">
              {Number.isFinite(usage.limit)
                ? `${usage.limit.toLocaleString()} total saves this month`
                : "Unlimited saves this month"}
            </s-text>
          </s-box>
        </s-grid>
      </s-section>

      {scheduledPlanId && (
        <s-banner tone="info" heading={`${plans.find((plan) => plan.id === scheduledPlanId)?.name ?? "New plan"} starts ${effectiveAtLabel}`}>
          Your current plan remains active until {effectiveAtLabel}; the scheduled plan starts then.
        </s-banner>
      )}

      {/* ── Feedback banners ── */}
      {addonStatus === "activated" && (
        <s-banner tone="success" heading="Addon activated">
          +{addon.saves.toLocaleString()} saves have been added to this month&apos;s limit.
        </s-banner>
      )}
      {addonStatus === "declined" && (
        <s-banner tone="warning" heading="Purchase declined">
          The addon purchase was cancelled. Your plan limit is unchanged.
        </s-banner>
      )}
      {addonStatus === "error" && (
        <s-banner tone="critical" heading="Purchase error">
          Something went wrong activating the addon. Please contact support.
        </s-banner>
      )}
      {planActivated && (
        <s-banner tone="success" heading="Plan activated">
          Your plan and monthly save limit have been updated.
        </s-banner>
      )}
      {allocationAdded && (
        <s-banner tone="success" heading="Plan allocation added">
          You now have {purchaseCount} allocations and {usage.planLimit.toLocaleString()} saves this month.
        </s-banner>
      )}
      {planScheduled && (
        <s-banner tone="success" heading="Plan change scheduled">
          Your current plan remains active until {effectiveAtLabel}. The selected plan starts then.
        </s-banner>
      )}
      {planDeclined && (
        <s-banner tone="warning" heading="Purchase not completed">
          No plan change was made.
        </s-banner>
      )}
      {billingError && (
        <s-banner tone="critical" heading="Could not confirm the purchase">
          You are back on Pricing, but the plan status could not be confirmed. Refresh the page or contact support.
        </s-banner>
      )}
      {actionData?.error && (
        <s-banner tone="critical" heading="Billing error">
          {actionData.error}
        </s-banner>
      )}
      {actionData?.success && (
        <s-banner tone="success" heading="Plan updated">
          {actionData.message}
        </s-banner>
      )}

      {/* ── Addon card (Growth plan only) ── */}
      {activePlanId === "growth" && (
        <s-section heading="Need more saves this month?">
          <s-box border="base" borderRadius="base" padding="base">
            <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
              <s-grid gap="small-200">
                <s-stack direction="inline" gap="small-200" alignItems="center">
                  <s-heading>+{addon.saves.toLocaleString()} saves</s-heading>
                  <s-badge tone="info">One-time</s-badge>
                </s-stack>
                <s-paragraph>
                  Buy an extra {addon.saves.toLocaleString()} saves for this calendar month only.
                  You can purchase this multiple times — they stack.
                  Unused saves don&apos;t carry over to next month.
                </s-paragraph>
                <s-paragraph>
                  <strong>${addon.price} one-time charge</strong> · billed immediately through Shopify
                </s-paragraph>
              </s-grid>
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="buy-addon" />
                <s-button
                  type="submit"
                  variant="primary"
                  loading={isSubmitting}
                >
                  Buy +{addon.saves.toLocaleString()} saves
                </s-button>
              </fetcher.Form>
            </s-grid>
            {addonSaves > 0 && (
              <s-banner tone="info" heading={`${addonSaves.toLocaleString()} addon saves active this month`}>
                Your effective limit this month is {(usage.planLimit + addonSaves).toLocaleString()} saves
                ({usage.planLimit.toLocaleString()} plan + {addonSaves.toLocaleString()} addon).
              </s-banner>
            )}
          </s-box>
        </s-section>
      )}

      {/* ── Plan cards ── */}
      <s-section heading="Choose a plan">
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "16px",
          alignItems: "stretch",
        }}>
          {plans.map((plan) => {
            const isActive = plan.id === activePlanId;
            const activePlanPrice = activePlan?.price ?? 0;
            const isDowngrade = plan.price < activePlanPrice && !isActive;
            const isUpgrade = plan.price > activePlanPrice && !isActive;

            return (
              <div
                key={plan.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  border: isActive ? "2px solid #008060" : "1px solid #e1e3e5",
                  borderRadius: "12px",
                  padding: "20px",
                  background: isActive ? "#f6fef9" : "#ffffff",
                  gap: "16px",
                }}
              >
                {/* Header */}
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <s-heading>{plan.name}</s-heading>
                    {isActive && <s-badge tone="success">Current plan</s-badge>}
                    {isActive && purchaseCount > 1 && (
                      <s-badge tone="info">{purchaseCount} allocations</s-badge>
                    )}
                    {plan.trialDays > 0 && !isActive && (
                      <s-badge tone="info">{plan.trialDays}-day free trial</s-badge>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
                    {plan.price === 0 ? (
                      <s-text>Free forever</s-text>
                    ) : (
                      <>
                        <span style={{ fontSize: "24px", fontWeight: "700", color: "#202223" }}>${plan.price}</span>
                        <s-text color="subdued">/ month</s-text>
                      </>
                    )}
                  </div>
                  <s-text color="subdued">
                    {plan.id === activePlanId && Number.isFinite(usage.planLimit)
                      ? `${usage.planLimit.toLocaleString()} saves active this month`
                      : plan.limit === Infinity
                      ? "Unlimited saves / month"
                      : `${plan.limit.toLocaleString()} saves / month`}
                  </s-text>
                </div>

                {/* Divider */}
                <div style={{ height: "1px", background: "#e1e3e5" }} />

                {/* Features — flex:1 pushes button to bottom */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "10px" }}>
                  {plan.features.map((f) => (
                    <div key={f} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ color: "#008060", fontSize: "16px" }}>✓</span>
                      <s-text>{f}</s-text>
                    </div>
                  ))}
                </div>

                {/* Divider */}
                <div style={{ height: "1px", background: "#e1e3e5" }} />

                {/* Button — always at bottom */}
                {isActive && plan.id === "free" ? (
                  <s-button variant="secondary" disabled>
                    Current plan
                  </s-button>
                ) : isActive && scheduledPlanId === "free" ? (
                  <s-button variant="secondary" disabled>
                    Cancellation scheduled
                  </s-button>
                ) : isActive ? (
                  <fetcher.Form
                    method="post"
                    style={{ display: "grid", gridTemplateColumns: "1fr" }}
                  >
                    <input type="hidden" name="intent" value="cancel-plan" />
                    <s-button
                      type="submit"
                      variant="primary"
                      tone="critical"
                      disabled={isSubmitting}
                    >
                      Cancel plan
                    </s-button>
                  </fetcher.Form>
                ) : isUpgrade ? (
                  <fetcher.Form method="post">
                    <input type="hidden" name="intent" value="upgrade" />
                    <input type="hidden" name="planId" value={plan.id} />
                    <s-button
                      type="submit"
                      variant="primary"
                      loading={isSubmitting}
                      inlineSize="fill"
                    >
                      Upgrade to {plan.name}
                    </s-button>
                  </fetcher.Form>
                ) : plan.id === scheduledPlanId ? (
                  <s-button variant="secondary" disabled>
                    Scheduled for {effectiveMonth}
                  </s-button>
                ) : isDowngrade ? (
                  <fetcher.Form method="post">
                    <input type="hidden" name="intent" value="downgrade" />
                    <input type="hidden" name="planId" value={plan.id} />
                    <s-button
                      type="submit"
                      variant="tertiary"
                      tone="critical"
                      disabled={isSubmitting}
                      inlineSize="fill"
                    >
                      Downgrade to {plan.name}
                    </s-button>
                  </fetcher.Form>
                ) : null}
              </div>
            );
          })}
        </div>
      </s-section>

      {/* ── Billing notes ── */}
      <s-section heading="Billing notes">
        <s-grid gap="small-200">
          <s-paragraph>
            Paid plans are billed through Shopify. Canceling stops renewal; your current
            calendar-month plan limit stays active through month-end, then the Free limit applies.
          </s-paragraph>
          <s-paragraph>
            Growth and Unlimited plans include a {plans.find((p) => p.id === "growth")?.trialDays}-day
            free trial. You will not be charged until the trial ends.
          </s-paragraph>
          <s-paragraph>
            <strong>When the monthly save limit is reached</strong>, new wishlist adds are
            declined for the rest of that calendar month. Existing saved items are unaffected —
            shoppers can still view and remove their wishlist. The limit resets on the 1st of
            the next month. If you expect high volume mid-month, upgrade before the limit is hit.
          </s-paragraph>
          <s-paragraph>
            A lower paid plan or Free cancellation takes effect at the end of your current Shopify
            subscription period, shown above. This may be mid-month. Until then, the current plan
            remains active. Buying the same finite plan more than once stacks its monthly saves.
                              Scheduled for {effectiveAtLabel}
          </s-paragraph>
          <s-paragraph>
            Monthly save counts reset on the first day of each calendar month.
          </s-paragraph>
        </s-grid>
      </s-section>

    </s-page>
  );
}
