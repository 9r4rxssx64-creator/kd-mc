#!/usr/bin/env node
/* ============================================================================
 * QUOTA D'INSCRIPTIONS — le registre du domaine ne se vide plus en une journée
 * ----------------------------------------------------------------------------
 * Vidéo de sécurité envoyée par Kevin le 23.09.2026, point 4 : « pas de limite
 * de débit ». Vérifié sur NOTRE domaine, endpoint par endpoint : un seul point
 * d'écriture est ouvert sans authentification, `/__sso/issue`.
 *
 * CE QUI A ÉTÉ MESURÉ (sonde, 23.09.2026, avant correctif) :
 *   50 inscriptions fabriquées d'affilée, sans aucune authentification
 *   → 250 écritures KV (5 par inscription neuve)
 *   → quota gratuit Cloudflare = 1000 écritures/jour pour TOUT le compte
 *   → 200 faux comptes suffisaient à le vider, et le registre des connexions
 *     de tout le domaine cessait de se mettre à jour.
 *
 * Cette garde EXÉCUTE le vrai routeur avec un faux KV qui COMPTE les écritures.
 * Elle ne cherche aucune chaîne de caractères dans le fichier : un contrôle qui
 * lit du texte passe au vert sur un commentaire (leçon #103, le faux vert).
 *
 * Ce qu'elle refuse de laisser passer :
 *   A. la mesure elle-même — une inscription neuve coûte cher, et 200 requêtes
 *      d'affilée ne doivent plus pouvoir vider le quota du jour ;
 *   B. un REFUS qui écrirait quoi que ce soit (sinon la protection nourrit
 *      l'attaque qu'elle prétend arrêter) ;
 *   C. LA NON-RÉGRESSION : une personne déjà inscrite n'est JAMAIS freinée,
 *      même en se reconnectant 200 fois, même depuis une autre app ;
 *   D. le frein d'urgence du domaine, et le fail-open sans KV.
 *
 * Lancer : node tests/verify-quota-inscriptions.mjs
 * ========================================================================== */
import mod, { quotaInscription, INSCR_PAR_IP_JOUR, INSCR_TOTAL_JOUR } from '../services/kdmc-router/worker.js';

let ko = 0;
const ok = (c, m, d) => {
  if (c) { console.log('  ✅ ' + m); return; }
  console.log('  ❌ ' + m + (d ? ' — ' + d : '')); ko++;
};

/* Faux KV qui COMPTE : c'est le compteur d'écritures qui fait la mesure. */
function faireEnv(fiches) {
  const kv = new Map();
  const n = { get: 0, put: 0, del: 0 };
  for (const [uid, acc] of Object.entries(fiches || {})) kv.set('acc:' + uid, JSON.stringify(acc));
  return {
    KDMC_SSO_SECRET: 'secret-de-test-quota', KDMC_CODE_OBLIGATOIRE: '0' /* ce test crée des comptes par le nom ; le code obligatoire est prouvé par code-attente.test.mjs */,
    ACCOUNTS: {
      get: async (k, t) => { n.get++; return t === 'arrayBuffer' ? null : (kv.has(k) ? kv.get(k) : null); },
      put: async (k, v) => { n.put++; kv.set(k, v); },
      delete: async (k) => { n.del++; kv.delete(k); },
    },
    _kv: kv,
    _n: n,
  };
}

/* Une inscription telle qu'un attaquant l'enverrait : aucune authentification,
   aucun en-tête Origin (un simple outil en ligne de commande). */
function inscrire(env, { nom, ip = '203.0.113.7', host = 'cmcteams.kd-mc.com' } = {}) {
  return mod.fetch(new Request('https://' + host + '/__sso/issue', {
    method: 'POST',
    headers: { host, 'content-type': 'application/json', 'CF-Connecting-IP': ip },
    body: JSON.stringify({ uid: 'faux_' + nom.replace(/\W/g, ''), name: nom, cgu: true }),
  }), env, { waitUntil() {} });
}

const nomN = (i) => 'Faux' + i + ' Compte' + i;

/* ── A. La mesure : 200 requêtes d'affilée ne vident plus le quota du jour ─── */
console.log('\nA. 200 inscriptions fabriquées depuis une seule adresse');
{
  const env = faireEnv();
  let refusees = 0, creees = 0;
  const ecrituresApres = [];
  for (let i = 0; i < 200; i++) {
    const avant = env._n.put;
    const r = await inscrire(env, { nom: nomN(i) });
    const j = await r.json();
    if (j.ok) creees++; else if (j.quota) refusees++;
    ecrituresApres.push(env._n.put - avant);
  }
  const total = env._n.put;
  const coutPremiere = ecrituresApres[0];

  ok(coutPremiere >= 5,
    `une inscription NEUVE coûte bien cher (${coutPremiere} écritures KV) — c'est ce qui rendait l'attaque rentable`);
  ok(creees === INSCR_PAR_IP_JOUR,
    `${creees} comptes créés puis plus rien (plafond par adresse = ${INSCR_PAR_IP_JOUR})`,
    'créées=' + creees);
  ok(refusees === 200 - INSCR_PAR_IP_JOUR,
    `les ${refusees} demandes suivantes sont refusées`);
  ok(total < 1000,
    `200 requêtes = ${total} écritures KV au total, sous le quota gratuit de 1000/jour`,
    'total=' + total);
  /* Avant correctif : 200 × 5 = 1000 → quota du jour vidé pile. */
  ok(total <= 100,
    `l'attaque coûte désormais ${total} écritures au lieu de 1000 (facteur ${Math.round(1000 / Math.max(1, total))})`,
    'total=' + total);
}

/* ── B. Un refus ne doit (presque) rien coûter ─────────────────────────────── */
console.log('\nB. Un refus n\'écrit rien (sinon la protection nourrit l\'attaque)');
{
  const env = faireEnv();
  for (let i = 0; i < INSCR_PAR_IP_JOUR; i++) await inscrire(env, { nom: nomN(i) });
  const avant = env._n.put;
  /* Le TOUT PREMIER refus de la journée pose un drapeau (1 écriture) pour prévenir
     Kevin une seule fois : sans ça, un groupe légitime derrière un seul wifi serait
     bloqué EN SILENCE. Tous les refus suivants doivent coûter ZÉRO. */
  await inscrire(env, { nom: nomN(999) });
  const coutPremierRefus = env._n.put - avant;
  ok(coutPremierRefus <= 1,
    `le premier refus du jour coûte ${coutPremierRefus} écriture (l'avertissement à Kevin, une seule fois)`);
  const avant2 = env._n.put;
  for (let i = 0; i < 50; i++) await inscrire(env, { nom: nomN(1000 + i) });
  const ecrites = env._n.put - avant2;
  ok(ecrites === 0,
    '50 demandes refusées ensuite = 0 écriture KV (ni journal, ni nom réservé)',
    ecrites + ' écriture(s)');
  const r = await inscrire(env, { nom: nomN(9999) });
  ok(r.status === 429, 'le refus répond bien 429 (trop de requêtes)', 'status=' + r.status);
  const j = await r.json();
  ok(j.quota === true && /réessaie demain/i.test(j.message || ''),
    'le message dit en français quoi faire, sans jargon', JSON.stringify(j).slice(0, 120));
}

/* ── C. NON-RÉGRESSION : un inscrit n'est JAMAIS freiné ────────────────────── */
console.log('\nC. Les gens déjà inscrits ne rencontrent jamais cette limite');
{
  /* Fiche existante, portée domaine (comme toutes les fiches d'avant le périmètre). */
  const env = faireEnv({ kevin_test: { uid: 'kevin_test', name: 'Paul Durand', hits: 3, apps: {}, history: [], devices: [], places: [] } });
  env._kv.set('nm:paul durand', 'kevin_test');
  let refus = 0;
  for (let i = 0; i < 200; i++) {
    const r = await mod.fetch(new Request('https://cmcteams.kd-mc.com/__sso/issue', {
      method: 'POST',
      headers: { host: 'cmcteams.kd-mc.com', 'content-type': 'application/json', 'CF-Connecting-IP': '203.0.113.7' },
      body: JSON.stringify({ uid: 'paul_cmc', name: 'Paul Durand', cgu: true }),
    }), env, { waitUntil() {} });
    const j = await r.json();
    if (!j.ok) refus++;
  }
  ok(refus === 0, '200 reconnexions de la même personne : 0 refus', refus + ' refus');

  /* Et depuis une AUTRE app (uid différent, même personne) : toujours pas freiné. */
  const r2 = await mod.fetch(new Request('https://lingua.kd-mc.com/__sso/issue', {
    method: 'POST',
    headers: { host: 'lingua.kd-mc.com', 'content-type': 'application/json', 'CF-Connecting-IP': '203.0.113.7' },
    body: JSON.stringify({ uid: 'lingua_paul', name: 'Paul Durand', cgu: true }),
  }), env, { waitUntil() {} });
  const j2 = await r2.json();
  ok(j2.ok === true, 'la même personne arrivant d\'une autre app n\'est pas comptée comme une inscription', JSON.stringify(j2).slice(0, 120));
}

/* ── D. Frein d'urgence du domaine + fail-open ─────────────────────────────── */
console.log('\nD. Frein d\'urgence tout le domaine, et fail-open sans KV');
{
  const env = faireEnv();
  let creees = 0;
  /* Assez d'adresses différentes pour dépasser le plafond du domaine. */
  for (let ip = 0; ip < 20; ip++) {
    for (let i = 0; i < INSCR_PAR_IP_JOUR; i++) {
      const r = await inscrire(env, { nom: 'Ip' + ip + ' Nom' + i, ip: '198.51.100.' + ip });
      if ((await r.json()).ok) creees++;
    }
  }
  ok(creees === INSCR_TOTAL_JOUR,
    `20 adresses différentes ne créent que ${creees} comptes (frein domaine = ${INSCR_TOTAL_JOUR})`,
    'créées=' + creees);
  ok(env._n.put < 1000,
    `même attaque distribuée : ${env._n.put} écritures, le domaine continue de fonctionner`,
    'put=' + env._n.put);

  /* Fail-open : sans KV, on ne bloque jamais une inscription. */
  const q = await quotaInscription({}, 'abc');
  ok(q.ok === true && q.raison === 'sans_kv', 'sans KV → on laisse passer (jamais de lock-out)');
  const envKo = { ACCOUNTS: { get: async () => { throw new Error('KV down'); }, put: async () => {} } };
  const q2 = await quotaInscription(envKo, 'abc');
  ok(q2.ok === true, 'KV en panne → on laisse passer (la limite ne casse jamais une inscription)');
}

/* ── E. Les plafonds restent raisonnables (anti-réglage absurde) ───────────── */
console.log('\nE. Des plafonds qui ne gênent personne de réel');
{
  ok(INSCR_PAR_IP_JOUR >= 5 && INSCR_PAR_IP_JOUR <= 50,
    `plafond par adresse = ${INSCR_PAR_IP_JOUR} (une famille/un bureau derrière une seule IP passe)`);
  ok(INSCR_TOTAL_JOUR >= 20 && INSCR_TOTAL_JOUR <= 200,
    `frein domaine = ${INSCR_TOTAL_JOUR}/jour (le registre a mis des mois à atteindre ~191 personnes)`);
  ok(INSCR_TOTAL_JOUR * 7 < 1000,
    `au pire ${INSCR_TOTAL_JOUR * 7} écritures pour les inscriptions : il en reste pour les gens déjà inscrits`);
}

/* ── F. Les plafonds s'ouvrent sans toucher au code ────────────────────────── */
console.log('\nF. Le jour où un vrai groupe s\'inscrit ensemble, on ouvre sans redéployer');
{
  /* 260 employés sur le wifi du casino = UNE seule adresse IP. Il faut pouvoir
     ouvrir en grand pour la journée — sinon le 11e employé reste dehors. */
  const env = faireEnv();
  env.KDMC_INSCR_IP_JOUR = '300';
  env.KDMC_INSCR_TOTAL_JOUR = '300';
  let creees = 0;
  for (let i = 0; i < 40; i++) {
    const r = await inscrire(env, { nom: 'Employe' + i + ' Casino' + i });
    if ((await r.json()).ok) creees++;
  }
  ok(creees === 40, `40 inscriptions d'affilée depuis la même adresse passent quand le plafond est ouvert`, 'créées=' + creees);

  /* Un réglage illisible ne doit pas ouvrir les vannes en grand par accident. */
  const env2 = faireEnv();
  env2.KDMC_INSCR_IP_JOUR = 'beaucoup';
  let creees2 = 0;
  for (let i = 0; i < 20; i++) {
    const r = await inscrire(env2, { nom: 'Zz' + i + ' Yy' + i });
    if ((await r.json()).ok) creees2++;
  }
  ok(creees2 === INSCR_PAR_IP_JOUR, `un réglage illisible retombe sur le défaut (${INSCR_PAR_IP_JOUR}), il n'ouvre pas tout`, 'créées=' + creees2);

  /* Le cas VRAIMENT dangereux : un réglage négatif ou à zéro (doigt qui ripe)
     fermerait la porte à TOUT LE MONDE. Il doit retomber sur le défaut, jamais
     enfermer dehors (anti-lock-out, comme partout ailleurs sur le domaine). */
  for (const mauvais of ['-5', '0', '']) {
    const e = faireEnv();
    e.KDMC_INSCR_IP_JOUR = mauvais;
    const r = await inscrire(e, { nom: 'Premier Venu' });
    ok((await r.json()).ok === true,
      `un plafond « ${mauvais || '(vide)'} » n'enferme personne dehors : la 1re inscription passe`);
  }
}

console.log('\n' + (ko ? `❌ ${ko} contrôle(s) en échec` : '✅ Quota d\'inscriptions : tout est vérifié'));
process.exit(ko ? 1 : 0);
