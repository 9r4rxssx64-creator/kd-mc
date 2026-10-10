# 📥 IMPORTS DE KEVIN — tout ce qu'il envoie, et ce que j'en ai fait pour le domaine

> **Règle (Kevin 8.10.2026)** : « Fais tout ce que tu dois faire avec tout ce que je t'ai donné. À chaque import, fais au mieux et
> améliore pour mon domaine. Toujours. »
> Chaque capture, lien, vidéo ou fichier envoyé reçoit UNE ligne ici, dans la même session : ce que c'est, le verdict pour kd-mc.com,
> et l'action faite (PR) ou la raison de l'écarter. Les photos PERSONNELLES (maison, voiture…) ne sont pas analysées (Kevin 7.10 :
> « des photos ne sont pas pour toi ») : une ligne « personnel » suffit.
> Garde : `npm run test:imports-kevin` (chaque ligne a un verdict, aucun « à voir » de plus de 7 jours).

Verdicts : ✅ appliqué · 🛠️ en cours · ⏭️ écarté (raison) · 🏠 personnel

| Date | Import | Verdict | Ce qui a été fait pour le domaine |
|---|---|---|---|
| 2026-10-04 | Capture Apex « Toutes les IA sont KO » | ✅ appliqué | Diagnostic réel du proxy (4 appels authentifiés, HTTP 200 partout) + verdict lisible par annotation (PR « Apex diag ») — clés saines, bannière côté appareil |
| 2026-10-06 | Capture admin.kd-mc.com `{"ok":false,"error":"not_found"}` | ✅ appliqué | Tout chemin de page montre « Qui se connecte » (#4338) |
| 2026-10-06 | TikTok OmniRoute (passerelle 264 fournisseurs IA gratuits) | ⏭️ écarté | Apex bascule déjà entre fournisseurs gratuits (conférence des IA) ; une passerelle tierce verrait toutes les clés et données |
| 2026-10-07 | TikTok « Trump United States Dividend Fund » (jeton crypto) | ⏭️ écarté | Schéma de jeton promotionnel (pump) : aucun usage, ne pas acheter |
| 2026-10-07 | TikTok skills Claude (context-mode, claude-token-optimizer, Caveman) | ⏭️ écarté | Audité le 8.10 : context-mode est un serveur MCP sous licence ELv2 (pas open source), installé par npx sans version figée → il exécuterait du code tiers dans chaque session avec accès au dépôt (risque chaîne d'approvisionnement, règle sécurité maximale). Le principe est appliqué sans lui : CLAUDE.md réduit à un index (−164 000 jetons/message), sorties d'outils filtrées (grep/tail) au lieu d'être recopiées. Caveman écarté (Kevin veut du français complet) ; claude-token-optimizer : même risque npx |
| 2026-10-07 | Facebook : 7 alternatives open source à Adobe | ⏭️ écarté | Le connecteur Adobe est déjà branché |
| 2026-10-07 | Facebook : skill `apk-reverse` (rétro-ingénierie Android) | ⏭️ écarté | Aucune app Android du domaine à analyser |
| 2026-10-07 | Facebook : Wazuh (surveillance de sécurité) | ⏭️ écarté | Lourd à héberger ; le domaine a déjà « Qui se connecte », les alertes et la porte compte obligatoire |
| 2026-10-07 | Facebook : skill `/page-mascot` (personnage qui suit le curseur) | ⏭️ écarté | Bee et Bourricot jouent déjà ce rôle, animés partout |
| 2026-10-07 | Facebook : Dyad (constructeur d'apps IA local) | ⏭️ écarté | Lovable + Claude Code couvrent ce besoin |
| 2026-10-07 | TikTok : bibliothèque de prompts + Gamma 5 (collaboration commerciale) | ⏭️ écarté | Publicité ; Gamma est déjà connecté |
| 2026-10-07 | TikTok : « agent IA sur WhatsApp gratuitement » | ⏭️ écarté | Donner Gmail/Notion/CRM à un agent tiers = risque de sécurité ; Apex fait ce travail |
| 2026-10-07 | Photos maison (garde-manger, toilettes) et Holts Wondarweld | 🏠 personnel | — |
| 2026-10-08 | « Connecte-toi comme moi réel partout » | ✅ appliqué | Faille fermée (session de Kevin par son seul nom, #4361) ; vérif réelle avec sa vraie session ; CSP des pages respectée ; lien piégé neutralisé (#4363) |
| 2026-10-08 | Capture « Mes messages » : Marie Curie, « Inconnu » (Stockholm, compte Laurence), connexions | ✅ appliqué | Journal brut lu au coffre (`coffre-lire-alertes.yml`) : Marie Curie = ma session de test (leçon #452) ; Ludovic Morter / Andrea Casella = vrais (Monaco Telecom) ; carte au nom du compte (plus jamais « Inconnu ») ; bouton « Déconnecter ce compte partout » ; une sonde déclarée n'écrit plus rien ; ménage du compte robot |
| 2026-10-07 | `OCTOBRE_2026_V2.pdf` : « Vérifie tout et respecte toutes tes règles » | ✅ appliqué | 11 personnes sans ligne de planning retrouvées dans les encadrés d'absence de la page 1 (M / CP / FORMATION / CSS) et rangées dans leur tableau ; code CSS ajouté ; détecteur `audit:noms-manquants` = 0 manquant jul→nov ; garde `test:import-absents` ; leçons #454-455 |
| 2026-10-08 | Capture de la page 1 d'octobre (boîtes M / CP / FORMATION / CSS) + « Lemonnier longue maladie / Gendreau css congé sans solde / Comme VERZELLO » | ✅ appliqué | A tranché contre le calque texte de pdfjs : ‹employé› → maladie, ‹employé› → congés (CSS) ; noté dans NOTES_USER ; `parseEncadresGeometric` lit aussi une boîte « 0 M » |
| 2026-10-08 | `NOVEMBRE_2026.pdf` (8 pages, « Roulements du mois de : novembre 2026 ») | ✅ appliqué | Fixture `tests/fixtures/novembre-2026.pdf`, TARGETS des deux générateurs (app + light), boards + seed régénérés (196 tableaux, 5 mois), fusionné (#4372) et vérifié en réel (run 37798486104) |
| 2026-10-10 | `NOVEMBRE_2026.pdf` + `OCTOBRE_2026_V2.pdf` renvoyés : « Vérifie les info réel, comme moi » | ✅ vérifié | Fichiers IDENTIQUES aux fixtures (sha256 `4b78324b161cc4aa…` nov, `7264c7f91c37324a…` oct) ; vérification réelle en admin sur le vrai domaine (voir MEMO 10.10 17h) : planning servi = PDF (empreinte `d2233b20c40133cb`), 18 503 passages de départs conformes, 23 378 cases app ⇄ light identiques, collègue OK |
