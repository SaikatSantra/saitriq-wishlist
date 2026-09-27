import { Outlet, useLoaderData, useRouteError } from "react-router";
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
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
