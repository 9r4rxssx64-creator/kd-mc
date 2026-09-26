/**
 * Invoice Generator — e-KDMC
 * Netlify Function: /.netlify/functions/invoice-generate
 *
 * Génère des factures PDF au format HTML (compatible impression navigateur)
 * Monaco-specific: gère TVA/pas TVA selon le client
 */

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const { orderId, customer, items, total, storeId, date } = body;

  if (!orderId || !customer || !items) {
    return { statusCode: 400, body: "Missing required fields" };
  }

  const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const fmtP = (p) => Number(p).toFixed(2).replace(".", ",") + " €";
  const invoiceDate = date || new Date().toLocaleDateString("fr-FR");
  const invoiceNum = "KDMC-INV-" + Date.now().toString(36).toUpperCase();

  const itemsHtml = items.map(function (item) {
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${esc(item.name)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${item.qty}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${fmtP(item.price)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:600">${fmtP(item.price * item.qty)}</td>
    </tr>`;
  }).join("");

  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const tva = customer.country === "FR" || customer.country === "EU" ? subtotal * 0.20 : 0;
  const totalTTC = subtotal + tva;

  const invoiceHtml = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><title>Facture ${esc(invoiceNum)}</title>
<style>
body{font-family:system-ui,sans-serif;max-width:800px;margin:0 auto;padding:40px;color:#333}
.header{display:flex;justify-content:space-between;margin-bottom:40px}
.brand{font-size:24px;font-weight:800;color:#D4AF37}
.brand span{display:block;font-size:12px;color:#888;font-weight:400}
.info{text-align:right;font-size:13px;color:#666}
.info strong{color:#333;display:block}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-bottom:40px}
.party h3{font-size:12px;text-transform:uppercase;color:#888;margin-bottom:8px}
.party p{font-size:14px;line-height:1.6}
table{width:100%;border-collapse:collapse;margin-bottom:24px}
th{background:#f8f8f8;padding:10px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#666;border-bottom:2px solid #ddd}
.totals{margin-left:auto;width:280px}
.totals div{display:flex;justify-content:space-between;padding:6px 0;font-size:14px}
.totals .total{font-size:18px;font-weight:800;color:#D4AF37;border-top:2px solid #D4AF37;padding-top:12px;margin-top:8px}
.footer{margin-top:40px;padding-top:20px;border-top:1px solid #eee;font-size:11px;color:#999;text-align:center}
@media print{body{padding:20px}button{display:none}}
</style>
</head>
<body>
<div class="header">
  <div class="brand">KDMC<span>${esc(storeId || "Boutique")}</span></div>
  <div class="info">
    <strong>Facture ${esc(invoiceNum)}</strong>
    Date : ${esc(invoiceDate)}<br>
    Commande : ${esc(orderId)}
  </div>
</div>
<div class="parties">
  <div class="party">
    <h3>Vendeur</h3>
    <p><strong>KDMC — Kevin DESARZENS</strong><br>Monaco, MC 98000<br>kevind@monaco.mc</p>
  </div>
  <div class="party">
    <h3>Client</h3>
    <p><strong>${esc(customer.name)}</strong><br>${esc(customer.address || "")}<br>${esc(customer.email)}</p>
  </div>
</div>
<table>
  <thead><tr><th>Produit</th><th style="text-align:center">Qté</th><th style="text-align:right">Prix unit.</th><th style="text-align:right">Total</th></tr></thead>
  <tbody>${itemsHtml}</tbody>
</table>
<div class="totals">
  <div><span>Sous-total HT</span><span>${fmtP(subtotal)}</span></div>
  <div><span>TVA (${tva > 0 ? "20%" : "0% — Monaco"})</span><span>${fmtP(tva)}</span></div>
  <div class="total"><span>Total TTC</span><span>${fmtP(totalTTC)}</span></div>
</div>
<button onclick="window.print()" style="display:block;margin:24px auto;padding:12px 24px;background:#D4AF37;color:#000;border:none;border-radius:8px;font-weight:700;cursor:pointer">🖨️ Imprimer / PDF</button>
<div class="footer">
  KDMC — Commerce en ligne | Monaco MC 98000 | kevind@monaco.mc<br>
  Paiement sécurisé par Stripe. Merci pour votre confiance.
</div>
</body>
</html>`;

  return {
    statusCode: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    body: invoiceHtml
  };
};
