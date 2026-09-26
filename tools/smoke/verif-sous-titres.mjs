/* PREUVE RÉELLE — « la parole devient du texte » (sous-titres du Montage auto).
 *
 * Pourquoi ce fichier existe : depuis l'agent, je ne peux joindre AUCUN service
 * de Kevin (l'egress est fermé) — je ne pouvais donc que dire « le mécanisme
 * est écrit », jamais « ça marche ». La CI, elle, a le réseau. On s'en sert.
 *
 * Comment on prouve sans dépendre d'un fichier son stocké quelque part :
 *   1) on demande au worker de DIRE une phrase connue  (POST /voice)
 *   2) on lui renvoie ce son et on lui demande de l'ÉCRIRE (POST /transcribe)
 *   3) on vérifie que le texte retrouvé contient bien les mots de départ
 * Tout se joue entre le worker et l'IA gratuite de Cloudflare : aucune clé à
 * gérer, aucune donnée de Kevin, aucun clic.
 *
 * Sortie : chaque étape est affichée avec sa vraie réponse. Échec = code 1 et
 * la RAISON EXACTE (règle « toujours détailler les erreurs »).
 *
 * LIMITE À DIRE HONNÊTEMENT : la voix de test est fabriquée par une machine,
 * c'est le cas le PLUS DIFFICILE à transcrire — une vraie voix humaine donne
 * mieux. Et ce contrôle n'exerce QUE le service : le nettoyage du son fait
 * dans le téléphone (graves coupés, niveau remonté) est vérifié séparément
 * par tests/verify-crea-montage-auto.mjs.
 */
const BASE = (process.env.CREA_AI_URL || 'https://kdmc-crea-ai.9r4rxssx64.workers.dev').replace(/\/$/, '');
const PHRASE = 'bonjour tout le monde, ceci est un essai de sous-titres';
/* mots assez distinctifs pour que la ressemblance ne soit pas un hasard */
const CLES = ['bonjour', 'monde', 'essai', 'titres'];

const ko = [];
const dire = (m) => console.log(m);
const norm = (s) => String(s || '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

async function main() {
  dire('Worker visé : ' + BASE);

  /* --- 0) le worker répond-il, et l'IA gratuite est-elle branchée ? --- */
  let sante = null;
  try {
    const r = await fetch(BASE + '/health');
    sante = await r.json();
    dire('/health → ' + JSON.stringify(sante));
    if (!sante.cloudflare) ko.push('Workers AI n\'est PAS branché sur ce worker (health.cloudflare = false) → pas de sous-titres possibles');
  } catch (e) {
    ko.push('/health injoignable : ' + (e && e.message || e));
    return;
  }

  /* --- 1) faire DIRE une phrase connue --- */
  let audio = null;
  try {
    const r = await fetch(BASE + '/voice', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: PHRASE, lang: 'fr' })
    });
    const type = r.headers.get('content-type') || '';
    if (!r.ok || !/^audio\//.test(type)) {
      const t = await r.text();
      ko.push('/voice a échoué (HTTP ' + r.status + ', type « ' + type + ' ») : ' + t.slice(0, 200));
      return;
    }
    audio = Buffer.from(await r.arrayBuffer());
    /* Durée approximative (MP3 ~16 ko/s). On la DIT, parce qu'une voix de test
       qui se met à bégayer fabrique un son 15× trop long — et c'est alors la
       VOIX qui est fautive, pas la transcription. Sans ça, on accuserait le
       mauvais coupable et on comparerait deux essais non comparables. */
    const secondes = audio.length / 16000;
    dire('/voice → ' + audio.length + ' octets de ' + type + '  (~' + secondes.toFixed(1) + ' s)');
    if (audio.length < 2000) ko.push('le son produit est trop court (' + audio.length + ' octets) pour être une vraie phrase');
    if (secondes > 8) dire('⚠️ La voix de test s\'est répétée (' + secondes.toFixed(1) + ' s pour une phrase de ~3 s) :' +
      ' le texte retrouvé contiendra des répétitions qui NE viennent PAS de la transcription.');
  } catch (e) { ko.push('/voice injoignable : ' + (e && e.message || e)); return; }

  /* --- 2) le faire ÉCRIRE --- */
  let texte = '', mots = [];
  try {
    const r = await fetch(BASE + '/transcribe', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ audio: audio.toString('base64'), lang: 'fr' })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { ko.push('/transcribe a échoué (HTTP ' + r.status + ') : ' + (j.detail || j.error || '?')); return; }
    texte = j.text || ''; mots = j.words || [];
    dire('/transcribe (' + (j.model || '?') + ') → « ' + texte +' »');
    dire('   mots datés : ' + mots.length + (mots.length ? '  (ex. ' + JSON.stringify(mots.slice(0, 3)) + ')' : ''));
    if (!texte && !mots.length) ko.push('la transcription est vide');
  } catch (e) { ko.push('/transcribe injoignable : ' + (e && e.message || e)); return; }

  /* --- 3) est-ce bien CE qui a été dit ? --- */
  const n = norm(texte || mots.map((m) => m.m).join(' '));
  const trouves = CLES.filter((k) => n.includes(k));
  /* Mesure chiffrée, pour COMPARER d'une version à l'autre (le 07/08/2026, le
     premier passage donnait 4 mots sur 11, soit 36 %). Le contrôle ne juge pas
     la beauté du texte : il dit si la chaîne marche et à quel point elle colle. */
  const attendus = norm(PHRASE).split(' ');
  const dits = new Set(n.split(' '));
  const colle = attendus.filter((m) => dits.has(m));
  dire('fidélité : ' + colle.length + ' mot(s) sur ' + attendus.length +
    ' retrouvé(s) — ' + Math.round(colle.length / attendus.length * 100) + ' %  (référence du 07/08/2026 : 4/11, 36 %)');
  dire('mots-clés retrouvés : ' + (trouves.join(', ') || '(aucun)') + '  sur ' + CLES.join(', '));
  if (trouves.length < 2) {
    ko.push('le texte retrouvé ne ressemble pas à ce qui a été dit (' + trouves.length + ' mot-clé sur ' + CLES.length +
      ') — attendu « ' + PHRASE + ' », obtenu « ' + texte + ' »');
  }
  /* Les mots datés servent à caler les sous-titres : sans eux on ne peut pas
     savoir QUAND afficher chaque mot. On le signale sans faire échouer si le
     texte est bon (le montage sait répartir les mots sur la durée). */
  if (!mots.length) dire('⚠️ Aucun mot daté : les sous-titres seront répartis à l\'estime, pas calés au mot près.');
}

await main();
console.log('');
if (ko.length) { console.log('=== ÉCHEC ==='); ko.forEach((m) => console.log('  ✗ ' + m)); process.exit(1); }
console.log('=== OK — la parole devient bien du texte, en vrai ===');
