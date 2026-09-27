/**
 * Check whether the Saitriq Wishlist app embed block is enabled
 * in the merchant's currently published theme.
 *
 * Method: fetch config/settings_data.json from the main theme,
 * parse it, and look for a block whose type includes our extension UID
 * and whose disabled property is not true.
 *
 * Returns: true if enabled, false if disabled or not found.
 */

const EXTENSION_UID = "65da582c-8dde-54ca-43f2-ee621799e5d650865d87";
const APP_HANDLE = "saitriq-wishlist";

const GET_MAIN_THEME = `#graphql
  query GetMainTheme {
    themes(first: 20) {
      edges {
        node { id role name }
      }
    }
  }
`;

const GET_SETTINGS_DATA = `#graphql
  query GetSettingsData($id: ID!) {
    theme(id: $id) {
      files(filenames: ["config/settings_data.json"], first: 1) {
        nodes {
          filename
          body {
            ... on OnlineStoreThemeFileBodyText {
              content
            }
          }
        }
      }
    }
  }
`;

export const checkEmbedEnabled = async (admin) => {
  try {
    // 1. Get the main (published) theme
    const themesRes = await admin.graphql(GET_MAIN_THEME);
    const themesJson = await themesRes.json();
    const themes = themesJson?.data?.themes?.edges ?? [];
    const mainTheme = themes.find((t) => t.node.role === "MAIN");
    if (!mainTheme) return false;

    const themeId = mainTheme.node.id;
    const themeName = mainTheme.node.name;

    // 2. Fetch settings_data.json
    const fileRes = await admin.graphql(GET_SETTINGS_DATA, {
      variables: { id: themeId },
    });
    const fileJson = await fileRes.json();
    const raw = fileJson?.data?.theme?.files?.nodes?.[0]?.body?.content ?? "";

    // 3. Strip leading /* ... */ comment (Shopify adds one)
    const cleaned = raw.replace(/\/\*[\s\S]*?\*\//, "").trim();
    if (!cleaned) return false;

    const data = JSON.parse(cleaned);
    const blocks = data?.current?.blocks ?? {};

    // 4. Find a block whose type references our extension UID or app handle
    const embedEnabled = Object.values(blocks).some((block) => {
      if (!block?.type) return false;
      const type = String(block.type);
      return (
        type.includes(EXTENSION_UID) ||
        type.includes(APP_HANDLE)
      ) && block.disabled !== true;
    });

    return { enabled: embedEnabled, themeName, themeId };
  } catch (err) {
    console.error("Embed status check failed (non-fatal):", err?.message);
    // Fail open — don't crash the dashboard if this check errors
    return { enabled: null, themeName: null, themeId: null };
  }
};
