import { useEffect } from "react";
import { useLoaderData, useRevalidator } from "react-router";
import { authenticate } from "../shopify.server";
import { getAnalyticsHistory } from "../metaobjects.server";

const monthKey = () => new Date().toISOString().slice(0, 7);

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const month = monthKey();
  const history = await getAnalyticsHistory(admin, month);
  const maxAdds = Math.max(1, ...history.map((entry) => entry.adds));

  return { month, history, maxAdds };
};

export default function WishlistOverview() {
  const { month, history, maxAdds } = useLoaderData();
  const revalidator = useRevalidator();

  useEffect(() => {
    const refreshTimer = window.setInterval(() => {
      revalidator.revalidate();
    }, 10000);

    return () => window.clearInterval(refreshTimer);
  }, [revalidator]);

  return (
    <s-page heading="Wishlist activity">
      <s-section heading={`Daily wishlist saves · ${month}`}>
        {history.length > 0 ? (
          <s-stack direction="block" gap="base">
            {history.map((entry) => (
              <s-box
                key={entry.day}
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background="subdued"
              >
                <s-stack direction="block" gap="small">
                  <s-stack direction="inline" gap="base" alignItems="center">
                    <s-text type="strong">{entry.day}</s-text>
                    <s-text>{entry.adds} saves</s-text>
                    <s-text tone="neutral">{entry.removes} removals</s-text>
                  </s-stack>
                  <s-stack direction="inline" gap="small">
                    {Array.from({ length: 10 }, (_, index) => (
                      <s-box
                        key={`${entry.day}-bar-${index}`}
                        padding="small"
                        background={
                          index < Math.ceil((entry.adds / maxAdds) * 10)
                            ? "strong"
                            : "subdued"
                        }
                        borderRadius="base"
                      />
                    ))}
                  </s-stack>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        ) : (
          <s-banner tone="info" heading="No wishlist activity yet">
            Daily wishlist saves will appear here after shoppers save products.
          </s-banner>
        )}
      </s-section>

      <s-section heading="Datewise analytics">
        <s-table variant="auto">
          <s-table-header-row>
            <s-table-header listSlot="primary">Date</s-table-header>
            <s-table-header format="numeric">Wishlist saves</s-table-header>
            <s-table-header format="numeric">Removals</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {history.map((entry) => (
              <s-table-row key={`table-${entry.day}`}>
                <s-table-cell>{entry.day}</s-table-cell>
                <s-table-cell>{entry.adds}</s-table-cell>
                <s-table-cell>{entry.removes}</s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
      </s-section>
    </s-page>
  );
}
