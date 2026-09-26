/* Archive Epstein — générateur de la page (Kevin 2026-09-18).
   CE QU'ON FAIT : on INDEXE les sources officielles et on renvoie vers l'original.
   CE QU'ON NE FAIT PAS, et ce n'est pas négociable :
     · aucune photo de victime, aucune « photo privée » — les éditeurs officiels
       retirent l'identité des victimes et le matériel d'abus sur mineurs AVANT de
       publier ; ce qui circule ailleurs est soit faux, soit illégal à détenir ;
     · on ne désigne personne comme coupable — être cité dans un document remis au
       Congrès, ce n'est pas être mis en cause.
   Ces deux règles sont tenues par tests/dossiers.test.mjs, pas seulement écrites ici. */
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const SRC = new URL('sources.json', import.meta.url);
export const DIR = new URL('../../dossiers/', import.meta.url);

/* Un seul endroit décide ce qu'est une source « officielle ». Élargir cette liste
   est une décision, pas un détail : chaque domaine ajouté est un domaine dont on
   n'a pas vérifié la politique de floutage des victimes. */
export const DOMAINES_OFFICIELS = ['oversight.house.gov', 'www.justice.gov', 'justice.gov', 'www.govinfo.gov', 'govinfo.gov', 'www.courtlistener.com', 'courtlistener.com', 'www.archives.gov', 'archives.gov'];

export function estOfficiel(url) {
  try {
    const u = new URL(String(url));
    return u.protocol === 'https:' && DOMAINES_OFFICIELS.includes(u.hostname);
  } catch (_) { return false; }
}

export function lit() { return JSON.parse(readFileSync(SRC, 'utf8')); }

export function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* Total de pages affiché : uniquement ce qui est CHIFFRÉ dans le catalogue.
   Une collection sans compte ne doit pas gonfler le total « au pif » — c'est la
   règle « jamais estimer, toujours mesurer » appliquée à un nombre montré au public. */
export function totalPages(collections) {
  return (collections || []).reduce((t, c) => t + (Number.isFinite(c.pages) ? c.pages : 0), 0);
}
export function nbChiffrees(collections) {
  return (collections || []).filter((c) => Number.isFinite(c.pages)).length;
}

export function fiche(c) {
  const pages = Number.isFinite(c.pages) ? `<span class="chiffre">${c.pages.toLocaleString('fr-FR')} pages</span>` : '';
  return `<article class="fiche" data-cherche="${esc((c.titre + ' ' + c.institution + ' ' + c.quoi).toLowerCase())}">
      <h3>${esc(c.titre)}</h3>
      <p class="meta">${esc(c.institution)} · ${esc(c.date)} ${pages}</p>
      <p>${esc(c.quoi)}</p>
      <p><a class="btn" href="${esc(c.url)}" rel="noopener nofollow" target="_blank">Ouvrir l'original</a></p>
    </article>`;
}

export function html(d) {
  const cols = d.collections || [];
  const total = totalPages(cols);
  const desc = `Les documents publics de l'affaire Epstein, rangés et renvoyés vers leur source officielle : ${total.toLocaleString('fr-FR')} pages recensées, ${cols.length} collections.`;
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'none'; object-src 'none'; frame-ancestors 'none'; upgrade-insecure-requests" />
<title>${esc(d.titre)}</title>
<meta name="description" content="${esc(desc)}" />
<link rel="stylesheet" href="dossiers.css" />
</head>
<body>
<main>
  <h1>${esc(d.titre)}</h1>
  <p class="chapo">${esc(d.sous_titre)}</p>

  <section class="avert">
    <h2>À lire avant de cliquer</h2>
    <ul>${(d.avertissement || []).map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
  </section>

  <p class="compte">${total.toLocaleString('fr-FR')} pages recensées sur ${cols.length} collections — mise à jour ${esc(d.maj)}.</p>

  <label class="sr" for="q">Chercher dans les collections</label>
  <input id="q" type="search" placeholder="Chercher : ministère, succession, banques…" autocomplete="off" />
  <p class="compte" id="resultat" hidden></p>

  <div id="liste">${cols.map(fiche).join('\n')}</div>

  <noscript><p class="compte">La recherche a besoin de JavaScript. Les ${cols.length} collections sont toutes affichées ci-dessus, avec leur lien.</p></noscript>

  <footer>
    <p>Aucun document n'est hébergé ici. Chaque lien renvoie vers l'institution qui l'a publié.</p>
    <p><a href="https://kd-mc.com/">kd-mc.com</a></p>
  </footer>
</main>
<script src="dossiers.js"></script>
</body>
</html>
`;
}

export function css() {
  return `:root{--fond:#0f1115;--carte:#171a21;--txt:#e8eaf0;--mut:#9aa3b2;--or:#e8b830;--ligne:rgba(255,255,255,.08)}
*{box-sizing:border-box}
body{margin:0;background:var(--fond);color:var(--txt);font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;-webkit-text-size-adjust:100%}
main{max-width:760px;margin:0 auto;padding:24px 16px calc(40px + env(safe-area-inset-bottom))}
h1{font-size:28px;line-height:1.25;margin:0 0 8px}
h2{font-size:18px;margin:0 0 8px}
h3{font-size:17px;margin:0 0 6px}
.chapo{color:var(--mut);margin:0 0 24px}
.avert{background:var(--carte);border:1px solid var(--ligne);border-left:3px solid var(--or);border-radius:12px;padding:16px;margin:0 0 24px}
.avert ul{margin:0;padding-left:20px}
.avert li{margin:8px 0;color:var(--mut)}
.compte{color:var(--mut);font-size:14px;margin:0 0 16px}
input[type=search]{width:100%;min-height:44px;font-size:16px;padding:10px 14px;border-radius:12px;border:1px solid var(--ligne);background:var(--carte);color:var(--txt)}
input[type=search]::placeholder{color:var(--mut)}
.fiche{background:var(--carte);border:1px solid var(--ligne);border-radius:12px;padding:16px;margin:16px 0}
.fiche p{margin:0 0 10px}
.meta{color:var(--mut);font-size:14px}
.chiffre{color:var(--or);font-weight:600}
.btn{display:inline-flex;align-items:center;min-height:44px;padding:10px 16px;border-radius:12px;background:var(--or);color:#11160c;font-weight:700;text-decoration:none}
footer{margin-top:32px;padding-top:16px;border-top:1px solid var(--ligne);color:var(--mut);font-size:14px}
footer a{color:var(--or)}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
@media(prefers-reduced-motion:no-preference){.fiche{transition:border-color .2s}}
`;
}

export function js() {
  return `(function () {
  'use strict';
  var q = document.getElementById('q');
  var res = document.getElementById('resultat');
  if (!q) return;
  var fiches = [].slice.call(document.querySelectorAll('.fiche'));
  var t = null;
  function filtre() {
    var v = q.value.trim().toLowerCase();
    var n = 0;
    fiches.forEach(function (f) {
      var ok = !v || (f.getAttribute('data-cherche') || '').indexOf(v) >= 0;
      f.hidden = !ok;
      if (ok) n++;
    });
    /* Dire « rien trouvé » plutôt que laisser un écran vide. */
    res.textContent = !v ? '' : (n ? n + ' collection(s)' : 'Rien sous ce mot. Essaie « justice », « succession », « banques ».');
    res.hidden = !v;
  }
  q.addEventListener('input', function () { clearTimeout(t); t = setTimeout(filtre, 150); });
})();
`;
}

export function fichiers() {
  const d = lit();
  return { 'index.html': html(d), 'dossiers.css': css(), 'dossiers.js': js() };
}

export function ecrire() {
  const f = fichiers();
  for (const [nom, contenu] of Object.entries(f)) writeFileSync(new URL(nom, DIR), contenu);
  return Object.keys(f);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--verifier')) {
    const f = fichiers();
    let ecart = 0;
    for (const [nom, attendu] of Object.entries(f)) {
      let vu = '';
      try { vu = readFileSync(new URL(nom, DIR), 'utf8'); } catch (_) { vu = ''; }
      if (vu !== attendu) { console.log('À REGÉNÉRER : ' + nom); ecart++; }
    }
    if (ecart) { console.log('Lance : node tools/dossiers/page.mjs'); process.exit(1); }
    console.log('Archive à jour (' + Object.keys(f).length + ' fichiers).');
  } else {
    console.log('Écrit : ' + ecrire().join(', '));
  }
}
