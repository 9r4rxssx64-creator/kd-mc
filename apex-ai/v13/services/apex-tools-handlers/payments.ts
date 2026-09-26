/**
 * APEX v13 — Handlers paiements (Stripe, PayPal).
 * Self-contained, lazy-loaded par executeTaskOnService.
 */

/* === Handler Stripe (charges, refunds, transfers) === */
export async function handleStripeTask(task: string, params: Record<string, unknown>): Promise<unknown> {
  const { vault } = await import('../vault/vault.js');
  const sk = await vault.readKey('ax_stripe_sk');
  if (!sk) throw new Error('ax_stripe_sk non configuré');
  const headers = {
    Authorization: `Bearer ${sk}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (task === 'create_payment_intent' || task === 'create_payment') {
    const body = new URLSearchParams({
      amount: String(params['amount'] ?? 0),
      currency: String(params['currency'] ?? 'eur'),
      description: String(params['description'] ?? ''),
    }).toString();
    const res = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST', headers, body, signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Stripe HTTP ${res.status}`);
    return await res.json();
  }
  if (task === 'refund' || task === 'create_refund') {
    if (params['confirm'] !== true) throw new Error('confirm:true requis pour refund');
    const body = new URLSearchParams({
      payment_intent: String(params['payment_intent'] ?? ''),
    }).toString();
    const res = await fetch('https://api.stripe.com/v1/refunds', {
      method: 'POST', headers, body, signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Stripe HTTP ${res.status}`);
    return await res.json();
  }
  if (task === 'transfer' || task === 'create_transfer') {
    if (params['confirm'] !== true) throw new Error('confirm:true requis pour transfer');
    const body = new URLSearchParams({
      amount: String(params['amount'] ?? 0),
      currency: String(params['currency'] ?? 'eur'),
      destination: String(params['destination'] ?? ''),
    }).toString();
    const res = await fetch('https://api.stripe.com/v1/transfers', {
      method: 'POST', headers, body, signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Stripe HTTP ${res.status}`);
    return await res.json();
  }
  throw new Error(`Task Stripe inconnue : ${task}`);
}

/* === Handler PayPal (orders, payouts) === */
export async function handlePaypalTask(task: string, _params: Record<string, unknown>): Promise<unknown> {
  const { vault } = await import('../vault/vault.js');
  const clientId = await vault.readKey('ax_paypal_client');
  const clientSecret = await vault.readKey('ax_paypal_secret');
  if (!clientId || !clientSecret) throw new Error('ax_paypal_client + ax_paypal_secret non configurés');
  /* OAuth token */
  const auth = btoa(`${clientId}:${clientSecret}`);
  if (task === 'get_token' || task === 'oauth') {
    const res = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`PayPal HTTP ${res.status}`);
    return await res.json();
  }
  throw new Error(`Task PayPal inconnue : ${task}`);
}
