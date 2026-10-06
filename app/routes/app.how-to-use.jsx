import wishlistStyles from "../../extensions/wishlist-product/assets/wishlist.css?raw";
import wishlistPageStyles from "../../extensions/wishlist-product/assets/wishlist-page.css?raw";
import wishlistEmbedScript from "../../extensions/wishlist-product/assets/wishlist.js?raw";
import wishlistProductScript from "../../extensions/wishlist-product/assets/wishlist-product.js?raw";
import wishlistCollectionScript from "../../extensions/wishlist-product/assets/wishlist-collection.js?raw";
import wishlistPageScript from "../../extensions/wishlist-product/assets/wishlist-page.js?raw";
import manualAssetsSnippet from "../../extensions/wishlist-product/snippets/manual-wishlist-assets.liquid?raw";
import manualButtonSnippet from "../../extensions/wishlist-product/snippets/manual-wishlist-button.liquid?raw";
import manualCollectionSnippet from "../../extensions/wishlist-product/snippets/manual-wishlist-collection.liquid?raw";
import manualPageSnippet from "../../extensions/wishlist-product/snippets/manual-wishlist-page.liquid?raw";
import headerLinkSnippet from "../../extensions/wishlist-product/snippets/wishlist-header-link.liquid?raw";

const codeStyle = { fontSize: "0.8rem", whiteSpace: "pre-wrap" };

const renderCopySource = (heading, source) => {
  return (
    <s-section heading={heading}>
      <pre style={codeStyle}>{source}</pre>
    </s-section>
  );
};

export default function HowToUsePage() {
  return (
    <s-page heading="How to use Saitriq Wishlist">
      <s-section heading="Online Store 2.0 theme (recommended)">
        <s-paragraph>
          App blocks work on themes that support Shopify app blocks. Updating the
          app does not upgrade the theme or place blocks into its templates.
        </s-paragraph>
        <s-ordered-list>
          <s-list-item>
            In <strong>Online Store → Themes → Customize</strong>, select the theme
            you plan to publish.
          </s-list-item>
          <s-list-item>
            Open <strong>App embeds</strong>, enable <strong>Saitriq Wishlist</strong>,
            and save.
          </s-list-item>
          <s-list-item>
            On the Product template, add the <strong>Product Page Button</strong>
            app block.
          </s-list-item>
          <s-list-item>
            On the Collection template, add <strong>Collection wishlist icons</strong>
            inside the product-card section when the theme allows it.
          </s-list-item>
          <s-list-item>
            Create a page with handle <code>wishlist</code>, assign it the
            wishlist template, add the <strong>Wishlist page</strong> app block,
            and save.
          </s-list-item>
          <s-list-item>
            Preview and test the theme. App updates do not auto-insert blocks;
            add blocks separately to each theme you use.
          </s-list-item>
        </s-ordered-list>
        <s-paragraph>
          To add a header link automatically, set a matching CSS selector in
          <s-link href="/app/settings">Wishlist settings</s-link>. The app embed
          must be enabled for automatic insertion.
        </s-paragraph>
      </s-section>

      <s-section heading="Older or custom theme without app blocks">
        <s-banner tone="warning" heading="Manual setup is a separate installation">
          These steps copy the current extension runtime into the theme. Use
          either the manual setup below or the theme app embed plus app blocks;
          do not run both on the same theme. Manual setup does not convert the
          theme to Online Store 2.0, and theme-copied files do not update when
          the app is deployed.
        </s-banner>
        <s-ordered-list>
          <s-list-item>
            Duplicate the theme first. In Theme Editor, turn off the Saitriq
            Wishlist app embed on this theme to avoid loading the shared runtime
            twice.
          </s-list-item>
          <s-list-item>
            In <strong>Edit code → Assets</strong>, create the files with the exact
            names shown below and paste their matching source. These are the same
            JS and CSS files used by the app extension.
          </s-list-item>
          <s-list-item>
            Create the four theme snippets shown below in{" "}
            <strong>Edit code → Snippets</strong>.
          </s-list-item>
          <s-list-item>
            Add the asset-loader render once inside <code>layout/theme.liquid</code>
            in the <code>&lt;head&gt;</code>, before <code>&lt;/head&gt;</code>.
            Add the collection-template render once before <code>&lt;/body&gt;</code>.
          </s-list-item>
          <s-list-item>
            Render the product button snippet in the product template, after the
            product form. Create and publish a page using
            <code>templates/page.wishlist.liquid</code> with the wishlist-page
            render tag below.
          </s-list-item>
          <s-list-item>
            Preview the duplicated theme and test product saves, collection
            buttons, guest and logged-in wishlists, removals, clear-all, and
            monthly limit behavior before publishing.
          </s-list-item>
        </s-ordered-list>

        <s-section heading="Theme asset source files">
          <s-paragraph>
            Create each file in the theme Assets folder. Copy only the content
            shown for that file; do not rename the files.
          </s-paragraph>
          {renderCopySource("assets/wishlist.css", wishlistStyles)}
          {renderCopySource("assets/wishlist-page.css", wishlistPageStyles)}
          {renderCopySource("assets/wishlist-product.js", wishlistProductScript)}
          {renderCopySource("assets/wishlist-collection.js", wishlistCollectionScript)}
          {renderCopySource("assets/wishlist-page.js", wishlistPageScript)}
          {renderCopySource("assets/wishlist.js", wishlistEmbedScript)}
        </s-section>

        <s-section heading="Theme snippets">
          {renderCopySource("snippets/manual-wishlist-assets.liquid", manualAssetsSnippet)}
          <s-paragraph>
            In <code>layout/theme.liquid</code>, render the shared assets in the
            head:
          </s-paragraph>
          <pre style={codeStyle}>{"{% render 'manual-wishlist-assets' %}"}</pre>

          {renderCopySource("snippets/manual-wishlist-button.liquid", manualButtonSnippet)}
          <s-paragraph>
            In the product Liquid template, render this after the product form:
          </s-paragraph>
          <pre style={codeStyle}>{"{% render 'manual-wishlist-button' %}"}</pre>

          {renderCopySource("snippets/manual-wishlist-collection.liquid", manualCollectionSnippet)}
          <s-paragraph>
            In <code>layout/theme.liquid</code>, render the collection template
            before <code>&lt;/body&gt;</code>. The collection script uses the
            theme&apos;s product-card markup to find products. Test the target
            theme and have a developer adjust its product-card selector if
            required.
          </s-paragraph>
          <pre style={codeStyle}>{"{% render 'manual-wishlist-collection' %}"}</pre>

          {renderCopySource("snippets/manual-wishlist-page.liquid", manualPageSnippet)}
          <s-paragraph>
            Create <code>templates/page.wishlist.liquid</code> containing this
            render tag, then assign the template to the page whose handle is
            <code>wishlist</code>:
          </s-paragraph>
          <pre style={codeStyle}>{"{% render 'manual-wishlist-page' %}"}</pre>
        </s-section>

        <s-section heading="Optional header link">
          <s-paragraph>
            Copy this snippet into the theme as
            <code>snippets/wishlist-header-link.liquid</code>, then render it
            where the link should appear in <code>sections/header.liquid</code>.
            The count reflects the visitor&apos;s local wishlist.
          </s-paragraph>
          {renderCopySource("snippets/wishlist-header-link.liquid", headerLinkSnippet)}
          <pre style={codeStyle}>{"{% render 'wishlist-header-link' %}"}</pre>
        </s-section>
      </s-section>

      <s-section heading="Manual setup notes">
        <s-paragraph>
          The copied assets use the same authenticated Shopify app proxy as the
          app blocks; do not add an API key or access token to theme code. Guest
          wishlist items remain in that browser&apos;s local storage, while
          logged-in customer wishlists sync through the app. To pick up future
          app changes, recopy the corresponding extension assets and snippets
          into each manually configured theme.
        </s-paragraph>
        <s-paragraph>
          For API routes and response examples, see the{" "}
          <s-link href="/app/api-docs">Developer API</s-link> page. The
          <code>/app/api</code> routes require an authenticated embedded-app
          session; the storefront uses the app proxy at
          <code>/apps/saitriq-wishlist</code>.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
