import { redirect } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { useEffect } from "react";
import { authenticate } from "../shopify.server";
import { PLANS } from "../plans";
import { currentUsage } from "../db.wishlist.server";
import {
  getActivePlan,
  createSubscription,
  downgradeToFree,
  createAddonCharge,
  getMonthlyAddonSaves,
  ADDON,
} from "../billing.server";

const monthKey = () => new Date().toISOString().slice(0, 7);

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const month = monthKey();

  const [activePlanId, used, addonSaves] = await Promise.all([
    getActivePlan(shop, admin),
    currentUsage(shop, month),
    getMonthlyAddonSaves(shop, month),
  ]);

  const activePlan = PLANS.find((p) => p.id === activePlanId) ?? PLANS[0];
  const planLimit = activePlan.limit;
  const effectiveLimit = Number.isFinite(planLimit) ? planLimit + addonSaves : Infinity;

  // read query params for post-purchase feedback
  const url = new URL(request.url);
  const addonStatus = url.searchParams.get("addon"); // activated | declined | error
  const planActivated = url.searchParams.get("activated") === "1";
  const planDeclined = url.searchParams.get("declined") === "1";

  return {
    plans: PLANS,
    activePlanId,
    addonSaves,
    addon: ADDON,
    addonStatus,
    planActivated,
    planDeclined,
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

  if (intent === "downgrade") {
    await downgradeToFree(admin, shop);
    return { success: true, message: "You are now on the Free plan." };
  }

  if (intent === "upgrade") {
    const plan = PLANS.find((p) => p.id === planId);
    if (!plan || plan.price === 0) return { error: "Invalid plan selected." };

    // Build return URL from the incoming request origin so it works
    // in both local dev (Shopify CLI tunnel) and production (Vercel)
    const origin = new URL(request.url).origin;
    const appUrl = process.env.SHOPIFY_APP_URL || origin;
    const returnUrl = `${appUrl}/app/billing?planId=${planId}&shop=${shop}`;

    console.log("[BILLING] Return URL:", returnUrl);

    try {
      const { confirmationUrl } = await createSubscription(admin, planId, returnUrl);
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
    const appUrl = process.env.SHOPIFY_APP_URL || origin;
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
  const { plans, activePlanId, usage, addonSaves, addon, addonStatus } = useLoaderData();
  const fetcher = useFetcher();
  const actionData = fetcher.data;
  const isSubmitting = fetcher.state !== "idle";

  const activePlan = plans.find((p) => p.id === activePlanId);

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
    const isPostBilling = params.get("activated") === "1" || params.get("addon") === "activated";
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
          </s-box>
        </s-grid>
      </s-section>

      {/* ── Feedback banners ── */}
      {addonStatus === "activated" && (
        <s-banner tone="success" heading="Addon activated">
          +{addon.saves.toLocaleString()} saves have been added to this month's limit.
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
                    {plan.limit === Infinity
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
                {isActive ? (
                  <s-button variant="secondary" disabled inlineSize="fill">
                    Current plan
                  </s-button>
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
                      Downgrade to Free
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
            Paid plans are billed monthly through Shopify. You can cancel at any time and your
            plan stays active until the end of the billing period.
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
            Downgrading to Free takes effect immediately. Saves above 100/month will be declined
            until the next calendar month begins.
          </s-paragraph>
          <s-paragraph>
            Monthly save counts reset on the first day of each calendar month.
          </s-paragraph>
        </s-grid>
      </s-section>

    </s-page>
  );
}
