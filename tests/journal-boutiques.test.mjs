// Pont 2637 (17.11.2026) : les boutiques appellent le journal du domaine (window.kdmcJournal, posé par le
// routeur sur chaque page) APRÈS chaque enregistrement réussi : commande passée, produit ajouté, sélection
// de sourcing, paiement enregistré. Phrase courte, jamais une adresse, un e-mail, un moyen de paiement,
// une référence ni un code ; jamais dans une boucle.
// SABOTAGE=1 : lit une copie sans les appels → doit être rouge.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
const sab = process.env.SABOTAGE === '1';
const lire = (f) => { const s = readFileSync(f, 'utf8'); return sab ? s.replace(/window\.kdmcJournal/g, 'window.autreChose') : s; };
let ko = 0;
const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); if (!c) ko++; };

/* Chaque appel : [fichier, phrase attendue, repère qui doit le PRÉCÉDER (l'enregistrement réussi)] */
const ATTENDUS = [
  ['shops/chez-lolo/index.html', 'Chez Lolo : commande passée', 'localStorage.setItem("kdmc_orders_"+STORE_ID'],
  ['shops/chez-lolo/index.html', 'Chez Lolo : produit ajouté à la boutique', 'localStorage.setItem("cl_custom_products"'],
  ['shops/chez-lolo/studio.html', 'Chez Lolo : produit créé au Studio', 'localStorage.setItem("cl_custom_products"'],
  ['shops/la-detente/index.html', 'La Détente : commande passée', 'localStorage.setItem("kdmc_orders_"+STORE_ID'],
  ['shops/la-detente/studio.html', 'La Détente : produit créé au Studio', 'localStorage.setItem("ld_custom_products"'],
  ['shops/sourcing/sourcing.js', 'Sourcing : article ajouté à la sélection', "method: 'PUT'"],
  ['shops/sourcing/sourcing.js', 'Sourcing : article retiré de la sélection', "method: 'DELETE'"],
  ['shops/croupier/acces.js', 'Devenir croupier : paiement enregistré', "fetch(API + '/reclamer'"],
  ['shops/kit-ia/kit.js', 'Kit IA : commande enregistrée', 'ecrisRef(d.ref)'],
  ['shops/kit-ia/kit.js', 'Kit IA : paiement enregistré', 'function journal(t)'],
  ['shops/kit-ia/merci.js', 'Kit IA : paiement PayPal confirmé', "fetch(API + '/caisse/capture'"],
];
const fichiers = {};
for (const [f, phrase, avant] of ATTENDUS) {
  const s = fichiers[f] || (fichiers[f] = lire(f));
  const i = s.indexOf(phrase), j = s.indexOf(avant);
  const appel = i > 0 && /kdmcJournal|journal\(|journalPaiement/.test(s.slice(Math.max(0, i - 140), i));
  ok(i > 0 && appel && (sab || /window\.kdmcJournal/.test(s)), f.replace('shops/', '') + ' : « ' + phrase + ' »');
  ok(j >= 0 && i > j, f.replace('shops/', '') + ' : appel APRÈS l\'enregistrement (' + avant.slice(0, 40) + ')');
}

/* Kit IA : le paiement n'est journalisé que s'il est vraiment enregistré, et les deux voies « J'ai payé » l'appellent. */
const kit = fichiers['shops/kit-ia/kit.js'];
ok(/function journal\(t\) \{ try \{ if \(window\.kdmcJournal\) window\.kdmcJournal\(t\)/.test(kit), 'Kit IA : helper journal (sans routeur : rien, jamais d\'erreur)');
ok(/v\.etat === 'ok' \|\| v\.etat === 'attente'/.test(kit) && (kit.match(/journalPaiement\(v\)/g) || []).length >= 2, 'Kit IA : paiement journalisé seulement s\'il est enregistré, sur les 2 voies');
ok(/r && r\.ok && window\.kdmcJournal/.test(fichiers['shops/sourcing/sourcing.js']), 'Sourcing : seulement si la base a répondu OK');
ok(/!d\.deja_delivre && window\.kdmcJournal/.test(fichiers['shops/kit-ia/merci.js']), 'Kit IA merci : pas de 2ᵉ ligne quand l\'accès était déjà ouvert');

/* Rien de personnel dans une phrase, jamais dans une boucle. */
for (const [f, s] of Object.entries(fichiers)) {
  const appels = [...s.matchAll(/(?:kdmcJournal|[^.\w]journal)\(([^;\n]{0,200})\)/g)].map((m) => m[1]);
  const perso = appels.filter((a) => /email|mail\b|ck\.|cli\.|\.ref\b|\bref\b|code|password|passwd|adresse|addr|phone|tel|iban|method|total|fmtP/i.test(a.replace(/produit/g, '')));
  ok(!perso.length, f.replace('shops/', '') + ' : aucune donnée personnelle ni montant dans le journal' + (perso.length ? ' → ' + perso.join(' | ') : ''));
  const lignes = s.split('\n').filter((l) => /window\.kdmcJournal\(/.test(l));
  ok(!lignes.some((l) => /\.(forEach|map)\(function/.test(l)), f.replace('shops/', '') + ' : aucun appel dans une boucle');
}
/* 19.11 (robot réel verif-live-journal) : « Devenir croupier » n'envoyait rien — sa CSP (connect-src) n'autorisait que le worker de vente, donc le POST
   /__boite/journal (même domaine) était refusé par le navigateur. Toute page qui appelle le journal (elle-même ou un de ses scripts locaux) doit autoriser 'self'. */
const pages = [...new Set(ATTENDUS.map(([f]) => f.split('/').slice(0, 2).join('/')))]
  .flatMap((d) => readdirSync(d).filter((n) => n.endsWith('.html')).map((n) => d + '/' + n));
for (const html of pages) {
  const src = readFileSync(html, 'utf8');
  const locaux = [...src.matchAll(/<script[^>]*\ssrc="([^":]+\.js)"/g)].map((m) => m[1]).filter((s) => !s.startsWith('/'))
    .map((s) => html.replace(/[^/]+$/, '') + s).filter((f) => existsSync(f));
  if (!/kdmcJournal/.test(src) && !locaux.some((f) => /kdmcJournal/.test(readFileSync(f, 'utf8')))) continue;
  const csp = (src.match(/http-equiv="Content-Security-Policy"\s+content="([^"]*)"/i) || [])[1];
  if (!csp) { ok(true, html.replace('shops/', '') + ' : pas de CSP en page, le journal peut partir'); continue; }
  const dir = (n) => { const m = csp.match(new RegExp('(?:^|;)\\s*' + n + '\\s+([^;]*)')); return m ? ' ' + m[1].trim() + ' ' : null; };
  const c = dir('connect-src') ?? dir('default-src') ?? ' * ';
  const permis = sab ? false : /\s'self'\s|\s\*\s/.test(c);
  ok(permis, html.replace('shops/', '') + " : la CSP laisse partir le journal (connect-src 'self')");
}
process.exit(ko ? 1 : 0);
