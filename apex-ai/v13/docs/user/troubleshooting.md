# Résolution des problèmes — FAQ

## Connexion

### J'ai oublié mon PIN
1. Login → "PIN oublié ?"
2. Réponds aux questions de récupération
3. OU validation WhatsApp OTP
4. OU validation email
5. Réinitialise un nouveau PIN

> ⚠️ Si tu n'as configuré ni questions ni WhatsApp/email → contact support : kevin.desarzens@gmail.com

### Connexion bloquée (rate-limit)
Trop de tentatives PIN ratées :
- 5 fails → blocage 30 secondes
- 6 fails → blocage 2 minutes
- 7 fails → blocage 10 minutes
- 8 fails → blocage 1 heure
- 9 fails → blocage 24 heures

Patiente le temps indiqué, ou contact support pour reset immédiat.

### "Je n'ai jamais reçu l'email de validation"
1. Vérifie tes **spams** / courrier indésirable
2. Ajoute `noreply@apex-ai.fr` à tes contacts
3. Touche **"Renvoyer"** (cooldown 60s)
4. Si toujours rien après 5 min → utilise validation WhatsApp ou contact support

## Performance

### L'app est lente
- Recharge la page (pull-to-refresh sur mobile)
- Vérifie ta connexion internet (Réglages → Diagnostic réseau)
- Vide le cache (Réglages → Avancé → Vider cache)
- Désinstalle puis réinstalle la PWA

### "Stockage saturé"
Apex limite localStorage à ~5 Mo (iOS Safari).
- Réglages → Stockage → "Nettoyer maintenant"
- Apex compresse + archive automatiquement

### IA ne répond pas / "3 points infinis"
1. Vérifie ta connexion
2. Touche le bouton **💥 Débloquer Apex** (en bas à droite)
3. Apex tente : reset connexion → failover provider → mode local
4. Si persiste : Réglages → IA → Diagnostic providers

### Mises à jour ne s'installent pas
- Apex se met à jour automatiquement (Service Worker)
- Force update : ferme l'app, puis ré-ouvre
- iPhone : double-tap home pour quitter, ré-ouvre depuis l'écran d'accueil
- Si bloqué sur ancienne version : Réglages → "Force mise à jour"

## Chat IA

### "Je n'ai pas compris ta demande"
Apex ne dit JAMAIS "je n'ai pas compris" → si ça arrive, c'est un bug.
- Touche 🔁 régénérer
- Reformule autrement
- Contact support avec la conversation

### Réponse coupée à mi-chemin
- Touche **"Continuer"** (Apex reprend là où il s'était arrêté)
- Si bloqué : régénère avec un prompt plus court

### Erreur "Quota dépassé"
Tu as atteint la limite mensuelle de ton plan :
- Free : 50 messages/mois
- Personal : 1 000/mois
- Pro : 10 000/mois

Solutions :
- Patiente jusqu'au prochain mois (reset le 1er)
- Upgrade ton plan
- Active "messages extra" facturés à l'unité

### Réponses incohérentes
- L'IA peut faire des erreurs (hallucinations).
- Vérifie toujours les infos critiques.
- Active "Multi-angles" dans Réglages → IA pour avoir 3 perspectives.
- Change de modèle (Claude → GPT → Gemini).

## Vault / Coffre

### "Passphrase incorrecte"
- Vérifie le clavier (majuscule activée ?)
- Réessaie (rate-limit aussi)
- Si oublié définitivement : impossible de récupérer (zero-knowledge)
  - Recrée le coffre
  - Re-saisis tes clés API

### "Clé API détectée non reconnue"
Apex reconnaît 30+ services. Si ta clé n'est pas reconnue :
- Stocke manuellement avec label custom
- Signale à kevin.desarzens@gmail.com pour ajout pattern

## Notifications

### Je ne reçois pas les notifications push
1. Vérifie permission OS : Réglages iPhone → Apex → Notifications → ON
2. Apex Réglages → Notifications → Active
3. Test : Réglages → Notifications → "Tester maintenant"

### Notifications Apex ne marchent pas iOS
iOS Safari notifications **ne fonctionnent qu'en mode PWA installée** (écran d'accueil), pas en navigateur classique.
- Installe Apex sur l'écran d'accueil (Partage → Ajouter à l'écran d'accueil)

## Synchronisation

### Mes données ne se synchronisent pas entre appareils
1. Vérifie connexion internet
2. Réglages → Sync → "Forcer sync maintenant"
3. Vérifie que tu es connecté avec le **même compte** sur les 2 appareils
4. Si différent : Réglages → Diagnostic Firebase

### Conflit de données
Si 2 appareils ont modifié simultanément :
- Apex applique le dernier modifié (timestamp gagne)
- Backup quotidien permet rollback (Réglages → Backups)

## Studios

### Studio Music ne joue pas
- Vérifie permission micro/audio (Safari → Permissions)
- iOS Safari : tap utilisateur requis avant de jouer audio (sécurité Apple)

### Export Studio Vidéo échoue
- Fichier trop gros (>500 Mo) → réduis qualité
- Mémoire iOS limitée → ferme autres apps
- Try plusieurs fois (parfois Safari libère après 1ère tentative)

## Voix

### Wake word "Dis Apex" ne marche pas
- iOS Safari : `continuous=true` non supporté → recovery 500ms auto
- Vérifie permission micro
- Bruit ambiant trop fort → précision baisse
- Réenrôle ta voix (3 enregistrements)

### Voiceprint ne me reconnaît pas
- Réenrôle (Réglages → Voix → Enrôler)
- Calibre threshold (Réglages → Voix → Sensibilité)
- Bruit ambient → enregistre dans calme

## Paiement / facturation

### Paiement refusé
- Vérifie solde carte
- 3D Secure activé ? (vérifie SMS banque)
- Limite paiement en ligne ? (contacte banque)
- Essaie un autre moyen (PayPal, virement)

### Je veux changer de plan
Réglages → Abonnement → Changer
- Upgrade : effet immédiat, prorata facturé
- Downgrade : effet à la prochaine échéance

### Annuler mon abonnement
Réglages → Abonnement → Annuler
- Effet à la fin de la période en cours
- Tu gardes accès jusqu'à la fin
- Pas de remboursement au prorata (sauf Enterprise)

## Confidentialité / RGPD

### Exporter mes données
Réglages → RGPD → "Exporter mes données" → JSON téléchargé

### Supprimer mon compte
Réglages → RGPD → "Supprimer mon compte" → confirmation
- Suppression cascade sous 72h
- Audit log conservé 5 ans (obligation légale)

### Voir qui a accès à mes données
Réglages → RGPD → Sous-traitants → liste à jour

## Bugs

### Crash au démarrage
1. Force quit l'app (double-tap home iOS, swipe up)
2. Re-ouvre
3. Si persiste : désinstalle PWA, réinstalle
4. Si toujours : contact support avec capture d'écran

### "Erreur interne"
- Apex log les erreurs automatiquement (Sentry)
- Touche **"Voir détails"** pour le code erreur
- Communique le code à kevin.desarzens@gmail.com

## Support

- **Email** : kevin.desarzens@gmail.com (24-48h selon plan)
- **Status** : https://status.apex-ai.fr
- **Communauté** : (à définir)
- **Bug bounty** : security@apex-ai.fr

---

*Suite : [Changelog versions](changelog.md)*
