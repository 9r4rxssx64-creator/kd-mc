/**
 * Stripe Webhook Handler — e-KDMC
 * Netlify Function: /.netlify/functions/stripe-webhook
 *
 * Gère: checkout.session.completed, charge.refunded, invoice.payment_failed
 * Sécurité: vérification signature Stripe, idempotent
 */

const stripe = require("stripe")(process.env.KDMC_STRIPE_SK);
const crypto = require("crypto");

const WEBHOOK_SECRET = process.env.KDMC_STRIPE_WEBHOOK_SECRET;
const PROCESSED_EVENTS = new Set();

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const sig = event.headers["stripe-signature"];
  if (!sig || !WEBHOOK_SECRET) {
    return { statusCode: 400, body: "Missing signature or webhook secret" };
  }

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return { statusCode: 400, body: "Invalid signature" };
  }

  if (PROCESSED_EVENTS.has(stripeEvent.id)) {
    return { statusCode: 200, body: "Already processed" };
  }
  PROCESSED_EVENTS.add(stripeEvent.id);

  try {
    switch (stripeEvent.type) {
      case "checkout.session.completed":
        await handleCheckoutComplete(stripeEvent.data.object);
        break;
      case "charge.refunded":
        await handleRefund(stripeEvent.data.object);
        break;
      case "invoice.payment_failed":
        await handlePaymentFailed(stripeEvent.data.object);
        break;
      default:
        console.log("Unhandled event type:", stripeEvent.type);
    }
  } catch (err) {
    console.error("Error processing webhook:", err);
    return { statusCode: 500, body: "Processing error" };
  }

  return { statusCode: 200, body: "OK" };
};

async function handleCheckoutComplete(session) {
  const orderId = "KDMC-" + Date.now().toString(36).toUpperCase();
  const order = {
    id: orderId,
    stripeSessionId: session.id,
    customerEmail: session.customer_details?.email,
    customerName: session.customer_details?.name,
    amount: session.amount_total / 100,
    currency: session.currency,
    status: "paid",
    createdAt: new Date().toISOString(),
    items: JSON.parse(session.metadata?.items || "[]"),
    storeId: session.metadata?.storeId || "unknown"
  };

  console.log("New order:", orderId, order.amount, order.currency);

  // TODO: Save to Firebase RTDB
  // TODO: Send confirmation email via Brevo
  // TODO: If digital product, generate download links
  // TODO: If physical product, forward to supplier
}

async function handleRefund(charge) {
  console.log("Refund processed:", charge.id, charge.amount_refunded / 100);
  // TODO: Update order status in Firebase
  // TODO: Send refund confirmation email
  // TODO: Cancel supplier order if not shipped
}

async function handlePaymentFailed(invoice) {
  console.log("Payment failed:", invoice.id);
  // TODO: Notify admin via Telegram
  // TODO: Send retry email to customer
}
