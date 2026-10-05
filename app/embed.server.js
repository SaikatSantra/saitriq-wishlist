/**
 * Check whether the Saitriq Wishlist app embed block is enabled
 * in the merchant's currently published theme.
 *
 * Strategy (in order):
 *  1. Query settings_data.json — deep-walk every object looking for our
 *     extension UID or app handle in a "type" field.
 *     A block is ENABLED when found AND disabled !== true.
 *  2. If the block is absent from settings_data.json entirely, check
 *     snippets/saitriq-wishlist.liquid existence (Shopify writes
 *     this file when an app embed is first saved in some theme versions).
 *  3. Fall back to null (unknown) so the dashboard shows a neutral state
 *     instead of a false "not enabled" error.
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

const GET_THEME_FILES = `#graphql
  query GetThemeFiles($id: ID!) {
    theme(id: $id) {
      files(
        filenames: [
          "config/settings_data.json",
          "layout/theme.liquid"
        ]
        first: 2
      ) {
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

/**
 * Deep-walk obj looking for any {type, disabled} node that references
 * our extension. Returns true if found and enabled, false if found and
 * explicitly disabled, null if not found at all.
 */
const findEmbedBlock = (obj) => {
  if (!obj || typeof obj !== "object") return null;

  if (typeof obj.type === "string") {
    const t = obj.type;
    if (t.includes(EXTENSION_UID) || t.includes(APP_HANDLE)) {
      // Found our block — disabled:true means off, anything else means on
      return obj.disabled !== true;
    }
  }

  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") {
      const result = findEmbedBlock(v);
      if (result !== null) return result;
    }
  }

  return null; // not found in this subtree
};

export const checkEmbedEnabled = async (admin) => {
  try {
    // ── 1. Find the published (MAIN) theme ──────────────────────────────
    const themesRes = await admin.graphql(GET_MAIN_THEME);
    const themesJson = await themesRes.json();
    const themes = themesJson?.data?.themes?.edges ?? [];
    const mainTheme = themes.find((t) => t.node.role === "MAIN");

    if (!mainTheme) {
      console.warn("[embed-check] No MAIN theme found");
      return { enabled: null, themeName: null, themeId: null };
    }

    const themeId = mainTheme.node.id;
    const themeName = mainTheme.node.name;

    // ── 2. Fetch settings_data.json + layout/theme.liquid ───────────────
    const fileRes = await admin.graphql(GET_THEME_FILES, {
      variables: { id: themeId },
    });
    const fileJson = await fileRes.json();
    const nodes = fileJson?.data?.theme?.files?.nodes ?? [];

    const settingsNode = nodes.find((n) => n.filename === "config/settings_data.json");
    const raw = settingsNode?.body?.content ?? "";

    // Strip the leading /* ... */ comment Shopify prepends
    const cleaned = raw.replace(/\/\*[\s\S]*?\*\//, "").trim();

    // ── 3. Parse and deep-walk settings_data.json ───────────────────────
    if (cleaned) {
      let data = null;
      try { data = JSON.parse(cleaned); } catch { /* handled below */ }

      if (data) {
        const found = findEmbedBlock(data);

        if (found === true) {
          console.log("[embed-check] ✓ Embed enabled (found in settings_data.json)");
          return { enabled: true, themeName, themeId };
        }

        if (found === false) {
          console.log("[embed-check] ✗ Embed explicitly disabled (disabled:true in settings_data.json)");
          return { enabled: false, themeName, themeId };
        }

        // found === null → block not in settings_data.json at all
        // Log the current.blocks keys to help diagnose
        const blockKeys = data?.current?.blocks
          ? Object.keys(data.current.blocks)
          : [];
        const blockTypes = data?.current?.blocks
          ? Object.values(data.current.blocks).map((b) => b?.type).filter(Boolean)
          : [];
        console.log(
          "[embed-check] Block not found in settings_data.json.",
          "\n  current keys:", data?.current ? Object.keys(data.current) : [],
          "\n  current.blocks count:", blockKeys.length,
          "\n  block types sample:", blockTypes.slice(0, 5),
          "\n  UID in raw:", cleaned.includes(EXTENSION_UID),
          "\n  handle in raw:", cleaned.includes(APP_HANDLE),
        );
      }
    }

    // ── 4. Fallback: check layout/theme.liquid for our asset tag ────────
    // When a merchant enables an app embed, Shopify injects a render tag
    // into layout/theme.liquid in some theme versions. If our asset URL
    // appears there, the embed is active.
    const themeLayout = nodes.find((n) => n.filename === "layout/theme.liquid");
    const layoutContent = themeLayout?.body?.content ?? "";
    if (
      layoutContent.includes(EXTENSION_UID) ||
      layoutContent.includes(APP_HANDLE) ||
      layoutContent.includes("wishlist.css")
    ) {
      console.log("[embed-check] ✓ Embed detected via layout/theme.liquid");
      return { enabled: true, themeName, themeId };
    }

    // ── 5. Nothing found → return null (unknown) not false ──────────────
    // Returning null shows a neutral badge instead of a false "not enabled"
    // warning when Shopify simply hasn't written the block to the file yet.
    console.log("[embed-check] Block not found anywhere — returning null (unknown)");
    return { enabled: null, themeName, themeId };

  } catch (err) {
    console.error("[embed-check] Failed (non-fatal):", err?.message);
    return { enabled: null, themeName: null, themeId: null };
  }
};
