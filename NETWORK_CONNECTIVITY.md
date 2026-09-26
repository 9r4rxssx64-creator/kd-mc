# NETWORK_CONNECTIVITY.md — WiFi/Bluetooth + Pare-feu corporate (Kevin 2026-04-21)

> **Questions Kevin** :
> 1. "Passer par les réseaux qui m'entourent (WiFi, Bluetooth) — les intégrer, s'en servir"
> 2. "Au travail : WiFi personnel vs clientèle — confusions, blocages, pare-feux possibles avec mes programmes ?"
> 3. "Pas toujours de cellular, il faut que ça marche sur WiFi"

---

## 📡 Partie 1 — Exploiter les réseaux environnants depuis PWA

### WiFi (ce qui MARCHE depuis Safari/Chrome PWA)

| Capability | API | Feasibility | Usage Apex |
|-----------|-----|-------------|------------|
| **Détecter connexion WiFi vs cellular** | `navigator.connection.type` | ✅ Partielle | Affiche "WiFi / 4G / offline" |
| **Vitesse effective** | `navigator.connection.effectiveType` | ✅ OK | Adapte qualité (4g / 3g / 2g / slow-2g) |
| **Nom du réseau (SSID)** | ❌ Bloqué navigateur | ❌ | Raison sécurité |
| **Scanner réseaux alentour** | ❌ Bloqué navigateur | ❌ | Nécessite app native |
| **IP locale** | `WebRTC ICE candidates` | ⚠️ Limité (souvent masqué) | Utile pour détecter LAN |
| **IP publique** | `fetch('https://api.ipify.org')` | ✅ OK | Géolocalisation IP approx |
| **Qualité signal** | Inaccessible depuis browser | ❌ | - |

**Verdict** : on NE peut PAS scanner les SSID autour ni récupérer le nom du WiFi actuel depuis le navigateur. C'est volontairement bloqué par iOS Safari et Chrome pour raisons de vie privée.

**CONTOURNEMENT** (via shortcut mobile) :
- **iOS** : Raccourci Siri "Get WiFi Name" → renvoie SSID → webhook vers Apex
- **Android** : Tasker/Automate récupère SSID → POST vers Apex endpoint
- Ces scripts tournent côté device, envoient les infos à Apex via HTTP

### Bluetooth (ce qui MARCHE depuis PWA)

| API | Browser | Usage |
|-----|---------|-------|
| **Web Bluetooth** (scan + GATT) | ✅ Chrome Android / Chrome Desktop | Scan BLE, connect, lire sensors (cardio Polar H10, balance Xiaomi, etc.) |
| **Web Bluetooth** | ❌ Safari iOS | Non supporté (utiliser app ou HA) |
| **Nearby devices (passif)** | ❌ Aucun navigateur | Pas accessible |

**Ce qu'on peut faire** :
- Depuis tablette Android (Chrome) → scan BLE actif avec `navigator.bluetooth.requestDevice({acceptAllDevices:true})`
- Connexion GATT à un appareil choisi par utilisateur
- Lecture/écriture caractéristiques (ex: charge batterie BLE, data sensors, LED commands, IR blast)

**Exemple code PWA Apex** (Android uniquement) :
```javascript
async function scanBLE() {
  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: ['battery_service', 'device_information']
  });
  const server = await device.gatt.connect();
  const battery = await server.getPrimaryService('battery_service');
  const level = await battery.getCharacteristic('battery_level');
  const value = await level.readValue();
  return value.getUint8(0); // % batterie
}
```

### Intégration dans Apex AI (roadmap)

- **v12.33** : Détection type connexion (WiFi vs cellular) + adaptation UI (mode basse data)
- **v12.34** : Scan BLE bouton "Découvrir appareils proches" (Android seulement)
- **v12.35** : Webhook iPhone Shortcuts "Je suis connecté au WiFi SBM" → Apex bascule en mode pro

---

## 🏢 Partie 2 — WiFi corporate SBM (Casino Monaco)

### Le contexte Kevin

Le Casino de Monaco (SBM) a probablement :
1. **WiFi Personnel** (`SBM-Staff` ou équivalent) — VLAN interne, ports restreints, filtrage DPI
2. **WiFi Clientèle** (`SBM-Guest`) — portail captif, tracking, aussi restrictif mais différent
3. Possiblement DNS filtering (Cloudflare Zero Trust / Cisco Umbrella / Fortinet)

### Risques potentiels pour Apex + CMCteams

| Risque | Impact | Probabilité SBM |
|--------|--------|-----------------|
| **Blocage Firebase RTDB** (`*.firebasedatabase.app`) | Sync impossible → données stale | 🟡 Moyenne |
| **Blocage Anthropic API** (`api.anthropic.com`) | IA Apex HS complet | 🟠 Moyenne-Haute |
| **Blocage Cloudflare Workers** (`*.workers.dev`) | Proxy IA HS | 🟡 Moyenne |
| **Blocage GitHub Pages** (`*.github.io`) | App inchargeable | 🔴 Possible (certains corps bloquent) |
| **Blocage WebSocket/EventSource** (SSE Firebase) | Temps réel perdu, polling fallback | 🟡 Moyenne |
| **Inspection SSL (MITM corporate)** | Certificat Cloudflare intercepté → erreurs TLS | 🟠 Haute (banque/casino) |
| **Portail captif détection** | App coincée sur page auth SBM | 🟡 Sur Guest WiFi |
| **Rate limiting agressif** | Throttling API toutes les N requests | 🟡 Moyenne |

### Comment diagnostiquer (Kevin, depuis ton iPhone au casino)

1. Connecté au WiFi SBM-Staff → Safari ouvre : `https://api.anthropic.com/v1/messages`
   - 401 Unauthorized = **OK, pas bloqué** (c'est normal sans auth)
   - Connection timeout / Refused = **BLOQUÉ** ❌
2. Teste : `https://cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app/.json`
   - 200 + data = **OK**
   - Error ou timeout = **bloqué** ❌
3. Teste SSE : `https://cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app/.json?auth=NONE&print=pretty` en long-polling
4. Check SSL : si Safari montre "Connexion non sécurisée" ou certificat différent → **inspection SSL corporate** en cours

### Solutions à implémenter dans Apex (j'ajoute en v12.33)

#### Solution A — **Détection auto du mode réseau** (priorité 1)
```javascript
async function axDetectNetworkEnv() {
  const tests = [
    {name: "Anthropic", url: "https://api.anthropic.com/v1/messages", method: "OPTIONS"},
    {name: "Firebase", url: FB_URL+"/.json?shallow=true"},
    {name: "Cloudflare Worker", url: lg("ax_proxy_url","")},
  ];
  const results = [];
  for (const t of tests) {
    const start = Date.now();
    try {
      await fetch(t.url, {method: t.method || "GET", signal: AbortSignal.timeout(5000)});
      results.push({...t, ok: true, ms: Date.now()-start});
    } catch(e) {
      results.push({...t, ok: false, err: e.message});
    }
  }
  return results;
}
```
→ Si Anthropic bloqué mais Cloudflare Worker OK → **switch auto vers proxy**
→ Si Firebase bloqué → mode **100% offline** avec queue locale + sync plus tard

#### Solution B — **Proxy Cloudflare Worker avec domaines alternatifs**
- Tu déploies 3 Workers sur 3 domaines différents (ex: `apex-1.workers.dev`, `apex-2.workers.dev`, `apex-3.workers.dev`)
- Apex teste en cascade : primary → fallback 1 → fallback 2
- Tous relay vers Anthropic mais avec domaines différents → un blocage ne tue pas tout
- Configuration Kevin : coller les 3 URLs dans Settings → Apex gère le roulement

#### Solution C — **Mode dégradé "hors connectivité"**
Quand toutes les API externes sont bloquées :
- IA locale Gemma (déjà partiellement implémenté) → réponses basiques offline
- Chat local (pas de sync FB) → messages stockés, sync dès que WiFi revient
- Cache 7j des dernières réponses IA pour re-afficher

#### Solution D — **Détection portail captif SBM-Guest**
```javascript
async function axDetectCaptivePortal() {
  try {
    const r = await fetch("https://www.google.com/generate_204", 
      {mode: "no-cors", signal: AbortSignal.timeout(3000)});
    // Si 204 No Content = pas de portail, internet OK
    // Si redirection ou HTML = portail captif bloque
    return r.ok ? "ok" : "captive";
  } catch { return "offline"; }
}
```
Si captive détecté → toast "⚠️ WiFi Guest SBM — authentifie-toi d'abord"

#### Solution E — **Recommandation : partage cellular iPhone en secours**
Si WiFi SBM bloque trop → **Personal Hotspot iPhone** contourne tout (réseau 4G/5G neutre). Coût : ~0€ si Kevin a data illimitée.

### Actions concrètes pour Kevin (à faire au travail)

- [ ] **Tester depuis iPhone sur WiFi Staff** : Apex chat → envoie message → si tourne indéfiniment = bloqué
- [ ] **Tester sur WiFi Guest** : même test
- [ ] **Basculer en cellular 4G** : même test → si ça marche = confirme blocage WiFi
- [ ] Si blocage confirmé :
  - Option 1 : demander à l'IT SBM d'autoriser `*.anthropic.com` + `*.firebasedatabase.app` (fiche justif : "app perso RH")
  - Option 2 : utiliser uniquement cellular au travail
  - Option 3 : **Cloudflare Worker proxy** avec 3 domaines fallback (je te prépare le code dès v12.33)

---

## 🔒 Partie 3 — Sécurité réseau (recommandations)

### Depuis un WiFi corporate (SBM, banque, etc.)

| Règle | Pourquoi |
|-------|----------|
| ✅ TOUJOURS en HTTPS (Apex l'est) | Évite interception en clair |
| ❌ JAMAIS saisir ta clé API Anthropic sur un WiFi inconnu | Interception possible si MITM |
| ✅ Clé API stockée localement, jamais en URL | Protection contre proxy log |
| ✅ Utiliser un Worker Cloudflare avec ta propre API key côté serveur | La clé ne quitte jamais ton infra |
| ⚠️ Éviter infos sensibles dans le chat sur WiFi pro | Logs corporate possibles |

### Recommandation VPN personnel (optionnel)

Si tu veux être paranoiac sur WiFi SBM :
- **Mullvad** (5€/mois) ou **ProtonVPN** (4€/mois) → chiffre tout ton trafic
- Contourne DPI et bypass filtrage DNS
- Mais peut ralentir + ton employeur peut le détecter/interdire

---

## 📊 Matrice de décision "Quel réseau pour quoi"

| Action | Cellular 4G/5G | WiFi SBM Staff | WiFi SBM Guest | WiFi maison |
|--------|----------------|----------------|----------------|-------------|
| Chat IA Apex simple | ✅ OK | ⚠️ Test requis | ⚠️ Après auth | ✅ OK |
| Sync Firebase CMCteams | ✅ OK | ⚠️ Test | ⚠️ Test | ✅ OK |
| Image generation / Vision | ✅ OK (gros data) | ⚠️ Test | ❌ Éviter | ✅ OK |
| Biométrie PassKey | ✅ OK | ✅ OK | ✅ OK | ✅ OK |
| Domotique locale (HA) | ❌ Nope | ❌ Pas sur SBM | ❌ Pas sur SBM | ✅ OK |

---

## 🎯 Implémentation dans Apex v12.33

Checklist que j'ajoute :
- [ ] `axDetectNetworkEnv()` : teste 3 endpoints au boot → log résultats
- [ ] `axDetectCaptivePortal()` : check au démarrage + toast si captive
- [ ] Fallback multi-proxy (3 URLs Cloudflare) avec rotation auto
- [ ] Mode offline renforcé : cache réponses IA 7j + queue locale messages
- [ ] UI Settings : section "📡 État réseau" avec badges verts/rouges par service
- [ ] Recommandation contextuelle : "WiFi Staff bloque Anthropic, bascule en cellular"

---

**Dernière MAJ** : 2026-04-21 par Claude Code (réponse à question Kevin WiFi/Bluetooth/pare-feu)
