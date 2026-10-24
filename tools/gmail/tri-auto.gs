/* Tri automatique de la boîte Gmail de Kevin — GÉNÉRÉ par tools/gmail/generer-tri.mjs, ne pas modifier ici.
 * À coller dans https://script.google.com (nouveau projet « Tri Gmail Kevin »), puis lancer installer() UNE fois :
 * Google demande une seule autorisation (Gmail), ensuite tout tourne seul toutes les 10 minutes, gratuitement.
 * Il ne range QUE les fils sans libellé des 3 derniers jours, n'efface rien, n'envoie rien.
 */
var REGLES = {
 "accounts.google.com": "🔐 Sécurité & Comptes",
 "adobe.com": "🛠️ Outils & SaaS",
 "airtable.com": "🛠️ Outils & SaaS",
 "aisecret.us": "📰 Newsletters & Veille",
 "apollo.io": "📣 Promotions & Pubs",
 "asana.com": "🛠️ Outils & SaaS",
 "cdata.com": "🛠️ Outils & SaaS",
 "cerebras.ai": "🛠️ Outils & SaaS",
 "cerebras.net": "📣 Promotions & Pubs",
 "communications.paypal.com": "🏦 Banque & Finance",
 "community.pexels.com": "🛠️ Outils & SaaS",
 "datasite.com": "🛠️ Outils & SaaS",
 "em.surveymonkey.com": "🛠️ Outils & SaaS",
 "em1.cloudflare.com": "🛠️ Outils & SaaS",
 "email.anthropic.com": "🛠️ Outils & SaaS",
 "email.claude.com": "🛠️ Outils & SaaS",
 "email.openai.com": "🛠️ Outils & SaaS",
 "emails.mistral.ai": "🛠️ Outils & SaaS",
 "emails.wix.com": "🛠️ Outils & SaaS",
 "era.app": "📣 Promotions & Pubs",
 "eraser.io": "🛠️ Outils & SaaS",
 "exa.ai": "📣 Promotions & Pubs",
 "fathom.video": "🛠️ Outils & SaaS",
 "feedback@anthropic.com": "📑 Administratif & Impôts",
 "feedback+noreply@anthropic.com": "📑 Administratif & Impôts",
 "finnhub.io": "🛠️ Outils & SaaS",
 "firebase-no-reply@google.com": "🛠️ Outils & SaaS",
 "firebase-noreply@google.com": "🛠️ Outils & SaaS",
 "getsentry.com": "🛠️ Outils & SaaS",
 "giphy.com": "🔐 Sécurité & Comptes",
 "google-maps-noreply@google.com": "📱 Réseaux sociaux",
 "google-noreply@google.com": "🔐 Sécurité & Comptes",
 "googleaistudio-noreply@google.com": "🛠️ Outils & SaaS",
 "googledev-noreply@google.com": "🛠️ Outils & SaaS",
 "googleplay-noreply@google.com": "🛠️ Outils & SaaS",
 "groq.co": "🛠️ Outils & SaaS",
 "hello.webflow.com": "📣 Promotions & Pubs",
 "idp.vonage.com": "🔐 Sécurité & Comptes",
 "invoice+statements@mail.anthropic.com": "💳 Factures & Paiements",
 "jam.dev": "🛠️ Outils & SaaS",
 "linear.app": "🛠️ Outils & SaaS",
 "link.com": "🏦 Banque & Finance",
 "lovable.dev": "🛠️ Outils & SaaS",
 "mail.apollo.io": "📣 Promotions & Pubs",
 "mail.consensus.app": "📰 Newsletters & Veille",
 "mail.gitlab.com": "📣 Promotions & Pubs",
 "mail.manus.im": "🛠️ Outils & SaaS",
 "mail.perplexity.ai": "🛠️ Outils & SaaS",
 "make.com": "📣 Promotions & Pubs",
 "marketing.printify.com": "🛍️ Boutiques Printify",
 "md.getsentry.com": "🛠️ Outils & SaaS",
 "metricool.com": "🛠️ Outils & SaaS",
 "mg.gitlab.com": "🛠️ Outils & SaaS",
 "mixpanel.com": "🛠️ Outils & SaaS",
 "moonshot.kimi.ai": "🛠️ Outils & SaaS",
 "motionapp.com": "📰 Newsletters & Veille",
 "myclaw.ai": "🛠️ Outils & SaaS",
 "nasa.gov": "🔐 Sécurité & Comptes",
 "netlify.com": "🛠️ Outils & SaaS",
 "news.manus.im": "🛠️ Outils & SaaS",
 "news.paypal.com": "📣 Promotions & Pubs",
 "nordaccount.com": "🔐 Sécurité & Comptes",
 "noreply-findmydevice@google.com": "🔐 Sécurité & Comptes",
 "notify.cloudflare.com": "🔐 Sécurité & Comptes",
 "notify.vonage.com": "🛠️ Outils & SaaS",
 "obsidian.md": "🔐 Sécurité & Comptes",
 "openlegi.fr": "🛠️ Outils & SaaS",
 "payments-noreply@google.com": "💳 Factures & Paiements",
 "paypal.fr": "🏦 Banque & Finance",
 "pexels.com": "🛠️ Outils & SaaS",
 "platform.datasite.com": "🛠️ Outils & SaaS",
 "printify.com": "🛍️ Boutiques Printify",
 "reseau-franceparebrise.fr": "📑 Administratif & Impôts",
 "sbm.mc": "📑 Administratif & Impôts",
 "sc.mail.deepseek.com": "🛠️ Outils & SaaS",
 "send.synthesize.bio": "🛠️ Outils & SaaS",
 "send.zapier.com": "📰 Newsletters & Veille",
 "sentry.io": "🛠️ Outils & SaaS",
 "speedparebrise13.fr": "📑 Administratif & Impôts",
 "stripe.com": "🏦 Banque & Finance",
 "subito.it": "🔐 Sécurité & Comptes",
 "superhuman.com": "📣 Promotions & Pubs",
 "supermetrics.com": "📣 Promotions & Pubs",
 "support@mail.anthropic.com": "📑 Administratif & Impôts",
 "surveymonkey.com": "🛠️ Outils & SaaS",
 "synthesize.bio": "🛠️ Outils & SaaS",
 "t.outbound.surveymonkey.com": "🛠️ Outils & SaaS",
 "tavily.com": "📣 Promotions & Pubs",
 "tm.openai.com": "🛠️ Outils & SaaS",
 "tpop.com": "🛍️ Boutiques Printify",
 "updates.linear.app": "🛠️ Outils & SaaS",
 "wix.com": "🛠️ Outils & SaaS",
 "wps.com": "📣 Promotions & Pubs",
 "x.ai": "🛠️ Outils & SaaS",
 "yellowglass.fr": "💳 Factures & Paiements",
 "youtube.com": "📱 Réseaux sociaux"
};
var ARCHIVER = {"🛠️ Outils & SaaS":true,"📰 Newsletters & Veille":true,"📣 Promotions & Pubs":true,"📱 Réseaux sociaux":true};
var SUJETS = [{"mot":"[PONT→CLOUD]","libelle":"🌉 Pont"}];
var SECOURS = [{"recherche":"subject:(code OR connexion OR \"sign-in\" OR \"sign in\" OR verification OR vérification OR \"mot de passe\" OR password OR sécurité OR security OR \"new login\" OR \"nouvel appareil\")","libelle":"🔐 Sécurité & Comptes","archiver":false},{"recherche":"subject:(facture OR invoice OR receipt OR reçu OR paiement OR payment)","libelle":"💳 Factures & Paiements","archiver":false},{"recherche":"category:promotions","libelle":"📣 Promotions & Pubs","archiver":true},{"recherche":"category:social","libelle":"📱 Réseaux sociaux","archiver":false},{"recherche":"category:forums","libelle":"📰 Newsletters & Veille","archiver":false},{"recherche":"category:updates","libelle":"🛠️ Outils & SaaS","archiver":false}];

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
