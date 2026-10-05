import { Outlet, isRouteErrorResponse, useLoaderData, useLocation, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData();

  return (
    <AppProvider embedded apiKey={apiKey}>
      {/*
        s-app-nav: App Bridge component for the Shopify admin sidebar nav.
        rel="home" hides the link from the menu and sets it as the home route.
        Labels should be 1-2 words, noun-based per Shopify guidelines.
      */}
      <s-app-nav>
        <s-link href="/app" rel="home">Dashboard</s-link>
        <s-link href="/app/wishlist">Activity</s-link>
        <s-link href="/app/settings">Design</s-link>
        <s-link href="/app/pricing">Pricing</s-link>
        <s-link href="/app/how-to-use">Setup</s-link>
        <s-link href="/app/api-docs">Developer API</s-link>
      </s-app-nav>
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
