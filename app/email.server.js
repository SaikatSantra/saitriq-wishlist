import { Resend } from "resend";
import fs from "node:fs";
import path from "node:path";
import prisma from "./db.server";

const resendApiKey = process.env.RESEND_API_KEY;
const resendFromEmail = process.env.RESEND_FROM_EMAIL || "Saitriq Wishlist <onboarding@resend.dev>";
const resend = resendApiKey ? new Resend(resendApiKey) : null;

const ALERTS_FILE = path.join(process.cwd(), "prisma", "quota-alerts.json");

function readAlerts() {
  try {
    if (!fs.existsSync(ALERTS_FILE)) return [];
    const raw = fs.readFileSync(ALERTS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAlerts(alerts) {
  try {
    const dir = path.dirname(ALERTS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(ALERTS_FILE, JSON.stringify(alerts, null, 2), "utf8");
  } catch (err) {
    console.error("[EmailAlert] Failed to persist quota alert record:", err);
  }
}

export function hasAlertBeenSent(shop, month, threshold = 80) {
  const alerts = readAlerts();
  return alerts.some((a) => a.shop === shop && a.month === month && a.threshold === threshold);
}

export function recordAlertSent(shop, month, threshold = 80, recipient = "") {
  const alerts = readAlerts();
  alerts.push({
    shop,
    month,
    threshold,
    recipient,
    sentAt: new Date().toISOString(),
  });
  writeAlerts(alerts);
}

/**
 * Checks if the store's monthly wishlist saves have reached 80% of their plan limit.
 * If 80% is reached and an alert has not yet been sent this month, dispatches an email via Resend.
 */
export async function checkAndSend80PercentQuotaEmail({ shop, month, used, limit, planName }) {
  if (!Number.isFinite(limit) || limit <= 0) return { skipped: true, reason: "unlimited_or_zero" };

  const ratio = used / limit;
  if (ratio < 0.8) return { skipped: true, reason: "below_threshold" };

  if (hasAlertBeenSent(shop, month, 80)) {
    return { skipped: true, reason: "already_sent_this_month" };
  }

  // Find recipient email from Shopify session (online or offline with email)
  const session = await prisma.session.findFirst({
    where: { shop, email: { not: null } },
    select: { email: true, shop: true },
    orderBy: { expires: "desc" },
  }).catch(() => null);

  let recipientEmail = session?.email || process.env.STORE_OWNER_NOTIFICATION_EMAIL;

  // If not found in database session, query Shopify Admin GraphQL via unauthenticated.admin
  if (!recipientEmail) {
    try {
      const { unauthenticated } = await import("./shopify.server");
      const { admin } = await unauthenticated.admin(shop);
      const res = await admin.graphql(`
        query GetShopContactEmail {
          shop {
            email
            contactEmail
          }
        }
      `);
      const body = await res.json();
      recipientEmail = body?.data?.shop?.contactEmail || body?.data?.shop?.email;
      if (recipientEmail) {
        // Cache back to offline session for future lookups
        await prisma.session.updateMany({
          where: { shop, isOnline: false },
          data: { email: recipientEmail },
        }).catch(() => {});
      }
    } catch (err) {
      // GraphQL query failed or offline session not ready
    }
  }

  if (!recipientEmail) {
    console.warn(`[EmailAlert] 80% quota reached for ${shop}, but no merchant email found in session or admin API.`);
    // Record alert to prevent repetitive console warning on every single wish save
    recordAlertSent(shop, month, 80, "unresolved");
    return { skipped: true, reason: "no_recipient_email" };
  }

  const appHandle = process.env.APP_NAME || "saitriq-wishlist";
  const upgradeUrl = `https://${shop}/admin/apps/${appHandle}/app/pricing`;
  const pct = Math.round(ratio * 100);

  const subject = `⚠️ Action Required: ${shop} reached ${pct}% of monthly wishlist capacity`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f6f6f7; margin: 0; padding: 24px; color: #202223; }
    .card { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e1e3e5; padding: 36px 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .badge { display: inline-block; background-color: #ffe6a0; color: #573b00; font-weight: 700; font-size: 13px; padding: 4px 12px; border-radius: 20px; text-transform: uppercase; margin-bottom: 16px; }
    h1 { font-size: 22px; font-weight: 700; margin: 0 0 16px 0; color: #1a1a1a; }
    p { font-size: 15px; line-height: 1.6; color: #4a4a4a; margin: 0 0 16px 0; }
    .stats-box { background: #fbfbfb; border: 1px solid #ebebeb; border-radius: 8px; padding: 18px; margin: 20px 0; }
    .stat-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; }
    .stat-label { color: #6d7175; }
    .stat-value { font-weight: 600; color: #202223; }
    .button { display: inline-block; background-color: #008060; color: #ffffff !important; text-decoration: none; font-weight: 600; font-size: 15px; padding: 13px 26px; border-radius: 8px; margin: 20px 0 10px 0; text-align: center; }
    .footer { font-size: 12px; color: #8c9196; margin-top: 32px; border-top: 1px solid #f1f2f3; padding-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">Capacity Alert · 80% Reached</span>
    <h1>Your store is approaching its monthly wishlist limit</h1>
    <p>Hello,</p>
    <p>Your store <strong>${shop}</strong> has used <strong>${pct}%</strong> of its monthly wishlist saves for <strong>${month}</strong>.</p>
    
    <div class="stats-box">
      <div class="stat-row">
        <span class="stat-label">Active Plan</span>
        <span class="stat-value">${planName || "Free"}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Saves Used This Month</span>
        <span class="stat-value">${used.toLocaleString()} saves</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Monthly Plan Limit</span>
        <span class="stat-value">${limit.toLocaleString()} saves</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Remaining Saves</span>
        <span class="stat-value">${Math.max(0, limit - used).toLocaleString()} saves</span>
      </div>
    </div>

    <p><strong>What happens when the limit is reached?</strong><br>
    When your store reaches 100% of capacity, the storefront wishlist will be paused (adding and removing items stops) to prevent unexpected overages until upgraded or reset next month.</p>

    <a href="${upgradeUrl}" class="button" target="_blank">Upgrade Plan in Shopify Admin</a>

    <p class="footer">
      Sent by <strong>Saitriq Wishlist</strong> for ${shop}.<br>
      You can manage your subscription or add extra saves at any time from your Shopify Admin dashboard.
    </p>
  </div>
</body>
</html>
  `;

  if (!resend) {
    console.warn("[EmailAlert] Resend API key is not configured in RESEND_API_KEY. Alert logged to console.");
    recordAlertSent(shop, month, 80, recipientEmail);
    return { sent: false, logged: true, recipient: recipientEmail };
  }

  try {
    const response = await resend.emails.send({
      from: resendFromEmail,
      to: [recipientEmail],
      subject,
      html,
    });

    recordAlertSent(shop, month, 80, recipientEmail);
    console.log(`[EmailAlert] 80% quota warning successfully sent to ${recipientEmail} for ${shop}:`, response);
    return { sent: true, response, recipient: recipientEmail };
  } catch (error) {
    console.error(`[EmailAlert] Error sending Resend email to ${recipientEmail}:`, error);
    return { sent: false, error: error.message };
  }
}

