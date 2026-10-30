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
      <div className={styles.container}>
        {/* Brand Header */}
        <header className={styles.header}>
          <div className={styles.badge}>
            <span className={styles.badgeIcon}>✨</span>
            <span>Enterprise Shopify Wishlist</span>
          </div>
          <h1 className={styles.heading}>Saitriq Wishlist</h1>
          <p className={styles.subheading}>
            Drive conversions and retention with a lightning-fast, persistent wishlist that syncs across customer devices and safeguards your store with automated quota protection.
          </p>
        </header>

        {/* Login Form Card */}
        {showForm && (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Open App in Shopify Admin</h2>
            <p className={styles.cardDesc}>
              Enter your Shopify store domain to access your merchant dashboard and manage settings.
            </p>

            <Form className={styles.form} method="post" action="/auth/login">
              <div className={styles.inputGroup}>
                <label htmlFor="shop" className={styles.label}>Shop Domain</label>
                <div className={styles.inputWrapper}>
                  <input
                    id="shop"
                    className={styles.input}
                    type="text"
                    name="shop"
                    placeholder="my-store-name.myshopify.com"
                    required
                  />
                </div>
                <span className={styles.hint}>Example: your-store.myshopify.com</span>
              </div>
              <button className={styles.button} type="submit">
                Log In to Store →
              </button>
            </Form>

            <div className={styles.footerNote}>
              Already installed? You can also launch Saitriq Wishlist directly from your <strong>Shopify Admin &gt; Apps</strong> menu.
            </div>
          </div>
        )}

        {/* Feature Grid */}
        <div className={styles.featureGrid}>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>🔄</div>
            <h3 className={styles.featureTitle}>Cross-Device Sync</h3>
            <p className={styles.featureText}>
              Guest shoppers save items to their browser instantly. When they log in, items automatically sync to their cloud account across mobile and desktop.
            </p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>⚡</div>
            <h3 className={styles.featureTitle}>OS 2.0 &amp; Vintage Themes</h3>
            <p className={styles.featureText}>
              Drag-and-drop app blocks for Dawn and modern themes, plus ready-to-use copyable Liquid snippets for vintage and custom Shopify stores.
            </p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>🛡️</div>
            <h3 className={styles.featureTitle}>Automated Quota Alerts</h3>
            <p className={styles.featureText}>
              Scalable pricing starting at $5/month with 7-day free trials, automatic 80% usage email warnings via Resend, and guaranteed quota protection.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
