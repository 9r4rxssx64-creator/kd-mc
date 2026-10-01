#!/usr/bin/env node
/* LIRE L'ÉTAT RÉEL DES VERROUS FIREBASE — lecture seule, jamais de PUT/PATCH/DELETE (audit 30.09.2026, R5-R6)
 *
 * Pourquoi : l'audit a lu firebase-rules-apex.json (le fichier), pas la base en ligne. Or deploy-rules.cjs applique des
 * verrous par-dessus le fichier (SHOPS_LOCK, ORDERS_READ, CMC_ADMIN_LOCK, SECRETS_LOCK, ECRITURES_LOCK) : l'état qui
 * compte est celui de /.settings/rules.json EN LIGNE. Ce script le lit avec le compte de service, en déduit chaque
 * verrou, sonde en ANONYME ce qu'un inconnu peut lire (GET shallow), et écrit le tout en ::notice (le journal CI
 * n'est pas lisible depuis l'agent — leçon #374). Il ne modifie RIEN : c'est la mesure « avant » de R5-R6.
 *   node tools/firebase/lire-verrous.cjs   (secrets FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY, comme deploy-rules) */
const { getAccessToken } = require('./sa-token.cjs');

const DB = 'https://cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app';
const role = (v) => /auth\.token\.role === 'admin'/.test(String(v == null ? '' : v));

/* Déduit l'état de chaque verrou depuis l'objet rules en ligne (même lecture que deploy-rules.cjs, mode keep). */
function lireVerrous(rules) {
  const r = rules || {};
  const sa = r.shops_admin_v1 || {}; const cmc = r.cmcteams || {};
  const produits = sa.products && sa.products.$shop && sa.products.$shop.$id && sa.products.$shop.$id['.write'];
  const logos = sa.logos && sa.logos.$shop && sa.logos.$shop.$id && sa.logos.$shop.$id['.write'];
  const selection = r.shops_sourcing_v1 && r.shops_sourcing_v1.selection && r.shops_sourcing_v1.selection.$id && r.shops_sourcing_v1.selection.$id['.write'];
  const pushSub = r.ld_detente && r.ld_detente.push_sub && r.ld_detente.push_sub['.write'];
  const commandesEcriture = sa.orders && sa.orders.$shop && sa.orders.$shop.$orderId && sa.orders.$shop.$orderId['.write'];
  return {
    racine: r['.read'] === false && r['.write'] === false ? 'deny' : 'OUVERTE',
    shops_lock: role(produits) && role(logos) && role(selection) ? 'on' : 'off',
    shops_detail: { produits: String(produits), logos: String(logos), selection: String(selection), push_sub: String(pushSub) },
    orders_read: role(sa.orders && sa.orders['.read']) ? 'on' : 'off',
    orders_write_clients: role(commandesEcriture) ? 'VERROUILLÉ (ANORMAL)' : 'anonyme (attendu)',
    cmc_admin_lock: cmc['.write'] == null && cmc.$key && cmc.$key['.write'] != null && role(cmc.cmc_motd && cmc.cmc_motd['.write']) ? 'on' : 'off',
    secrets_lock: cmc.cmc_verif_codes && cmc.cmc_verif_codes['.validate'] === 'false' && cmc.cmc_pw && cmc.cmc_pw.$uid && cmc.cmc_pw.$uid.h && cmc.cmc_pw.$uid.h['.validate'] === 'false' ? 'on' : 'off',
    ecritures_lock: role(cmc.cmc_ov && cmc.cmc_ov['.write']) && role(cmc.cmc_t && cmc.cmc_t['.write']) ? 'on' : 'off',
    cmc_read: String(cmc['.read']), cmc_write_parent: String(cmc['.write']), cmc_key_write: String(cmc.$key && cmc.$key['.write']),
    cmcteams_prive_read: String(r.cmcteams_prive && r.cmcteams_prive['.read']),
    cmcteams_secret_read: String(r.cmcteams_secret && r.cmcteams_secret['.read']),
  };
}

/* Ce qu'un inconnu (sans jeton) peut LIRE aujourd'hui : GET shallow, 200 = lisible, 401 = fermé. */
const SONDES = ['/shops_admin_v1/orders', '/shops_admin_v1/products', '/shops_admin_v1/logos', '/shops_sourcing_v1/selection', '/ld_detente/push_sub', '/cmcteams', '/cmcteams_prive', '/cmcteams_secret', '/apex', '/coffre_vault', '/arbre'];
async function sonderAnonyme(fetchFn = fetch) {
  const out = {};
  for (const p of SONDES) { try { const r = await fetchFn(DB + p + '.json?shallow=true'); out[p] = r.status; } catch (e) { out[p] = 'erreur ' + e.message; } }
  return out;
}

async function main(fetchFn = fetch) {
  const token = await getAccessToken();
  const r = await fetchFn(DB + '/.settings/rules.json?access_token=' + encodeURIComponent(token));
  if (!r.ok) throw new Error('lecture des règles en ligne impossible : HTTP ' + r.status);
  const live = await r.json();
  const v = lireVerrous(live && live.rules);
  const anon = await sonderAnonyme(fetchFn);
  const lignes = [
    `racine=${v.racine} · shops_lock=${v.shops_lock} · orders_read=${v.orders_read} · commandes(écriture clients)=${v.orders_write_clients} · cmc_admin_lock=${v.cmc_admin_lock} · secrets_lock=${v.secrets_lock} · ecritures_lock=${v.ecritures_lock}`,
    `shops .write en ligne → produits: ${v.shops_detail.produits} | logos: ${v.shops_detail.logos} | selection: ${v.shops_detail.selection} | ld_detente/push_sub: ${v.shops_detail.push_sub}`,
    `/cmcteams .read=${v.cmc_read} · .write parent=${v.cmc_write_parent} · $key .write=${v.cmc_key_write} · /cmcteams_prive .read=${v.cmcteams_prive_read} · /cmcteams_secret .read=${v.cmcteams_secret_read}`,
    'lecture ANONYME (GET shallow) : ' + Object.keys(anon).map((p) => `${p}=${anon[p]}`).join(' · '),
  ];
  for (const l of lignes) console.log(l);
  if (process.env.GITHUB_ACTIONS) console.log('::notice title=Verrous Firebase en ligne (lecture seule)::' + lignes.join(' ⏎ '));
  return { verrous: v, anonyme: anon };
}

module.exports = { lireVerrous, sonderAnonyme, main, SONDES };
if (require.main === module) main().catch((e) => { console.error('❌ ' + e.message); if (process.env.GITHUB_ACTIONS) console.log('::error title=lire-verrous::' + e.message); process.exit(1); });
