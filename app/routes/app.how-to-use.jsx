export default function HowToUsePage() {
  return (
    <s-page heading="How to use Saitriq Wishlist">

      {/* ── Method 1: App Blocks (recommended) ── */}
      <s-section heading="Method 1 — App blocks (recommended)">
        <s-paragraph>
          Works with any Online Store 2.0 theme (Debut, Dawn, Sense, Craft, etc.).
          No code editing required.
        </s-paragraph>
        <s-ordered-list>
          <s-list-item>
            In your Shopify admin go to <strong>Online Store → Themes → Customize</strong>.
          </s-list-item>
          <s-list-item>
            Open the <strong>Product</strong> template. Click <strong>Add block</strong> inside
            the product form section and choose <strong>Saitriq Wishlist → Wishlist</strong>.
            Save.
          </s-list-item>
          <s-list-item>
            Open the <strong>Collection</strong> template. Add the
            <strong> Collection wishlist icons</strong> block to the product grid section. Save.
          </s-list-item>
          <s-list-item>
            Create a new page in <strong>Online Store → Pages</strong> with the URL handle
            set to <code>wishlist</code>. Open it in the theme editor, add the
            <strong> Wishlist page</strong> block, and save.
          </s-list-item>
          <s-list-item>
            Add a link to <code>/pages/wishlist</code> in your theme header or navigation menu
            so shoppers can find their saved items.
          </s-list-item>
          <s-list-item>
            Test by opening a product page while logged in and clicking the wishlist button.
            The counter in the header should update immediately.
          </s-list-item>
        </s-ordered-list>
      </s-section>

      {/* ── Method 2: Manual snippets (legacy themes) ── */}
      <s-section heading="Method 2 — Manual snippets (for older or custom themes)">
        <s-paragraph>
          Use this method if your theme does not support app blocks (e.g. Debut, older Brooklyn,
          Pipeline, Prestige v3 and below, or any fully custom theme).
          You will need to edit theme code. Always work on a duplicate theme first.
        </s-paragraph>

        <s-section heading="Step 1 — Copy the snippet files">
          <s-paragraph>
            After deploying this app the following snippet files are available in your theme
            under <strong>Assets / Snippets</strong>. If they are not there yet, run
            <code>shopify app deploy</code> from your terminal.
          </s-paragraph>
          <s-unordered-list>
            <s-list-item><code>snippets/wishlist-button.liquid</code> — the heart button for product pages</s-list-item>
            <s-list-item><code>snippets/wishlist-collection-inject.liquid</code> — auto-injects heart icons on collection pages</s-list-item>
            <s-list-item><code>snippets/wishlist-header-link.liquid</code> — header link with live count badge</s-list-item>
          </s-unordered-list>
        </s-section>

        <s-section heading="Step 2 — Add the wishlist button to the product page">
          <s-paragraph>
            In the theme editor go to <strong>Actions → Edit code</strong>.
            Open <code>sections/product-template.liquid</code> or
            <code>sections/main-product.liquid</code> (name varies by theme).
            Find the add-to-cart button — look for <code>type="submit"</code> inside a
            <code>product-form</code> tag. Paste the snippet render tag directly after it:
          </s-paragraph>
          <s-banner tone="info">
            <code>{"{% render 'wishlist-button' %}"}</code>
          </s-banner>
          <s-paragraph>
            The snippet automatically reads the <code>product</code> object from the template.
            No variables need to be passed.
          </s-paragraph>
        </s-section>

        <s-section heading="Step 3 — Add heart icons to the collection page">
          <s-paragraph>
            Open <code>layout/theme.liquid</code>. Find the closing <code>{"</body>"}</code> tag
            and paste this line just above it:
          </s-paragraph>
          <s-banner tone="info">
            <code>{"{% render 'wishlist-collection-inject' %}"}</code>
          </s-banner>
          <s-paragraph>
            The snippet scans every product card link on the page and injects a heart button
            into the card automatically. It uses a MutationObserver so it also works with
            infinite scroll and AJAX-loaded products.
          </s-paragraph>
          <s-paragraph>
            If the heart button position looks wrong you can adjust it in the theme CSS.
            The button has the class <code>.sai-wishlist--collection</code> and is positioned
            absolute top-right of the card by default.
          </s-paragraph>
        </s-section>

        <s-section heading="Step 4 — Add the wishlist page">
          <s-paragraph>
            Create a page in <strong>Online Store → Pages</strong> with the URL handle
            set to <code>wishlist</code>. Then open your theme code and paste the snippet
            into the page template. The simplest approach is:
          </s-paragraph>
          <s-ordered-list>
            <s-list-item>
              In the theme code editor, create a new file:
              <code>templates/page.wishlist.liquid</code>
            </s-list-item>
            <s-list-item>
              Paste this single line inside it:
              <s-banner tone="info"><code>{"{% render 'wishlist-page' %}"}</code></s-banner>
            </s-list-item>
            <s-list-item>
              Save. The page at <code>/pages/wishlist</code> will now show the full wishlist grid.
            </s-list-item>
          </s-ordered-list>
          <s-paragraph>
            You can customise the snippet by passing variables. For example to use your
            theme's own product card class and show 3 columns:
          </s-paragraph>
          <s-banner tone="info">
            <code>
              {"{% render 'wishlist-page',"}
              <br />
              {"   heading: 'Saved items',"}
              <br />
              {"   columns: 3,"}
              <br />
              {"   card_class: 'product-card',"}
              <br />
              {"   button_label: 'Delete'"}
              <br />
              {"%}"}
            </code>
          </s-banner>
          <s-paragraph>
            All available variables — <code>heading</code>, <code>empty_message</code>,
            <code>columns</code>, <code>show_prices</code>, <code>show_remove</code>,
            <code>button_label</code>, <code>card_class</code> — are documented as
            comments at the top of the snippet file.
          </s-paragraph>
          <s-paragraph>
            Settings saved in <strong>Page design settings</strong> in this app are also
            applied automatically for logged-in customers, so you only need to override
            the variables when you want the template to differ from the app defaults.
          </s-paragraph>
        </s-section>

        <s-section heading="Step 5 — Add the header link (optional)">
          <s-paragraph>
            Open your header file (usually <code>sections/header.liquid</code>).
            Find the navigation or icon area and add:
          </s-paragraph>
          <s-banner tone="info">
            <code>{"{% render 'wishlist-header-link' %}"}</code>
          </s-banner>
          <s-paragraph>
            This renders a link to <code>/pages/wishlist</code> with a live item count badge
            that updates from localStorage without a page reload.
          </s-paragraph>
        </s-section>
      </s-section>

      {/* ── Usage tracking ── */}
      <s-section heading="Usage tracking">
        <s-paragraph>
          Each successful product save counts once toward your monthly limit.
          Removing an item is tracked for analytics but does not restore a save credit.
          Guest saves (shoppers not logged in) are also counted.
          View your current usage on the <s-link href="/app">Dashboard</s-link> or the{" "}
          <s-link href="/app/wishlist">Wishlist activity</s-link> page.
        </s-paragraph>
      </s-section>

      {/* ── Troubleshooting ── */}
      <s-section heading="Troubleshooting">
        <s-unordered-list>
          <s-list-item>
            <strong>Heart button not appearing on collection page</strong> — the inject snippet
            looks for product card links inside <code>li</code>, <code>article</code>,
            <code>.card</code>, <code>.grid__item</code>, and elements with
            <code>product-card</code> or <code>product-item</code> in the class name.
            If your theme uses a different wrapper, add <code>position: relative</code> to that
            element and it will be picked up automatically.
          </s-list-item>
          <s-list-item>
            <strong>Wishlist not syncing for logged-in customers</strong> — make sure the app
            proxy is active. Go to your Shopify Partner dashboard → App setup and confirm the
            proxy URL is set to your app URL. Run <code>shopify app deploy</code> if you recently
            changed it.
          </s-list-item>
          <s-list-item>
            <strong>Items disappear after login</strong> — this is expected on the first sync.
            Guest items saved before login are merged into the customer account automatically.
          </s-list-item>
          <s-list-item>
            <strong>CSS conflicts</strong> — all wishlist classes are prefixed with
            <code>.sai-wishlist</code>. Override them in your theme CSS using that prefix.
          </s-list-item>
        </s-unordered-list>
      </s-section>

    </s-page>
  );
}
