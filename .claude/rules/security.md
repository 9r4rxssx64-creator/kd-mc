# Regles de Securite

- esc() sur TOUTE donnee utilisateur avant innerHTML
- Guards admin : if(!K.user||K.user.role!=="admin") return;
- API keys jamais dans le code, toujours localStorage ou Cloudflare Secrets
- Sandbox iframe pour execution de code (sandbox="allow-scripts")
- CSP restrictif sur toutes les pages
- Rate limiting sur les endpoints sensibles
- Chiffrement des donnees sensibles
- Session TTL avec expiration automatique
- Audit log de toutes les actions sensibles
- Bouton ON/OFF sur chaque fonction sensible
- Kill switch global (tout couper en 1 clic)
