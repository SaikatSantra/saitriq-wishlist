import { redirect } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { PLANS } from "../plans";
import { currentUsage } from "../db.wishlist.server";
import {
  getActivePlan,
  createSubscription,
  downgradeToFree,
} from "../billing.server";

const monthKey = () => new Date().toISOString().slice(0, 7);

// ─── Loader ───────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const month = monthKey();

  const [activePlanId, used] = await Promise.all([
    getActivePlan(shop, admin),
    currentUsage(shop, month),
  ]);

  const activePlan = PLANS.find((p) => p.id === activePlanId) ?? PLANS[0];
  const limit = activePlan.limit;

  return {
    plans: PLANS,
    activePlanId,
    usage: {
      used,
      limit,
      remaining: Number.isFinite(limit) ? Math.max(0, limit - used) : null,
    },
  };
};

export const headers = () => ({ "Cache-Control": "no-store, max-age=0" });

// ─── Action ───────────────────────────────────────────────────────────────────

export const action = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent");
  const planId = String(formData.get("planId") || "");

  // Downgrade to free
  if (intent === "downgrade") {
    await downgradeToFree(admin, shop);
    return { success: true, message: "You are now on the Free plan." };
  }

  // Upgrade to paid plan
  if (intent === "upgrade") {
    const plan = PLANS.find((p) => p.id === planId);
    if (!plan || plan.price === 0) {
      return { error: "Invalid plan selected." };
    }

    const appUrl = process.env.SHOPIFY_APP_URL || "";
    const returnUrl = `${appUrl}/app/billing?planId=${planId}&shop=${shop}`;

    try {
      const { confirmationUrl } = await createSubscription(
        admin,
        planId,
        returnUrl,
      );
      return redirect(confirmationUrl);
    } catch (err) {
      console.error("Subscription creation error:", err);
      return { error: "Could not start the billing flow. Please try again." };
    }
  }

  return { error: "Unknown action." };
};

// ─── UI ───────────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const { plans, activePlanId, usage } = useLoaderData();
  const fetcher = useFetcher();
  const actionData = fetcher.data;
  const isSubmitting = fetcher.state !== "idle";

  return (
    <s-page heading="Pricing">

      <s-section heading="Current usage">
        <s-stack direction="inline" gap="base">
          <s-box background="subdued" borderRadius="base" padding="base">
            <s-paragraph>Wishlist saves used this month</s-paragraph>
            <s-paragraph>{usage.used}</s-paragraph>
          </s-box>
          <s-box background="subdued" borderRadius="base" padding="base">
            <s-paragraph>Saves remaining</s-paragraph>
            <s-paragraph>
              {usage.remaining === null ? "Unlimited" : usage.remaining}
            </s-paragraph>
          </s-box>
          <s-box background="subdued" borderRadius="base" padding="base">
            <s-paragraph>Current plan</s-paragraph>
            <s-paragraph>
              {plans.find((p) => p.id === activePlanId)?.name ?? "Free"}
            </s-paragraph>
          </s-box>
        </s-stack>
      </s-section>

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

      <s-section heading="Plans">
        <s-stack direction="inline" gap="base" wrap>
          {plans.map((plan) => {
            const isActive = plan.id === activePlanId;
            const isDowngrade = plan.price < (plans.find((p) => p.id === activePlanId)?.price ?? 0);
            const isUpgrade = !isActive && !isDowngrade;

            return (
              <s-box
                key={plan.id}
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background={isActive ? "strong" : "subdued"}
                minWidth="220px"
              >
                <s-stack direction="block" gap="small">
                  <s-heading>{plan.name}</s-heading>
                  <s-paragraph>
                    {plan.price === 0 ? "Free" : `$${plan.price} / month`}
                  </s-paragraph>
                  <s-paragraph>
                    {plan.limit === Infinity
                      ? "Unlimited wishlist saves"
                      : `${plan.limit.toLocaleString()} saves / month`}
                  </s-paragraph>
                  <s-paragraph>{plan.description}</s-paragraph>

                  <s-stack direction="block" gap="extraSmall">
                    {plan.features.map((f) => (
                      <s-paragraph key={f}>✓ {f}</s-paragraph>
                    ))}
                  </s-stack>

                  {plan.trialDays > 0 && !isActive && (
                    <s-paragraph>{plan.trialDays}-day free trial</s-paragraph>
                  )}

                  {isActive ? (
                    <s-button variant="primary" disabled>
                      Current plan
                    </s-button>
                  ) : isDowngrade ? (
                    <fetcher.Form method="post">
                      <input type="hidden" name="intent" value="downgrade" />
                      <input type="hidden" name="planId" value={plan.id} />
                      <s-button
                        type="submit"
                        variant="secondary"
                        disabled={isSubmitting}
                      >
                        Downgrade to Free
                      </s-button>
                    </fetcher.Form>
                  ) : (
                    <fetcher.Form method="post">
                      <input type="hidden" name="intent" value="upgrade" />
                      <input type="hidden" name="planId" value={plan.id} />
                      <s-button
                        type="submit"
                        variant="primary"
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? "Redirecting…" : `Upgrade to ${plan.name}`}
                      </s-button>
                    </fetcher.Form>
                  )}
                </s-stack>
              </s-box>
            );
          })}
        </s-stack>
      </s-section>

      <s-section heading="Billing notes">
        <s-unordered-list>
          <s-list-item>
            Paid plans are billed monthly through Shopify. You can cancel at any time
            and your plan stays active until the end of the billing period.
          </s-list-item>
          <s-list-item>
            Growth and Unlimited plans include a {plans.find((p) => p.id === "growth")?.trialDays}-day
            free trial. You will not be charged until the trial ends.
          </s-list-item>
          <s-list-item>
            Downgrading to Free takes effect immediately. Any saves above 100 per month
            will no longer be accepted until the next billing cycle begins.
          </s-list-item>
          <s-list-item>
            Monthly save counts reset on the first day of each calendar month.
          </s-list-item>
        </s-unordered-list>
      </s-section>

    </s-page>
  );
}
