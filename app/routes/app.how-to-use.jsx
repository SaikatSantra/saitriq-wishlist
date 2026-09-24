export default function HowToUsePage() {
  return (
    <s-page heading="How to use Saitriq Wishlist">
      <s-section heading="Install the storefront blocks">
        <s-ordered-list>
          <s-list-item>Open Online Store, then Themes, and select Customize.</s-list-item>
          <s-list-item>Add the Saitriq Wishlist block to product and collection templates.</s-list-item>
          <s-list-item>Create a page with the handle wishlist and add the Wishlist page block.</s-list-item>
          <s-list-item>Add a header link to /pages/wishlist so shoppers can open saved items.</s-list-item>
          <s-list-item>Save the theme and test adding and removing a product while logged in.</s-list-item>
        </s-ordered-list>
      </s-section>
      <s-section heading="Track usage">
        <s-paragraph>Each successful add is counted once for the current calendar month. Removing an item is tracked for analytics but does not restore a monthly save credit. The proxy returns used and remaining counts to the storefront.</s-paragraph>
      </s-section>
    </s-page>
  );
}
