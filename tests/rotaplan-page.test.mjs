/* Garde de la page de vente Rotaplan (shops/rotaplan/index.html).
 *
 * POURQUOI : la page est refaite sous le système de design « levels »
 * (vendor/agent-toolkit/awesome-design-skills/skills/levels) — orienté conversion,
 * contrastes WCAG 2.2 AA vérifiés. Sans garde, un « remets le noir et or » ou un
 * copier-coller de bloc casserait en silence la CSP, les liens légaux ou les
 * données structurées, et personne ne le verrait (règle : une règle sans
 * automatisme finit sautée, leçon #142).
 *
 * Ce que ça NE fait PAS : rendre la page. Le rendu réel (0 débordement, cibles
 * 44 px, polices chargées, 3 affichages) se mesure en vrai navigateur ; ce
 * fichier fige seulement ce qui doit rester vrai dans la source. */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = join(RACINE, 'shops/rotaplan/index.html');
const echecs = [];
const verifie = (nom, ok, detail = '') => { if (!ok) echecs.push(`${nom}${detail ? ' — ' + detail : ''}`); };

const h = readFileSync(PAGE, 'utf8');

/* 1. Sécurité : la page est publique sur un domaine public. */
const csp = (h.match(/Content-Security-Policy" content="([^"]+)"/) || [])[1] || '';
verifie('CSP présente', !!csp);
verifie("CSP interdit tout script (la page n'en exécute aucun)", csp.includes("script-src 'none'"));
verifie("CSP borne default-src", csp.includes("default-src 'self'"));
verifie("CSP interdit les objets", csp.includes("object-src 'none'"));
/* frame-ancestors est IGNORÉ en <meta> (mesuré dans Chromium) : l'anti-clickjacking
   est posé par le routeur (X-Frame-Options: SAMEORIGIN). Le remettre ici = réglage
   mort qui donne une fausse impression de protection. */
verifie("pas de frame-ancestors en <meta> (ignoré par le navigateur)", !csp.includes('frame-ancestors'));

/* 2. Données structurées : lisibles, et sans note/avis inventés. */
const ld = (h.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1];
verifie('bloc de données structurées présent', !!ld);
if (ld) {
  let j = null;
  try { j = JSON.parse(ld); } catch (e) { verifie('données structurées lisibles', false, String(e.message)); }
  if (j) {
    const types = (j['@graph'] || []).map(n => n['@type']);
    verifie('déclare le logiciel', types.includes('SoftwareApplication'));
    verifie('déclare les questions fréquentes', types.includes('FAQPage'));
    verifie('aucune note/avis inventé (règle : rien de faux)', !ld.includes('aggregateRating') && !ld.includes('"review"'));
    const offres = (j['@graph'].find(n => n['@type'] === 'SoftwareApplication') || {}).offers || [];
    verifie('les 3 tarifs sont déclarés', offres.length === 3, `trouvé ${offres.length}`);
    for (const o of offres) verifie(`tarif « ${o.name} » affiché dans la page`, h.includes(`${o.price} €`));
  }
}

/* 3. Liens : un lien mort sur une page de vente, c'est une vente perdue.
      Le précédent pointait /shops/legal/ — dossier SANS index.html, donc 404. */
for (const lien of [...h.matchAll(/href="(\/shops\/[^"#]+)"/g)].map(m => m[1])) {
  verifie(`lien interne ${lien} existe`, existsSync(join(RACINE, lien.replace(/^\//, ''))));
}
verifie('aucun lien vers /shops/legal/ (dossier sans index = 404)', !h.includes('href="/shops/legal/"'));

/* 4. Système de design « levels » : les jetons doivent rester ceux du système.
      Si quelqu'un revient au noir/or sans le décider, le test le dit. */
verifie('système nommé cité en commentaire', h.includes('awesome-design-skills/skills/levels'));
for (const [nom, jeton] of [['primaire', '--primaire:#27272A'], ['accent', '--accent:#8B5CF6'],
                            ['texte', '--texte:#111827'], ['surface', '--surface:#FFFFFF']]) {
  verifie(`jeton ${nom} du système conservé`, h.includes(jeton));
}
verifie('violet foncé pour le texte (7,1:1 — le #8B5CF6 seul ne passe pas AA)', h.includes('--accent-txt:#6D28D9'));
verifie('variante sombre présente', h.includes('prefers-color-scheme: dark'));
verifie('animations coupées si demandé', h.includes('prefers-reduced-motion'));
verifie('focus clavier visible', h.includes(':focus-visible'));

/* 5. iPhone : cibles tactiles. Mesuré : la marque faisait 32 px avant correction. */
verifie('marque ≥ 44 px', /\.marque\{[^}]*min-height:44px/.test(h));
verifie('boutons ≥ 44 px', /\.btn\{[^}]*min-height:48px/.test(h) && /\.btn-petit\{[^}]*min-height:44px/.test(h));
verifie('zone sûre iOS respectée', h.includes('env(safe-area-inset-bottom)'));

/* 6. Référencement : une page absente du sitemap est une page invisible. */
const sitemap = readFileSync(join(RACINE, 'shops/sitemap.xml'), 'utf8');
const canon = (h.match(/rel="canonical" href="([^"]+)"/) || [])[1] || '';
verifie('adresse canonique déclarée', !!canon);
/* Le sitemap doit pointer la MÊME adresse que la canonique, sinon on demande à
   Google d'indexer une page qui se déclare ailleurs. */
verifie('Rotaplan est dans le sitemap, à son adresse canonique', sitemap.includes(canon), `canonique=${canon}`);
verifie('un seul titre principal', (h.match(/<h1[\s>]/g) || []).length === 1);

/* 7. Honnêteté : les deux chiffres discutables gardent leur note de bas de page. */
verifie('le gain de temps garde son astérisque', h.includes('8&nbsp;h') && h.includes('mesuré sur l\'installation d\'origine'));
verifie('le comparatif de prix garde sa réserve', h.includes('vérifiez auprès d\'eux'));

if (echecs.length) {
  console.error(`Page Rotaplan : ${echecs.length} échec(s)`);
  for (const e of echecs) console.error('  ✗ ' + e);
  process.exit(1);
}
console.log('Page Rotaplan : 0 échec (sécurité, données structurées, liens, système levels, iPhone, référencement, honnêteté)');
