/**
 * Email Trigger — e-KDMC
 * Netlify Function: /.netlify/functions/email-trigger
 *
 * Envoie des emails transactionnels via Brevo API
 * Templates: confirmation, expédition, livraison, abandon panier
 */

const BREVO_API_KEY = process.env.KDMC_BREVO_API_KEY;
const BREVO_URL = "https://api.brevo.com/v3/smtp/email";

const TEMPLATES = {
  order_confirmation: {
    subject: "✅ Commande confirmée — {{orderId}}",
    html: "<h1>Merci pour votre commande !</h1><p>Votre commande <strong>{{orderId}}</strong> a été confirmée.</p><p>Montant : <strong>{{amount}}</strong></p><p>Vous recevrez un email de suivi dès l'expédition.</p><p style='margin-top:24px;color:#888'>— L'équipe KDMC</p>"
  },
  shipping_notification: {
    subject: "📦 Votre commande {{orderId}} est en route !",
    html: "<h1>Votre colis est en chemin !</h1><p>Commande : <strong>{{orderId}}</strong></p><p>Numéro de suivi : <strong>{{trackingNumber}}</strong></p><p>Livraison estimée : {{estimatedDelivery}}</p>"
  },
  digital_download: {
    subject: "📥 Vos fichiers sont prêts — {{orderId}}",
    html: "<h1>Vos produits sont prêts !</h1><p>Cliquez ci-dessous pour télécharger :</p><p><a href='{{downloadUrl}}' style='display:inline-block;padding:12px 24px;background:#D4AF37;color:#000;border-radius:8px;text-decoration:none;font-weight:bold'>📥 Télécharger</a></p><p style='color:#888;font-size:12px'>Ce lien expire dans 24h.</p>"
  },
  abandoned_cart: {
    subject: "🛒 Vous avez oublié quelque chose ?",
    html: "<h1>Votre panier vous attend !</h1><p>Vous aviez sélectionné des produits dans votre panier. Finalisez votre commande avant qu'il ne soit trop tard.</p><p><a href='{{cartUrl}}' style='display:inline-block;padding:12px 24px;background:#D4AF37;color:#000;border-radius:8px;text-decoration:none;font-weight:bold'>Reprendre mon panier →</a></p><p style='color:#888'>Utilisez le code <strong>RETOUR10</strong> pour -10% !</p>"
  },
  refund_confirmation: {
    subject: "↩️ Remboursement effectué — {{orderId}}",
    html: "<h1>Remboursement confirmé</h1><p>Votre commande <strong>{{orderId}}</strong> a été remboursée.</p><p>Montant : <strong>{{amount}}</strong></p><p>Le remboursement apparaîtra sur votre compte sous 5-10 jours ouvrés.</p>"
  },
  review_request: {
    subject: "⭐ Comment s'est passée votre expérience ?",
    html: "<h1>Votre avis compte !</h1><p>Vous avez reçu votre commande <strong>{{orderId}}</strong>. Nous aimerions connaître votre avis.</p><p><a href='{{reviewUrl}}' style='display:inline-block;padding:12px 24px;background:#D4AF37;color:#000;border-radius:8px;text-decoration:none;font-weight:bold'>⭐ Laisser un avis</a></p><p style='color:#888'>En remerciement, recevez <strong>-10%</strong> sur votre prochaine commande !</p>"
  }
};

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  if (!BREVO_API_KEY) {
    return { statusCode: 500, body: "Brevo API key not configured" };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const { templateId, to, params, storeId } = body;

  if (!templateId || !to || !TEMPLATES[templateId]) {
    return { statusCode: 400, body: "Missing templateId or recipient" };
  }

  const template = TEMPLATES[templateId];
  let subject = template.subject;
  let html = template.html;

  if (params) {
    Object.keys(params).forEach(function (key) {
      const regex = new RegExp("\\{\\{" + key + "\\}\\}", "g");
      const safeVal = String(params[key]).replace(/</g, "&lt;").replace(/>/g, "&gt;");
      subject = subject.replace(regex, safeVal);
      html = html.replace(regex, safeVal);
    });
  }

  try {
    const response = await fetch(BREVO_URL, {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "content-type": "application/json",
        accept: "application/json"
      },
      body: JSON.stringify({
        sender: { name: storeId ? storeId + " — KDMC" : "KDMC Boutique", email: "noreply@kdmc.store" },
        to: [{ email: to }],
        subject: subject,
        htmlContent: html
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Brevo error:", response.status, errText);
      return { statusCode: 502, body: "Email send failed" };
    }

    return { statusCode: 200, body: JSON.stringify({ sent: true, to, template: templateId }) };
  } catch (err) {
    console.error("Email error:", err.message);
    return { statusCode: 500, body: "Email send error" };
  }
};
