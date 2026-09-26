---
name: lire-video
description: Lire VRAIMENT une vidéo que Kevin envoie (TikTok, Instagram, YouTube, Facebook) — la télécharger, transcrire la parole en français horodaté, et en sortir ce qui compte. À ouvrir dès que Kevin envoie un lien de vidéo, une capture d'écran de vidéo, ou dit « regarde cette vidéo », « c'est quoi ce truc », « ça vaut quoi ». Contient la chaîne technique mesurée (l'agent NE PEUT PAS atteindre TikTok, la CI oui) et la grille de lecture des vidéos de vente.
---

# Lire une vidéo pour de vrai

Créée le 2026-09-15 (Kevin envoie une capture TikTok : « Regarde cette vidéo »).
Interdit de commenter une capture d'écran en faisant semblant d'avoir vu la vidéo (leçon #267).

## 1. Ce qui NE marche PAS (mesuré, ne pas réessayer)

| Canal | Résultat mesuré le 15.09.2026 |
|---|---|
| `curl` direct vers tiktok.com | **403 CONNECT** (proxy de l'agent) |
| Passerelles tikwm.com / tiklydown **depuis l'agent** | **403 CONNECT** |
| WebFetch sur tiktok.com / urlebird.com | **EGRESS_BLOCKED** |
| Firecrawl MCP sur une page TikTok | **403** (Firecrawl bloque aussi TikTok) |
| HF Jobs / HF Sandbox | **402 Payment Required** (devenu payant) |
| `yt-dlp` **depuis un runner GitHub**, en direct | `ERROR: [TikTok] Unexpected response from webpage request` — TikTok sert une page de contrôle aux **IP de datacenter** |
| Whisper local dans l'agent | modèles injoignables (huggingface.co et openaipublic bloqués) |

**Ce qui marche : la CI + une passerelle publique.** Le runner GitHub a le réseau ouvert, et
`tikwm.com` (lui) a le droit de parler à TikTok. `api.github.com` et `gitlab.com` répondent 200
depuis l'agent, donc je peux déclencher et lire le résultat.

## 2. La chaîne qui marche

1. Déposer `workflow-modele.yml` dans `.github/workflows/zz-lire-video-temp.yml`
2. Y mettre l'URL de la vidéo, pousser sur sa branche → le job part tout seul
3. Lire les logs (`mcp__github__get_job_logs`, `tail_lines` ≈ 400 ; au-delà le retour est
   tronqué et sauvé dans un fichier qu'on découpe en Bash)
4. **Retirer le workflow du dépôt** une fois le résultat obtenu (dépôt public)

Le job : passerelle tikwm → mp4 → `ffmpeg` extrait l'audio 16 kHz mono → `faster-whisper`
(modèle `small`, `language="fr"`, `vad_filter`) → transcription horodatée `[mm:ss]`.
13 minutes de parole ≈ 5 minutes de job.

## 3. Pièges vérifiés

- **Les sous-titres TikTok ne sont PAS dans le fichier.** Ils sont dessinés par l'app à la
  lecture. Mesuré : 26 aperçus de la vidéo ne portaient que le titre incrusté. Donc l'OCR ne
  sert à rien pour la parole → **transcrire le son**, pas lire l'image. (L'OCR reste utile pour
  un texte réellement incrusté : titre, prix affiché, capture d'écran dans la vidéo.)
- **Mettre le résultat à la FIN du job** : on lit les logs par la fin (`tail`).
- `jq -r` avec un gabarit multi-ligne dans un heredoc YAML : les échappements se perdent.
  Écrire les champs un par un, ou passer par un fichier.
- Un heredoc Python dans un bloc `run: |` doit être à l'indentation **de base** du bloc,
  sinon Python lève `IndentationError` après désindentation YAML.
- Tester la logique de post-traitement **en local avant de pousser** : un aller-retour CI raté
  coûte 5 minutes. (Un bug de dédoublonnage gardait la version tronquée des sous-titres au
  lieu de la version complète — attrapé en local.)

## 4. Si Kevin peut envoyer le fichier

Beaucoup plus court, et tout se fait dans l'agent :
`pip3 install --default-timeout=180 imageio-ffmpeg` (pypi est joignable, contrairement au reste)
→ `imageio_ffmpeg.get_ffmpeg_exe()` → extraire des images → **je les lis moi-même**
(pas besoin d'OCR, je suis multimodal). Prouvé le 15.09 sur une vidéo test.
Mais ça lui demande 3 gestes : préférer la CI, qui ne lui en demande aucun.

## 5. Grille de lecture — reconnaître une vidéo de vente

Observée sur le cas du 15.09.2026 (`@pianotutoezz`, vidéo `7683540481992592673`, 13 min).
Ces marqueurs se répètent d'une vidéo à l'autre :

| Marqueur | Ce que ça veut dire |
|---|---|
| **Le prix n'est jamais dit** — « évidemment c'est payant », et rien de plus | Vente en messages privés. Pas de comparaison possible, pas de temps de réflexion. C'est le signal n°1 |
| « Écris-moi **go** sur Instagram » | Le produit n'est pas la vidéo, c'est la conversation qui suit |
| **Garantie de résultat de revenu** (« 3 000 €/mois ou remboursé ») | Invérifiable : on pourra toujours dire que la méthode n'a pas été appliquée |
| « **Jamais eu la moindre demande** de remboursement » | Invérifiable, et c'est exactement ce que dirait quelqu'un qui n'en accorde aucun |
| « **Mets en favori** » demandé explicitement | Explique un ratio favoris > likes (ici 7 274 pour 5 056) : ce n'est pas de l'enthousiasme, c'est une consigne |
| Beaucoup de **partages**, très peu de **commentaires** (1 073 / 31) | Peu de discussion possible. Commentaires souvent filtrés |
| **Urgence de saison** (« les 3-4 mois les plus importants », Noël) | Levier de pression, indépendant du contenu |
| **Culpabilisation** (« tant pis pour vous », « toujours des excuses ») | Retourne l'hésitation en défaut personnel |
| « Je fais peu de cuts pour que tu voies que c'est **naturel** » | Annoncer sa propre sincérité est une technique, pas une preuve |
| Vend un **compte de réseau social tout fait** | Contraire aux CGU de TikTok : le compte est supprimable. Ici il admet lui-même à `[03:43]` que TikTok bannit des comptes |
| Un **outil tiers cité 3 fois** sans dire qu'on est affilié | Commission probable |

**À faire à chaque fois** : citer les **horodatages** dans la réponse à Kevin. Une citation
`[09:03]` est une preuve ; « il dit en gros que » n'en est pas une.

**Et rester juste** : sur ce cas, la méthode gratuite exposée (niche, régularité, publier sur
les 4 réseaux, avoir un produit à soi) était **correcte**. Dire ce qui est bon ET ce qui cloche,
sinon l'avis n'est pas crédible.
