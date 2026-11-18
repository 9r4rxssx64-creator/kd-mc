/* OUVRIR / FERMER UNE APP POUR TOUT LE MONDE, sans navigateur (Kevin 18.11.2026 : « Dans le domaine ferme de base CMCteams pour tous. J'ouvrirai quand tout
 * sera ok. Possible 1 clic ouvert fermé pour tous, général, sur chaque app de mon domaine »).
 * Le même geste que le bouton du tableau de bord (kd-mc.com/admin/ › Personnes › Bloquer & bannir), fait par le robot quand Kevin le demande à une session :
 * connexion admin au domaine (code = SECRET, empreinte, jamais écrite ni journalisée), puis POST /__admin/app-bascule { app, fermee }.
 * Le domaine ne touche QUE l'app nommée ; l'admin y entre toujours ; le portail ne se ferme jamais. Journal public : l'app, l'état, la liste des apps fermées.
 *   APP=cmcteams ETAT=fermee node tools/admin/app-bascule.mjs      (ETAT = fermee | ouverte | lire) */
const HASH = String(process.env.KDMC_ADMIN_PIN_SHA256 || '').trim().toLowerCase();
const APP = String(process.env.APP || '').trim().toLowerCase();
const ETAT = String(process.env.ETAT || 'lire').trim().toLowerCase();
const DOMAINE = process.env.DOMAINE || 'https://kd-mc.com';
const dire = (t) => console.log(t);
export function demande(app, etat) {
  if (!['fermee', 'ouverte', 'lire'].includes(etat)) return { erreur: 'ETAT doit être fermee, ouverte ou lire' };
  if (etat !== 'lire' && !/^[a-z0-9-]{2,40}$/.test(app)) return { erreur: 'APP manquante ou mal écrite' };
  if (app === 'portail') return { erreur: 'le portail est la réception : il ne se ferme jamais' };
  return etat === 'lire' ? { lire: true } : { corps: { app, fermee: etat === 'fermee' } };
}
if (import.meta.url === 'file://' + process.argv[1]) {
  const d = demande(APP, ETAT);
  if (d.erreur) { dire('❌ ' + d.erreur); process.exit(1); }
  if (!/^[0-9a-f]{64}$/.test(HASH)) { dire('❌ Code admin absent (secret CI) : rien n\'a été fait.'); process.exit(1); }
  const H0 = { 'content-type': 'application/json', origin: DOMAINE, 'x-kdmc-verif': '1' };
  const c = await fetch(DOMAINE + '/__admin/login', { method: 'POST', headers: H0, body: JSON.stringify({ hash: HASH }) }).then((r) => r.json()).catch(() => ({}));
  if (!c.ok || !c.grant) { dire('❌ connexion ADMIN refusée (' + (c.reason || '?') + ') : rien n\'a été fait.'); process.exit(1); }
  const H = Object.assign({}, H0, { 'x-kdmc-admin': c.grant });
  const avant = await fetch(DOMAINE + '/__admin/apps-fermees', { headers: H }).then((r) => r.json()).catch(() => ({}));
  dire('ℹ️ avant : ' + ((avant.fermees || []).length ? 'fermées pour tous = ' + avant.fermees.join(', ') : 'aucune app fermée') + ' (HTTP ok ' + (avant.ok === true) + ')');
  if (d.lire) process.exit(avant.ok ? 0 : 1);
  if (avant.ok && Array.isArray(avant.apps) && !avant.apps.includes(d.corps.app)) { dire('❌ app inconnue du domaine : ' + d.corps.app + ' — apps : ' + avant.apps.join(', ')); process.exit(1); }
  const r = await fetch(DOMAINE + '/__admin/app-bascule', { method: 'POST', headers: H, body: JSON.stringify(d.corps) }).then((x) => x.json()).catch(() => ({}));
  if (!r.ok) { dire('❌ le domaine a refusé (' + (r.reason || '?') + ') : rien n\'a changé.'); process.exit(1); }
  const apres = await fetch(DOMAINE + '/__admin/apps-fermees', { headers: H }).then((x) => x.json()).catch(() => ({}));
  const fermee = (apres.fermees || []).includes(d.corps.app);
  dire((fermee === d.corps.fermee ? '✅ ' : '❌ ') + d.corps.app + ' est ' + (fermee ? 'FERMÉE pour tout le monde (l\'admin y entre toujours)' : 'OUVERTE à tout le monde') + ' — relu sur le domaine');
  dire('ℹ️ après : ' + ((apres.fermees || []).length ? 'fermées pour tous = ' + apres.fermees.join(', ') : 'aucune app fermée'));
  process.exit(fermee === d.corps.fermee ? 0 : 1);
}
