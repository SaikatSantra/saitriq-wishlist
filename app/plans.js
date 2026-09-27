// ─── Plan definitions ─────────────────────────────────────────────────────────
// These are the single source of truth for plan IDs, limits, and prices.
// The `id` must match exactly what is passed to Shopify Billing API as the plan name.

export const PLANS = [
  {
    id: "free",
    name: "Free",
    price: 0,
    limit: 100,
    description: "Perfect for stores just getting started.",
    features: ["100 wishlist saves per month", "All storefront blocks", "Basic analytics"],
    trialDays: 0,
  },
  {
    id: "growth",
    name: "Growth",
    price: 10,
    limit: 10000,
    description: "For growing stores with active shoppers.",
    features: ["10,000 wishlist saves per month", "All storefront blocks", "Full analytics", "Priority support"],
    trialDays: 7,
  },
  {
    id: "unlimited",
    name: "Unlimited",
    price: 30,
    limit: Infinity,
    description: "No limits. For high-volume stores.",
    features: ["Unlimited wishlist saves", "All storefront blocks", "Full analytics", "Priority support"],
    trialDays: 7,
  },
];

export const PLAN_MAP = Object.fromEntries(PLANS.map((p) => [p.id, p]));

/** Returns the monthly save limit for a given plan id */
export const monthlyLimit = (planId) => PLAN_MAP[planId]?.limit ?? PLAN_MAP.free.limit;

/** Returns the full plan object, falling back to free */
export const getPlan = (planId) => PLAN_MAP[planId] ?? PLAN_MAP.free;
