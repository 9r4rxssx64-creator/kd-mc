# Validation WhatsApp OTP

Apex utilise WhatsApp pour la validation client (alternative au SMS, gratuit et international).

## Principe

1. Le client saisit son numéro WhatsApp.
2. Apex envoie un code OTP à 6 chiffres via WhatsApp Business API.
3. Client saisit le code → validation.
4. Compte certifié.

## Cas d'usage

- ✅ Vérification numéro (création compte, changement)
- ✅ 2FA (authentification 2 facteurs)
- ✅ Récupération mot de passe / PIN
- ✅ Confirmation transaction sensible
- ✅ Alerte sécurité (login suspect)

## Pour l'utilisateur

### Recevoir un code

1. Apex demande "Saisis ton numéro WhatsApp" (avec indicatif pays).
2. Tu reçois un message WhatsApp dans les 30 secondes :
   ```
   Apex AI : Ton code de vérification est 482917
   Valable 10 minutes. Ne le partage JAMAIS.
   ```
3. Saisis le code dans Apex.
4. ✅ Validé !

### Sécurité

- Code valable **10 minutes maximum**
- 5 tentatives maximum, sinon nouveau code requis
- Le code n'est jamais affiché dans Apex (anti-screenshot)
- Apex ne demande JAMAIS le code par chat (anti-phishing)

### Si tu ne reçois pas le code

1. Vérifie ton numéro (avec indicatif, ex: +33612345678).
2. Vérifie que WhatsApp est installé et fonctionne.
3. Touche **"Renvoyer"** (cooldown 60s).
4. Si toujours rien, **"Aide"** → email support.

### Numéro multi-utilisateur

Plusieurs comptes Apex peuvent partager le même numéro WhatsApp (familles, équipes).
Chaque OTP indique le compte concerné :
```
Apex AI : Code pour le compte de Kevin DESARZENS : 482917
```

## Pour les administrateurs (Pro/Business)

### Configuration

Apex utilise WhatsApp via Cloudflare Worker proxy (gratuit jusqu'à 1000 OTP/mois).

1. **Réglages admin → WhatsApp**
2. Configure :
   - Numéro Apex Business (sender)
   - Template OTP (validé Meta)
   - Cooldown user (60s par défaut)
   - Limite mensuelle (ex: 1000)
3. Active.

### Suivi consommation

- Réglages admin → Consommation → WhatsApp
- Compteur OTP envoyés / reçus
- Coût par message
- Alertes seuil

### Alternatives en cas d'échec

Si WhatsApp Business API indisponible :
1. **Fallback SMS** (Twilio, Vonage)
2. **Fallback email**
3. **Fallback push notification PWA**

## Confidentialité

- ⚠️ Apex ne stocke PAS le contenu de tes messages WhatsApp
- ⚠️ Seul le numéro de téléphone est conservé (chiffré)
- ⚠️ Conformité RGPD : tu peux supprimer ton numéro à tout moment (Réglages → RGPD)

## Limites

- WhatsApp Business API : sujet aux conditions Meta (https://business.whatsapp.com/terms)
- Pays non-disponibles : Chine, Iran, Corée du Nord
- Numéros virtuels (Skype, Google Voice) : non supportés
- Mineurs <13 ans : interdiction WhatsApp

## Désactivation

Réglages → Sécurité → WhatsApp OTP → Désactiver.
Apex revient à validation par email.

---

*Suite : [Abonnement et facturation](subscription-billing.md)*
