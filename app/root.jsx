import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <style>{`
          :root, html, body {
            --s-container-shadow-mobile-f4125: none !important;
            --s-container-radius-mobile-f4125: 0 !important;
            --s-section-border-f4125: none !important;
            --s-section-shadow-f4125: none !important;
            --s-section-padding-f4125: 0 !important;
            --p-shadow-container-f4125: none !important;
            --p-border-radius-container-f4125: 0 !important;
            --p-space-800: 16px !important;
            --p-space-600: 12px !important;
            --p-space-500: 12px !important;
          }
          .padding-base,
          [class*="padding-base"] {
            padding: 0 !important;
          }
          .level-1:where(:not(.admin-next)),
          [class*="level-1"],
          s-section {
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            margin-block-start: 10px !important;
            margin-block-end: 10px !important;
          }
          s-box[padding="large"],
          [padding="large"] {
            padding: 14px 16px !important;
          }
          s-box[padding="base"],
          [padding="base"] {
            padding: 10px 14px !important;
          }
          s-stack[direction="block"][gap="large"],
          s-grid[gap="large"],
          [gap="large"] {
            gap: 12px !important;
          }
          s-stack[direction="block"][gap="base"],
          s-grid[gap="base"],
          [gap="base"] {
            gap: 10px !important;
          }
          s-heading {
            margin-block-end: 4px !important;
          }
          s-banner {
            margin-block-end: 10px !important;
          }
        `}</style>
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
