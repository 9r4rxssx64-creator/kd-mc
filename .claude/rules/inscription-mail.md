# La validation des inscriptions se fait par MAIL (Kevin 17.10.2026, absolue, partout)

- Toute app crée ses comptes par le portail (`/__sso/issue`). E-mail obligatoire → lien signé 48 h → `GET /__sso/mail/confirmer?t=` ouvre le compte tout seul. Kevin ne touche rien ; sa main (Mes messages) n'est que le secours.
- WhatsApp / Meta : abandonné (pas de 2e numéro). Ne plus l'écrire ni l'afficher comme chemin normal. Pas de « validation manuelle » comme règle : c'est le secours.
- Rien à coder côté app ; écran d'attente : lire `whoami.mail_attente`. Interrupteur `KDMC_MAIL_CONFIRME=0`. Clé `EMAILJS_PRIVATE_KEY` au routeur (déploiement, fail-open).
- Code : `services/kdmc-router/mail-confirme.js`. Gardes : `npm run test:mail-confirme`, `npm run test:validation-par-mail-docs`.
