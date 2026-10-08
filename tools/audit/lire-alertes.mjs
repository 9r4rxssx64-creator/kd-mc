#!/usr/bin/env node
/* LIRE LES ALERTES DU DOMAINE, BRUTES (Kevin 8.10 : « Vérifie Marie Curie, l'alerte domaine et le reste des connexions »)
 *
 * La boîte de l'admin montre une carte ; ici on lit la SOURCE (KV ACCOUNTS du routeur, lecture seule par l'API
 * Cloudflare) : le journal `aud:log` (nouvel appareil, changement de pays, nouvel inscrit, code admin refusé…) et,
 * pour les comptes demandés, leur fiche (`acc:<uid>` : appareils, lieux, opérateur, réseau, VPN, historique des sessions).
 * Jamais l'adresse IP ni son empreinte (liste BLANCHE des champs imprimés). Reste au COFFRE : ces lignes parlent de
 * vraies personnes, un journal public les exposerait.
 *
 * Usage : CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… NS=<id KV> node tools/audit/lire-alertes.mjs [--uids=a,b] [--n=25]
 * Tests : tests/verify-lire-alertes.mjs (`formater` est pure ; sabotage : une IP glissée dans le journal n'est jamais imprimée). */
const ARGS = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a, '1']; }));
const CHAMPS_ALERTE = ['ev', 'type', 'name', 'uid', 'app', 'page', 'device', 'os', 'place', 'country', 'isp', 'asn', 'vpn', 'masque', 'mins', 'detail', 'devkey', 'pays_precedent', 'lieu_precedent', 'isp_precedent', 'asn_precedent', 'arrivee'];
const CHAMPS_SESSION = ['ts', 'end', 'app', 'device', 'dev', 'place', 'isp', 'vpn', 'tz'];
const EV = { new_device: '🔐 nouvel appareil', geo_anomaly: '⚠️ changement de pays', nouvel_inscrit: '🆕 nouvel inscrit', nouvelle_connexion: '🆕 nouvelle connexion', admin_login_fail: '🚫 code admin refusé', matricule_refuse: '🪪 matricule refusé', quota_inscriptions_atteint: '🛑 quota', pointage_loin: '📍 pointage loin', inscription_refusee: '🚫 inscription refusée' };
const ASN_NUAGES = new Set([8075, 16509, 14618, 15169, 396982, 24940, 16276, 14061, 20473, 63949, 31898, 45102, 12876, 51167, 197540, 13335]);
const quand = (ts) => (ts ? new Date(ts).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '?');
const reseau = (asn, isp, vpn, masque) => (isp || '?') + (asn ? ' (AS' + asn + (ASN_NUAGES.has(Number(asn)) ? ' = centre de données/robot' : '') + ')' : '') + (vpn ? ' · VPN/hébergeur' : '') + (masque ? ' · réseau masqué (Relais privé ?)' : '');

/* Pure : le journal + les fiches → lignes lisibles, champs en liste blanche seulement. */
export function formater(log, comptes, n) {
  const out = [];
  const liste = (Array.isArray(log) ? log : []).slice(0, n || 25);
  out.push(`JOURNAL — ${liste.length} dernière(s) alerte(s) (sur ${Array.isArray(log) ? log.length : 0})`);
  for (const e0 of liste) {
    const e = Object.fromEntries(CHAMPS_ALERTE.filter((k) => e0 && e0[k] !== undefined && e0[k] !== '').map((k) => [k, e0[k]]));
    const ev = e.ev || e.type || '?';
    out.push(`• ${quand(e0 && e0.ts)} · ${EV[ev] || ev} · ${e.name || '(sans nom)'}${e.uid ? ' [' + e.uid + ']' : ''} · ${e.app || 'domaine'}${e.page || ''}`
      + `\n    appareil : ${e.device || '?'}${e.os ? ' · ' + e.os : ''} · lieu : ${e.place || e.country || '?'} · réseau : ${reseau(e.asn, e.isp, e.vpn, e.masque)}`
      + (e.detail ? `\n    détail : ${String(e.detail).slice(0, 160)}` : '')
      + (ev === 'geo_anomaly' ? `\n    avant : ${e.lieu_precedent || e.pays_precedent || '?'} · ${e.isp_precedent || '?'}${e.asn_precedent ? ' (AS' + e.asn_precedent + ')' : ''} — ${e.mins != null ? e.mins : '?'} min plus tôt` : ''));
  }
  for (const [uid, acc] of Object.entries(comptes || {})) {
    if (!acc) { out.push(`\nFICHE ${uid} : absente`); continue; }
    out.push(`\nFICHE ${uid} — ${acc.name || '(sans nom)'} · inscrit ${quand(acc.created)} · ${acc.hits || 0} session(s) · vu ${quand(acc.last_seen)}`
      + `\n  appareils : ${(acc.devices || []).join(', ') || '?'}\n  lieux : ${(acc.places || []).join(' | ') || '?'}`
      + `\n  dernier réseau : ${reseau(acc.last_net && acc.last_net.asn, acc.last_isp, acc.last_vpn, false)} · pays ${acc.last_country || '?'}`
      + `\n  code posé : ${acc.cred || acc.code_at ? 'oui' : 'non/inconnu'} · Face ID : ${(acc.webauthn || acc.passkeys || []).length ? 'oui' : 'non'} · sessions révoquées le : ${acc.revoked_at ? quand(acc.revoked_at) : 'jamais'}`);
    for (const h0 of (acc.history || []).slice(0, 6)) {
      const h = Object.fromEntries(CHAMPS_SESSION.filter((k) => h0 && h0[k] !== undefined && h0[k] !== '').map((k) => [k, h0[k]]));
      out.push(`  ↳ ${quand(h.ts)} → ${quand(h.end)} · ${h.app || '?'} · ${h.dev || h.device || '?'} · ${h.place || '?'} · ${h.isp || '?'}${h.vpn ? ' · VPN/hébergeur' : ''}${h.tz ? ' · ' + h.tz : ''}`);
    }
  }
  return out.join('\n');
}

if (process.argv[1] && /lire-alertes\.mjs$/.test(process.argv[1]) && !process.env.LIRE_ALERTES_SELFTEST) {
  const TOKEN = process.env.CLOUDFLARE_API_TOKEN || '', COMPTE = process.env.CLOUDFLARE_ACCOUNT_ID || '', NS = process.env.NS || '';
  if (!TOKEN || !COMPTE || !NS) { console.error('CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID et NS requis'); process.exit(2); }
  const lire = async (cle) => {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${COMPTE}/storage/kv/namespaces/${NS}/values/${encodeURIComponent(cle)}`, { headers: { authorization: 'Bearer ' + TOKEN }, signal: AbortSignal.timeout(20000) });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`KV ${cle} : HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
    try { return JSON.parse(await r.text()); } catch { return null; }
  };
  const uids = String(ARGS.uids || '').split(',').map((s) => s.trim()).filter(Boolean);
  const log = await lire('aud:log');
  const comptes = {}; for (const u of uids) comptes[u] = await lire('acc:' + u);
  const t = formater(log, comptes, parseInt(ARGS.n || '25', 10) || 25);
  console.log(t);
  console.log(`::notice title=Alertes du domaine (brut)::${t.replace(/\n/g, '%0A').slice(0, 3900)}`);
}
