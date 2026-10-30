import { useEffect } from "react";
import { useLoaderData, useRevalidator } from "react-router";
import { authenticate } from "../shopify.server";
import { getAnalyticsHistory } from "../db.wishlist.server";
import { detectLocale, createTranslator } from "../i18n.server";

const monthKey = () => new Date().toISOString().slice(0, 7);

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const month = monthKey();
  const locale = detectLocale({ request, session });
  const t = createTranslator(locale);

  const history = await getAnalyticsHistory(session.shop, month);
  const maxAdds = Math.max(1, ...history.map((e) => e.adds));

  return {
    month,
    history,
    maxAdds,
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
  const { month, history, maxAdds, translations } = useLoaderData();
  const revalidator = useRevalidator();

  useEffect(() => {
    const timer = window.setInterval(() => revalidator.revalidate(), 10000);
    return () => window.clearInterval(timer);
  }, [revalidator]);

  const renderSaves = (count) => translations.savesLabel.replace("{count}", String(count));
  const renderRemovals = (count) => translations.removalsLabel.replace("{count}", String(count));

  return (
    <s-page heading={translations.title}>
      <s-section heading={translations.dailySavesHeading}>
        {history.length === 0 ? (
          <s-banner tone="info" heading={translations.noActivityHeading}>
            {translations.noActivityMessage}
          </s-banner>
        ) : (
          <s-grid gap="small">
            {history.map((entry) => (
              <s-box key={entry.day} border="base" borderRadius="base" padding="base">
                <s-grid gap="small-200">
                  <s-stack direction="inline" gap="base" alignItems="center">
                    <s-text>{entry.day}</s-text>
                    <s-badge tone="success">{renderSaves(entry.adds)}</s-badge>
                    {entry.removes > 0 && (
                      <s-badge tone="neutral">{renderRemovals(entry.removes)}</s-badge>
                    )}
                  </s-stack>
                  {/* Bar chart */}
                  <s-stack direction="inline" gap="small-200">
                    {Array.from({ length: 10 }, (_, i) => (
                      <s-box
                        key={`${entry.day}-bar-${i}`}
                        padding="small"
                        borderRadius="base"
                        background={
                          i < Math.ceil((entry.adds / maxAdds) * 10)
                            ? "strong"
                            : "subdued"
                        }
                      />
                    ))}
                  </s-stack>
                </s-grid>
              </s-box>
            ))}
          </s-grid>
        )}
      </s-section>
    </s-page>
  );
}
