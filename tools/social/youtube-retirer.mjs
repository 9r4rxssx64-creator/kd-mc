#!/usr/bin/env node
/* Retirer des vidéos YouTube de la vue du public (Kevin 08.10.2026 : « Arrête les publications
 * et retire-les. On annule ce business. »).
 *
 * Réversible : on NE SUPPRIME PAS, on passe en « privé » (Kevin peut les rendre publiques depuis
 * YouTube Studio). Garde : si le jeton ne mène pas à la chaîne attendue, on s'arrête sans rien
 * toucher. Le jeton n'est jamais affiché.
 *
 *   mode=sonde  → dit seulement quelle chaîne et quels droits le jeton donne
 *   mode=prive  → passe chaque vidéo listée en privé, et relit pour le prouver
 *
 * Env : YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN, MODE, IDS (séparés par virgules),
 *       CHAINE (identifiant de chaîne attendu).
 */
const { YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN } = process.env;
const MODE = process.env.MODE || 'sonde';
const CHAINE = process.env.CHAINE || '';
const IDS = (process.env.IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
const API = 'https://www.googleapis.com/youtube/v3';

export function corpsStatut(id, statut) {
  // videos.update réécrit TOUT le bloc status : on recopie l'existant, on ne change que la visibilité.
  const garde = ['embeddable', 'license', 'publicStatsViewable', 'selfDeclaredMadeForKids', 'containsSyntheticMedia'];
  const status = { privacyStatus: 'private' };
  for (const k of garde) if (statut && statut[k] !== undefined) status[k] = statut[k];
  return { id, status };
}

async function jeton() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: YT_CLIENT_ID, client_secret: YT_CLIENT_SECRET,
      refresh_token: YT_REFRESH_TOKEN, grant_type: 'refresh_token',
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`jeton refusé : HTTP ${r.status} ${j.error || ''} ${j.error_description || ''}`);
  return j;
}

async function main() {
  if (!YT_CLIENT_ID || !YT_CLIENT_SECRET || !YT_REFRESH_TOKEN) {
    console.log('SECRETS YOUTUBE ABSENTS — rien n’est possible ici.');
    process.exit(1);
  }
  const t = await jeton();
  console.log(`DROITS DU JETON : ${t.scope}`);
  const h = { authorization: `Bearer ${t.access_token}` };
  const c = await (await fetch(`${API}/channels?part=id,snippet&mine=true`, { headers: h })).json();
  const ch = c.items?.[0];
  console.log(`CHAÎNE DU JETON : ${ch ? `${ch.id} « ${ch.snippet.title} »` : 'aucune'} ${c.error ? JSON.stringify(c.error.message) : ''}`);
  if (CHAINE && ch?.id !== CHAINE) {
    console.log(`ARRÊT : la chaîne attendue est ${CHAINE}. Rien n’a été touché.`);
    process.exit(2);
  }
  if (MODE !== 'prive') return;
  if (!/auth\/youtube(\s|$|\.force-ssl)/.test(t.scope || '')) {
    console.log('ARRÊT : ce jeton ne permet que d’envoyer des vidéos, pas de les modifier. Rien n’a été touché.');
    process.exit(3);
  }
  let ok = 0, ko = 0;
  for (const id of IDS) {
    const v = await (await fetch(`${API}/videos?part=status,snippet&id=${id}`, { headers: h })).json();
    const it = v.items?.[0];
    if (!it) { console.log(`- ${id} : introuvable (déjà supprimée ?)`); continue; }
    if (it.snippet.channelId !== ch.id) { console.log(`- ${id} : pas sur cette chaîne, ignorée`); continue; }
    const r = await fetch(`${API}/videos?part=status`, {
      method: 'PUT', headers: { ...h, 'content-type': 'application/json' },
      body: JSON.stringify(corpsStatut(id, it.status)),
    });
    const relu = await (await fetch(`${API}/videos?part=status&id=${id}`, { headers: h })).json();
    const vis = relu.items?.[0]?.status?.privacyStatus;
    if (r.ok && vis === 'private') { ok++; console.log(`- ${id} « ${it.snippet.title} » : PRIVÉE ✓`); }
    else { ko++; console.log(`- ${id} : ÉCHEC HTTP ${r.status} (visibilité relue : ${vis})`); }
  }
  console.log(`BILAN YOUTUBE : ${ok} passée(s) en privé, ${ko} échec(s), ${IDS.length} demandée(s).`);
  if (ko) process.exit(4);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.log(`ERREUR : ${e.message}`); process.exit(1); });
}
