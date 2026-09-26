# Skill : Auto-amélioration Sécurité

## Objectif
Apex détecte et corrige automatiquement les failles (OWASP Top 10 + casino-specific).

## Déclencheurs
- security-watch sentinel alerte
- innerHTML sans escapeHtml détecté
- Clé API en clair dans code source
- Auth bypass possible détecté

## Corrections auto

### XSS Prevention
```ts
// INTERDIT: el.innerHTML = userInput
// REQUIS:
el.innerHTML = escapeHtml(userInput); // ou DOMPurify.sanitize()
```

### Auth Guard
```ts
function adminAction(user: ApexUser) {
  if (user.id !== ADMIN_ID) throw new Error('Unauthorized');
}
```

### Vault enforcement
- Toute credential → vault.setKey() AES-GCM-256 + PBKDF2 200k
- Triple persistence : localStorage chiffré + IDB + Firebase backup
- Jamais localStorage.setItem() pour secrets

### CSP Strict
```html
<meta http-equiv="Content-Security-Policy"
  content="default-src 'self'; script-src 'self' 'sha256-...';">
```

## Métriques
- 0 innerHTML sans escape ✅ | 0 secret en clair ✅ | OWASP >= 95/100 ✅
