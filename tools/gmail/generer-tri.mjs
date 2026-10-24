#!/usr/bin/env node
/* Tri automatique de la boîte Gmail de Kevin (Kevin 24.10.2026 : « automatise la chose dans ma boîte
 * pour que le tri se fasse automatiquement à chaque fois »).
 *
 * Une seule source : tools/gmail/regles-tri.json (domaine ou adresse d'entreprise → libellé).
 * Ce script en tire DEUX fichiers :
 *   1. filtres-gmail-kevin.xml : les filtres natifs de Gmail (Réglages › Filtres › Importer) — instantanés.
 *   2. tri-auto.gs : un script Google gratuit (script.google.com) qui, toutes les 10 min, range ce qu'aucun
 *      filtre ne connaît encore (nouvel expéditeur) : règles, puis catégorie Gmail, puis mots du sujet.
 *
 * Dépôt PUBLIC : regles-tri.json ne contient que des domaines d'entreprises, jamais l'adresse d'une personne
 * (garde : tests/gmail-tri-auto.test.mjs).
 *
 *   node tools/gmail/generer-tri.mjs                 → réécrit les deux fichiers
 *   node tools/gmail/generer-tri.mjs --depuis <expediteurs.json>  → ajoute les domaines d'entreprise vus
 *        dans la boîte (sortie de la collecte) à regles-tri.json, puis réécrit les deux fichiers
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const REGLES = join(ICI, 'regles-tri.json');

/* Messageries grand public : un domaine partagé par des personnes, jamais une règle. */
export const DOMAINES_PERSONNELS = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.fr', 'outlook.com', 'outlook.fr', 'live.com', 'live.fr',
  'msn.com', 'yahoo.com', 'yahoo.fr', 'icloud.com', 'me.com', 'mac.com', 'orange.fr', 'wanadoo.fr', 'free.fr',
  'sfr.fr', 'laposte.net', 'gmx.com', 'gmx.fr', 'gmx.de', 'proton.me', 'protonmail.com', 'aol.com', 'neuf.fr',
  'bbox.fr', 'numericable.fr', 'libero.it', 'tiscali.it', 'monaco.mc', 'privaterelay.appleid.com',
  'kd-mc.com', 'desarzens.com', /* les adresses de Kevin lui-même : jamais une règle */
]);

/* Libellés dont les expéditeurs sont des PERSONNES (famille, fournisseurs contactés, sessions) : jamais
 * collectés en règles ; ils se rangent à la main ou par une règle de sujet. */
export const LIBELLES_PERSONNES = new Set(['🌳 Arbre – recherches', '🫒 Moulin mobile', '🌉 Pont']);

export function domaineDe(adresse) {
  const a = String(adresse || '').toLowerCase().trim();
  const at = a.lastIndexOf('@');
  return at < 0 ? a : a.slice(at + 1);
}

/* Ajoute à `regles` les domaines d'entreprise vus dans la boîte. Un domaine vu sous plusieurs libellés
 * va au libellé où il a le plus de fils ; une règle déjà écrite à la main n'est jamais écrasée. */
export function fusionnerExpediteurs(regles, expediteurs) {
  const votes = new Map();
  for (const [libelle, parAdresse] of Object.entries(expediteurs)) {
    if (LIBELLES_PERSONNES.has(libelle) || !regles.libelles[libelle]) continue;
    for (const [adresse, n] of Object.entries(parAdresse)) {
      const d = domaineDe(adresse);
      if (!d || DOMAINES_PERSONNELS.has(d) || !d.includes('.')) continue;
      const v = votes.get(d) || {};
      v[libelle] = (v[libelle] || 0) + Number(n || 1);
      votes.set(d, v);
    }
  }
  let ajoutes = 0;
  for (const [d, v] of votes) {
    if (regles.expediteurs[d]) continue;
    regles.expediteurs[d] = Object.entries(v).sort((a, b) => b[1] - a[1])[0][0];
    ajoutes++;
  }
  return ajoutes;
}

const echXml = s => String(s).replace(/&/g, '&amp;').replace(/'/g, '&apos;').replace(/</g, '&lt;');

/* Gmail refuse un critère trop long : on coupe la liste d'expéditeurs par paquets. */
export function paquets(liste, max = 900) {
  const out = []; let cur = [];
  for (const x of liste) {
    if (cur.length && (cur.join(' OR ').length + x.length + 4) > max) { out.push(cur); cur = []; }
    cur.push(x);
  }
  if (cur.length) out.push(cur);
  return out;
}

export function genererXml(regles) {
  const parLibelle = {};
  for (const [exp, lib] of Object.entries(regles.expediteurs)) (parLibelle[lib] ||= []).push(exp);
  const lignes = ["<?xml version='1.0' encoding='UTF-8'?>",
    "<feed xmlns='http://www.w3.org/2005/Atom' xmlns:apps='http://schemas.google.com/apps/2006'>",
    '  <title>Filtres Gmail — Kevin DESARZENS (tri auto, généré par tools/gmail/generer-tri.mjs)</title>'];
  for (const [lib, conf] of Object.entries(regles.libelles)) {
    const exps = (parLibelle[lib] || []).sort();
    paquets(exps).forEach((p, i) => {
      lignes.push('', `  <!-- ${lib} — ${conf.archiver ? 'libellé + archivé' : 'libellé + reste en réception'} (${i + 1}) -->`,
        '  <entry>', "    <category term='filter'></category>", `    <title>${echXml(conf.titre)} ${i + 1}</title>`, '    <content></content>',
        `    <apps:property name='from' value='${echXml(p.join(' OR '))}'/>`,
        `    <apps:property name='label' value='${echXml(lib)}'/>`);
      if (conf.archiver) lignes.push("    <apps:property name='shouldArchive' value='true'/>");
      lignes.push("    <apps:property name='sizeOperator' value='s_sl'/>", "    <apps:property name='sizeUnit' value='s_smb'/>", '  </entry>');
    });
  }
  for (const s of regles.sujets || []) {
    lignes.push('', `  <!-- ${s.libelle} — par le sujet -->`, '  <entry>', "    <category term='filter'></category>",
      `    <title>${echXml(s.titre)}</title>`, '    <content></content>',
      `    <apps:property name='subject' value='${echXml(s.sujet)}'/>`, `    <apps:property name='label' value='${echXml(s.libelle)}'/>`,
      "    <apps:property name='sizeOperator' value='s_sl'/>", "    <apps:property name='sizeUnit' value='s_smb'/>", '  </entry>');
  }
  lignes.push('</feed>', '');
  return lignes.join('\n');
}

export function genererGs(regles) {
  const archiver = Object.fromEntries(Object.entries(regles.libelles).filter(([, c]) => c.archiver).map(([l]) => [l, true]));
  return `/* Tri automatique de la boîte Gmail de Kevin — GÉNÉRÉ par tools/gmail/generer-tri.mjs, ne pas modifier ici.
 * À coller dans https://script.google.com (nouveau projet « Tri Gmail Kevin »), puis lancer installer() UNE fois :
 * Google demande une seule autorisation (Gmail), ensuite tout tourne seul toutes les 10 minutes, gratuitement.
 * Il ne range QUE les fils sans libellé des 3 derniers jours, n'efface rien, n'envoie rien.
 */
var REGLES = ${JSON.stringify(regles.expediteurs, null, 1)};
var ARCHIVER = ${JSON.stringify(archiver)};
var SUJETS = ${JSON.stringify((regles.sujets || []).map(s => ({ mot: s.sujet, libelle: s.libelle })))};
var SECOURS = ${JSON.stringify(regles.secours)};

function libelle_(nom) { return GmailApp.getUserLabelByName(nom) || GmailApp.createLabel(nom); }

function adresse_(from) { var m = String(from).match(/<([^>]+)>/); return (m ? m[1] : String(from)).trim().toLowerCase(); }

/* Adresse exacte, puis domaine, puis domaine parent (mail.exemple.com → exemple.com). */
function regle_(adresse) {
  if (REGLES[adresse]) return REGLES[adresse];
  var d = adresse.split('@').pop();
  while (d && d.indexOf('.') > 0) { if (REGLES[d]) return REGLES[d]; d = d.slice(d.indexOf('.') + 1); }
  return null;
}

/* archiver : la règle du libellé (expéditeur connu) ; un secours dit lui-même s'il archive. */
function ranger_(fil, nom, archiver) {
  fil.addLabel(libelle_(nom));
  if (archiver) fil.moveToArchive();
}

function trierBoite() {
  var faits = 0;
  var fils = GmailApp.search('has:nouserlabels newer_than:3d -in:sent -in:chats', 0, 100);
  for (var i = 0; i < fils.length; i++) {
    var fil = fils[i], sujet = fil.getFirstMessageSubject() || '';
    var nom = regle_(adresse_(fil.getMessages()[0].getFrom()));
    for (var j = 0; !nom && j < SUJETS.length; j++) if (sujet.indexOf(SUJETS[j].mot) >= 0) nom = SUJETS[j].libelle;
    if (nom) { ranger_(fil, nom, !!ARCHIVER[nom]); faits++; }
  }
  /* Expéditeur inconnu : les mots du sujet, puis la catégorie de Gmail. Seules les pubs sont archivées :
   * un mail deviné reste en réception, rien d'important ne disparaît. */
  for (var k = 0; k < SECOURS.length; k++) {
    var reste = GmailApp.search('has:nouserlabels newer_than:3d -in:sent ' + SECOURS[k].recherche, 0, 100);
    for (var r = 0; r < reste.length; r++) { ranger_(reste[r], SECOURS[k].libelle, !!SECOURS[k].archiver); faits++; }
  }
  return faits;
}

function installer() {
  var t = ScriptApp.getProjectTriggers();
  for (var i = 0; i < t.length; i++) if (t[i].getHandlerFunction() === 'trierBoite') ScriptApp.deleteTrigger(t[i]);
  ScriptApp.newTrigger('trierBoite').timeBased().everyMinutes(10).create();
  return 'Tri automatique installé (toutes les 10 min). Fils rangés tout de suite : ' + trierBoite();
}
`;
}

function main() {
  const regles = JSON.parse(readFileSync(REGLES, 'utf8'));
  const i = process.argv.indexOf('--depuis');
  if (i > 0) {
    const n = fusionnerExpediteurs(regles, JSON.parse(readFileSync(process.argv[i + 1], 'utf8')));
    regles.expediteurs = Object.fromEntries(Object.entries(regles.expediteurs).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(REGLES, JSON.stringify(regles, null, 2) + '\n');
    console.log(`regles-tri.json : ${n} domaine(s) ajouté(s), ${Object.keys(regles.expediteurs).length} au total`);
  }
  writeFileSync(join(ICI, 'filtres-gmail-kevin.xml'), genererXml(regles));
  writeFileSync(join(ICI, 'tri-auto.gs'), genererGs(regles));
  console.log('écrits : tools/gmail/filtres-gmail-kevin.xml, tools/gmail/tri-auto.gs');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
