import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { PLANS } from "../plans";
import { getAnalytics, monthlyLimit } from "../metaobjects.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const analytics = await getAnalytics(admin, new Date().toISOString().slice(0, 7));
  return {
    plans: PLANS,
    usage: { used: analytics.adds, limit: monthlyLimit("free") },
  };
};

export default function PricingPage() {
  const { plans, usage } = useLoaderData();
  return (
    <s-page heading="Pricing">
      <s-section heading="Monthly wishlist usage">
        <s-paragraph>
          {usage.used} wishlist saves used this month. {usage.limit === Infinity ? "Unlimited saves remain." : `${Math.max(0, usage.limit - usage.used)} saves remain.`}
        </s-paragraph>
      </s-section>
      <s-section heading="Choose a plan">
        <s-stack direction="inline" gap="base">
          {plans.map((plan) => (
            <s-box key={plan.id} padding="base" borderWidth="base" borderRadius="base" background="subdued">
              <s-heading>{plan.name}</s-heading>
              <s-paragraph>{plan.limit === Infinity ? "Unlimited" : `${plan.limit} wishlist saves`} per month</s-paragraph>
              <s-paragraph>${plan.price} per month</s-paragraph>
              <s-paragraph>{plan.description}</s-paragraph>
              <s-button variant={plan.id === "free" ? "primary" : "secondary"} disabled={plan.id === "free"}>{plan.id === "free" ? "Current plan" : "Contact us to upgrade"}</s-button>
            </s-box>
          ))}
        </s-stack>
      </s-section>
    </s-page>
  );
}
