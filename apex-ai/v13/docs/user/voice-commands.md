# Commandes vocales Apex

Apex est conçu pour fonctionner **mains libres** : wake word + dictée + reconnaissance utilisateur.

## Wake word "Dis Apex"

Active la commande vocale depuis n'importe où dans l'app.

### Configuration
1. **Réglages → Voix → Wake word**
2. Active **"Dis Apex actif"**
3. Apex écoute en permanence (anonyme, traitement local)

### Utilisation
- Dis : **"Dis Apex, [ta demande]"**
- Apex répond et exécute

### Confidentialité
- Le wake word est détecté **localement** (Web Speech API native)
- Aucun audio n'est envoyé à un serveur tant que "Dis Apex" n'est pas détecté
- Tu peux désactiver à tout moment

## Reconnaissance vocale (voiceprint)

Apex te reconnaît à ta voix (utile multi-utilisateur).

### Enrôlement (1ère fois)
1. **Réglages → Voix → Enrôler ma voix**
2. Dis 3 fois : *"Apex, tu reconnais ma voix maintenant"*
3. Apex extrait tes features (MFCC + chroma)
4. Stocké strictement local (jamais Firebase)

### Reconnaissance
- Quand tu dis "Dis Apex", Apex compare ta voix aux profils enrôlés
- Confidence ≥ 75% → t'identifie
- Sinon → "Voix non reconnue, veux-tu enrôler ?"

### Multi-utilisateur
- Plusieurs personnes peuvent enrôler leurs voix sur le même device
- Apex active le contexte de la personne reconnue
- Kevin admin reconnu → mode admin actif même dans vue d'un autre user

## Dictée vocale (alternative au clavier)

Au lieu de taper, parle :
1. Touche le bouton **🎙 micro** dans n'importe quel champ
2. Parle clairement
3. Texte transcrit en temps réel

### Auto-correction
- "ai zay sy x y z 1 2 3" → "AIzaSyXYZ123"
- "arobase" → @
- "point" → .
- "tiret" → -
- "underscore" → _

### Langues supportées
- Français (par défaut)
- English
- Italiano
- Español
- Deutsch
- Auto-détection

## Lecture à voix haute (TTS)

Apex peut lire ses réponses à voix haute.

### Configuration
- **Réglages → Voix → Lecture auto**
- Choisis ta voix préférée parmi 50+ voix
- Ajuste vitesse, pitch

### Voix disponibles

#### Voix PRO (10+)
- Web Speech native (système)
- Google WaveNet FR/EN
- Azure Neural
- ElevenLabs Pro (option Premium)

#### Voix FUN (20+)
- Helium (chipmunk)
- Robot
- Echo
- Slow
- Whisper
- Drunk
- Cartoon
- Old Man
- Megaphone
- Underwater
- Phone
- ...

#### Voix Thématiques (16+)
- 🤖 Robot
- 👴 Vieux
- 👶 Bébé
- 👻 Fantôme
- 🦸 Super-héros
- 🧙 Sorcier
- 🐱 Chat
- 🐉 Dragon
- 🤡 Clown
- 🎤 Chanteur
- 📺 Présentateur JT
- ⚽ Commentateur sport
- 😴 Endormi
- 🎉 Hyper-content
- 😢 Triste
- 😡 Colère

### Auto-switch contextuel
- Article scientifique → voix PRO neutre
- Blague → voix FUN cartoon
- Annonce urgente → voix présentateur
- Méditation → voix calme reverb
- Halloween → voix fantôme
- Noël → voix Père Noël

### Mode "Surprise"
Bouton 🎲 → tire au sort une voix.

## Commandes vocales courantes

| Tu dis | Apex fait |
|--------|----------|
| "Mixe une musique pour ce soir" | Ouvre Studio Music |
| "Va sur YouTube" | Ouvre navigateur intégré sur YouTube |
| "Cherche meteo Monaco" | Affiche météo 7j |
| "Calcule mon impôt 2026" | Ouvre Finance Pro |
| "Recette poulet curry pour 4" | Ouvre Cuisine Pro avec préset |
| "Traduis en italien : bonjour" | Traduit + lit à voix haute |
| "Note : appeler Jean demain" | Crée une note avec rappel |
| "Quel jour est mon prochain RDV ?" | Lit ton calendrier |
| "Envoie un message à Laurence" | Ouvre chat avec Laurence |
| "Photo et envoie à Marc" | Active caméra + partage |

## Mode admin (Kevin uniquement)

Si Apex te reconnaît comme Kevin admin (voiceprint), tu peux :
- "Change la vue" (impersonation)
- "Modifie le profil de Laurence"
- "Active la sentinelle X"
- "Désactive l'IA pour aujourd'hui"

Audit log immutable trace toutes les actions admin vocales.

## Anti-bruit

- Filtrage bruit ambiant (RNNoise WebAssembly)
- Adaptation environnement (calme/bruyant auto)
- Détection écho (pas auto-trigger sur lecture TTS Apex)

## Limites

- Précision ~90% en environnement calme
- Bruit ambiant fort → précision baisse
- Voix similaires (jumeaux) → faux positifs possibles
- Pour sécurité critique → FaceID/TouchID + voiceprint en 2FA

## Désactivation

À tout moment : **Réglages → Voix → Tout désactiver**.

---

*Suite : [Validation WhatsApp OTP](whatsapp-otp.md)*
