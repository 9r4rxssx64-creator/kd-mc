# Apex Chat — Audit d'amélioration UX + UI (mesuré en navigateur réel)

**Date** : 17/09/2026 · **Cible** : `messaging-app/index.html` (v1.1.290 au départ → **v1.1.291 en cours d'audit**, le fichier a été modifié par une autre session pendant la passe : 16 538 → 16 609 lignes ; les numéros de ligne ci-dessous sont donc approximatifs, les noms de fonctions/sélecteurs sont la référence fiable).
**Méthode** : Chromium 1194 (Playwright 1.63) servi en HTTPS local (`tests/serve-https.sh`, port 4173), UA iPhone Safari 17.5, DPR 3, tactile, `serviceWorkers:'block'`, API `apex-chat-api…workers.dev` entièrement mockée par `page.route` (conversations, contacts, `/api/users/me`, config, premium ; `ws-ticket` → 503 ; `kd-mc.com` → abort). Session injectée dans `localStorage` (`apex_chat_user`, `apex_chat_token`, CGU + autorisations déjà acceptées, verrou récent). Numéros synthétiques `+336000000xx`, aucun code admin.
**Viewports** : 375×812 (iPhone SE/mini, référence), 390×844 (14 Pro), 768×1024 (tablette). **Scénarios** : déconnecté (téléphone / OTP / pseudo / OTP mode « code affiché »), verrou PIN, connecté avec données (4 conv, 3 contacts, 14 messages), **admin** (`is_admin:true`), **vide** (0 conv / 0 contact), **réseau coupé** (toutes requêtes abandonnées), thèmes clair / minuit, 5 pages statiques, première ouverture, comptage de taps par clic réel.
**Ce que mesure le script injecté** (`node_modules/.ux-audit-lib.mjs`) sur chaque vue : cibles tactiles < 44 px (bouton, lien, `[onclick]`, input, `summary`, `.conv-item`), contraste WCAG calculé sur `getComputedStyle` avec **fond composité** (alpha des ancêtres), police < 14 px (texte) et < 16 px (inputs → zoom iOS), débordement horizontal (`scrollWidth > clientWidth`) et éléments hors écran, chevauchements entre zones fixes (topbar, bannière, bnav, pilule KDMC, composer, modale, toasts), CLS (`PerformanceObserver layout-shift`), a11y (boutons sans nom, inputs sans label, `tabindex>0`, rôle des modales), grille 4/8 px, couleurs hex en style inline. **296 entrées** mesurées (110 vues à 375 px), 0 `pageerror` JS sur toutes les passes.
**Fichiers** : `results.json` (toutes les mesures), `results-extra.json`, `table.md` (296 lignes), `shots/` (296 captures), scripts `messaging-app/node_modules/.ux-audit-{lib,run,extra}.mjs`. Rien n'a été écrit dans le dépôt.

---

## 0. Synthèse en 10 lignes

1. **Aucune vue ne déborde horizontalement** à 375/390/768 (sauf `privacy.html`, 378 > 375 px : le tableau à 3 colonnes). 0 erreur JS. Les modales ont `role=dialog`, `aria-modal`, focus déplacé, ✕ de 44 px, retour iOS = fermeture. C'est une base saine.
2. **Le mode clair est cassé** : titre, avatars et bouton primaire à **1,85:1** (or `#e8b830` sur blanc), mes bulles **blanc sur or 1,85:1** (24 échecs de contraste dans une conversation), topbar et barre d'onglets **restent noires** (`rgba(8,8,15,.95)` en dur). Et il existe **deux écrans « thème »** : « Apparence → Clair » pose `data-theme=light` que **0 règle CSS** ne lit → rien ne change (mesuré : fond `rgb(14,14,16)` avant/après).
3. **Le chiffrement est annoncé trois fois de trois façons** sur le même écran : bannière verte permanente « Chiffrement de bout en bout · vérifie le numéro de sécurité » (54 px), en-tête de la conv « 🔒 Chiffré (transit) », modale « ⚠️ Session E2E non établie ». L'écran de connexion dit « Chiffrement de bout en bout » en titre et « chiffrés en transit (HTTPS) » en pied. Pour un client payant, c'est le point qui coûte le plus de confiance.
4. **Réglages = mur de 40 lignes, 2 191 px, 2,6 écrans**, sans section ni recherche ; **13/40 libellés sont du jargon** (JSON, sync serveur, Snippets, Memory Lane, Diagnostic MAJ, Studios, QR…). Les notifications sont éclatées sur **4 lignes** (n° 3, 4, 13, 22), les données sur **4 lignes**, le thème sur **2** (dont une morte).
5. **Le composer d'une conversation aligne 10 boutons de 40×40 px** sur une ligne de 351 px (contenu 454 px) : 2 boutons sont hors écran sans aucun indice de défilement ; les 10 sont sous 44 px. Les messages n'occupent que **64 % de l'écran** (topbar 61 + en-tête 55 + composer 169 + onglets 65 = 350 px de chrome).
6. Sur la liste : 4 boutons « ⋯ » de **27×35 px**, badge et heure à **11,5 px**, aperçu à 13,6 px ; libellés de la barre d'onglets à **9,6 px** (375) / 10,9 px (390) ; version de la topbar à **8,8 px**.
7. **Réseau coupé** : envoyer un message donne « 🔒 En attente de la clé du contact — sera chiffré puis envoyé » (faux : c'est le réseau), la bulle affiche « 🔒🕓 » sans texte ; l'écran push affiche « ⚠️ Erreur » mais propose quand même « Activer ». Le seul indicateur permanent est un point « ○ » gris de **10×18 px** dans la topbar, sans nom accessible.
8. **Toasts** ancrés à `top:122px` : ils **recouvrent le titre de la vue** (mesuré : « Réglages » caché) au lieu de la zone libre ; la pilule « ← KDMC » (71×23 px) recouvre les lignes de réglages (816 px²) et la bannière « installer » (1 140 px²).
9. **25 `confirm()` natifs** (déconnexion, bloquer, supprimer une conv, effacer l'historique…), 3 `prompt()`, 2 `alert()` : boîtes système non stylées, non mesurables, qui cassent l'identité visuelle.
10. **Onboarding** : 72 mots, la page fait **822 px sur 812** (le pied CGU est coupé sur SE), le bouton « Recevoir le code SMS » est **inerte** tant que la case n'est pas cochée (`pointer-events:none`, opacité 0,5 : un tap ne produit **rien**), et le second bouton « Mon compte kd-mc.com (Face ID, sans SMS) » est incompréhensible pour un invité extérieur. Temps jusqu'au formulaire : 154 ms (très bon).

---

## (a) Mesures brutes par vue — 375 × 812 (iPhone SE), toutes vues

Colonnes : cibles tactiles < 44 px sur total ; échecs de contraste (ratio < 4,5:1, ou < 3:1 en grand texte) sur éléments vérifiés ; textes < 14 px ; inputs < 16 px ; débordement horizontal ; nombre de paires de zones fixes qui se chevauchent ; éléments de `#app` recouverts par la pilule KDMC ; CLS cumulé (session) ; % de hauteur utile hors topbar/bannière/onglets ; boutons sans nom accessible ; mots visibles ; capture dans `shots/`.
Nota : la mesure d'une modale inclut la vue derrière (les 8 cibles < 44 px de « chats » se retrouvent donc dans chaque modale ouverte depuis la liste). « NON ATTEINTE » = la vue n'a pas pu être rendue, raison indiquée.

| scénario | vue | cibles <44 px / total | contraste KO / vérifiés | texte <14 px / vérifiés | inputs <16 px | débord. horiz. | chevauch. zones fixes | pilule KDMC recouvre | CLS | zone utile % | boutons sans nom | mots | capture |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| deconnecte | login-phone | 5/10 | 0/15 | 9/15 | 0 | non | 0 | 0 | 0 | 100 | 0 | 0 | 001-deconnecte-se-login-phone.png |
| deconnecte | login-otp | 4/8 | 0/16 | 7/16 | 0 | non | 0 | 0 | 0.0265 | 100 | 0 | 0 | 002-deconnecte-se-login-otp.png |
| deconnecte | login-pseudo | 3/5 | 0/12 | 6/12 | 0 | non | 0 | 0 | 0.069 | 100 | 0 | 0 | 003-deconnecte-se-login-pseudo.png |
| deconnecte | login-otp-devcode | 4/9 | 0/18 | 9/18 | 0 | non | 0 | 0 | 0.1885 | 100 | 0 | 0 | 004-deconnecte-se-login-otp-devcode.png |
| verrou | lockscreen-pin | 9/22 | 0/35 | 20/35 | 0 | non | 4 | 0 | 0 | 77.8 | 0 | 67 | 005-verrou-se-lockscreen-pin.png |
| connecte | chats | 8/19 | 0/30 | 18/30 | 0 | non | 0 | 0 | 0 | 77.8 | 0 | 67 | 006-connecte-se-chats.png |
| connecte | menu-hamburger | 8/30 | 1/48 | 26/48 | 0 | non | 2 | 0 | 0 | 77.8 | 0 | 67 | 007-connecte-se-menu-hamburger.png |
| connecte | menu-nouveau | 8/25 | 0/39 | 22/39 | 0 | non | 2 | 0 | 0 | 77.8 | 0 | 67 | 008-connecte-se-menu-nouveau.png |
| connecte | inviter | 11/25 | 0/37 | 21/37 | 0 | non | 2 | 0 | 0 | 77.8 | 0 | 67 | 009-connecte-se-inviter.png |
| connecte | recherche-globale | 8/22 | 0/32 | 19/32 | 1 | non | 2 | 0 | 0 | 77.8 | 0 | 67 | 010-connecte-se-recherche-globale.png |
| connecte | nouveau-groupe | 8/24 | 0/35 | 21/35 | 0 | non | 2 | 0 | 0 | 77.8 | 0 | 67 | 011-connecte-se-nouveau-groupe.png |
| connecte | capsule-temporelle | 8/26 | 0/38 | 22/38 | 0 | non | 2 | 0 | 0 | 77.8 | 0 | 67 | 012-connecte-se-capsule-temporelle.png |
| connecte | lettre-differee | 8/25 | 0/37 | 21/37 | 0 | non | 2 | 0 | 0 | 77.8 | 0 | 67 | 013-connecte-se-lettre-differee.png |
| connecte | memory-lane | 8/21 | 0/34 | 18/34 | 0 | non | 2 | 0 | 0 | 77.8 | 0 | 67 | 014-connecte-se-memory-lane.png |
| connecte | conv-actions-menu | 8/43 | 3/54 | 19/54 | 0 | non | 2 | 0 | 0 | 77.8 | 0 | 67 | 015-connecte-se-conv-actions-menu.png |
| connecte | galerie-medias | 12/26 | 0/41 | 24/41 | 0 | non | 2 | 0 | 0 | 77.8 | 0 | 67 | 016-connecte-se-galerie-medias.png |
| connecte | conv-infos | 8/21 | 0/46 | 29/46 | 0 | non | 2 | 0 | 0 | 77.8 | 0 | 67 | 017-connecte-se-conv-infos.png |
| connecte | export-conv | 8/23 | 0/36 | 21/36 | 0 | non | 2 | 0 | 0 | 77.8 | 0 | 67 | 018-connecte-se-export-conv.png |
| connecte | labels | 8/27 | 0/39 | 20/39 | 0 | non | 2 | 0 | 0 | 77.8 | 0 | 67 | 019-connecte-se-labels.png |
| connecte | snooze | 8/27 | 0/39 | 20/39 | 0 | non | 2 | 0 | 0 | 77.8 | 0 | 67 | 020-connecte-se-snooze.png |
| connecte | fond-conv | 8/30 | 0/41 | 26/41 | 0 | non | 2 | 0 | 0 | 77.8 | 0 | 67 | 021-connecte-se-fond-conv.png |
| connecte | stories-mes-statuts | 8/22 | 0/33 | 18/33 | 0 | non | 2 | 0 | 0 | 77.8 | 0 | 67 | 022-connecte-se-stories-mes-statuts.png |
| connecte | rappels | 8/21 | 0/33 | 19/33 | 0 | non | 2 | 0 | 0 | 77.8 | 0 | 67 | 023-connecte-se-rappels.png |
| connecte | signaler | 8/24 | 0/35 | 20/35 | 0 | non | 2 | 0 | 0 | 77.8 | 0 | 67 | 024-connecte-se-signaler.png |
| connecte | bloquer | **NON ATTEINTE** : aucune modale rendue (toasts: ) | | | | | | | | | | | |
| connecte | chat-conversation | 27/42 | 7/43 | 23/43 | 0 | non | 1 | – | 0.062 | 84.5 | 0 | 131 | 025-connecte-se-chat-conversation.png |
| connecte | chat-composer-focus | 27/42 | 7/43 | 23/43 | 0 | non | 1 | – | 0.062 | 84.5 | 0 | 131 | 026-connecte-se-chat-composer-focus.png |
| connecte | chat-emoji-picker | **NON ATTEINTE** : aucune modale rendue (toasts: ) | | | | | | | | | | | |
| connecte | chat-emoji-inline | 27/42 | 7/43 | 23/43 | 0 | non | 1 | – | 0.0423 | 84.5 | 0 | 131 | 027-connecte-se-chat-emoji-inline.png |
| connecte | chat-gif-inline | 28/43 | 7/45 | 24/45 | 0 | non | 1 | – | 0.065 | 84.5 | 0 | 138 | 028-connecte-se-chat-gif-inline.png |
| connecte | chat-find-bar | 31/46 | 7/43 | 23/43 | 0 | non | 1 | – | 0.065 | 84.5 | 0 | 134 | 029-connecte-se-chat-find-bar.png |
| connecte | chat-programmer | 27/48 | 7/52 | 26/52 | 0 | non | 4 | – | 0 | 84.5 | 0 | 131 | 030-connecte-se-chat-programmer.png |
| connecte | chat-ephemere | 27/49 | 7/53 | 25/53 | 0 | non | 4 | – | 0 | 84.5 | 0 | 131 | 031-connecte-se-chat-ephemere.png |
| connecte | chat-sondage | 28/53 | 7/50 | 25/50 | 0 | non | 4 | – | 0 | 84.5 | 0 | 131 | 032-connecte-se-chat-sondage.png |
| connecte | chat-position | 27/47 | 7/49 | 24/49 | 0 | non | 4 | – | 0 | 84.5 | 0 | 131 | 033-connecte-se-chat-position.png |
| connecte | chat-carte-contact | 27/49 | 7/49 | 27/49 | 0 | non | 4 | – | 0 | 84.5 | 0 | 131 | 034-connecte-se-chat-carte-contact.png |
| connecte | chat-securite-e2e | 27/44 | 7/47 | 25/47 | 0 | non | 4 | – | 0 | 84.5 | 0 | 131 | 035-connecte-se-chat-securite-e2e.png |
| connecte | chat-reaction-picker | 35/62 | 8/55 | 24/55 | 0 | non | 4 | – | 0 | 84.5 | 0 | 131 | 036-connecte-se-chat-reaction-picker.png |
| connecte | chat-recherche-ia | 27/46 | 7/46 | 24/46 | 0 | non | 4 | – | 0 | 84.5 | 0 | 131 | 037-connecte-se-chat-recherche-ia.png |
| connecte | chat-appel-audio | 27/43 | 7/45 | 23/45 | 0 | non | 1 | – | 0 | 84.5 | 1 | 131 | 038-connecte-se-chat-appel-audio.png |
| connecte | chat-appel-video | **NON ATTEINTE** : aucune modale rendue (toasts: Connexion temps réel indisponible — réessaie dans un instant) | | | | | | | | | | | |
| connecte | appel-entrant-ui | 27/44 | 7/46 | 23/46 | 0 | non | 1 | – | 0 | 84.5 | 0 | 131 | 039-connecte-se-appel-entrant-ui.png |
| connecte | appel-entrant-video-ui | 27/47 | 7/46 | 23/46 | 0 | non | 1 | – | 0 | 84.5 | 0 | 131 | 040-connecte-se-appel-entrant-video-ui.png |
| connecte | chat-groupe | 14/25 | 1/16 | 9/16 | 0 | non | 1 | – | 0 | 84.5 | 0 | 34 | 041-connecte-se-chat-groupe.png |
| connecte | groupe-menu | 14/30 | 2/22 | 10/22 | 0 | non | 4 | – | 0 | 84.5 | 0 | 34 | 042-connecte-se-groupe-menu.png |
| connecte | contacts | 2/19 | 0/21 | 11/21 | 0 | non | 0 | 0 | 0.062 | 77.8 | 0 | 37 | 043-connecte-se-contacts.png |
| connecte | contact-ajouter | 2/24 | 0/25 | 14/25 | 0 | non | 2 | 0 | 0 | 77.8 | 0 | 37 | 044-connecte-se-contact-ajouter.png |
| connecte | contact-fiche | 2/21 | 1/23 | 12/23 | 0 | non | 2 | 0 | 0 | 77.8 | 0 | 37 | 045-connecte-se-contact-fiche.png |
| connecte | contact-assistance | **NON ATTEINTE** : aucune modale rendue (toasts: 💬 Conv ouverte avec Assistance KDMC / 🆘 Conversation avec l'assistance ouverte | | | | | | | | | | | |
| connecte | appels | 2/14 | 0/27 | 11/27 | 0 | non | 0 | 0 | 0.124 | 77.8 | 0 | 43 | 046-connecte-se-appels.png |
| connecte | reglages | 2/48 | 2/57 | 9/57 | 0 | non | 0 | 2 | 0.124 | 77.8 | 0 | 204 | 047-connecte-se-reglages.png |
| connecte | reglages-profil | 3/64 | 2/76 | 25/76 | 0 | non | 4 | 2 | 0.014 | 77.8 | 0 | 204 | 048-connecte-se-reglages-profil.png |
| connecte | reglages-photo-profil | 3/52 | 2/59 | 10/59 | 0 | non | 2 | 2 | 0.0141 | 77.8 | 0 | 204 | 049-connecte-se-reglages-photo-profil.png |
| connecte | reglages-notifications | 2/66 | 2/72 | 16/72 | 0 | non | 3 | 2 | 0 | 77.8 | 0 | 204 | 050-connecte-se-reglages-notifications.png |
| connecte | reglages-push | 2/51 | 2/60 | 12/60 | 0 | non | 2 | 2 | 0 | 77.8 | 0 | 204 | 051-connecte-se-reglages-push.png |
| connecte | reglages-confidentialite | 2/65 | 10/79 | 28/79 | 0 | non | 2 | 2 | 0 | 77.8 | 0 | 204 | 052-connecte-se-reglages-confidentialite.png |
| connecte | reglages-apparence | 2/58 | 2/62 | 11/62 | 0 | non | 2 | 2 | 0 | 77.8 | 0 | 204 | 053-connecte-se-reglages-apparence.png |
| connecte | reglages-theme-accent | 2/62 | 2/63 | 12/63 | 0 | non | 2 | 2 | 0 | 77.8 | 0 | 204 | 054-connecte-se-reglages-theme-accent.png |
| connecte | reglages-messages-programmes | 2/50 | 2/56 | 9/56 | 0 | non | 2 | 2 | 0 | 77.8 | 0 | 204 | 055-connecte-se-reglages-messages-programmes.png |
| connecte | reglages-insights | 2/51 | 2/79 | 26/79 | 0 | non | 2 | 2 | 0 | 77.8 | 0 | 204 | 056-connecte-se-reglages-insights.png |
| connecte | reglages-favoris | 2/50 | 2/56 | 9/56 | 0 | non | 2 | 2 | 0 | 77.8 | 0 | 204 | 057-connecte-se-reglages-favoris.png |
| connecte | reglages-son | 2/57 | 2/63 | 10/63 | 0 | non | 2 | 2 | 0 | 77.8 | 0 | 204 | 058-connecte-se-reglages-son.png |
| connecte | reglages-mon-statut | 2/60 | 2/67 | 12/67 | 0 | non | 2 | 2 | 0 | 77.8 | 0 | 204 | 059-connecte-se-reglages-mon-statut.png |
| connecte | reglages-bloques | 2/50 | 2/57 | 10/57 | 0 | non | 2 | 2 | 0 | 77.8 | 0 | 204 | 060-connecte-se-reglages-bloques.png |
| connecte | reglages-raccourcis | 2/50 | 2/71 | 17/71 | 0 | non | 2 | 2 | 0 | 77.8 | 0 | 204 | 061-connecte-se-reglages-raccourcis.png |
| connecte | reglages-stockage | 2/50 | 2/61 | 14/61 | 0 | non | 2 | 2 | 0 | 77.8 | 0 | 204 | 062-connecte-se-reglages-stockage.png |
| connecte | reglages-backup | 2/52 | 2/61 | 10/61 | 0 | non | 2 | 2 | 0 | 77.8 | 0 | 204 | 063-connecte-se-reglages-backup.png |
| connecte | reglages-snippets | 10/61 | 2/73 | 18/73 | 0 | non | 2 | 2 | 0 | 77.8 | 8 | 204 | 064-connecte-se-reglages-snippets.png |
| connecte | reglages-diag-maj | 2/52 | 2/67 | 14/67 | 0 | non | 2 | 2 | 0 | 77.8 | 0 | 204 | 065-connecte-se-reglages-diag-maj.png |
| connecte | reglages-import | 3/52 | 3/58 | 9/58 | 0 | non | 2 | 2 | 0 | 77.8 | 0 | 204 | 066-connecte-se-reglages-import.png |
| connecte | reglages-miniapps | 2/56 | 2/61 | 15/61 | 0 | non | 2 | 2 | 0 | 77.8 | 0 | 204 | 067-connecte-se-reglages-miniapps.png |
| connecte | reglages-pay-qr | 2/56 | 2/62 | 14/62 | 0 | non | 2 | 2 | 0 | 77.8 | 0 | 204 | 068-connecte-se-reglages-pay-qr.png |
| connecte | reglages-premium | 2/53 | 2/64 | 13/64 | 0 | non | 2 | 2 | 0 | 77.8 | 0 | 204 | 069-connecte-se-reglages-premium.png |
| connecte | reglages-supprimer-compte | 3/54 | 3/63 | 11/63 | 0 | non | 2 | 2 | 0 | 77.8 | 0 | 204 | 070-connecte-se-reglages-supprimer-compte.png |
| connecte | reglages-effacer-historique | **NON ATTEINTE** : aucune modale rendue (toasts: ) | | | | | | | | | | | |
| connecte | reglages-export-json | (mesure hors DOM : voir texte) | | | | | | | | | | | |
| connecte | light-chats | 9/21 | 18/33 | 18/33 | 0 | non | 0 | 0 | 0 | 77.8 | 0 | 72 | 071-connecte-se-light-chats.png |
| connecte | light-chat-conversation | 27/42 | 24/45 | 23/45 | 0 | non | 1 | – | 0.062 | 84.5 | 0 | 131 | 072-connecte-se-light-chat-conversation.png |
| connecte | light-reglages | 2/48 | 11/56 | 9/56 | 0 | non | 0 | 2 | 0.124 | 77.8 | 0 | 204 | 073-connecte-se-light-reglages.png |
| connecte | light-contacts | 2/19 | 13/21 | 11/21 | 0 | non | 0 | 0 | 0.1381 | 77.8 | 0 | 37 | 074-connecte-se-light-contacts.png |
| connecte | light-menu-hamburger | 2/30 | 17/39 | 19/39 | 0 | non | 3 | 0 | 0 | 77.8 | 0 | 37 | 075-connecte-se-light-menu-hamburger.png |
| connecte | midnight-chats | 9/21 | 9/33 | 18/33 | 0 | non | 0 | 0 | 0 | 77.8 | 0 | 72 | 076-connecte-se-midnight-chats.png |
| admin | chats | 8/20 | 0/31 | 19/31 | 0 | non | 0 | 0 | 0 | 77.8 | 0 | 67 | 077-admin-se-chats.png |
| admin | admin | 2/27 | 0/51 | 33/51 | 0 | non | 0 | 0 | 0 | 77.8 | 0 | 108 | 078-admin-se-admin.png |
| admin | admin-diag | 3/13 | 1/21 | 12/21 | 0 | non | 0 | 0 | 0.0253 | 77.8 | 2 | 36 | 079-admin-se-admin-diag.png |
| admin | admin-users | 2/17 | 0/32 | 18/32 | 0 | non | 0 | 0 | 0.0253 | 77.8 | 0 | 48 | 080-admin-se-admin-users.png |
| admin | admin-live-users | 2/17 | 0/32 | 18/32 | 0 | non | 0 | 0 | 0.0253 | 77.8 | 0 | 48 | 081-admin-se-admin-live-users.png |
| admin | admin-connections | 2/11 | 0/15 | 10/15 | 0 | non | 0 | 0 | 0.0253 | 77.8 | 0 | 15 | 082-admin-se-admin-connections.png |
| admin | admin-toggles | 2/32 | 0/43 | 10/43 | 0 | non | 0 | 1 | 0.0253 | 77.8 | 0 | 122 | 083-admin-se-admin-toggles.png |
| admin | admin-sentinels | 2/11 | 0/23 | 11/23 | 0 | non | 0 | 0 | 0.0253 | 77.8 | 0 | 47 | 084-admin-se-admin-sentinels.png |
| admin | admin-audit | 2/10 | 0/14 | 10/14 | 0 | non | 0 | 0 | 0.0253 | 77.8 | 0 | 15 | 085-admin-se-admin-audit.png |
| admin | admin-invite-book | 2/14 | 0/30 | 22/30 | 0 | non | 0 | 0 | 0.0253 | 77.8 | 0 | 125 | 086-admin-se-admin-invite-book.png |
| admin | admin-trusted-circle | 2/12 | 0/18 | 9/18 | 0 | non | 0 | 0 | 0.0253 | 77.8 | 0 | 38 | 087-admin-se-admin-trusted-circle.png |
| admin | admin-search | 2/16 | 0/19 | 11/19 | 0 | non | 0 | 0 | 0.0253 | 77.8 | 0 | 31 | 088-admin-se-admin-search.png |
| admin | admin-timeline | **NON ATTEINTE** : redirigé vers admin-live-users | | | | | | | | | | | |
| admin | admin-map | 2/15 | 0/18 | 10/18 | 0 | non | 0 | 0 | 0.0253 | 77.8 | 0 | 28 | 089-admin-se-admin-map.png |
| admin | admin-premium | 2/10 | 0/15 | 10/15 | 0 | non | 0 | 0 | 0.0253 | 77.8 | 0 | 20 | 090-admin-se-admin-premium.png |
| admin | reglages-admin | 2/52 | 2/59 | 11/59 | 0 | non | 0 | 2 | 0.0253 | 77.8 | 0 | 235 | 091-admin-se-reglages-admin.png |
| admin | admin-cle-faceid | 2/54 | 2/61 | 11/61 | 0 | non | 2 | 2 | 0 | 77.8 | 0 | 235 | 092-admin-se-admin-cle-faceid.png |
| admin | admin-core-pair | 2/59 | 2/68 | 16/68 | 0 | non | 2 | 2 | 0 | 77.8 | 0 | 235 | 093-admin-se-admin-core-pair.png |
| admin | menu-hamburger-admin | 2/64 | 2/80 | 21/80 | 0 | non | 2 | 2 | 0 | 77.8 | 0 | 235 | 094-admin-se-menu-hamburger-admin.png |
| vide | chats-vide | 4/13 | 0/15 | 8/15 | 0 | non | 0 | 0 | 0 | 77.8 | 0 | 15 | 095-vide-se-chats-vide.png |
| vide | contacts-vide | 2/12 | 0/19 | 11/19 | 0 | non | 0 | 0 | 0 | 77.8 | 0 | 43 | 096-vide-se-contacts-vide.png |
| vide | appels-vide | 3/9 | 0/17 | 12/17 | 0 | non | 0 | 0 | 0 | 77.8 | 0 | 28 | 097-vide-se-appels-vide.png |
| vide | galerie-vide | **NON ATTEINTE** : aucune modale rendue (toasts: Conversation introuvable) | | | | | | | | | | | |
| vide | favoris-vide | 3/11 | 0/20 | 12/20 | 0 | non | 2 | 0 | 0 | 77.8 | 0 | 28 | 098-vide-se-favoris-vide.png |
| vide | programmes-vide | 3/11 | 0/20 | 12/20 | 0 | non | 2 | 0 | 0 | 77.8 | 0 | 28 | 099-vide-se-programmes-vide.png |
| reseau-coupe | chats-hors-ligne | 8/19 | 0/30 | 18/30 | 0 | non | 0 | 0 | 0 | 77.8 | 0 | 67 | 100-reseau-coupe-se-chats-hors-ligne.png |
| reseau-coupe | contacts-hors-ligne | 2/19 | 0/20 | 11/20 | 0 | non | 0 | 0 | 0 | 77.8 | 0 | 37 | 101-reseau-coupe-se-contacts-hors-ligne.png |
| reseau-coupe | chat-envoi-hors-ligne | 28/43 | 7/45 | 24/45 | 0 | non | 1 | – | 0.062 | 84.5 | 0 | 136 | 102-reseau-coupe-se-chat-envoi-hors-ligne.png |
| reseau-coupe | push-hors-ligne | 28/46 | 7/51 | 27/51 | 0 | non | 4 | – | 0 | 84.5 | 0 | 136 | 103-reseau-coupe-se-push-hors-ligne.png |
| reseau-coupe | inviter-hors-ligne | 31/49 | 7/52 | 27/52 | 0 | non | 4 | – | 0 | 84.5 | 0 | 136 | 104-reseau-coupe-se-inviter-hors-ligne.png |
| reseau-coupe | invite-envoi-hors-ligne | (mesure hors DOM : voir texte) | | | | | | | | | | | |
| reseau-coupe | evenement-offline | (mesure hors DOM : voir texte) | | | | | | | | | | | |
| pages-statiques | aide.html | 5/16 | 0/55 | 4/55 | 0 | non | 0 | – | – | 100 | 0 | 145 | 105-static-aide.html.png |
| pages-statiques | cgu.html | 6/7 | 0/88 | 7/88 | 0 | non | 0 | – | – | 100 | 0 | 785 | 106-static-cgu.html.png |
| pages-statiques | privacy.html | 5/6 | 0/92 | 4/92 | 0 | OUI 378>375 | 0 | – | – | 100 | 0 | 833 | 107-static-privacy.html.png |
| pages-statiques | mentions.html | 5/7 | 0/30 | 4/30 | 0 | non | 0 | – | – | 100 | 0 | 298 | 108-static-mentions.html.png |
| pages-statiques | diag.html | 0/8 | 0/101 | 46/101 | 0 | non | 0 | – | – | 100 | 0 | 268 | 109-static-diag.html.png |
| premiere-ouverture | premiere-ouverture | 5/10 | 0/15 | 9/15 | 0 | non | 0 | 0 | – | 100 | 0 | 0 | 110-premiere-ouverture.png |
| premiere-ouverture | tap-sms-sans-cgu | (mesure hors DOM : voir texte) | | | | | | | | | | | |

### Résumé 390 × 844 et 768 × 1024

| viewport | vues mesurées | cibles < 44 (cumul) | contraste KO (cumul) | textes < 14 px (cumul) | inputs < 16 | débord. horiz. | CLS > 0,1 |
|---|---|---|---|---|---|---|---|
| 375 × 812 | 110 | 958 | 301 | 1 837 | 1 (`#gs-input` 15,2 px) | 1 (`privacy.html`) | login-otp-devcode 0,19 · appels 0,12 · réglages 0,12 · light-contacts 0,14 |
| 390 × 844 | 76 | 778 | 271 | 1 339 | 1 | 0 | idem (0,18 / 0,12 / 0,12 / 0,13) |
| 768 × 1024 | 71 | 770 | 271 | 1 288 | 1 | 0 | aucun (boot 0,09) |

Différences réelles entre 375 et 390 : les libellés de la barre d'onglets passent de 9,6 px à 10,9 px (media query `max-width:380px` → `.6em`), la version topbar de 8,8 à 10,1 px, les boutons 🔎 et 📹 de l'en-tête de conversation restent cachés (`max-width:420px`). À 768 px : **même mise en page qu'un téléphone étirée** (lignes de conversation de 768 px de large, `#app` n'a de `max-width` qu'à partir de 1024 px, pas de vue liste + conversation côte à côte), bannière 36 px, zone utile 84 %.

### Mesures complémentaires (sorties de `results-extra.json`, `_flows`, `_reglages-scroll`, `_apparence-clair-effet`)

```
chrome liste (375) : topbar 61 + bannière sécurité 54 + onglets 65 = 180 px = 22,2 % de l'écran (zone utile 77,8 %)
chrome conversation : topbar 61 + en-tête conv 55 + composer (barre 10 boutons + champ) 169 + onglets 65 = 350 px → messages visibles 523 px = 64,4 %
barre d'attache : 10 boutons .chat-attach 40×40, scrollWidth 454 / clientWidth 351, hors écran : « Partager position », « Partager un contact » (scrollbar masquée, aucun indice)
réglages : 40 .card-row, hauteur 2 191 px, « Se déconnecter » à 2 128 px = 2,6 écrans ; 13 libellés jargon
Apparence → Clair : body bg avant rgb(14,14,16) → après rgb(14,14,16) ; data-theme="light" posé ; règles CSS ciblant [data-theme] : 0
toast : top 122 px (bannière finit à 115) ; recouvre « Réglages » (h2) ; pointer-events:none ; 14,4 px
pilule KDMC : 71×23 px à (8,717) ; recouvre 2 lignes de réglages (473 + 816 px²) ; bannière « installer » (351×144) la recouvre de 1 140 px²
première ouverture : formulaire prêt en 154 ms ; 72 mots ; splash 822 px > 812 (défilement nécessaire) ; bouton SMS disabled + opacity .5 + pointer-events none ; un tap forcé donne « ☝ Coche « J'accepte les conditions » pour continuer » (11,5 px)
événement offline : toast « Hors ligne — tes messages partiront dès reconnexion » + #conn-status « ○ » 10×18 px rgb(138,138,138) sans aria-label
appel sortant (WS coupé) : écran noir plein « 🛜 Connexion temps réel… » + 📴 (bouton sans nom accessible) ; aucun délai maximal, aucun message d'échec
```

**Flux critiques — taps comptés par clic réel (375 px)**

| Flux | Taps | Friction mesurée |
|---|---|---|
| Inviter un contact | **5** (Chromium sans `navigator.share`) ; 2 sur iPhone si la feuille de partage existe | La saisie manuelle est repliée dans un `<details>` (« 📝 Entrer prénom + numéro à la main », 343×37 px) ; validation « Numéro requis » par toast rouge, sans mise en évidence du champ ; l'action existe à **8 endroits** (topbar 📤, ☰, ＋ Nouveau, contacts, appels, état vide…) |
| Envoyer un message | **3** (conv → champ → ➤) | OK. Toast « 🔒 En attente de la clé du contact… » à chaque premier envoi (jargon crypto) |
| Envoyer une photo | **2 + 1-2 système** | `accept="image/*,video/*" capture="environment"` : iOS ouvre **directement l'appareil photo** sur certains modèles au lieu de proposer la photothèque ; **aucun aperçu ni légende** avant envoi (`K._uploadMedia` part immédiatement) |
| Démarrer un appel audio | **1** depuis la conv, 2 depuis l'onglet Appels | Vidéo : bouton caché < 420 px → passe par ⋯ = **2 taps** ; onglet Appels limité aux **8 premiers contacts**, sans recherche |
| Activer les notifications | **3 + 1 système** | 4 lignes concurrentes dans Réglages (n° 3 « Notifications », 4 « Tester une notif serveur », 13 « Son », 22 « Notifications push (app fermée) ») ; la bonne est la 22ᵉ, sous le pli ; l'écran montre « ⚠️ Erreur / Statut actuel » et un bouton « Activer » quand même |
| Changer de thème | **3** par « Thème + couleur d'accent » (ligne 26) ; **4 pour rien** par « Apparence » (ligne 6, effet nul) | Deux écrans pour la même chose, l'un mort |
| Exporter ses données | **2** | 5 lignes concurrentes (Backup/Restauration, Exporter JSON, Importer, Mes données serveur, Supprimer) ; téléchargement immédiat sans dire ce que contient le fichier |
| Supprimer son compte | **4 + clavier** | Ligne 39/40 tout en bas ; saisir « SUPPRIMER » (bon garde-fou) ; bouton rouge à 3,85:1 |

---

## (b) Backlog classé P0 → P3

Format : `[Px] Titre · Vue · Mesure réelle · Amélioration proposée (CSS/JS, ligne approx.) · Effort`

### P0 — bloque ou trompe un client payant

- **[P0] Deux systèmes de thème, dont un mort** · Réglages › Apparence / Thème + accent · `K._applyAppearance` pose `data-theme=light` : **0 règle CSS** ne le lit, fond inchangé `rgb(14,14,16)` ; `K._applyTheme` (l. ~4689) écrit les variables `--ax-*` · Supprimer la ligne « Apparence » et fusionner sa « Taille du texte » dans le picker `K._openThemePicker` (l. ~4713) ; faire pointer `openAppearance` sur `_openThemePicker` ; garder une seule clé (`theme_pref`) · **S**
- **[P0] Mode clair illisible et bicolore** · light-chats / light-chat / light-réglages · 18 échecs sur la liste (h2 « Conversations » or sur blanc **1,85:1**, « ＋ Nouveau » blanc sur or 1,85:1, initiales d'avatar 1,7:1), **24 dans une conversation** (mes bulles `color:var(--ax-bg)` = blanc sur `#e8b830` 1,85:1, liens `#6a8aff` sur or **1,69:1**, heures 3,34:1) ; topbar et bnav restent noires (`.topbar`/`.bnav` `background:rgba(8,8,15,.95)` en dur l. 141/165) · (1) `K._THEMES.light` : ajouter `--ax-gold:#8a6d00` (or foncé, 5,9:1 sur blanc) ou définir `--ax-on-gold:#1a1a1f` et l'utiliser dans `.msg.me`, `.btn`, `.conv-unread` ; (2) remplacer les `rgba(8,8,15,.95)` par `color-mix(in srgb, var(--ax-bg) 95%, transparent)` ; (3) `.security-banner` : dégradé sur variables · **M**
- **[P0] Promesse de chiffrement contradictoire** · login, bandeau, en-tête conv, modale sécurité · Splash : « 🛡 Chiffrement de bout en bout » (titre) **et** « chiffrés en transit (HTTPS) » (pied) ; bandeau permanent `#security-banner` « Chiffrement de bout en bout · vérifie le numéro de sécurité » alors que `K._presenceLabel` affiche « 🔒 Chiffré (transit) » et `_openSecurityVerification` « ⚠️ Session E2E non établie » ; `cgu.html` badge « Chiffrée en transit » · Un seul état, calculé : `K._e2eActive(conv)` → bandeau/sous-titre « 🛡 Chiffré de bout en bout » sinon « 🔒 Chiffré en transit » ; retirer la phrase du splash ou l'aligner ; masquer le bandeau (54 px) par défaut, le garder comme sous-titre de l'en-tête · **S**
- **[P0] Bouton « Recevoir le code SMS » inerte** · login-phone · `setSendEnabled(false)` met `disabled` + `opacity:.5` + **`pointer-events:none`** (l. ~7200) : un tap ne donne aucun retour ; splash 822 px > 812 px (le pied défile) · Garder le bouton actif visuellement (`opacity:1`) et, au tap sans case cochée, secouer la case + message à 14 px sous elle ; ou cocher la case par défaut lien « lire les conditions » (CGU acceptées au tap = pattern App Store) ; réduire `.splash-logo` (6em → 4em) pour tenir sur 812 px · **S**
- **[P0] Réglages : 40 lignes plates, 2,6 écrans, 13 libellés jargon** · Réglages · `renderSettings` (l. ~12512) : 40 `.card-row`, 2 191 px, aucune section ; « Exporter mes données (JSON) », « Réparer mes conversations (sync serveur) », « Diagnostic MAJ », « Templates / Snippets », « Mini-apps (Studios Apex) », « Memory Lane »… · Regrouper en 5 cartes titrées : **Compte** (profil, photo, statut) · **Notifications** (1 seule ligne → sous-écran qui fusionne prefs + push + son + test) · **Confidentialité & sécurité** · **Apparence** · **Données** (export/import/backup/serveur/supprimer) ; déplacer capsule/lettre/mémoire/programmés/favoris/rappels dans ＋ Nouveau ou un onglet « Plus » ; reléguer diag/réparer/raccourcis dans « Avancé » replié (`<details>`) · **M**
- **[P0] Hors-ligne : message trompeur et indicateur invisible** · réseau coupé › envoi · Toast « 🔒 En attente de la clé du contact — sera chiffré puis envoyé » alors que la cause est l'absence de réseau ; bulle « 🔒🕓 » sans texte ; aucun bandeau ; `#conn-status` « ○ » **10×18 px** gris sans `aria-label` ; au boot sans réseau : **0 toast, 0 indication** (liste servie du cache sans le dire) · Bandeau fin (28 px, sous la topbar) « Hors ligne — envoi à la reconnexion » piloté par `navigator.onLine` + échec `fetch` ; sous la bulle en attente, texte « En attente de connexion » ; `#conn-status` → `aria-label="Connecté/Hors ligne"` et 24 px · **S**

### P1 — dégrade nettement l'usage quotidien

- **[P1] Composer : 10 boutons de 40×40 sur une ligne qui déborde** · conversation · `.chat-attach-row` scrollWidth 454 / clientWidth 351, `scrollbar-width:none` (l. 303) ; 2 boutons hors écran, aucun indice ; 10 cibles < 44 px · Ne garder que 📷 🎙 😊 ➤ visibles (44×44), tout le reste derrière un « ＋ » (feuille d'actions) ; `.chat-attach{width:44px;height:44px}` · **M**
- **[P1] Bouton « ⋯ » de la liste 27×35 px** · chats · 4 boutons `aria-label="Actions"` `padding:6px 4px` (l. ~7857) · `min-width:44px;min-height:44px;margin:-6px 0` ; ou remplacer par appui long + balayage (le menu existe déjà via `_openConvActionsMenu`) · **S**
- **[P1] Toasts qui recouvrent le contenu** · toutes vues · `.toasts{top:calc(safe-top + 122px)}` (l. 394) : recouvre le h2 « Réglages » ; 2 toasts pour une action (« 💬 Conv ouverte avec Assistance KDMC » + « 🆘 Conversation avec l'assistance ouverte », `K._contactSupport`) · Ancrer en bas au-dessus des onglets (`bottom:calc(safe-bottom + 84px)`), 1 toast par action, 3,5 s max, pas de toast d'info après une navigation déjà visible · **S**
- **[P1] Pilule « ← KDMC » flottante** · chats, réglages, modales · 71×23 px (< 44), 11 px, recouvre 2 lignes de réglages (816 px²) et la bannière « installer » (1 140 px²) ; disparaît seulement en conversation · La déplacer dans le menu ☰ (1 ligne « Retour au portail KDMC ») ou dans la topbar à gauche du ☰ ; supprimer l'élément fixe · **S**
- **[P1] Recherche globale : input 15,2 px → zoom iOS** · recherche-globale · `#gs-input` font-size 15,2 px (seul input < 16 px de l'app) · `font-size:16px` · **S**
- **[P1] 25 `confirm()` / 3 `prompt()` / 2 `alert()` natifs** · déconnexion (`K.logout`), bloquer (`_blockUser`), supprimer conv (`_deleteConv`), effacer (`_clearConvMessages`, `_wipeAllChatHistory`), tout marquer lu… · boîtes système non stylées, texte avec emojis et `\n` · Helper `K._confirmModal(title, text, {danger, label})` sur `_showModal` (déjà utilisé pour « Supprimer mon compte ») et remplacer les 25 appels · **M**
- **[P1] Rouge d'action sous 4,5:1** · réglages, menu ⋯, bloquer, fiche contact · `.btn-err` blanc sur `#cf5f5f` **3,85:1** (« Se déconnecter », « Supprimer définitivement ») ; `#e63946` sur `#1a1a1f` **4,16:1** (« Supprimer mon compte », « Bloquer », « Effacer », « Fiche indisponible », erreurs admin) · `--ax-err:#b23a3a` (fond, blanc dessus 5,9:1) et `#ff6b6b` pour le texte rouge sur fond sombre (5,2:1) ; supprimer les 3 `#e63946` inline (`_openConvActionsMenu` l. ~4441) · **S**
- **[P1] Textes de service trop petits** · toutes vues · bnav 9,6 px (375) / 10,9 px ; version topbar 8,8 px ; heure & badge liste 11,5 px ; heure de bulle 10,4 px (4,35:1) ; sous-titre en-tête 10,9 px ; « GIF » 10,6 px ; bannière sécurité 12,5 px ; aide des lignes 12,5 px · `.bnav-btn{font-size:.75em}` (12 px) sans la réduction à 380 px ; `.conv-time,.msg-time{font-size:.8em}` (12,8 px) ; masquer la version dans la topbar (elle est déjà dans Réglages et le menu) · **S**
- **[P1] Bandeau sécurité permanent de 54 px** · liste, contacts, appels, réglages · 22 % de chrome (180 px) sur 812 ; le bandeau répète l'info du cadenas · Le retirer ; l'info vit dans l'en-tête de chaque conversation (déjà là) · **S**
- **[P1] Doublons d'entrées** · partout · « Inviter » à 8 endroits ; « Se déconnecter » ×2 ; « Diagnostic technique » ×2 + « Diagnostic MAJ » ; « Messages programmés » ×2 ; « Rechercher » ×3 (liste, ☰, ＋) · Une seule porte par action : Inviter = topbar 📤 + état vide seulement ; ☰ réduit à Nouveau / Réglages / Admin ; supprimer « Diagnostic technique » du ☰ · **S**
- **[P1] État vide « Contacts » technique** · vide › contacts · 3 boutons pleine largeur au-dessus du message, puis « 🩺 diag · token:oui · admin:non · serveur HTTP:200 · comptes:0 · convs:0 · cache:0 » (11,5 px, mono) affiché à l'utilisateur final · Un seul CTA « Inviter un ami » (le vrai flux), le diag derrière un lien « Un souci ? » ou uniquement pour `is_admin` · **S**
- **[P1] Onglet Appels : jargon + liste tronquée** · appels · « WebRTC P2P chiffré bout-en-bout · audio ou vidéo » (13,1 px) ; `contacts.slice(0,8)` sans recherche ; historique daté « 17/09/2026 17:11:02 · 125s » (11 px) ; lien inline « Invite un ami » 89×16 px · Retirer la phrase technique ; liste complète avec champ de recherche ; « Il y a 1 h · 2 min 5 s » ; bouton 44 px · **S**
- **[P1] Écran d'appel sans issue** · chat-appel-audio · Plein écran noir « 🛜 Connexion temps réel… » **sans délai maximal ni message d'échec** quand le WS est coupé ; bouton raccrocher 📴 **sans nom accessible** ; rendu dans `#modal-host` sans `role=dialog` · Timeout 15 s → « Impossible de joindre Laurence · Réessayer / Annuler » ; `aria-label="Raccrocher"` ; `role="dialog"` · **S**
- **[P1] Vidéo cachée sous 420 px** · conversation · `@media(max-width:420px){.chat-header .hdr-opt{display:none}}` (l. 246) : 📹 et 🔎 exigent 2 taps via ⋯ · Garder 📞 et 📹, envoyer 🔎 dans ⋯ ; ou un seul bouton « Appeler » ouvrant un choix audio/vidéo · **S**
- **[P1] Envoi de photo sans aperçu ni légende** · conversation › 📷 · `K._uploadMedia` part dès `onchange` ; `capture="environment"` force l'appareil photo · Retirer `capture` (laisser iOS proposer Photothèque / Appareil) ; feuille « Aperçu + légende + Envoyer » avant l'upload · **M**
- **[P1] Boutons icône sans nom** · snippets (🗑 ×8, 28×21 px), admin-diag (← 42×44, 🔍), appel (📴) · `a11y.noName` · `aria-label` + 44 px · **S**
- **[P1] Inputs sans label associé** · login (2), invitation (2), profil (12), recherche, confidentialité (2 `<select>`) · `.label` est un `<label>` sans `for`, ou un `<p>` · `for="id"` / `aria-label` ; VoiceOver lit sinon le placeholder seul · **S**
- **[P1] `privacy.html` déborde de 3 px** · page statique · `docScrollWidth 378 > 375` (table 3 colonnes `width:100%`) · `table{display:block;overflow-x:auto}` ou passer la 3ᵉ colonne en ligne sous 480 px · **S**
- **[P1] `diag.html` affiche « v1.0.0 »** · page statique · `#d-ver` = v1.0.0 alors que l'app est en v1.1.291 ; 46 textes à 12,5 px · Lire `__APEX_CHAT_VERSION__` ou le manifeste ; 14 px minimum · **S**
- **[P1] Route admin morte** · admin-timeline · `K.sv('admin-timeline')` **redirige vers admin-live-users** ; `admin-diag` affiche une erreur JS brute « ❌ Cannot read properties of undefined (reading 'length') » ; `admin-map` « Carte indisponible : » (raison vide) · Retirer la tuile ou la câbler ; messages d'erreur en français ; raison réelle · **S**

### P2 — polish visible, cohérence

- **[P2] Grille 8 px non tenue** · liste 29/61 valeurs hors grille 4 px (48 %), conversation 149/181 (82 %), réglages 124/134 (93 %) · `.card-row{padding:10px 0}`, `.msg{padding:6px 10px}`, `gap:6px`, `.conv-item{padding:12px 10px}` · Tokens `--sp-1:4px … --sp-4:16px` et n'utiliser que ceux-là · **M**
- **[P2] Styles inline massifs et hex en dur** · 50–60 éléments stylés inline par modale, jusqu'à 7 hex inline (theme picker), 3 `#e63946` (menu ⋯) · Classes `.row`, `.muted`, `.danger` · **M**
- **[P2] Tablette 768 : téléphone étiré** · tab › chats/conversation · lignes de 768 px, `#app{max-width:900px}` seulement ≥ 1024 (l. 450), pas de liste + conversation côte à côte, bulles à 84 % de 768 px · `@media(min-width:700px)`: `#app{max-width:640px;margin:auto}` ; à terme grille 320 px + 1fr · **M**
- **[P2] Petites cibles secondaires** · galerie (onglets 30 px de haut), réactions (33×22), citation de réponse (159×39), hashtag (32×16), liens inline 15–16 px (CGU, aide, « Réinitialiser » du verrou 73×15) · `min-height:44px` ou zone de tap étendue via `::before` · **S**
- **[P2] CLS à chaque changement de vue** · appels/réglages 0,062 par navigation (cumul 0,124), OTP « code affiché » 0,19, boot tablette 0,09 · La zone `#app` change de hauteur au rendu (bandeau/toast) ; réserver la hauteur du bloc « code SMS » ; éviter `animation:slidein` sur les blocs de contenu · **S**
- **[P2] Ordre et libellés des réglages** · « Capsule temporelle » entre « Apparence » et « Lettre différée », « Memory Lane (il y a 1 an) », « Long-press sur un message » (état vide favoris), « Templates / Snippets », « Insights IA » · Français simple : « Réponses rapides », « Souvenirs d'il y a un an », « Appui long » · **S**
- **[P2] Avatar / nom incohérents** · réglages · avatar initiale « T » (real_name) mais nom affiché « kevin » (pseudo) · Afficher `real_name` en titre, `@pseudo` en sous-titre · **S**
- **[P2] Thème « Minuit »** · midnight-chats · `--ax-text-3:#606068` sur `#08080e` = **3,21:1** (9 échecs : onglets, version, heures) · `#8a8a94` · **S**
- **[P2] Bouton « Mon compte kd-mc.com (Face ID, sans SMS) »** · login · Pour un invité extérieur : nom de domaine inconnu + « Face ID » + « sans SMS » = 3 concepts ; le bouton est aussi haut que l'action principale · Le réduire en lien texte « Déjà membre du domaine kd-mc ? Se connecter » sous le bouton principal · **S**
- **[P2] Modale d'actions de conversation : 21 boutons pleine largeur** · conv-actions-menu · 1 369 px de contenu dans 690 px, ordre non hiérarchisé (« Fuseau horaire peer », « Stats réactions » au même niveau que « Supprimer ») · 6 actions principales en grille d'icônes + « Plus… » · **M**
- **[P2] Bannière « installer sur l'écran d'accueil »** · première session iOS hors PWA · 351×144 px sur la liste, 13,6 px, chevauche la pilule KDMC · La montrer une fois après le premier message envoyé (moment de valeur), en bas, 2 lignes · **S**

### P3 — confort

- **[P3] Titres de page** · `h2` seulement, jamais de `h1` dans l'app ; conversation sans titre sémantique · `h1` visuellement identique · **S**
- **[P3] Pages statiques** : liens de pied 16 px de haut ; pas de mode sombre/clair automatique (`darkAware:false`) ; `cgu` 785 mots / `privacy` 833 mots sans sommaire · Ajouter un sommaire ancré et `prefers-color-scheme` · **S**
- **[P3] Skip-link** · présent mais 32×16 px hors écran (normal) — vérifier le focus au clavier externe iPad · **S**
- **[P3] Programmer un message** · avertissement « Tu dois garder Apex Chat ouvert pour l'envoi auto (envoi via ce device) » à 11,2 px : information capitale, la mettre en 14 px avec icône · **S**

---

## (c) Les 10 améliorations à plus fort impact pour un client payant (dans l'ordre)

1. **Une seule vérité sur le chiffrement** (P0) — bandeau/sous-titre/modale/splash calculés depuis `K._e2eActive`. C'est la promesse commerciale ; aujourd'hui elle se contredit à l'écran.
2. **Réparer le mode clair et supprimer l'écran « Apparence » mort** (P0) — 1,85:1 sur les titres et mes bulles, barres restées noires ; c'est le premier réglage qu'un utilisateur de 60 ans touche.
3. **Réglages en 5 sections + « Avancé » replié** (P0) — 40 → ~12 lignes visibles, 0 jargon, notifications sur une seule ligne.
4. **Écran de connexion : bouton SMS toujours réactif, page qui tient sur 812 px, un seul bouton principal** (P0).
5. **Hors-ligne honnête** (P0) — bandeau « Hors ligne », statut « en attente de connexion » sous la bulle, plus de message « clé du contact » quand c'est le réseau.
6. **Composer allégé : 4 boutons de 44 px + « ＋ »** (P1) — et aperçu/légende avant d'envoyer une photo, sans forcer l'appareil photo.
7. **Retirer le bandeau vert permanent (54 px) et la pilule KDMC flottante** (P1) — +7 % d'écran utile, plus de recouvrements.
8. **Remplacer les 25 `confirm()` natifs et le rouge 3,85:1** par la modale maison, couleurs d'alerte conformes (P1).
9. **Boutons « ⋯ » à 44 px, textes de service ≥ 12 px, toasts en bas** (P1) — les trois irritants tactiles/lisibilité de la vue la plus utilisée.
10. **Écran d'appel avec délai et échec explicite, vidéo à 1 tap** (P1) — aujourd'hui « Connexion… » peut rester à l'infini.

---

## (d) Auto-critique : ce que je n'ai pas pu mesurer, et pourquoi

- **Pas de WebKit / Safari réel.** Tout est mesuré dans Chromium 1194 avec un UA iPhone. Le rendu iOS (police système -apple-system, hauteur réelle du clavier, `env(safe-area-inset-*)`, `100dvh`, comportement de `position:sticky` du composer avec le clavier ouvert, zoom automatique des inputs < 16 px) n'est pas prouvé ici. Le WebKit de Playwright est présent dans le dépôt mais son script de Service Worker et les modules posaient problème en CI (voir `playwright.config.js`) ; je n'ai pas eu le temps de doubler la passe.
- **`navigator.share` absent dans Chromium headless** : le flux « Inviter » est compté à 5 taps ; sur iPhone la feuille de partage existe et ramène à 2 taps — non vérifié sur appareil.
- **Service Worker bloqué** (`serviceWorkers:'block'`, indispensable au mock) : pas de mesure des notifications push réelles, de la bannière « nouvelle version », du comportement hors-ligne servi par le cache SW (j'ai coupé le réseau côté `fetch`, pas côté SW).
- **WebSocket, appels WebRTC, Face ID, OTP réel** : mockés ou impossibles. L'écran d'appel a été mesuré en état « Connexion… » (WS indisponible) et via `K._renderCallUI` ; l'état « en communication », l'appel entrant avec sonnerie et la vidéo locale n'ont pas été vus.
- **Vues non atteintes** (listées dans le tableau) : `bloquer`, `effacer l'historique`, `chat-emoji-picker` (c'est un panneau inline, mesuré sous « chat-emoji-inline »), `contact-assistance` (ouvre une conversation, pas une modale), `chat-appel-video` (refusé faute de WS : toast « Connexion temps réel indisponible »), `admin-timeline` (route morte), `galerie-vide` (conversation absente en scénario vide). Les flux à `confirm()` natif ne sont pas mesurables par le DOM.
- **Stories** : seule la liste « Mes statuts » a été ouverte ; le composeur de statut et le visionnage n'ont pas été rendus (fonctions non exposées sans donnée).
- **Contraste sur dégradés** : les éléments posés sur un `background-image` (bandeau vert, avatars) sont marqués `[gradient]` ; leur ratio est approximé sur la couleur composite des ancêtres. En mode clair, les 2 échecs « bandeau » sont un faux positif de cette approximation (le bandeau reste vert foncé) — ce qui est en soi une incohérence visuelle en thème clair.
- **Tap counting** : compté par clics programmés sur le DOM ; les taps système (feuille photo, prompt notification) sont estimés (« +1 système »).
- **Le fichier a changé pendant l'audit** (v1.1.290 → v1.1.291, +71 lignes par une autre session) : la passe rapide et la passe complète n'ont pas mesuré exactement le même code ; les chiffres du tableau viennent de la passe complète (v1.1.291). Les numéros de ligne cités sont ceux lus au début.
- **Non mesuré faute d'outil dans le sandbox** : performance sur appareil (INP, temps de rendu de la liste avec 200 conversations), poids réseau (841 Ko de HTML), VoiceOver réel, Dynamic Type iOS (« Taille du texte » de l'app ne suit pas celle du système), mode paysage, luminosité extérieure.
- **Ce dont je ne suis pas certain** : l'effet réel de `capture="environment"` dépend de la version iOS (certaines proposent quand même la photothèque) ; le chevauchement modale/bnav (24 375 px²) est voulu (la feuille passe au-dessus) et n'est pas compté comme défaut.

---

## Annexe — sorties brutes du script par vue principale (375 px, sélecteur · taille · ratio)

Listes dédupliquées, bruit commun retiré (skip-link, pilule KDMC, libellés d'onglets déjà cités). Le détail complet de chaque vue est dans `results.json`.

### deconnecte / login-phone (capture `001-deconnecte-se-login-phone.png`)

```
CIBLES < 44 px (5/10) :
  label «J'accepte les conditions d'utilisation e»  315x37
  a «conditions d'utilisation»  144x15 (lien inline)
  a «conditions»  64x15 (lien inline)
CONTRASTE KO (0/15, hors dégradés) :
  aucun
TEXTE < 14 px (9/15) :
  p «🔒 Les deux sont obligatoires (n'importe»  11.5px
  div#splash-version «v1.1.291»  12.5px
  p.splash-cgu «🔒 Messagerie privée — Tes échanges sont»  12.5px
  a «conditions»  12.5px
  span «J'accepte les conditions d'utilisation e»  12.8px
  a «conditions d'utilisation»  12.8px
  label.label «Numéro de téléphone»  13.6px
INPUTS SANS LABEL : input#auth-phone, input#auth-name
GRILLE 4 px : 0/0 valeurs hors grille · styles inline : 0 · hex inline : 0 · CLS : 0
```

### connecte / chats (capture `006-connecte-se-chats.png`)

```
CIBLES < 44 px (8/19) :
  button.btn.btn-sm «Rechercher dans toutes les conversations»  40x44
  input#conv-search-input  359x41
  button «Actions»  27x35
CONTRASTE KO (0/30, hors dégradés) :
  aucun
TEXTE < 14 px (18/30) :
  div.conv-time «18:15»  11.5px
  span.conv-unread «2»  11.5px
  div#security-banner «🛡 Chiffrement de bout en bout · v  12.5px
  span.key «Chiffrement de bout en bout»  12.5px
  div.conv-last «À ce soir ! Tu rentres à quelle heure ?»  13.6px
INPUTS SANS LABEL : input#conv-search-input
GRILLE 4 px : 29/61 valeurs hors grille · styles inline : 18 · hex inline : 0 · CLS : 0
```

### connecte / chat-conversation (capture `025-connecte-se-chat-conversation.png`)

```
CIBLES < 44 px (27/42) :
  div «Laurence Saint-Polit 🔒 Chiffré (transit»  167x39
  div.msg.me «Message numéro 0 👋 15:56 ✓✓»  179x42
  div.msg.them «Message numéro 1 👋 16:06»  179x42
  span.hashtag «#39»  32x16
  div.reply-quote «↩ kevin Message numéro 6»  159x39
  a.md-link «https://exemple.io/page-tres-longue/avec»  278x34 (lien inline)
  div.msg.them «Message numéro 10 👋 17:36»  189x42
  div.msg.me «Message numéro 11 👋 17:46 ✓✓»  189x42
  span.msg-reaction «❤️»  33x22
  span.msg-reaction.mine «👍»  33x22
  button#chat-emoji-btn «Emojis»  40x40
  button#chat-mic-btn «Message vocal»  40x40
  button.chat-attach «Photo ou vidéo»  40x40
  button#chat-gif-btn «GIF»  40x40
CONTRASTE KO (7/43, hors dégradés) :
  span.hashtag «#39»  1.69:1 (min 4.5) #6a8aff sur #e8b830 14.4px
  a.md-link «https://exemple.io/page-tres-longue/ave  1.69:1 (min 4.5) #6a8aff sur #e8b830 14.4px
  div.msg-time «16:06»  4.35:1 (min 4.5) #8a8a8a sur #26262d 10.4px
TEXTE < 14 px (23/43) :
  div.msg-time «15:56 ✓✓»  10.4px
  div «↩ kevin»  10.4px
  button#chat-gif-btn «GIF»  10.6px
  div#chat-header-subtitle «🔒 Chiffré (transit)»  10.9px
  div «Message numéro 6»  12.2px
CHEVAUCHEMENTS : #bnav ∩ .chat-input = 24375 px²
INPUTS SANS LABEL : textarea#msg-input
GRILLE 4 px : 149/181 valeurs hors grille · styles inline : 10 · hex inline : 0 · CLS : 0.062
```

### connecte / contacts (capture `043-connecte-se-contacts.png`)

```
CIBLES < 44 px (2/19) :

CONTRASTE KO (0/21, hors dégradés) :
  aucun
TEXTE < 14 px (11/21) :
  p «Tape sur un contact pour démarrer une co»  11.5px
  div «🟢 En ligne»  12px
  div#security-banner «🛡 Chiffrement de bout en bout · v  12.5px
  span.key «Chiffrement de bout en bout»  12.5px
GRILLE 4 px : 51/61 valeurs hors grille · styles inline : 17 · hex inline : 0 · CLS : 0.062
```

### connecte / appels (capture `046-connecte-se-appels.png`)

```
CIBLES < 44 px (2/14) :

CONTRASTE KO (0/27, hors dégradés) :
  aucun
TEXTE < 14 px (11/27) :
  div «17/09/2026 17:16:06 · 125s»  11px
  div#security-banner «🛡 Chiffrement de bout en bout · v  12.5px
  span.key «Chiffrement de bout en bout»  12.5px
  p «WebRTC P2P chiffré bout-en-bout · audio »  13.1px
GRILLE 4 px : 54/72 valeurs hors grille · styles inline : 25 · hex inline : 0 · CLS : 0.124
```

### connecte / reglages (capture `047-connecte-se-reglages.png`)

```
CIBLES < 44 px (2/48) :

CONTRASTE KO (2/57, hors dégradés) :
  button.btn.btn-err «🚪 Se déconnecter»  3.85:1 (min 4.5) #ffffff sur #cf5f5f 16px gras
  span «Supprimer mon compte»  4.16:1 (min 4.5) #e63946 sur #1a1a1f 16px
TEXTE < 14 px (9/57) :
  p «Apex Chat v1.1.291»  12px
  div#security-banner «🛡 Chiffrement de bout en bout · v  12.5px
  span.key «Chiffrement de bout en bout»  12.5px
PILULE KDMC recouvre : div.card-row «📅Messages programmés›» (473 px²) ; div.card-row «📊Insights IA (statistique (816 px²)
GRILLE 4 px : 124/134 valeurs hors grille · styles inline : 45 · hex inline : 1 · CLS : 0.124
```

### connecte / light-chats (capture `071-connecte-se-light-chats.png`)

```
CIBLES < 44 px (9/21) :
  button.btn.btn-sm «Rechercher dans toutes les conversations»  40x44
  input#conv-search-input  359x41
  button «Actions»  27x35
CONTRASTE KO (18/33, hors dégradés) :
  h2 «Conversations»  1.85:1 (min 4.5) #e8b830 sur #ffffff 18.4px gras
  button.btn.btn-sm «＋ Nouveau»  1.85:1 (min 4.5) #ffffff sur #e8b830 14.4px gras
  span#topbar-version «v1.1.291»  4.26:1 (min 4.5) #7a7a7a sur #14141b 8.8px
  span «Contacts»  4.26:1 (min 4.5) #7a7a7a sur #14141b 9.6px
  div.conv-time «18:15»  4.29:1 (min 4.5) #7a7a7a sur #ffffff 11.5px
TEXTE < 14 px (18/33) :
  div.conv-time «18:15»  11.5px
  div#security-banner «🛡 Chiffrement de bout en bout · v  12.5px
  span.key «Chiffrement de bout en bout»  12.5px
  div.conv-last «À ce soir ! Tu rentres à quelle heure ?»  13.6px
INPUTS SANS LABEL : input#conv-search-input
GRILLE 4 px : 29/64 valeurs hors grille · styles inline : 21 · hex inline : 0 · CLS : 0
```

### connecte / light-chat-conversation (capture `072-connecte-se-light-chat-conversation.png`)

```
CIBLES < 44 px (27/42) :
  div «Laurence Saint-Polit 🔒 Chiffré (transit»  167x39
  div.msg.me «Message numéro 0 👋 15:56 ✓✓»  179x42
  div.msg.them «Message numéro 1 👋 16:06»  179x42
  span.hashtag «#39»  32x16
  div.reply-quote «↩ kevin Message numéro 6»  159x39
  a.md-link «https://exemple.io/page-tres-longue/avec»  278x34 (lien inline)
  div.msg.them «Message numéro 10 👋 17:36»  189x42
  div.msg.me «Message numéro 11 👋 17:46 ✓✓»  189x42
  span.msg-reaction «❤️»  33x22
  span.msg-reaction.mine «👍»  33x22
  button#chat-emoji-btn «Emojis»  40x40
  button#chat-mic-btn «Message vocal»  40x40
  button.chat-attach «Photo ou vidéo»  40x40
  button#chat-gif-btn «GIF»  40x40
CONTRASTE KO (24/45, hors dégradés) :
  div «↩ kevin»  1.4:1 (min 4.5) #e8b830 sur #e8e0c3 10.4px
  span.hashtag «#39»  1.69:1 (min 4.5) #6a8aff sur #e8b830 14.4px
  a.md-link «https://exemple.io/page-tres-longue/ave  1.69:1 (min 4.5) #6a8aff sur #e8b830 14.4px
  div#chat-header-subtitle «🔒 Chiffré (transit)»  1.82:1 (min 4.5) #5fcf5f sur #f7f5ed 10.9px
  div.msg.me «Message numéro 0 👋 15:56 ✓✓»  1.85:1 (min 4.5) #ffffff sur #e8b830 14.4px
  div.msg-time «16:06»  3.34:1 (min 4.5) #7a7a7a sur #e8e3d0 10.4px
  span#topbar-version «v1.1.291»  4.26:1 (min 4.5) #7a7a7a sur #14141b 8.8px
  span «Chats»  4.26:1 (min 4.5) #7a7a7a sur #14141b 9.6px
TEXTE < 14 px (23/45) :
  div.msg-time «15:56 ✓✓»  10.4px
  div «↩ kevin»  10.4px
  button#chat-gif-btn «GIF»  10.6px
  div#chat-header-subtitle «🔒 Chiffré (transit)»  10.9px
  div «Message numéro 6»  12.2px
CHEVAUCHEMENTS : #bnav ∩ .chat-input = 24375 px²
INPUTS SANS LABEL : textarea#msg-input
GRILLE 4 px : 149/181 valeurs hors grille · styles inline : 10 · hex inline : 0 · CLS : 0.062
TOASTS : ⚠️ Temps réel indisponible (code 1006) — messages en mode local
```

### admin / admin (capture `078-admin-se-admin.png`)

```
CIBLES < 44 px (2/27) :

CONTRASTE KO (0/51, hors dégradés) :
  aucun
TEXTE < 14 px (33/51) :
  div#security-banner «🛡 Chiffrement de bout en bout · v  12.5px
  span.key «Chiffrement de bout en bout»  12.5px
  div.lbl «Diagnostic + tests»  13.1px
  span «Mode»  13.6px
  strong «A»  13.6px
INPUTS SANS LABEL : textarea#admin-ai-input
GRILLE 4 px : 98/122 valeurs hors grille · styles inline : 20 · hex inline : 0 · CLS : 0
```

### vide / contacts-vide (capture `096-vide-se-contacts-vide.png`)

```
CIBLES < 44 px (2/12) :

CONTRASTE KO (0/19, hors dégradés) :
  aucun
TEXTE < 14 px (11/19) :
  div «🩺 diag · token:oui · admin:non · serveu»  11.5px
  div#security-banner «🛡 Chiffrement de bout en bout · v  12.5px
  span.key «Chiffrement de bout en bout»  12.5px
  p «Tape "➕ Ajouter contact" pour saisir un »  13.6px
  strong «"➕ Ajouter contact"»  13.6px
GRILLE 4 px : 22/38 valeurs hors grille · styles inline : 8 · hex inline : 0 · CLS : 0
```

### reseau-coupe / chat-envoi-hors-ligne (capture `102-reseau-coupe-se-chat-envoi-hors-ligne.png`)

```
CIBLES < 44 px (28/43) :
  div «Laurence Saint-Polit 🔒 Chiffré (transit»  167x39
  div.msg.me «Message numéro 0 👋 15:56 ✓✓»  179x42
  div.msg.them «Message numéro 1 👋 16:06»  179x42
  span.hashtag «#39»  32x16
  div.reply-quote «↩ kevin Message numéro 6»  159x39
  a.md-link «https://exemple.io/page-tres-longue/avec»  278x34 (lien inline)
  div.msg.them «Message numéro 10 👋 17:36»  189x42
  div.msg.me «Message numéro 11 👋 17:46 ✓✓»  189x42
  span.msg-reaction «❤️»  33x22
  span.msg-reaction.mine «👍»  33x22
  div.msg.me «Test hors ligne 18:18 🔒🕓»  124x42
  button#chat-emoji-btn «Emojis»  40x40
  button#chat-mic-btn «Message vocal»  40x40
  button.chat-attach «Photo ou vidéo»  40x40
CONTRASTE KO (7/45, hors dégradés) :
  span.hashtag «#39»  1.69:1 (min 4.5) #6a8aff sur #e8b830 14.4px
  a.md-link «https://exemple.io/page-tres-longue/ave  1.69:1 (min 4.5) #6a8aff sur #e8b830 14.4px
  div.msg-time «16:06»  4.35:1 (min 4.5) #8a8a8a sur #26262d 10.4px
TEXTE < 14 px (24/45) :
  div.msg-time «15:56 ✓✓»  10.4px
  div «↩ kevin»  10.4px
  button#chat-gif-btn «GIF»  10.6px
  div#chat-header-subtitle «🔒 Chiffré (transit)»  10.9px
  div «Message numéro 6»  12.2px
CHEVAUCHEMENTS : #bnav ∩ .chat-input = 24375 px²
INPUTS SANS LABEL : textarea#msg-input
GRILLE 4 px : 154/187 valeurs hors grille · styles inline : 10 · hex inline : 0 · CLS : 0.062
TOASTS : 🔒 En attente de la clé du contact — sera chiffré puis envoyé
```

### pages-statiques / privacy.html (capture `107-static-privacy.html.png`)

```
CIBLES < 44 px (5/6) :
  a «kevin.desarzens@gmail.com»  229x19 (lien inline)
  a «ccin.mc»  62x19 (lien inline)
  a «Conditions d'utilisation»  155x16 (lien inline)
  a «Mentions légales»  114x16 (lien inline)
  a «Aide»  30x16 (lien inline)
CONTRASTE KO (0/92, hors dégradés) :
  aucun
TEXTE < 14 px (4/92) :
  p.meta «Apex Chat — Charte vie privée — version »  13.6px
  a «Conditions d'utilisation»  13.6px
DÉBORDEMENT : scrollWidth 378 > clientWidth 375
GRILLE 4 px : 0/0 valeurs hors grille · styles inline : 0 · hex inline : 0 · CLS : –
```
