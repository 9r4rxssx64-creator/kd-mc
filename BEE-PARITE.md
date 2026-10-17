# 🐝 BEE ↔ APEX ↔ CLAUDE CODE — ce que chacun sait faire (honnête, 17.10.2026)

> Demande de Kevin (17.10) : « Bee a la parité Apex, et avec toi aussi, même compétence. »
> Cette page dit **ce qui est vrai aujourd'hui**, sans arrondir. Les cases ✅ sont mesurées (test ou robot réel) ;
> les ⚠️ ne le sont pas encore ; les ❌ sont des écarts réels.

## Le principe
- **Bee** = l'assistante de Kevin, partout dans le domaine, **gratuite** (IA gratuites en conférence), qui **lit, cherche, ouvre** et **propose** :
  toute modification passe par le bouton ✅ de Kevin.
- **Apex** = l'assistant qui **écrit** (≈ 200 outils : documents, mails, calendrier, images, réseaux, objets connectés…).
- **Claude Code** = celui qui **construit** (code, tests, publication).
- Bee n'a pas à tout faire seule : quand il lui manque un outil elle **le dit** et **passe la main** (`tache_code` → Claude Code, ou `ouvrir` → Apex).

## Tableau
| Capacité | Bee | Apex | Claude Code |
|---|---|---|---|
| Météo, heure ailleurs, calcul exact, conversions, dates | ✅ outils gratuits (test) | ✅ | ✅ |
| Chercher sur le web, lire une page publique | ✅ `rechercher`, `lire_page` | ✅ | ✅ |
| Planning (lire, qui travaille quand) | ✅ `planning` (lecture seule) | ✅ | ✅ |
| Arbre généalogique : lire, chercher, ouvrir une personne | ✅ + modifier **après ✅**, copie avant, relecture | ✅ | ✅ |
| Ouvrir n'importe quelle app / page du domaine | ✅ `ouvrir` (sans IA pour les demandes nettes) | ✅ | n/a |
| Voir la page où l'on est, lire les documents du domaine | ✅ `voir_page`, `docs_domaine` | ✅ | ✅ |
| Voir les comptes, la boîte de messages, le journal, les robots | ✅ lecture | ✅ + agir | ✅ |
| Agir sur le domaine (bannir, valider, couper…) | ✅ **seulement** via carte ✅ de Kevin | ✅ | ✅ |
| Mémoire et rappels | ✅ `ma_memoire`, `mes_rappels` | ✅ | ✅ (mémoire du dépôt) |
| Modifier du code, lancer les tests, publier | ❌ → **délègue** (`tache_code`) | ⚠️ partiel | ✅ |
| Documents (PDF, Excel, Word), images, vidéo | ❌ | ✅ | ✅ (via outils) |
| Mails, agenda, contacts, réseaux sociaux | ❌ | ✅ | ✅ (connecteurs) |
| Objets connectés (Tuya…) | ❌ | ✅ | ⚠️ |
| Être là, en petit widget, dans **chaque** app | ⚠️ **voir ci-dessous** | ⚠️ propre page | n/a |
| Réservé à Kevin (aucun autre compte) | ✅ session admin prouvée par le domaine (test) | ✅ | n/a |

## Le widget « partout » — l'état exact
- **Cause trouvée (17.10)** : le paquetage de wrangler mettait des `__name(…)` dans les scripts servis, absents de la page → Bee, le bouton ✉️ et « ← Portail » ne se lançaient pas, sans message. **Corrigé et en ligne**, garde `test:js-servis`.
- **Reste volontairement sans widget** : les pages dont la sécurité interdit nos scripts (rotaplan, croupier, cuisine, apex-ai, admin). Décision du 8.10 : on ne force pas la règle de la page. À rouvrir avec Kevin (option : un nonce posé par le routeur).
- **Mesuré en réel le 17.10 après correctif** (Chromium sur le vrai kd-mc.com, marqueur « c'est Kevin » posé) : le script de Bee SE LANCE (`__kdmcBee = 1`) et le cadre est posé — avant, `__kdmcBee` restait vide. Les écrans de connexion (« Lingua — connexion »…) n'ont pas Bee : voulu, personne n'est connecté.
- **Pas encore rejoué pages connectées** : le robot `verif-live-bee-partout` (8 min) a été refusé par la ration d'Actions du jour (règle « gratuit par défaut », on ne force pas sans l'accord de Kevin). Relance programmée juste après minuit UTC.

## Ce qui n'est PAS vérifié
- L'usage réel des outils par l'IA gratuite sur les 11 sujets du robot depuis l'allègement de la consigne (à remesurer).
- Le comportement chez Kevin, sur iPhone (action « Essayer Bee » dans `KEVIN_ACTIONS_TODO.md`).

## Comment combler les écarts, gratuitement
1. **Documents** : outil `fichier` (Markdown / CSV / calendrier `.ics` / carte de contact `.vcf` générés dans le navigateur, bouton de téléchargement) — 0 €, à construire.
2. **Passer la main à Apex** : `ouvrir` vers Apex Chat avec la demande préremplie — 0 €, à construire.
3. **Code** : `tache_code` existe ; lancer Claude Code automatiquement demanderait un jeton GitHub limité aux tickets — **décision de Kevin**.

_Mise à jour : à chaque évolution de Bee (garde R8 : le code de Bee change ⇒ `CLAUDE-HISTOIRE.md` aussi)._
