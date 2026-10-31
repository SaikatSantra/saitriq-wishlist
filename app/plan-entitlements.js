import { monthlyLimit } from "./plans.js";

export const PLAN_RANK = { free: 0, starter:1, growth: 2, unlimited: 3 };

export const higherPlan = (firstPlanId, secondPlanId) =>
  (PLAN_RANK[secondPlanId] ?? 0) > (PLAN_RANK[firstPlanId] ?? 0)
    ? secondPlanId
    : firstPlanId;

export const resolvePlanEntitlement = ({
  activePlanId,
  month,
  scheduled,
  purchases,
  now = new Date(),
}) => {
  const scheduledEffectiveAt = scheduled?.effectiveAt
    ? new Date(scheduled.effectiveAt)
    : null;
  const scheduleStarted = scheduled && (scheduledEffectiveAt
    ? now >= scheduledEffectiveAt
    : month >= scheduled.effectiveMonth);
  const basePlanId = scheduled
    ? (scheduleStarted ? scheduled.planId : (activePlanId && activePlanId !== "free" ? activePlanId : scheduled.previousPlanId || activePlanId || "free"))
    : (activePlanId || "free");

  const purchasedPlanId = purchases.reduce(
    (highest, purchase) => higherPlan(highest, purchase.planId),
    "free",
  );
  const planId = scheduleStarted
    ? scheduled.planId
    : (activePlanId === "free" && !scheduled ? "free" : higherPlan(basePlanId, purchasedPlanId));
  const basePurchaseCount = purchases.filter(
    (purchase) => purchase.planId === planId && purchase.purchaseType === "base",
  ).length;
  const extraPurchaseCount = purchases.filter(
    (purchase) => purchase.planId === planId && purchase.purchaseType === "extra",
  ).length;
  const purchaseCount = Math.max(1, basePurchaseCount) + extraPurchaseCount;
  const limit = monthlyLimit(planId);

  return {
    planId,
    planLimit: Number.isFinite(limit) ? limit * purchaseCount : Infinity,
    purchaseCount,
    scheduledPlanId: scheduled && !scheduleStarted ? scheduled.planId : null,
    effectiveMonth: scheduled && !scheduleStarted
      ? scheduledEffectiveAt?.toISOString().slice(0, 7) ?? scheduled.effectiveMonth
      : null,
    effectiveAt: scheduled && !scheduleStarted
      ? scheduledEffectiveAt?.toISOString() ?? null
      : null,
  };
};