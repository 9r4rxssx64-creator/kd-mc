/* La Détente — teste la clé PRINTIFY_API_KEY et récupère le(s) shop(s) Printify.
   Écrit shops/la-detente/printify-config.json (PAS de secret dedans, juste shop_id/titre).
   Lancer en CI : node shops/la-detente/scripts/ld-printify-connect.mjs */
import fs from 'fs';

const KEY = process.env.PRINTIFY_API_KEY;
if (!KEY) { console.error('❌ PRINTIFY_API_KEY manquante dans les secrets'); process.exit(1); }
const OUT = process.cwd() + '/shops/la-detente/printify-config.json';
const H = { 'Authorization': 'Bearer ' + KEY, 'User-Agent': 'LaDetente-KDMC/1.0', 'Content-Type': 'application/json' };

(async () => {
  const r = await fetch('https://api.printify.com/v1/shops.json', { headers: H });
  const txt = await r.text();
  if (r.status === 401 || r.status === 403) {
    console.error('❌ Clé Printify refusée (HTTP ' + r.status + ') : ' + txt.slice(0, 160));
    process.exit(2);
  }
  if (!r.ok) { console.error('❌ HTTP ' + r.status + ' : ' + txt.slice(0, 200)); process.exit(3); }
  let shops; try { shops = JSON.parse(txt); } catch (_) { console.error('Réponse non-JSON'); process.exit(4); }
  if (!Array.isArray(shops) || !shops.length) {
    console.error('⚠️ Clé valide mais AUCUNE boutique Printify trouvée. Crée une boutique « Manual / API » sur printify.com puis relance.');
    process.exit(5);
  }
  console.log('✅ Clé Printify VALIDE. Boutiques :');
  shops.forEach(s => console.log('   • shop_id=' + s.id + '  «' + s.title + '»  (' + s.sales_channel + ')'));
  const api = shops.find(s => /api|manual/i.test(s.sales_channel)) || shops[0];
  const cfg = {
    connected: true,
    shop_id: api.id,
    shop_title: api.title,
    sales_channel: api.sales_channel,
    all_shops: shops.map(s => ({ id: s.id, title: s.title, channel: s.sales_channel })),
    api_base: 'https://api.printify.com/v1',
    checked_at: new Date().toISOString()
  };
  fs.writeFileSync(OUT, JSON.stringify(cfg, null, 2));
  console.log('\n🖼️ Config écrite → printify-config.json (shop_id=' + api.id + ')');
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
