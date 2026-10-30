import { Outlet, isRouteErrorResponse, useLoaderData, useLocation, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { NavMenu } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { detectLocale, createTranslator } from "../i18n.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const locale = detectLocale({ request, session });
  const t = createTranslator(locale);

  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    locale,
    translations: {
      dashboard: t("nav.dashboard"),
      activity: t("nav.activity"),
      design: t("nav.design"),
      pricing: t("nav.pricing"),
      setup: t("nav.setup"),
      apiDocs: t("nav.apiDocs"),
    },
  };
};

export default function App() {
  const { apiKey, translations } = useLoaderData();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <NavMenu>
        <a href="/app" rel="home">{translations?.dashboard || "Dashboard"}</a>
        <a href="/app/wishlist">{translations?.activity || "Activity"}</a>
        <a href="/app/settings">{translations?.design || "Design"}</a>
        <a href="/app/pricing">{translations?.pricing || "Pricing"}</a>
        <a href="/app/how-to-use">{translations?.setup || "Setup"}</a>
        <a href="/app/api-docs">{translations?.apiDocs || "Developer API"}</a>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const hasShopifyLaunchContext = ["shop", "host", "id_token", "embedded"].some((key) =>
    searchParams.has(key),
  );

  if (
    !hasShopifyLaunchContext &&
    isRouteErrorResponse(error) &&
    error.status === 200
  ) {
    return (
      <main
        style={{
          boxSizing: "border-box",
          maxWidth: "38rem",
          margin: "12vh auto",
          padding: "2rem",
          color: "#202223",
          fontFamily: "Inter, sans-serif",
          lineHeight: 1.5,
        }}
      >
        <h1 style={{ fontSize: "1.75rem", marginBottom: "0.75rem" }}>
          Open Saitriq Wishlist from Shopify
        </h1>
        <p>
          This app needs Shopify Admin to provide its secure embedded
          authentication context. Open your Shopify Admin, choose the store,
          then launch Saitriq Wishlist from <strong>Apps</strong>.
        </p>
        <p>
          <a href="https://admin.shopify.com/">Go to Shopify Admin</a>
        </p>
      </main>
    );
  }

  return boundary.error(error);
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
