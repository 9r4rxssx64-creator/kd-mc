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
| 2026-10-07 | TikTok skills Claude (context-mode, claude-token-optimizer, Caveman) | 🛠️ en cours | Le contexte est le gros des jetons : CLAUDE.md déjà réduit à un index (17.09) ; Caveman écarté (Kevin veut du français complet) ; context-mode à auditer (code, licence, ce qu'il lit) avant tout branchement |
| 2026-10-07 | Facebook : 7 alternatives open source à Adobe | ⏭️ écarté | Le connecteur Adobe est déjà branché |
| 2026-10-07 | Facebook : skill `apk-reverse` (rétro-ingénierie Android) | ⏭️ écarté | Aucune app Android du domaine à analyser |
| 2026-10-07 | Facebook : Wazuh (surveillance de sécurité) | ⏭️ écarté | Lourd à héberger ; le domaine a déjà « Qui se connecte », les alertes et la porte compte obligatoire |
| 2026-10-07 | Facebook : skill `/page-mascot` (personnage qui suit le curseur) | ⏭️ écarté | Bee et Bourricot jouent déjà ce rôle, animés partout |
| 2026-10-07 | Facebook : Dyad (constructeur d'apps IA local) | ⏭️ écarté | Lovable + Claude Code couvrent ce besoin |
| 2026-10-07 | TikTok : bibliothèque de prompts + Gamma 5 (collaboration commerciale) | ⏭️ écarté | Publicité ; Gamma est déjà connecté |
| 2026-10-07 | TikTok : « agent IA sur WhatsApp gratuitement » | ⏭️ écarté | Donner Gmail/Notion/CRM à un agent tiers = risque de sécurité ; Apex fait ce travail |
| 2026-10-07 | Photos maison (garde-manger, toilettes) et Holts Wondarweld | 🏠 personnel | — |
| 2026-10-08 | « Connecte-toi comme moi réel partout » | ✅ appliqué | Faille fermée (session de Kevin par son seul nom, #4361) ; vérif réelle avec sa vraie session ; CSP des pages respectée ; lien piégé neutralisé (#4363) |
