import { Form, redirect, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import styles from "./styles.module.css";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Saitriq Wishlist</h1>
        <p className={styles.text}>
          Give customers a persistent wishlist that works across devices.
        </p>
        {showForm && (
          <>
            <Form className={styles.form} method="post" action="/auth/login">
              <label className={styles.label}>
                <span>Shop domain</span>
                <input className={styles.input} type="text" name="shop" />
                <span>e.g: my-shop-domain.myshopify.com</span>
              </label>
              <button className={styles.button} type="submit">
                Log in
              </button>
            </Form>
            <p className={styles.text}>
              Install or open Saitriq Wishlist from Shopify Admin to begin setup.
            </p>
          </>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Customer sync</strong>. Logged-in customers see the same
            wishlist on every device.
          </li>
          <li>
            <strong>Theme app blocks</strong>. Add wishlist controls without
            editing theme code.
          </li>
          <li>
            <strong>Merchant controls</strong>. Configure button icons, SVGs,
            page layout, and custom CSS.
          </li>
        </ul>
      </div>
    </div>
  );
}
