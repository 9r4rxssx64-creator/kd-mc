/**
 * Stripe Webhook -> Firebase Worker (Cloudflare)
 * ===============================================
 * Active les comptes clients Apex AI quand ils paient via Stripe.
 *
 * DEPLOIEMENT (a faire une fois par Kevin) :
 * 1. Dashboard Cloudflare > Workers > Create Worker
 * 2. Nom : apex-stripe-webhook
 * 3. Coller ce code
 * 4. Env vars a ajouter dans Worker Settings :
 *    - STRIPE_WEBHOOK_SECRET (whsec_... depuis Stripe Dashboard > Developers > Webhooks > ton endpoint > Signing secret)
 *    - FB_URL = https://cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app
 *    - FB_SECRET = ton token Firebase (optionnel si regles publiques)
 * 5. Deploy -> copier l'URL du Worker
 * 6. Dashboard Stripe > Developers > Webhooks > Add endpoint :
 *    - URL : https://apex-stripe-webhook.<sous-domaine>.workers.dev
 *    - Events : customer.subscription.created, customer.subscription.updated,
 *               customer.subscription.deleted, invoice.payment_succeeded, invoice.payment_failed
 *
 * FONCTIONNEMENT :
 * - Client paie -> Stripe envoie POST ici -> Worker verifie signature -> update Firebase
 * - Apex AI (cote client) lit /apex/clients/<uid>/plan depuis Firebase au boot
 */

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const sig = request.headers.get("stripe-signature");
    if (!sig) return new Response("No signature", { status: 400 });

    const rawBody = await request.text();

    // Verify signature (simple HMAC check)
    const valid = await verifyStripeSignature(rawBody, sig, env.STRIPE_WEBHOOK_SECRET);
    if (!valid) return new Response("Invalid signature", { status: 400 });

    const event = JSON.parse(rawBody);
    const now = Date.now();

    try {
      switch (event.type) {
        case "customer.subscription.created":
        case "customer.subscription.updated": {
          const sub = event.data.object;
          const priceId = sub.items?.data?.[0]?.price?.id;
          const plan = mapPriceToPlan(priceId);
          const uid = sub.metadata?.apex_uid || sub.customer;
          await updateFirebase(env, `/apex/clients/${uid}`, {
            plan,
            stripeCustomerId: sub.customer,
            subscriptionId: sub.id,
            status: sub.status,
            currentPeriodEnd: sub.current_period_end * 1000,
            updatedAt: now
          });
          break;
        }
        case "customer.subscription.deleted": {
          const sub = event.data.object;
          const uid = sub.metadata?.apex_uid || sub.customer;
          await updateFirebase(env, `/apex/clients/${uid}`, {
            plan: "free",
            status: "canceled",
            canceledAt: now
          });
          break;
        }
        case "invoice.payment_succeeded": {
          const inv = event.data.object;
          await logFirebase(env, "/apex/payments", {
            type: "success",
            amount: inv.amount_paid,
            currency: inv.currency,
            customer: inv.customer,
            ts: now
          });
          break;
        }
        case "invoice.payment_failed": {
          const inv = event.data.object;
          await logFirebase(env, "/apex/payments", {
            type: "failed",
            amount: inv.amount_due,
            currency: inv.currency,
            customer: inv.customer,
            ts: now
          });
          const uid = inv.metadata?.apex_uid || inv.customer;
          await updateFirebase(env, `/apex/clients/${uid}`, {
            paymentFailed: true,
            lastFailureTs: now
          });
          break;
        }
      }
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    } catch (e) {
      return new Response("Handler error: " + e.message, { status: 500 });
    }
  }
};

function mapPriceToPlan(priceId) {
  // A configurer avec les vrais price IDs Stripe de Kevin
  const map = {
    "price_pro_39_99": "pro",
    "price_business_69_99": "business"
  };
  return map[priceId] || "free";
}

async function verifyStripeSignature(payload, signature, secret) {
  if (!secret) return false;
  try {
    const items = signature.split(",").reduce((acc, kv) => {
      const [k, v] = kv.split("=");
      acc[k] = v;
      return acc;
    }, {});
    const timestamp = items.t;
    const sig = items.v1;
    if (!timestamp || !sig) return false;

    const signedPayload = timestamp + "." + payload;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
    const expected = Array.from(new Uint8Array(mac))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");

    // Tolerance 5 minutes
    const age = Date.now() / 1000 - parseInt(timestamp);
    if (age > 300) return false;

    return expected === sig;
  } catch {
    return false;
  }
}

async function updateFirebase(env, path, data) {
  const url = `${env.FB_URL}${path}.json${env.FB_SECRET ? `?auth=${env.FB_SECRET}` : ""}`;
  const r = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!r.ok) throw new Error(`Firebase ${r.status}: ${await r.text()}`);
}

async function logFirebase(env, path, data) {
  const url = `${env.FB_URL}${path}.json${env.FB_SECRET ? `?auth=${env.FB_SECRET}` : ""}`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
}
