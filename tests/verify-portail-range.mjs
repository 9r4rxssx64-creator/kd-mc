/* GARDE — LE PORTAIL kd-mc.com EST RANGÉ, SANS RIEN PERDRE (Kevin 16.10.2026 : « fais-moi le tri… allège-moi mon domaine, sans rien perdre,
   et que j'ai toujours accès ; regroupe les boutiques avec un menu déroulant »). Toutes les adresses d'avant le tri restent des tuiles ;
   le tableau de bord unique est la première chose de « Mon espace », lui-même en tête ; les groupes sont des <details> (sans JS).
   node tests/verify-portail-range.mjs */
import { readFileSync } from 'node:fs';
let ok = 0, ko = 0; const t = (c, m) => { if (c) { ok++; console.log('  ✅ ' + m); } else { ko++; console.log('  ❌ ' + m); } };
const h = readFileSync('kdmc-home/index.html', 'utf8');
const AVANT = ["/admin/", "/clone/", "/cujina", "/cujina/livre.pdf", "/empreinte/", "/liens/", "https://admin.kd-mc.com/", "https://apex-ai.kd-mc.com/", "https://apex-chat.kd-mc.com/", "https://arbre.kd-mc.com/", "https://autorisations.kd-mc.com/", "https://beatbot.kd-mc.com/", "https://bot.kd-mc.com/", "https://chez-lolo.kd-mc.com/", "https://cmcteams-light.kd-mc.com/", "https://cmcteams.kd-mc.com/", "https://cmcteams.kd-mc.com/tools/finances/", "https://cmcteams.kd-mc.com/tools/messages/", "https://coffre.kd-mc.com/", "https://croupier.kd-mc.com/", "https://dashboard.kd-mc.com/", "https://dossiers.kd-mc.com/", "https://ia.kd-mc.com/", "https://javis.kd-mc.com/", "https://kit.kd-mc.com/", "https://la-detente.kd-mc.com/", "https://lingua.kd-mc.com/", "https://osint.kd-mc.com/", "https://outils.kd-mc.com/", "https://rotaplan.kd-mc.com/", "https://shops.kd-mc.com/", "https://shops.kd-mc.com/digital-vault/", "https://shops.kd-mc.com/ecocraft/", "https://shops.kd-mc.com/pawsome/", "https://shops.kd-mc.com/tech-hub/", "https://sourcing.kd-mc.com/", "https://studio.kd-mc.com/", "https://tor.kd-mc.com/", "https://worldmonitor.kd-mc.com/"];
const tuiles = new Set([...h.matchAll(/<a class="card[^"]*"[^>]*href="([^"]+)"/g)].map((m) => m[1]));
console.log('\nPortail rangé\n');
const perdues = AVANT.filter((x) => !tuiles.has(x));
t(perdues.length === 0, 'aucune des ' + AVANT.length + ' adresses d\'avant le tri n\'a disparu' + (perdues.length ? ' — perdues : ' + perdues.join(', ') : ''));
const iEspace = h.indexOf('id="priv-zone"'), iPro = h.indexOf('🎰 Pro &amp; métier'), iAdmin = h.indexOf('href="/admin/"', iEspace);
t(iEspace > 0 && iEspace < iPro, '« Mon espace » est en tête du portail');
t(iAdmin > iEspace && iAdmin < h.indexOf('<details', iEspace), 'le tableau de bord (/admin/) est la première tuile de « Mon espace »');
const boutiques = h.slice(h.indexOf('🛍️ Boutiques'), h.indexOf('Famille &amp; loisirs'));
t(/<details class="grp">[\s\S]*chez-lolo\.kd-mc\.com[\s\S]*la-detente\.kd-mc\.com/.test(boutiques), 'les boutiques sont dans un menu déroulant');
t(/<details class="grp sous">[\s\S]*tech-hub/.test(boutiques), 'les boutiques en construction sont rangées au fond du menu, pas en vitrine');
for (const id of ['priv-zone', 'javis-zone', 'bot-zone', 'access-zone', 'tor-zone']) t(new RegExp('id="' + id + '" hidden').test(h), id + ' existe et reste caché tant que kdmc-portal.js ne le révèle pas');
t(/details\.grp>summary\{[^}]*min-height:(4[4-9]|[5-9]\d)px/.test(h), 'les en-têtes des menus font au moins 44 px (doigt)');
console.log('\n' + ok + ' OK / ' + ko + ' échec(s)'); if (ko) process.exit(1);
