/* GARDE — « Enlève où il y a marqué WhatsApp tant qu'il ne fonctionne pas » (Kevin 15.10.2026)
   node tests/whatsapp-masque.test.mjs
   La confirmation WhatsApp n'est pas branchée chez Meta (KEVIN_ACTIONS_TODO.md, 10.10) : tant que c'est vrai, rien de visible tout de suite ne la nomme.
   Visible = l'écran d'attente du portail, la boîte de Kevin, les tuiles/compteurs de l'admin, « État du compte ».
   Les écrans de confirmation WhatsApp eux-mêmes (renderTelObligatoire, choix « la personne confirme par WhatsApp » de la création d'invité) ne s'affichent
   QUE si le domaine déclare WhatsApp branché : ils restent, derrière leur interrupteur. */
import { readFileSync } from 'node:fs';
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}`); };
const lire = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const portail = lire('kdmc-home/kdmc-portal.js'), boite = lire('kdmc-home/kdmc-boite.js'), tableau = lire('kdmc-home/admin/tableau.js'), admin = lire('kdmc-home/admin/admin.js');

const attente = portail.slice(portail.indexOf('function renderAttenteAdmin'), portail.indexOf('/* ===== « CRÉE TON CODE »'));
const texteAttente = attente.split('\n').filter((l) => !/^\s*(\/\*|\*|\/\/)/.test(l)).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
ok(!/whatsapp/i.test(texteAttente), '1. l\'écran « en attente de l\'administrateur » ne parle pas de WhatsApp');
ok(/L\\'administrateur doit l\\'ouvrir/.test(attente), '1b. … il dit simplement que l\'administrateur doit ouvrir le compte');

const iB = boite.indexOf('Comptes du domaine à valider');
ok(iB > 0, '2a. le bloc « Comptes du domaine à valider » existe dans la boîte');
const blocBoite = boite.slice(Math.max(0, iB - 80), iB + 1500);
ok(!/whatsapp/i.test(blocBoite.replace(/\/\*[\s\S]*?\*\//g, '')), '2. la boîte (titre, explication, confirmation) ne parle pas de WhatsApp');
ok(/Comptes du domaine à valider/.test(boite) && !/Inscriptions à valider \(' \+ L\.length/.test(boite), '2b. le bloc se distingue des « Inscriptions à valider » de CMCteams');

const lignesTableau = tableau.split('\n').filter((l) => /\{ t: |\{ id: 'sansWhatsapp'/.test(l)).map((l) => l.replace(/ k: '[^']*'/, ''));
ok(!lignesTableau.some((l) => /whatsapp/i.test(l.replace(/id: 'sansWhatsapp'/, ''))), '3. les libellés du tableau (tuile, compteur) ne disent pas WhatsApp (seuls l\'identifiant interne et les mots de recherche le gardent)');

const etat = admin.slice(admin.indexOf('function etatCompte'), admin.indexOf('var _comptes'));
ok(!/whatsapp/i.test(etat), '4. « État du compte » ne parle pas de WhatsApp');

ok(/id="t-wa"/.test(portail) && /cinv-mode-wa/.test(admin) && /if \(j && j\.pret && m\) m\.hidden = false/.test(admin), '5. les écrans de confirmation WhatsApp existent encore, derrière leur interrupteur (hidden tant que le domaine ne les dit pas prêts)');
console.log(`\n${fail ? '❌' : '✅'} whatsapp-masque : ${pass} ok, ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
