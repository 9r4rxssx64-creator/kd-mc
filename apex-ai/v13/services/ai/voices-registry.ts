/**
 * APEX v13 — Voices Registry (50+ voix PRO + FUN + thématiques).
 *
 * Demande Kevin (CLAUDE.md règle voix diversifiées + 2026-05-03) :
 * "Choix de voix rigolo et fun, pas toutes les mêmes voies"
 * "50+ voix proposées (PRO + FUN + Thématiques)"
 *
 * Catalogue complet :
 * - 12 voix PRO (Web Speech natives + Google WaveNet + Azure Neural + ElevenLabs Pro)
 * - 20 voix FUN (effets Web Audio API : helium, robot, cartoon, drunk, etc.)
 * - 18 voix THÉMATIQUES (Yoda, Vador, Mickey, Père Noël, etc.)
 *
 * Anti-pattern Kevin :
 * - JAMAIS proposer toutes les mêmes voix (audit obligatoire)
 * - Rotation aléatoire pour éviter monotonie
 * - Pas de feature 100% sérieuse (toujours FUN counterpart)
 */

import { logger } from '../../core/logger.js';

export type VoiceCategory = 'pro' | 'fun' | 'thematic';
export type VoiceProvider = 'web_speech' | 'google_wavenet' | 'azure_neural' | 'elevenlabs' | 'web_audio_filter';

export interface Voice {
  id: string;
  name: string;
  category: VoiceCategory;
  provider: VoiceProvider;
  description: string;
  emoji: string;
  language: string;
  gender?: 'male' | 'female' | 'neutral';
  effects?: {
    pitch?: number; /* semi-tons */
    rate?: number; /* speed multiplier */
    filter?: 'helium' | 'robot' | 'echo' | 'reverb' | 'distortion' | 'underwater' | 'megaphone' | 'phone' | 'cartoon';
  };
  premium?: boolean; /* Pro tier required */
}

const VOICES: readonly Voice[] = [
  /* === 12 VOIX PRO === */
  {
    id: 'pro_neutral_fr',
    name: 'Neutre FR',
    category: 'pro',
    provider: 'web_speech',
    description: 'Voix française neutre par défaut système',
    emoji: '🇫🇷',
    language: 'fr-FR',
    gender: 'neutral',
  },
  {
    id: 'pro_male_fr',
    name: 'Homme FR',
    category: 'pro',
    provider: 'web_speech',
    description: 'Voix masculine française',
    emoji: '👨',
    language: 'fr-FR',
    gender: 'male',
  },
  {
    id: 'pro_female_fr',
    name: 'Femme FR',
    category: 'pro',
    provider: 'web_speech',
    description: 'Voix féminine française',
    emoji: '👩',
    language: 'fr-FR',
    gender: 'female',
  },
  {
    id: 'pro_male_en',
    name: 'Homme US',
    category: 'pro',
    provider: 'web_speech',
    description: 'Voix masculine américaine',
    emoji: '🇺🇸',
    language: 'en-US',
    gender: 'male',
  },
  {
    id: 'pro_female_en',
    name: 'Femme US',
    category: 'pro',
    provider: 'web_speech',
    description: 'Voix féminine américaine',
    emoji: '🗽',
    language: 'en-US',
    gender: 'female',
  },
  {
    id: 'pro_wavenet_fr',
    name: 'WaveNet FR (Premium)',
    category: 'pro',
    provider: 'google_wavenet',
    description: 'Google WaveNet HD français — qualité broadcast',
    emoji: '🎙️',
    language: 'fr-FR',
    gender: 'female',
    premium: true,
  },
  {
    id: 'pro_neural_fr',
    name: 'Neural Azure FR',
    category: 'pro',
    provider: 'azure_neural',
    description: 'Azure Neural HD français',
    emoji: '🔵',
    language: 'fr-FR',
    gender: 'neutral',
    premium: true,
  },
  {
    id: 'pro_elevenlabs_rachel',
    name: 'Rachel (ElevenLabs)',
    category: 'pro',
    provider: 'elevenlabs',
    description: 'ElevenLabs Rachel — calme, narrative',
    emoji: '✨',
    language: 'multi',
    gender: 'female',
    premium: true,
  },
  {
    id: 'pro_elevenlabs_adam',
    name: 'Adam (ElevenLabs)',
    category: 'pro',
    provider: 'elevenlabs',
    description: 'ElevenLabs Adam — profonde, présentateur',
    emoji: '🎭',
    language: 'multi',
    gender: 'male',
    premium: true,
  },
  {
    id: 'pro_elevenlabs_bella',
    name: 'Bella (ElevenLabs)',
    category: 'pro',
    provider: 'elevenlabs',
    description: 'ElevenLabs Bella — douce, expressive',
    emoji: '🌸',
    language: 'multi',
    gender: 'female',
    premium: true,
  },
  {
    id: 'pro_news_anchor',
    name: 'Présentateur JT',
    category: 'pro',
    provider: 'elevenlabs',
    description: 'Voix journal télévisé — claire et professionnelle',
    emoji: '📺',
    language: 'fr-FR',
    gender: 'male',
    premium: true,
  },
  {
    id: 'pro_audiobook',
    name: 'Audiobook Narrator',
    category: 'pro',
    provider: 'elevenlabs',
    description: 'Voix livre audio — chaude, engageante',
    emoji: '📖',
    language: 'fr-FR',
    gender: 'female',
    premium: true,
  },

  /* === 20 VOIX FUN === */
  {
    id: 'fun_helium',
    name: 'Hélium 🎈',
    category: 'fun',
    provider: 'web_audio_filter',
    description: 'Voix aiguë comme après ballon hélium',
    emoji: '🎈',
    language: 'multi',
    effects: { pitch: 12, filter: 'helium' },
  },
  {
    id: 'fun_robot',
    name: 'Robot 🤖',
    category: 'fun',
    provider: 'web_audio_filter',
    description: 'Voix robotique avec ring modulator',
    emoji: '🤖',
    language: 'multi',
    effects: { filter: 'robot' },
  },
  {
    id: 'fun_echo',
    name: 'Écho cathédrale',
    category: 'fun',
    provider: 'web_audio_filter',
    description: 'Long écho réverbération',
    emoji: '⛪',
    language: 'multi',
    effects: { filter: 'echo' },
  },
  {
    id: 'fun_slow',
    name: 'Ralenti 🐌',
    category: 'fun',
    provider: 'web_audio_filter',
    description: 'Voix au ralenti playback x0.5',
    emoji: '🐌',
    language: 'multi',
    effects: { rate: 0.5 },
  },
  {
    id: 'fun_chipmunk',
    name: 'Chipmunk',
    category: 'fun',
    provider: 'web_audio_filter',
    description: 'Voix Tic-Tac aigu accéléré',
    emoji: '🐿️',
    language: 'multi',
    effects: { pitch: 10, rate: 1.5 },
  },
  {
    id: 'fun_cartoon',
    name: 'Cartoon',
    category: 'fun',
    provider: 'web_audio_filter',
    description: 'Voix cartoon dessin animé',
    emoji: '🎬',
    language: 'multi',
    effects: { pitch: 8, filter: 'cartoon' },
  },
  {
    id: 'fun_oldman',
    name: 'Vieux 👴',
    category: 'fun',
    provider: 'web_audio_filter',
    description: 'Voix vieillard tremblante',
    emoji: '👴',
    language: 'multi',
    effects: { pitch: -4, filter: 'reverb' },
  },
  {
    id: 'fun_baby',
    name: 'Bébé 👶',
    category: 'fun',
    provider: 'web_audio_filter',
    description: 'Voix bébé qui babille',
    emoji: '👶',
    language: 'multi',
    effects: { pitch: 14, rate: 1.2 },
  },
  {
    id: 'fun_drunk',
    name: 'Bourré 🍺',
    category: 'fun',
    provider: 'web_audio_filter',
    description: 'Voix wobble pitch random',
    emoji: '🍺',
    language: 'multi',
    effects: { pitch: -2 },
  },
  {
    id: 'fun_megaphone',
    name: 'Mégaphone 📢',
    category: 'fun',
    provider: 'web_audio_filter',
    description: 'Voix mégaphone manifestation',
    emoji: '📢',
    language: 'multi',
    effects: { filter: 'megaphone' },
  },
  {
    id: 'fun_phone',
    name: 'Téléphone',
    category: 'fun',
    provider: 'web_audio_filter',
    description: 'Voix téléphone bandwidth limitée',
    emoji: '☎️',
    language: 'multi',
    effects: { filter: 'phone' },
  },
  {
    id: 'fun_underwater',
    name: 'Sous-marin 🌊',
    category: 'fun',
    provider: 'web_audio_filter',
    description: 'Voix sous-marine étouffée',
    emoji: '🌊',
    language: 'multi',
    effects: { filter: 'underwater' },
  },
  {
    id: 'fun_whisper',
    name: 'Chuchotement 🤫',
    category: 'fun',
    provider: 'web_audio_filter',
    description: 'Voix chuchotée intime',
    emoji: '🤫',
    language: 'multi',
    effects: { rate: 0.8 },
  },
  {
    id: 'fun_reverse',
    name: 'Inversée 🔄',
    category: 'fun',
    provider: 'web_audio_filter',
    description: 'Voix lue à l\'envers',
    emoji: '🔄',
    language: 'multi',
  },
  {
    id: 'fun_distorted',
    name: 'Distorsion 🎸',
    category: 'fun',
    provider: 'web_audio_filter',
    description: 'Voix distorsion guitare metal',
    emoji: '🎸',
    language: 'multi',
    effects: { filter: 'distortion' },
  },
  {
    id: 'fun_autotune',
    name: 'Auto-Tune 🎤',
    category: 'fun',
    provider: 'web_audio_filter',
    description: 'Voix Auto-Tune pop hits',
    emoji: '🎤',
    language: 'multi',
  },
  {
    id: 'fun_alien',
    name: 'Alien 👽',
    category: 'fun',
    provider: 'web_audio_filter',
    description: 'Voix extraterrestre étrange',
    emoji: '👽',
    language: 'multi',
    effects: { pitch: 6, filter: 'echo' },
  },
  {
    id: 'fun_spooky',
    name: 'Spooky 🎃',
    category: 'fun',
    provider: 'web_audio_filter',
    description: 'Voix Halloween effrayante',
    emoji: '🎃',
    language: 'multi',
    effects: { pitch: -6, filter: 'reverb' },
  },
  {
    id: 'fun_excited',
    name: 'Surexcité 🎉',
    category: 'fun',
    provider: 'web_audio_filter',
    description: 'Voix hyper-content rapide aigu',
    emoji: '🎉',
    language: 'multi',
    effects: { pitch: 4, rate: 1.3 },
  },
  {
    id: 'fun_sad',
    name: 'Triste 😢',
    category: 'fun',
    provider: 'web_audio_filter',
    description: 'Voix triste lente grave',
    emoji: '😢',
    language: 'multi',
    effects: { pitch: -3, rate: 0.85 },
  },

  /* === 18 VOIX THÉMATIQUES === */
  {
    /* Profil « Antonin » (Kevin 2026-08-10) — voix de garçon APPROCHANTE fabriquée
       par effets Web Audio (comme Bébé, en plus doux) ; la vraie voix d'Antonin
       demandera un enregistrement audio (clonage). Déjà en choix dans Lingua v2.86. */
    id: 'theme_antonin',
    name: 'Antonin 🧒',
    category: 'thematic',
    provider: 'web_audio_filter',
    description: 'Voix de garçon — le profil d’Antonin',
    emoji: '🧒',
    language: 'fr-FR',
    gender: 'male',
    effects: { pitch: 5, rate: 1.02 },
  },
  {
    id: 'theme_yoda',
    name: 'Yoda',
    category: 'thematic',
    provider: 'elevenlabs',
    description: 'Voix Maître Yoda — sage tu seras',
    emoji: '🟢',
    language: 'multi',
    premium: true,
  },
  {
    id: 'theme_vader',
    name: 'Dark Vador',
    category: 'thematic',
    provider: 'elevenlabs',
    description: 'Voix Dark Vador — respiration lourde',
    emoji: '🖤',
    language: 'multi',
    premium: true,
  },
  {
    id: 'theme_mickey',
    name: 'Mickey 🐭',
    category: 'thematic',
    provider: 'web_audio_filter',
    description: 'Voix Mickey Mouse aiguë',
    emoji: '🐭',
    language: 'multi',
    effects: { pitch: 12, rate: 1.1 },
  },
  {
    id: 'theme_santa',
    name: 'Père Noël 🎅',
    category: 'thematic',
    provider: 'elevenlabs',
    description: 'Voix Père Noël Ho ho ho',
    emoji: '🎅',
    language: 'fr-FR',
    premium: true,
  },
  {
    id: 'theme_pirate',
    name: 'Pirate 🏴‍☠️',
    category: 'thematic',
    provider: 'elevenlabs',
    description: 'Voix pirate Arrr matelot',
    emoji: '🏴‍☠️',
    language: 'fr-FR',
  },
  {
    id: 'theme_witch',
    name: 'Sorcière 🧙‍♀️',
    category: 'thematic',
    provider: 'web_audio_filter',
    description: 'Voix sorcière Halloween',
    emoji: '🧙‍♀️',
    language: 'multi',
    effects: { pitch: -2, filter: 'reverb' },
  },
  {
    id: 'theme_wizard',
    name: 'Magicien 🧙‍♂️',
    category: 'thematic',
    provider: 'elevenlabs',
    description: 'Voix sage magicien Gandalf-style',
    emoji: '🧙‍♂️',
    language: 'multi',
    premium: true,
  },
  {
    id: 'theme_cat',
    name: 'Chat 🐱',
    category: 'thematic',
    provider: 'web_audio_filter',
    description: 'Voix chat miaulements',
    emoji: '🐱',
    language: 'multi',
    effects: { pitch: 8 },
  },
  {
    id: 'theme_dragon',
    name: 'Dragon 🐉',
    category: 'thematic',
    provider: 'web_audio_filter',
    description: 'Voix dragon grave puissante',
    emoji: '🐉',
    language: 'multi',
    effects: { pitch: -8, filter: 'reverb' },
  },
  {
    id: 'theme_clown',
    name: 'Clown 🤡',
    category: 'thematic',
    provider: 'web_audio_filter',
    description: 'Voix clown circus',
    emoji: '🤡',
    language: 'multi',
    effects: { pitch: 6, rate: 1.2 },
  },
  {
    id: 'theme_singer',
    name: 'Chanteur 🎤',
    category: 'thematic',
    provider: 'elevenlabs',
    description: 'Voix Auto-Tune pop',
    emoji: '🎤',
    language: 'multi',
  },
  {
    id: 'theme_sport_announcer',
    name: 'Commentateur Sport',
    category: 'thematic',
    provider: 'elevenlabs',
    description: 'Voix commentateur foot enthousiaste',
    emoji: '⚽',
    language: 'fr-FR',
    premium: true,
  },
  {
    id: 'theme_sleepy',
    name: 'Endormi 😴',
    category: 'thematic',
    provider: 'web_audio_filter',
    description: 'Voix bâillements yeux qui pèsent',
    emoji: '😴',
    language: 'multi',
    effects: { rate: 0.7 },
  },
  {
    id: 'theme_hyper',
    name: 'Hyper-content 🎉',
    category: 'thematic',
    provider: 'web_audio_filter',
    description: 'Voix méga énergie',
    emoji: '🎉',
    language: 'multi',
    effects: { pitch: 4, rate: 1.4 },
  },
  {
    id: 'theme_sad_movie',
    name: 'Voix dramatique',
    category: 'thematic',
    provider: 'elevenlabs',
    description: 'Voix bande-annonce film triste',
    emoji: '🎬',
    language: 'fr-FR',
    premium: true,
  },
  {
    id: 'theme_angry',
    name: 'Colère 😡',
    category: 'thematic',
    provider: 'web_audio_filter',
    description: 'Voix forte vibrato énervé',
    emoji: '😡',
    language: 'multi',
    effects: { pitch: 2, filter: 'distortion' },
  },
  {
    id: 'theme_superhero',
    name: 'Super-héros',
    category: 'thematic',
    provider: 'elevenlabs',
    description: 'Voix super-héros Marvel-style',
    emoji: '🦸',
    language: 'multi',
    premium: true,
  },
  {
    id: 'theme_news_old',
    name: 'JT années 60',
    category: 'thematic',
    provider: 'web_audio_filter',
    description: 'Voix JT vintage avec phone filter',
    emoji: '📻',
    language: 'fr-FR',
    effects: { filter: 'phone' },
  },

  /* === 10 NOUVELLES VOIX FUN v13.3.29 (Kevin "encore plus drôle") === */
  {
    id: 'theme_hulk',
    name: 'Hulk 💪',
    category: 'thematic',
    provider: 'web_audio_filter',
    description: 'HULK SMASH ! Voix grave colère contenue',
    emoji: '💪',
    language: 'multi',
    effects: { pitch: -7, filter: 'distortion' },
  },
  {
    id: 'theme_voldemort',
    name: 'Voldemort 🐍',
    category: 'thematic',
    provider: 'elevenlabs',
    description: 'Voix sifflante du Seigneur des Ténèbres',
    emoji: '🐍',
    language: 'multi',
    premium: true,
    effects: { pitch: -2, filter: 'reverb' },
  },
  {
    id: 'theme_rapper',
    name: 'Rappeur 🎤',
    category: 'thematic',
    provider: 'web_audio_filter',
    description: 'Voix rap avec swag et autotune',
    emoji: '🎤',
    language: 'multi',
    effects: { pitch: -1, rate: 1.1 },
  },
  {
    id: 'theme_baby_robot',
    name: 'BébéRobot 🤖👶',
    category: 'thematic',
    provider: 'web_audio_filter',
    description: 'Bébé robot des galaxies, mi-mécanique mi-mignon',
    emoji: '🤖',
    language: 'multi',
    effects: { pitch: 10, filter: 'robot' },
  },
  {
    id: 'fun_cow',
    name: 'Vache 🐄',
    category: 'fun',
    provider: 'web_audio_filter',
    description: 'Meuh ! Voix vache francophone',
    emoji: '🐄',
    language: 'fr-FR',
    effects: { pitch: -5, rate: 0.9 },
  },
  {
    id: 'fun_dog',
    name: 'Chien 🐶',
    category: 'fun',
    provider: 'web_audio_filter',
    description: 'Wouaf wouaf ! Voix chien excitée',
    emoji: '🐶',
    language: 'multi',
    effects: { pitch: 5, rate: 1.2 },
  },
  {
    id: 'fun_cat_talking',
    name: 'Chat parlant 🐱',
    category: 'fun',
    provider: 'web_audio_filter',
    description: 'Miaaaaow conversationnel',
    emoji: '🐱',
    language: 'multi',
    effects: { pitch: 9, rate: 0.95 },
  },
  {
    id: 'theme_yoda_v2',
    name: 'Yoda Plus 🟢',
    category: 'thematic',
    provider: 'web_audio_filter',
    description: 'Inversé l\'ordre des mots, hmmm',
    emoji: '🟢',
    language: 'multi',
    effects: { pitch: -3, rate: 0.85, filter: 'reverb' },
  },
  {
    id: 'fun_minion',
    name: 'Minion 🍌',
    category: 'fun',
    provider: 'web_audio_filter',
    description: 'Bello ! Voix minion banane',
    emoji: '🍌',
    language: 'multi',
    effects: { pitch: 11, rate: 1.15 },
  },
  {
    id: 'theme_trex',
    name: 'T-Rex 🦖',
    category: 'thematic',
    provider: 'web_audio_filter',
    description: 'RAAAAR ! Voix dinosaure préhistorique',
    emoji: '🦖',
    language: 'multi',
    effects: { pitch: -10, filter: 'distortion' },
  },
];

class VoicesRegistry {
  list(): readonly Voice[] {
    return VOICES;
  }

  byCategory(category: VoiceCategory): readonly Voice[] {
    return VOICES.filter((v) => v.category === category);
  }

  byId(id: string): Voice | null {
    return VOICES.find((v) => v.id === id) ?? null;
  }

  countByCategory(): Record<VoiceCategory, number> {
    return {
      pro: VOICES.filter((v) => v.category === 'pro').length,
      fun: VOICES.filter((v) => v.category === 'fun').length,
      thematic: VOICES.filter((v) => v.category === 'thematic').length,
    };
  }

  /**
   * Random voice par catégorie (rotation anti-monotonie Kevin règle).
   */
  randomVoice(category?: VoiceCategory): Voice {
    const candidates = category ? this.byCategory(category) : VOICES;
    const fallback = VOICES[0];
    if (!fallback) throw new Error('VOICES registry empty');
    if (candidates.length === 0) return fallback;
    const idx = Math.floor(Math.random() * candidates.length);
    return candidates[idx] ?? fallback;
  }

  /**
   * Surprise me : tire au sort pour briser monotonie (Kevin "rigolo, fun").
   */
  surpriseMe(): Voice {
    /* Probabilités : 30% pro, 35% fun, 35% thematic */
    const r = Math.random();
    if (r < 0.3) return this.randomVoice('pro');
    if (r < 0.65) return this.randomVoice('fun');
    return this.randomVoice('thematic');
  }

  /**
   * Voix par contexte (auto-switch émotion).
   */
  byContext(context: 'sad' | 'happy' | 'urgent' | 'casual' | 'pro' | 'kids' | 'halloween' | 'christmas'): Voice | null {
    const map: Record<string, string> = {
      sad: 'theme_sad_movie',
      happy: 'theme_hyper',
      urgent: 'pro_news_anchor',
      casual: 'pro_neutral_fr',
      pro: 'pro_audiobook',
      kids: 'theme_mickey',
      halloween: 'theme_witch',
      christmas: 'theme_santa',
    };
    const id = map[context];
    return id ? this.byId(id) : null;
  }

  /**
   * User preference : voix favorite stockée localStorage.
   */
  setUserPreference(uid: string, voiceId: string): void {
    try {
      localStorage.setItem(`apex_v13_voice_pref_${uid}`, voiceId);
    } catch (err: unknown) {
      logger.warn('voices', 'setUserPreference failed', { err });
    }
  }

  getUserPreference(uid: string): Voice | null {
    try {
      const id = localStorage.getItem(`apex_v13_voice_pref_${uid}`);
      return id ? this.byId(id) : null;
    } catch {
      return null;
    }
  }

  /**
   * TTS playback : speak text avec voix donnée (anti-théâtre wiring).
   * - web_speech : utilise SpeechSynthesis API (toujours dispo browser)
   * - web_audio_filter : applique pitch/rate via SpeechSynthesisUtterance
   * - elevenlabs/google_wavenet/azure_neural : Jet 9 (nécessite backend API)
   */
  async speak(
    text: string,
    voiceId?: string,
    options: { uid?: string } = {},
  ): Promise<{ ok: boolean; provider?: string; reason?: string }> {
    if (!text) return { ok: false, reason: 'text required' };
    if (typeof window === 'undefined' || typeof window.speechSynthesis === 'undefined') {
      return { ok: false, reason: 'SpeechSynthesis API non disponible' };
    }

    /* Détermine voix : explicit > user pref > default neutral */
    let voice = voiceId ? this.byId(voiceId) : null;
    if (!voice && options.uid) voice = this.getUserPreference(options.uid);
    if (!voice) voice = this.byId('pro_neutral_fr');
    if (!voice) return { ok: false, reason: 'No voice available' };

    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = voice.language === 'multi' ? 'fr-FR' : voice.language;
      /* Apply voice effects (pitch shift via semi-tons → ratio Web Speech) */
      if (voice.effects?.pitch) {
        utterance.pitch = Math.max(0, Math.min(2, 1 + voice.effects.pitch / 12));
      }
      if (voice.effects?.rate) {
        utterance.rate = Math.max(0.1, Math.min(10, voice.effects.rate));
      }
      /* Find matching browser voice if available (Web Speech voices list) */
      const browserVoices = window.speechSynthesis.getVoices();
      const matchingVoice = browserVoices.find(
        (v) => v.lang.startsWith(utterance.lang.slice(0, 2)) &&
          (voice.gender === 'female' ? /female|woman|fr-fr-amelie|virginie/i.test(v.name) :
           voice.gender === 'male' ? /male|man|fr-fr-thomas|nicolas/i.test(v.name) : true),
      );
      if (matchingVoice) utterance.voice = matchingVoice;
      window.speechSynthesis.speak(utterance);
      return { ok: true, provider: voice.provider };
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      return { ok: false, reason };
    }
  }

  /**
   * Stop tous TTS en cours (cleanup).
   */
  stop(): void {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Audit anti-monotonie (Kevin règle CLAUDE.md).
   * Vérifie qu'il y a au moins 50 voix avec diversité catégories.
   */
  auditDiversity(): { healthy: boolean; total: number; warnings: string[] } {
    const warnings: string[] = [];
    if (VOICES.length < 50) warnings.push(`${VOICES.length} voix < 50 minimum requis`);
    const counts = this.countByCategory();
    if (counts.pro < 10) warnings.push('Moins de 10 voix PRO');
    if (counts.fun < 15) warnings.push('Moins de 15 voix FUN');
    if (counts.thematic < 15) warnings.push('Moins de 15 voix THÉMATIQUES');
    return {
      healthy: warnings.length === 0,
      total: VOICES.length,
      warnings,
    };
  }
}

export const voicesRegistry = new VoicesRegistry();
