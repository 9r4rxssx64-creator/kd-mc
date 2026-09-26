/* Garde « Tor en clair » (tools/tor/index.html) — Kevin 2026-09-15.
 *
 * Raison d'être : c'est une page qui donne des ADRESSES. Une adresse fausse ou un lien
 * vers un pont web, et l'outil censé protéger Kevin devient exactement le piège qu'il
 * décrit. Cette garde interdit mécaniquement les 5 façons de se tromper :
 *   1. une adresse .onion malformée (une vraie adresse v3 = 56 caractères base32) ;
 *   2. une fiche sans SOURCE officielle en clair (= « crois-moi sur parole ») ;
 *   3. une source qui serait elle-même un .onion (invérifiable depuis Safari) ;
 *   4. un « pont web » / proxy tor2web quelque part dans la page (casse l'anonymat) ;
 *   5. une adresse .onion rendue CLIQUABLE (un clic depuis Safari ne peut aboutir
 *      que sur un pont web — d'où le bouton « Copier » à la place).
 * Prouvée discriminante par sabotage (voir le commit).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require0 = createRequire(import.meta.url);
import { strict as assert } from 'node:assert';

const PAGE = 'tools/tor/index.html';
const html = readFileSync(new URL('../' + PAGE, import.meta.url), 'utf8');
let ok = 0;
const t = (nom, fn) => { fn(); ok++; console.log('  ✓ ' + nom); };

/* --- Extraction du catalogue tel qu'il est réellement écrit dans la page --- */
const bloc = html.match(/var SITES = \[([\s\S]*?)\n\];/);
assert(bloc, 'catalogue SITES introuvable dans ' + PAGE);
const fiches = [...bloc[1].matchAll(/\{c:"(.*?)", *n:"(.*?)", *d:"(.*?)", *o:"(.*?)", *s:"(.*?)"\}/g)]
  .map(m => ({ c: m[1], n: m[2], d: m[3], o: m[4], s: m[5] }));

console.log('Garde « Tor en clair » — ' + fiches.length + ' fiches lues dans ' + PAGE);

t('le catalogue contient au moins 15 services', () => {
  assert(fiches.length >= 15, 'seulement ' + fiches.length + ' fiches');
});

/* Une adresse v3 = 56 caractères base32 (a-z, 2-7) + « .onion ».
   Un préfixe (www.) et un chemin (/learningenglish/) sont légitimes. */
t('chaque adresse est une vraie adresse .onion v3 (56 caractères base32)', () => {
  for (const f of fiches) {
    const hote = f.o.replace(/\/.*$/, '');
    assert(hote.endsWith('.onion'), f.n + ' : « ' + hote + ' » ne finit pas par .onion');
    const labels = hote.slice(0, -'.onion'.length).split('.');
    const cle = labels[labels.length - 1];
    assert.equal(cle.length, 56, f.n + ' : clé de ' + cle.length + ' caractères au lieu de 56 (« ' + cle + ' »)');
    assert(/^[a-z2-7]{56}$/.test(cle), f.n + ' : caractères hors base32 dans la clé');
  }
});

t('aucune adresse en double (deux noms pour la même adresse = piège possible)', () => {
  const vues = new Map();
  for (const f of fiches) {
    const hote = f.o.replace(/\/.*$/, '');
    const cle = hote.slice(0, -'.onion'.length).split('.').pop();
    if (vues.has(cle)) assert(f.n.startsWith('BBC') && vues.get(cle).startsWith('BBC'),
      'adresse partagée par « ' + vues.get(cle) + ' » et « ' + f.n + ' »');
    vues.set(cle, f.n);
  }
});

t('chaque fiche porte une source officielle en clair, vérifiable depuis Safari', () => {
  for (const f of fiches) {
    assert(/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}/i.test(f.s), f.n + ' : source « ' + f.s + ' » invalide');
    assert(!f.s.includes('.onion'), f.n + ' : la source est un .onion, donc invérifiable avant d\'avoir Tor');
  }
});

t('chaque fiche a un nom, une catégorie et une explication en français', () => {
  for (const f of fiches) {
    assert(f.n.length >= 3, 'nom trop court : ' + JSON.stringify(f.n));
    assert(f.c.length >= 3, f.n + ' : catégorie manquante');
    assert(f.d.length >= 30, f.n + ' : explication trop courte (' + f.d.length + ' car.) — Kevin doit savoir à quoi ça sert');
  }
});

/* Les ponts web : ils ouvrent du .onion dans un navigateur normal, en se mettant
   au milieu. Leur seule présence hors de la mise en garde contredirait tout le propos.
   Tolérance STRICTE : uniquement à l'intérieur du bloc #ponts (la mise en garde
   elle-même), jamais « quelque part à côté » — un voisinage large laissait passer
   une astuce ajoutée juste après une autre mise en garde (trou trouvé par sabotage). */
function blocDe(id) {
  const i = html.indexOf('id="' + id + '"');
  if (i < 0) return '';
  const fin = html.indexOf('</section>', i);
  return html.slice(i, fin < 0 ? html.length : fin);
}
const PONTS = ['tor2web', 'onion.ly', 'onion.pet', 'onion.ws', 'onion.cab', 'onion.to',
               'onion.sh', 'darknet.to', 'onion.link', 'onion.moe'];
t('aucun « pont web » (proxy tor2web) hors du bloc de mise en garde', () => {
  const horsGarde = html.replace(blocDe('ponts'), '').toLowerCase();
  for (const p of PONTS) {
    assert(!horsGarde.includes(p), 'le pont web « ' + p + ' » apparaît hors de la mise en garde #ponts');
  }
});

t('la mise en garde contre les ponts web existe toujours', () => {
  const b = blocDe('ponts').toLowerCase();
  assert(b.length > 200, 'bloc #ponts introuvable ou vide');
  assert(b.includes('au milieu'), 'la mise en garde n\'explique plus POURQUOI (« au milieu »)');
});

t('aucune adresse .onion n\'est cliquable (href/src) — on copie, on ne clique pas', () => {
  const liens = [...html.matchAll(/(?:href|src)\s*=\s*"([^"]*\.onion[^"]*)"/gi)].map(m => m[1]);
  assert.equal(liens.length, 0, 'lien(s) cliquable(s) vers du .onion : ' + liens.join(', '));
});

t('aucun annuaire de marchés illégaux hors du bloc « ce que je n\'ai pas mis »', () => {
  const horsExclus = html.replace(blocDe('exclus'), '').toLowerCase();
  for (const mot of ['hidden wiki', 'hiddenwiki', 'darknetlive', 'dread', 'tormarket', 'darkmarket']) {
    assert(!horsExclus.includes(mot), 'référence à « ' + mot + ' » hors de la mise en garde #exclus');
  }
});

/* Les 8 règles sont la vraie protection : elles ne doivent pas disparaître à la faveur
   d'une refonte cosmétique. */
t('les règles de sécurité non négociables sont toujours présentes', () => {
  for (const r of ['Ne télécharge rien', 'Ne te connecte à aucun de tes comptes',
                   'Aucun paiement', 'Vérifie l\'adresse caractère par caractère']) {
    assert(html.includes(r), 'règle manquante : « ' + r + ' »');
  }
});

t('la page n\'appelle aucun serveur (CSP connect-src \'none\', 0 ressource externe)', () => {
  assert(html.includes("connect-src 'none'"), "CSP : connect-src 'none' absent");
  const ext = [...html.matchAll(/(?:href|src)\s*=\s*"(https?:\/\/[^"]+)"/gi)]
    .map(m => m[1])
    .filter(u => !/^https:\/\/(apps\.apple\.com|www\.torproject\.org|www\.internet-signalement\.gouv\.fr|app\.tuta\.com|coffre\.kd-mc\.com|ahmia\.fi)/.test(u));
  const fichesSrc = new Set(fiches.map(f => f.s));
  const inattendus = ext.filter(u => !fichesSrc.has(u));
  assert.equal(inattendus.length, 0, 'lien externe inattendu : ' + inattendus.join(', '));
});

t('page mobile-first : viewport, safe-area et cibles tactiles ≥ 44px', () => {
  assert(html.includes('viewport-fit=cover'), 'viewport-fit=cover absent');
  assert(html.includes('env(safe-area-inset-bottom)'), 'safe-area-inset-bottom absent');
  const tailles = [...html.matchAll(/min-height:(\d+)px/g)].map(m => +m[1]);
  assert(tailles.length >= 3, 'aucune hauteur de bouton déclarée');
  assert(tailles.every(v => v >= 40), 'cible tactile trop petite : ' + Math.min(...tailles) + 'px');
});


/* ── Générateur d'identité : il fabrique des SECRETS. S'il les envoyait quelque part,
   ou s'il utilisait un hasard faible (Math.random), l'outil deviendrait dangereux. ── */
t('l\'identité est fabriquée sur le téléphone, jamais envoyée', () => {
  assert(html.includes('crypto.getRandomValues'), 'le générateur n\'utilise pas le hasard cryptographique');
  const script = html.slice(html.indexOf('<script>'));
  assert(!/\bfetch\s*\(/.test(script), 'un fetch() traîne dans la page');
  assert(!/XMLHttpRequest|navigator\.sendBeacon|new WebSocket|EventSource/.test(script),
    'un moyen d\'envoyer des données traîne dans la page');
});

t('le hasard du générateur est sans biais et sans Math.random', () => {
  const script = html.slice(html.indexOf('<script>'));
  assert(!/Math\.random/.test(script), 'Math.random utilisé pour fabriquer un secret');
  assert(/Math\.floor\(4294967296 \/ n\) \* n/.test(script), 'le rejet anti-biais du tirage a disparu');
});

t('le vocabulaire du générateur reste assez large pour un vrai secret', () => {
  const m = html.match(/var MOTS = \("([^"]+)"\)/);
  assert(m, 'liste de mots introuvable');
  const mots = m[1].split(',');
  assert(mots.length >= 150, 'seulement ' + mots.length + ' mots — phrase de passe trop faible');
  assert(new Set(mots).size === mots.length, 'doublons dans la liste de mots (réduit le hasard réel)');
  assert(/for \(var i = 0; i < 7; i\+\+\)/.test(html), 'la phrase de passe ne fait plus 7 mots');
});

t('les règles d\'étanchéité de l\'identité sont là', () => {
  for (const r of ['Cette identité ne sert QU\'À ÇA', 'Jamais ton vrai mail en secours', 'Seulement dans Tor.']) {
    assert(html.includes(r), 'règle d\'étanchéité manquante : « ' + r + ' »');
  }
});

t('la promesse « rien n\'est envoyé, rien n\'est enregistré » est sur le générateur lui-même', () => {
  const b = blocDe('promesse');
  assert(b.length > 100, 'bloc #promesse introuvable — la promesse a été déplacée ou retirée');
  assert(/rien n'est envoyé/i.test(b) && /rien n'est enregistré/i.test(b),
    'la promesse n\'est plus affichée à côté du bouton qui fabrique les secrets');
});

/* ── Exploration : Kevin veut pouvoir tout voir. Le moteur qui le permet doit rester
   en tête du catalogue, et les 3 limites doivent rester écrites. ── */
t('le bloc Explorer met un moteur de recherche en avant', () => {
  const b = blocDe('explorer');
  assert(b.length > 200, 'bloc #explorer introuvable');
  assert(b.includes('<b>Ahmia</b>'), 'le moteur n\'est plus nommé dans le texte du bloc Explorer');
  assert(/copie-ahmia/.test(html), 'le bouton de copie du moteur a disparu');
  assert(fiches.some(f => f.n === 'Ahmia'), 'le moteur n\'est plus dans le catalogue : le bouton copierait du vide');
});

t('les 3 limites non négociables sont toujours écrites', () => {
  for (const r of ['pédocriminels', 'Commander une violence', 'Acheter quoi que ce soit']) {
    assert(html.includes(r), 'limite manquante : « ' + r + ' »');
  }
});


/* ── Intégration au domaine : le registre ET la tuile du portail. Sans tuile, Kevin
   devrait taper l'adresse à la main = fonction inexistante (leçon du 2026-08-05). ── */
t('l\'outil est inscrit partout dans le domaine (registre, routeur, replis)', () => {
  const attendus = ['kdmc-home/apps.json', 'services/kdmc-router/worker.js',
                    'services/kdmc-router/wrangler.toml', 'kdmc-home/kdmc-portal.js',
                    'kdmc-home/admin/admin.js'];
  for (const f of attendus) {
    const c = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    assert(/['"\/]tor\.kd-mc\.com/.test(c), 'tor.kd-mc.com absent de ' + f);
  }
});

t('la tuile du portail existe, pointe sur l\'outil, et reste dans une zone privée', () => {
  const portail = readFileSync(new URL('../kdmc-home/index.html', import.meta.url), 'utf8');
  const i = portail.indexOf('id="tor-zone"');
  assert(i > 0, 'la zone #tor-zone a disparu du portail');
  const zone = portail.slice(i, portail.indexOf('</div>', i));
  assert(/hidden/.test(portail.slice(i - 40, i + 40)), 'la zone n\'est plus masquée par défaut : tout le monde la verrait');
  assert(zone.includes('https://tor.kd-mc.com/'), 'la tuile ne pointe plus sur l\'outil');
  const js = readFileSync(new URL('../kdmc-home/kdmc-portal.js', import.meta.url), 'utf8');
  assert(js.includes("getElementById('tor-zone')"), 'la règle d\'affichage de la tuile a disparu');
  assert(/estKevin[\s\S]{0,120}kevin\|desarzens/.test(js), 'la tuile n\'est plus réservée à Kevin');
});


/* ── « Non traçable » : ce que la page garde, dit et sait effacer. ── */
t('la page n\'écrit qu\'UNE clé de stockage, et sait l\'effacer', () => {
  const cles = [...html.matchAll(/localStorage\.(?:setItem|getItem|removeItem)\("([^"]+)"/g)].map(m => m[1]);
  const uniques = [...new Set(cles)];
  assert.deepEqual(uniques, ['tor_vue'], 'clés de stockage inattendues : ' + uniques.join(', '));
  assert(html.includes('localStorage.removeItem("tor_vue")'), 'plus moyen d\'effacer la trace');
  assert(!/sessionStorage|indexedDB|document\.cookie/.test(html), 'un autre stockage est apparu');
});

t('la page explique honnêtement la trace qu\'elle ne peut PAS effacer', () => {
  const b = blocDe('traces');
  assert(b.length > 400, 'bloc #traces introuvable');
  assert(/ton opérateur et l'hébergeur voient/.test(b),
    'la page ne dit plus que la visite elle-même est visible — ce serait une fausse promesse');
  assert(/hors-ligne/.test(html) && /efface/.test(html), 'les deux boutons de maîtrise des traces ont disparu');
});

t('l\'enregistrement hors ligne se fait sans réseau (copie du document, pas un téléchargement)', () => {
  assert(/document\.documentElement\.outerHTML/.test(html),
    'la copie hors ligne ne se fabrique plus depuis la page déjà chargée : elle appellerait le réseau');
});

t('aucun mouchard, aucune mesure d\'audience', () => {
  const bas = html.toLowerCase();
  for (const m of ['google-analytics', 'gtag(', 'googletagmanager', 'cloudflareinsights',
                   'plausible', 'matomo', 'hotjar', 'facebook.net', 'sentry']) {
    assert(!bas.includes(m), 'mouchard trouvé : ' + m);
  }
});


/* ── L'outil qui ouvre VRAIMENT les .onion. Il ne peut pas tourner ici (réseau fermé),
   mais sa logique se prouve hors ligne — sinon il resterait une intention, pas un outil. ── */
t('le vérificateur réel existe, tourne, et classe les 4 cas', () => {
  const { execFileSync } = require0('node:child_process');
  const sortie = execFileSync(process.execPath,
    [new URL('../tools/tor/verif-onion.mjs', import.meta.url).pathname, '--simule'],
    { encoding: 'utf8' });
  for (const etat of ['vivant', 'protégé', 'erreur', 'injoignable']) {
    assert(sortie.includes(etat), 'le classement « ' + etat + ' » a disparu');
  }
  assert(/\d+\/20 adresses répondent/.test(sortie), 'le décompte final a disparu');
  assert(sortie.includes('ne prouvent RIEN'), 'le mode simulé ne s\'annonce plus comme tel : on croirait à un vrai verdict');
});

t('sans Tor, il REFUSE au lieu d\'annoncer « tout est mort »', () => {
  /* Le piège : sans Tor, curl échoue sur les 20 adresses et le rapport dirait que le
     catalogue entier est mort — un faux verdict, pire que pas de verdict. On pointe donc
     TOR_SOCKS sur un port fermé, et on exige un refus net (sortie 2, aucun rapport). */
  const { spawnSync } = require0('node:child_process');
  const r = spawnSync(process.execPath,
    [new URL('../tools/tor/verif-onion.mjs', import.meta.url).pathname],
    { encoding: 'utf8', env: { ...process.env, TOR_SOCKS: '127.0.0.1:1' } });
  assert(r.status === 2, 'le vérificateur n\'a pas refusé (sortie ' + r.status + ') : il a produit un verdict sans Tor');
  const sortie = (r.stderr || '') + (r.stdout || '');
  assert(/faux verdict/.test(sortie), 'le refus n\'explique plus pourquoi');
  assert(!/adresses répondent/.test(sortie), 'un décompte a quand même été produit sans Tor');
  const src = readFileSync(new URL('../tools/tor/verif-onion.mjs', import.meta.url), 'utf8');
  assert(/9150/.test(src), 'le port du Tor Browser (9150) n\'est plus cherché : Kevin ne pourrait pas lancer la vérification lui-même');
});

t('le vérificateur lit le catalogue dans la page, sans le recopier', () => {
  const src = readFileSync(new URL('../tools/tor/verif-onion.mjs', import.meta.url), 'utf8');
  assert(src.includes("readFileSync(new URL('./index.html'"), 'le catalogue est recopié ailleurs : les deux listes vont diverger');
  assert(!/\.onion"/.test(src.replace(/\*.*?\*\//gs, '')), 'une adresse en dur traîne dans le vérificateur');
});

t('sa destination est écrite, et ce n\'est pas GitHub Actions', () => {
  const src = readFileSync(new URL('../tools/tor/verif-onion.mjs', import.meta.url), 'utf8');
  assert(/GitHub Actions *: *INTERDIT/.test(src), 'la destination n\'est plus expliquée dans l\'outil');
  const gl = readFileSync(new URL('../.gitlab-ci.yml', import.meta.url), 'utf8');
  assert(gl.includes('tor-adresses:'), 'le job GitLab a disparu');
  assert(/tor-adresses:[\s\S]{0,900}when: manual/.test(gl), 'le job n\'est plus « à la demande »');
  assert(!/tor-adresses:[\s\S]{0,900}(schedule|cron)/.test(gl), 'une tâche programmée est apparue : interdit');
  const wf = readdirSync(new URL('../.github/workflows/', import.meta.url))
    .filter(f => /\.ya?ml$/.test(f));   /* le dossier contient aussi des sous-dossiers */
  for (const f of wf) {
    const c = readFileSync(new URL('../.github/workflows/' + f, import.meta.url), 'utf8');
    assert(!c.includes('verif-onion.mjs'), 'le vérificateur a été câblé dans GitHub Actions (' + f + ') : c\'est exactement ce qui a fait suspendre le compte');
  }
});


/* ── Le vérificateur d'adresse est la protection la plus forte de l'outil (c'est lui qui
   voit la fausse adresse). Il doit exister, et surtout garder la comparaison de préfixe :
   sans elle, il ne détecte plus les imitations, qui sont TOUTE la menace. ── */
t('une adresse muette a DROIT à un deuxième essai avant d\'être dite injoignable', () => {
  /* Un `000` sur Tor = « le circuit n'a pas abouti », pas « l'adresse est morte ».
     Mesuré le 17.09 : 7 des 20 adresses (Tor Project, NYT, ProPublica, The Intercept…)
     sont sorties muettes au 1er essai depuis un runner — des services qui vivent très
     bien. Déclarer « mort » là-dessus, c'est accuser un catalogue correct : la même
     faute que le faux verdict de la leçon #268, retournée contre l'adresse. */
  const src = readFileSync(new URL('../tools/tor/verif-onion.mjs', import.meta.url), 'utf8');
  assert(/muettes/.test(src) && /2e essai/.test(src),
    'la deuxième passe sur les adresses muettes a disparu : un seul timeout redeviendrait un verdict');
  assert(/injoignables:/.test(src) && !/\bmorts:/.test(src),
    'le rapport reparle d\'adresses « mortes » : on ne peut constater que « pas ouverte d\'ici »');
  assert(/pas une preuve que l\\?'adresse est morte/.test(src),
    'la réserve honnête a disparu du rapport');
});

t('le chemin qui lance la vérification est manuel, ne touche pas main, ne fuit pas le jeton', () => {
  /* Une session Claude n'a aucun jeton GitLab (mesuré 17.09). Le seul chemin est un
     workflow que JE déclenche et qui publie le dépôt vers son miroir. Trois choses ne
     doivent jamais bouger : il reste strictement à la main (un cron = le volume qui a
     fait suspendre le compte), il ne pousse jamais la lignée GitHub sur main GitLab
     (les deux lignées n'ont pas d'ancêtre commun), et le jeton n'apparaît nulle part. */
  const wf = readFileSync(new URL('../.github/workflows/publier-gitlab.yml', import.meta.url), 'utf8');
  assert(/^on:\s*\n\s+workflow_dispatch:/m.test(wf), 'le déclencheur n\'est plus « à la main » uniquement');
  assert(!/\bschedule:|\bcron:/.test(wf), 'une tâche programmée est apparue : c\'est exactement ce qui a fait suspendre le compte');
  assert(!/pull_request_target|issue_comment/.test(wf), 'un déclencheur ouvert à un inconnu est apparu');
  assert(/case .*CIBLE.*in[\s\S]{0,200}main\|master/.test(wf), 'le refus de pousser sur main a disparu');
  /* CHAQUE push doit être filtré, pas seulement le premier : git affiche l'URL
     distante dans ses messages, et l'URL porte le jeton. Une seule ligne oubliée
     et le jeton part en clair dans un journal public. */
  const pousses = (wf.match(/git push[^\n]*\$\{DEPOT\}|git push --force-with-lease "\$\{DEPOT\}"/g) || []).length;
  const filtres = (wf.match(/sed -e "s#\$\{JETON\}#\*\*\*#g"/g) || []).length;
  assert(pousses > 0, 'plus aucun push vers le miroir : le chemin est mort');
  assert(filtres >= pousses,
    'un push n\'est pas filtré (' + filtres + ' filtre(s) pour ' + pousses + ' push) : le jeton peut apparaître dans le journal');
  assert(/ci\.variable="TOR_ADRESSES=1"/.test(wf), 'la demande de travail a disparu : le job ne partirait plus tout seul');
  /* Le commit qui porte la demande ne doit PAS dire « [skip ci] ». Sur GitHub c'est le
     réflexe (un commit de robot ne relance pas la CI) ; GitLab lit la même marque et
     saute TOUT le pipeline. Vécu le 17.09 : premier lancement, push accepté, variable
     posée… et rien n'a tourné, parce que le commit se sabordait lui-même. */
  const ligneCommit = (wf.match(/git commit --allow-empty[^\n]*/) || [''])[0];
  assert(ligneCommit, 'le commit qui porte la demande a disparu : le job ne partirait plus');
  assert(!/\[\s*(skip\s+ci|ci\s+skip)\s*\]/i.test(ligneCommit),
    'le commit qui doit LANCER le pipeline porte « [skip ci] » : GitLab le lit aussi et ne lance rien');
  /* Le RETOUR (lire le résultat côté GitLab) doit passer le jeton dans un EN-TÊTE.
     Dans une URL, il finirait dans les journaux, dans les redirections et dans les
     messages d'erreur de curl — c'est-à-dire en clair, sur un dépôt public.
     On contrôle CHAQUE ligne curl, pas « il y en a une quelque part » : une seule
     oubliée suffit, et une garde qui se contente d'une occurrence passe au vert
     pendant qu'une autre ligne fuit (déjà vécu avec le filtre du jeton au push). */
  const recolle = wf.replace(/\\\n\s*/g, ' ');   /* une commande coupée sur 3 lignes reste UNE commande */
  const curls = recolle.split('\n').map(l => l.trim())
    .filter(l => !l.startsWith('#') && /\bcurl\b/.test(l));
  assert(curls.length > 0, 'plus aucun appel curl : le retour est mort');
  for (const l of curls) {
    assert(/PRIVATE-TOKEN: \$\{[A-Z_]+\}/.test(l),
      'une commande curl n\'envoie pas le jeton en en-tête : ' + l.trim().slice(0, 90));
  }
  assert(!/(private_token|access_token)=/.test(wf),
    'un jeton est mis dans une URL : il partirait en clair dans les journaux');
  assert(!wf.includes('verif-onion.mjs'), 'le vérificateur est nommé dans un workflow GitHub : il doit rester côté GitLab');
});

t('le vérificateur d\'adresse existe et est utilisable', () => {
  assert(html.includes('id="verif"'), 'le bloc de vérification a disparu');
  assert(html.includes('id="qverif"') && html.includes('id="rverif"'), 'le champ ou le résultat a disparu');
  assert(/function verifieAdresse/.test(html), 'la fonction de vérification a disparu');
});

t('il détecte les IMITATIONS (début commun, fin différente)', () => {
  assert(/function prefixeCommun/.test(html), 'la comparaison de début a disparu : les faux passeraient');
  assert(/score >= 6/.test(html), 'le seuil de ressemblance a disparu');
  assert(html.includes('DANGER — imite'), 'l\'alerte d\'imitation a disparu');
});

t('il refuse les adresses impossibles', () => {
  assert(/cle\.length === 16/.test(html), 'les vieilles adresses v2 ne sont plus refusées');
  assert(/cle\.length !== 56/.test(html), 'la longueur réelle n\'est plus contrôlée');
});

t('le carnet personnel ne s\'écrit pas sur l\'appareil, il voyage dans la copie', () => {
  assert(html.includes('id="perso"'), 'le carnet personnel a disparu');
  assert(/window\.__PERSO__/.test(html), 'les adresses perso ne sont plus embarquées dans la copie hors ligne');
  assert(!/localStorage[^)]*PERSO/i.test(html), 'le carnet personnel s\'écrit sur l\'appareil : c\'est une trace');
  assert(/replace\(\/<\/g, *"\\\\u003c"\)/.test(html) || html.includes('u003c'),
    'les adresses perso ne sont plus échappées avant d\'être écrites dans la copie');
});

/* CHAQUE COMMANDE ÉCRITE SUR LA PAGE DOIT EXISTER — ET FAIRE CE QU'ON DIT.
 * Mesuré le 26.09 : la page disait « ouvre le Tor Browser puis lance npm run tor:verif,
 * il sort un rapport adresse par adresse ». Or `tor:verif` lançait le test de RENDU de la
 * page (Playwright) : Kevin aurait ouvert Tor pour rien, et n'aurait eu aucun rapport.
 * Le vrai vérificateur d'adresses n'avait même AUCUN script npm. C'est exactement
 * l'obligation (5) de la leçon #268 — « ne pas écrire qu'on peut lancer quelque chose
 * sans l'avoir vérifié » — que j'avais écrite moi-même, puis enfreinte.
 * Cette garde lit les commandes citées dans la page et les confronte à package.json. */
t('chaque « npm run … » cité sur la page existe et lance le bon fichier', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const cites = [...html.matchAll(/npm run ([a-z0-9:_-]+)/g)].map(m => m[1]);
  assert(cites.length > 0, 'la page ne cite plus aucune commande : la marche à suivre a disparu');
  for (const c of cites) {
    assert(pkg.scripts && pkg.scripts[c],
      'la page dit « npm run ' + c + ' » mais ce script n\'existe pas dans package.json');
  }
  /* La commande présentée comme celle qui OUVRE les adresses doit lancer le vérificateur
     .onion, pas un test de rendu : c'est précisément la confusion qui s'est produite. */
  const phrase = (html.match(/Pour les ouvrir toi-même[\s\S]{0,400}/) || [''])[0];
  const nom = (phrase.match(/npm run ([a-z0-9:_-]+)/) || [])[1];
  assert(nom, 'la phrase « pour les ouvrir toi-même » ne nomme plus de commande');
  assert(/verif-onion\.mjs/.test(pkg.scripts[nom]),
    'la page envoie Kevin sur « npm run ' + nom + ' » = ' + pkg.scripts[nom] +
    ' — ce n\'est pas le vérificateur d\'adresses (tools/tor/verif-onion.mjs)');
});

console.log('\n✅ ' + ok + ' contrôles, 0 échec — ' + fiches.length + ' services au catalogue.');
