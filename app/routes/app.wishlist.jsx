import { useEffect } from "react";
import { useLoaderData, useRevalidator } from "react-router";
import { authenticate } from "../shopify.server";
import { getAnalyticsHistory } from "../db.wishlist.server";

const monthKey = () => new Date().toISOString().slice(0, 7);

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const month = monthKey();
  const history = await getAnalyticsHistory(session.shop, month);
  const maxAdds = Math.max(1, ...history.map((e) => e.adds));
  return { month, history, maxAdds };
};

export default function WishlistOverview() {
  const { month, history, maxAdds } = useLoaderData();
  const revalidator = useRevalidator();

  useEffect(() => {
    const timer = window.setInterval(() => revalidator.revalidate(), 10000);
    return () => window.clearInterval(timer);
  }, [revalidator]);

  return (
    <s-page heading="Wishlist activity">

      <s-section heading={`Daily saves · ${month}`}>
        {history.length === 0 ? (
          <s-banner tone="info" heading="No activity yet">
            Daily wishlist saves will appear here after shoppers save products.
          </s-banner>
        ) : (
          <s-grid gap="small">
            {history.map((entry) => (
              <s-box key={entry.day} border="base" borderRadius="base" padding="base">
                <s-grid gap="small-200">
                  <s-stack direction="inline" gap="base" alignItems="center">
                    <s-text>{entry.day}</s-text>
                    <s-badge tone="success">{entry.adds} saves</s-badge>
                    {entry.removes > 0 && (
                      <s-badge tone="neutral">{entry.removes} removals</s-badge>
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

      <s-section heading="Daily breakdown" padding="none">
        <s-table variant="auto">
          <s-table-header-row>
            <s-table-header>Date</s-table-header>
            <s-table-header format="numeric">Saves</s-table-header>
            <s-table-header format="numeric">Removals</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {history.length === 0 ? (
              <s-table-row>
                <s-table-cell>No data for this month</s-table-cell>
                <s-table-cell>—</s-table-cell>
                <s-table-cell>—</s-table-cell>
              </s-table-row>
            ) : (
              history.map((entry) => (
                <s-table-row key={`table-${entry.day}`}>
                  <s-table-cell>{entry.day}</s-table-cell>
                  <s-table-cell>{entry.adds}</s-table-cell>
                  <s-table-cell>{entry.removes}</s-table-cell>
                </s-table-row>
              ))
            )}
          </s-table-body>
        </s-table>
      </s-section>

    </s-page>
  );
}
