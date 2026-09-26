# Vérif LIVE des tuiles — ce que Kevin voit vraiment sur son iPhone

_2026-09-26 18:16 UTC · lecture seule sur le domaine · rapport écrit par la machine GitHub_

## Portail kd-mc.com
- ✅ kd-mc.com répond — HTTP 200, 24961 octets
- ❌ la version servie est celle du dépôt — dépôt = v1.0.34 · en ligne = v1.0.33 → PUBLICATION EN RETARD
- ❌ CAUSE : l'origine elle-même sert l'ancienne version — même avec un paramètre inédit → v1.0.33. Ce n'est donc pas le cache : l'adresse stable ne pointe pas sur le paquet publié.
- ❌ les 39 tuiles du fichier sont toutes servies en ligne — absente(s) : « Rotaplan » → https://rotaplan.kd-mc.com/ · « Kit IA de l’indépendant » → https://kit.kd-mc.com/ · « Devenir croupier » → https://croupier.kd-mc.com/ · « Changer mon code admin Privé » → /empreinte/

## Vitrine boutiques
- ✅ shops.kd-mc.com répond — HTTP 200, 17784 octets
- ❌ la version servie est celle du dépôt — dépôt = v1.0.3 · en ligne = v1.0.2 → PUBLICATION EN RETARD
- ❌ CAUSE : l'origine elle-même sert l'ancienne version — même avec un paramètre inédit → v1.0.2. Ce n'est donc pas le cache : l'adresse stable ne pointe pas sur le paquet publié.
- ❌ les 10 tuiles du fichier sont toutes servies en ligne — absente(s) : « EcoCraft » → ecocraft/

## Chaque tuile mène-t-elle quelque part ?
- ✅ les 41 destinations de tuiles répondent — aucune tuile ne mène à une page morte
- ℹ️ 8 tuile(s) « en construction » non sonnée(s) (grisées exprès, elles annoncent un chantier) — Portail kd-mc.com → « Tech Hub 🚧 En construction » (https://shops.kd-mc.com/tech-hub/) · Portail kd-mc.com → « EcoCraft 🚧 En construction » (https://shops.kd-mc.com/ecocraft/) · Portail kd-mc.com → « Digital Vault 🚧 En construction » (https://shops.kd-mc.com/digital-vault/) · Portail kd-mc.com → « Pawsome 🚧 En construction » (https://shops.kd-mc.com/pawsome/) · Vitrine boutiques → « Tech Hub » (tech-hub/) · Vitrine boutiques → « EcoCraft » (ecocraft/) · Vitrine boutiques → « Digital Vault » (digital-vault/) · Vitrine boutiques → « Pawsome » (pawsome/)

## Javis / Bee — le durcissement du 26.09 est-il en ligne ?
- ✅ javis.kd-mc.com sert le widget — 69857 octets
- ❌ la garde des 4 secondes est en ligne (plus d'écran noir si le domaine ne répond pas)
- ❌ le son n'est armé qu'après le portier, et désarmé à la mise en veille
- ❌ le fichier servi est bien celui du dépôt — en ligne 69857 o · dépôt 72270 o
- ✅ l'icône 192 px est servie (installation sur iPhone sans icône floue) — HTTP 200

## Ce que ce contrôle NE prouve pas
- Les tuiles du **tableau admin** (`kdmc-home/admin/admin.js`) sont derrière le code admin :
  elles sont prouvées en vrai navigateur par `npm run test:admin-tuiles-reel` (15/0), pas ici.
- Un cache d'iPhone déjà chargé peut retarder ce que Kevin voit de quelques minutes.

---

**Conclusion : 9 écart(s) mesuré(s) — détail ci-dessus.**
