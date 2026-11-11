/* 🎙️ CATALOGUE COMMUN DES VOIX DU DOMAINE (Kevin 11.11.2026 : « Ajoute tout tant que rien n'est commercialisé… large choix gratuit et non
   commercialisable pour le moment. Quand ça le sera je te dirai et on changera. »)

   Une seule liste, lue par TOUTES les apps (sélecteur `tools/shared/voix-choix.js`) via `GET /__voix/catalogue`.
   Chaque voix porte sa licence ET un drapeau `commercial` : true (autorisé), false (interdit), null (à vérifier).
   Tant que `KDMC_COMMERCIALISE` n'est pas « 1 », tout est proposé. Le jour où Kevin dit « on commercialise », on pose
   KDMC_COMMERCIALISE=1 : le catalogue ne rend plus que les voix `commercial === true` (aucune autre modification).

   `etat` : actif (marche aujourd'hui dans le domaine) · a_brancher (licence et gratuité lues sur la fiche officielle, pas encore reliée)
   · a_ecouter (relié, qualité non jugée). Rien n'est annoncé « qualité pro » sans écoute : `qualite` reste vide jusqu'au choix de Kevin.
   Sources : fiches officielles Hugging Face lues le 11.11.2026 (licence + langues) — jamais de mémoire. */

const G = 'Gemini TTS (Google, gratuit avec quota)';
export const CATALOGUE = [
  /* ── Actifs aujourd'hui (routeur /__lingua/tts) ── */
  ...[['alloy', 'Kore', 'f'], ['nova', 'Aoede', 'f'], ['shimmer', 'Leda', 'f'], ['echo', 'Puck', 'h'], ['fable', 'Charon', 'h'], ['onyx', 'Orus', 'h']]
    .map(([v, nom, genre]) => ({ id: 'gemini-' + nom.toLowerCase(), nom, genre, langues: ['fr', 'en', 'multi'], moteur: 'gemini', mode: 'routeur', param: { v }, source: G, licence: 'Conditions Google (palier gratuit)', commercial: null, gratuit: true, etat: 'actif', note: 'quota court, refus possibles' })),
  { id: 'melotts-fr', nom: 'MeloTTS français', genre: 'f', langues: ['fr'], moteur: 'melotts', mode: 'routeur', licence: 'MIT', commercial: true, gratuit: true, etat: 'actif', note: 'robotique, secours' },
  { id: 'qwen3-clone', nom: 'Qwen3-TTS (clonage)', genre: '?', langues: ['fr', 'en', 'it', 'es', 'de', 'pt', 'ru', 'ja', 'ko', 'zh'], moteur: 'qwen', mode: 'espace-hf', licence: 'Apache-2.0', commercial: true, gratuit: true, etat: 'actif', note: 'Studio Voix : ta voix ou un échantillon' },
  { id: 'chatterbox-clone', nom: 'Chatterbox (clonage)', genre: '?', langues: ['fr', 'en', 'it', 'es', 'de', 'pt', 'ru', 'ja', 'ko', 'zh', 'ar'], moteur: 'chatterbox', mode: 'espace-hf', licence: 'MIT', commercial: true, gratuit: true, etat: 'actif', note: 'Studio Voix' },

  /* ── Les 12 voix de la branche Moulin à huile mobile (échantillons mp3 de Kevin) ── */
  ...['Agathe:f', 'Antonin:h', 'Camille:f', 'Célia:f', 'Clémence:f', 'Florent:h', 'Guillaume:h', 'Manon:f', 'Micha:h', 'Nico:h', 'Sophie:f', 'Thomas:h']
    .map((x) => { const [nom, genre] = x.split(':'); return { id: 'moulin-' + nom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''), nom, genre, langues: ['fr'], moteur: 'moulin', mode: 'echantillon', source: 'Branche Moulin à huile mobile', licence: 'à confirmer avec la branche Moulin', commercial: null, gratuit: true, etat: 'a_ecouter', echantillon: 'livrables/voix/moulin/' + nom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') + '.mp3' }; }),

  /* ── Piper (moteur MIT, dans le navigateur, hors ligne) ── */
  { id: 'piper-siwis', nom: 'Piper · Siwis', genre: 'f', langues: ['fr'], moteur: 'piper', mode: 'navigateur', licence: 'CC-BY 4.0', credit: 'SIWIS (Univ. Edimbourg)', commercial: true, gratuit: true, etat: 'a_ecouter', echantillon: 'livrables/voix/echantillons/piper-fr_FR-siwis-medium.mp3' },
  { id: 'piper-mls', nom: 'Piper · MLS', genre: 'h', langues: ['fr'], moteur: 'piper', mode: 'navigateur', licence: 'CC-BY 4.0', credit: 'Multilingual LibriSpeech', commercial: true, gratuit: true, etat: 'a_ecouter', echantillon: 'livrables/voix/echantillons/piper-fr_FR-mls-medium.mp3' },
  { id: 'piper-mls1840', nom: 'Piper · MLS 1840', genre: 'h', langues: ['fr'], moteur: 'piper', mode: 'navigateur', licence: 'CC-BY 4.0', credit: 'Multilingual LibriSpeech', commercial: true, gratuit: true, etat: 'a_ecouter', echantillon: 'livrables/voix/echantillons/piper-fr_FR-mls_1840-medium.mp3' },
  { id: 'piper-gilles', nom: 'Piper · Gilles', genre: 'h', langues: ['fr'], moteur: 'piper', mode: 'navigateur', licence: 'CC0', commercial: true, gratuit: true, etat: 'a_ecouter', echantillon: 'livrables/voix/echantillons/piper-fr_FR-gilles-low.mp3', note: 'qualité basse' },
  { id: 'piper-upmc', nom: 'Piper · UPMC', genre: '?', langues: ['fr'], moteur: 'piper', mode: 'navigateur', licence: 'CC-BY-SA 4.0', credit: 'UPMC', commercial: false, gratuit: true, etat: 'a_ecouter', echantillon: 'livrables/voix/echantillons/piper-fr_FR-upmc-medium.mp3', note: 'partage à l\'identique : exclue du commerce' },
  { id: 'piper-tom', nom: 'Piper · Tom', genre: 'h', langues: ['fr'], moteur: 'piper', mode: 'navigateur', licence: 'AGPL-3.0', commercial: false, gratuit: true, etat: 'a_ecouter', echantillon: 'livrables/voix/echantillons/piper-fr_FR-tom-medium.mp3', note: 'AGPL : exclue du commerce' },

  /* ── Modèles ouverts à brancher (fiches Hugging Face lues le 11.11.2026) ── */
  { id: 'kokoro-ff-siwis', nom: 'Kokoro · ff_siwis', genre: 'f', langues: ['fr'], moteur: 'kokoro', mode: 'navigateur', source: 'hexgrad/Kokoro-82M', licence: 'Apache-2.0', commercial: true, gratuit: true, etat: 'a_ecouter', echantillon: 'livrables/voix/echantillons/kokoro-ff_siwis.mp3', note: 'kokoro-js n\'embarque que l\'anglais : voix française à charger à part' },
  ...['F1:f', 'F2:f', 'F3:f', 'F4:f', 'F5:f', 'M1:h', 'M2:h', 'M3:h', 'M4:h', 'M5:h'].map((x) => { const [n, g] = x.split(':'); return { id: 'supertonic-' + n.toLowerCase(), nom: 'Supertonic · ' + (g === 'f' ? 'Femme ' : 'Homme ') + n[1], genre: g, langues: ['fr', 'en', 'multi31'], moteur: 'supertonic', mode: 'navigateur', param: { voix: n }, source: 'Supertone/supertonic-3', licence: 'OpenRAIL', commercial: true, gratuit: true, etat: 'a_ecouter', echantillon: 'livrables/voix/echantillons/supertonic-' + n + '.mp3', note: 'ONNX sur l\'appareil ; usages interdits listés dans la licence' }; }),
  { id: 'kyutai-pocket', nom: 'Kyutai Pocket-TTS', genre: '?', langues: ['fr', 'en'], moteur: 'kyutai', mode: 'espace-hf', source: 'kyutai/pocket-tts', licence: 'CC-BY 4.0', credit: 'Kyutai', commercial: true, gratuit: true, etat: 'a_brancher', note: '228 voix données (CC0) à lister' },
  { id: 'kyutai-1.6b', nom: 'Kyutai TTS 1.6B', genre: '?', langues: ['fr', 'en'], moteur: 'kyutai', mode: 'espace-hf', source: 'kyutai/tts-1.6b-en_fr', licence: 'CC-BY 4.0', credit: 'Kyutai', commercial: true, gratuit: true, etat: 'a_brancher' },
  { id: 'voxcpm2', nom: 'VoxCPM2', genre: '?', langues: ['fr', 'multi30'], moteur: 'voxcpm', mode: 'espace-hf', source: 'openbmb/VoxCPM2', licence: 'Apache-2.0', commercial: true, gratuit: true, etat: 'a_brancher' },
  { id: 'ming-tts', nom: 'Ming-3.0 TTS', genre: '?', langues: ['fr', 'en', 'de', 'es', 'ko', 'ja', 'zh'], moteur: 'ming', mode: 'espace-hf', source: 'inclusionAI/Ming-3.0-tts-0.5B', licence: 'MIT', commercial: true, gratuit: true, etat: 'a_brancher' },
  { id: 'zonos3-mini', nom: 'Zonos 3 Mini', genre: '?', langues: ['fr', 'en', 'de', 'es', 'it', 'pt', 'nl', 'pl', 'ru'], moteur: 'zonos', mode: 'espace-hf', source: 'Zyphra/ZONOS3-Mini', licence: 'Apache-2.0', commercial: true, gratuit: true, etat: 'a_brancher' },
  { id: 'orpheus-fr', nom: 'Orpheus français', genre: '?', langues: ['fr'], moteur: 'orpheus', mode: 'espace-hf', source: 'canopylabs/3b-fr-ft-research_release', licence: 'Apache-2.0', commercial: true, gratuit: true, etat: 'a_brancher', note: 'version « recherche »' },

  /* ── Gratuits MAIS non commerciaux : proposés tant que rien n'est vendu (Kevin 11.11), retirés dès « on commercialise » ── */
  { id: 'voxtral-tts', nom: 'Voxtral TTS (Mistral)', genre: '?', langues: ['fr', 'en', 'es', 'pt', 'it', 'nl', 'de', 'ar', 'hi'], moteur: 'voxtral', mode: 'espace-hf', source: 'mistralai/Voxtral-4B-TTS-2603', licence: 'CC-BY-NC 4.0', commercial: false, gratuit: true, etat: 'a_brancher' },
  { id: 'mms-fra', nom: 'MMS français (Meta)', genre: '?', langues: ['fr'], moteur: 'mms', mode: 'navigateur', source: 'facebook/mms-tts-fra', licence: 'CC-BY-NC 4.0', commercial: false, gratuit: true, etat: 'a_brancher', note: 'robotique' },
  { id: 'xtts-v2', nom: 'XTTS-v2 (Coqui)', genre: '?', langues: ['fr', 'en', 'multi17'], moteur: 'xtts', mode: 'espace-hf', source: 'coqui/XTTS-v2', licence: 'CPML (non commercial)', commercial: false, gratuit: true, etat: 'a_brancher', note: 'clonage 17 langues' },
  { id: 'elevenlabs-free', nom: 'ElevenLabs (plan gratuit)', genre: '?', langues: ['fr', 'multi'], moteur: 'elevenlabs', mode: 'api', source: 'ElevenLabs Free', licence: 'Plan gratuit : pas d\'usage commercial, mention obligatoire', credit: 'ElevenLabs', commercial: false, gratuit: true, etat: 'a_brancher', note: '~10 000 caractères/mois ; clé à poser par le Lenovo (règle clés)' },
];

/* Le catalogue vu par une app. commercialise = KDMC_COMMERCIALISE === '1' : on ne garde alors que les voix explicitement autorisées. */
export function catalogue(env, filtres) {
  const commercialise = !!env && String(env.KDMC_COMMERCIALISE) === '1';
  const f = filtres || {};
  let liste = CATALOGUE.filter((v) => !commercialise || v.commercial === true);
  if (f.langue) liste = liste.filter((v) => v.langues.indexOf(f.langue) >= 0 || v.langues.some((l) => /^multi/.test(l)));
  if (f.genre) liste = liste.filter((v) => v.genre === f.genre);
  if (f.etat) liste = liste.filter((v) => v.etat === f.etat);
  return { commercialise, total: liste.length, voix: liste };
}
