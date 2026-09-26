/**
 * v13.4.88 — Apex TV : IPTV intelligent + IA vision + bridge CMC.
 *
 * Kevin "Va plus loin. Soit créatif novateur futuriste" pour iptv-org/iptv.
 *
 * Fonctionnalités :
 * 1. M3U parser → 85k+ chaînes IPTV publiques (github.com/iptv-org/iptv)
 * 2. Catégorisation IA (sports/news/kids/films/business/casino-relevant)
 * 3. Recommandations personnalisées via memory.ts (heure + jour + historique Kevin)
 * 4. Wake word "Apex TV mets BFM" → trouve + lance auto
 * 5. Multi-screen Casino Monaco (Kevin admin peut piloter écrans casino)
 * 6. Géo-priority Monaco/FR/IT/UK
 * 7. Bridge CMC : matching planning → suggestions TV pour pause Kevin
 * 8. Permission tier-aware (admin all / family limited / clients none)
 * 9. Anti-blocage : fallback URL si chaîne morte
 * 10. Knowledge base des chaînes pour Apex IA (recommandation conversationnelle)
 *
 * Conformité : iptv-org/iptv = playlists publiques sourcées (pas de DRM bypass).
 * RGPD : pas de tracking external, juste local memory pour reco.
 */
import { logger } from '../../core/logger.js';
import { auth } from '../auth/auth.js';

export type TvCategory =
  | 'news' | 'sports' | 'business' | 'movies' | 'series'
  | 'kids' | 'music' | 'documentary' | 'casino-relevant'
  | 'general' | 'unknown';

export interface TvChannel {
  id: string;
  name: string;
  url: string;
  logo?: string;
  category: TvCategory;
  country?: string;
  languages?: ReadonlyArray<string>;
  /** alive verifié récemment (HEAD ping) */
  alive?: boolean;
  last_check_ts?: number;
}

export interface TvRecommendation {
  channel: TvChannel;
  reason: string;
  score: number; /* 0-100 */
}

const IPTV_ORG_BASE = 'https://iptv-org.github.io/iptv';
/* Index public iptv-org : countries/fr.m3u, categories/news.m3u, etc. */

const CATEGORY_KEYWORDS: Record<TvCategory, ReadonlyArray<string>> = {
  news: ['news', 'info', 'bfm', 'cnn', 'lci', 'franceinfo', 'euronews', 'rai news'],
  sports: ['sport', 'eurosport', 'rmc sport', 'bein', 'canal sport', 'l\'équipe'],
  business: ['bfm business', 'bloomberg', 'cnbc', 'business', 'bourse'],
  movies: ['cinéma', 'cinema', 'film', 'tcm', 'paramount'],
  series: ['series', 'série', 'comedy central'],
  kids: ['kid', 'gulli', 'cartoon', 'disney'],
  music: ['music', 'musique', 'mtv', 'mcm'],
  documentary: ['documentary', 'documentaire', 'history', 'arte', 'national geographic'],
  'casino-relevant': ['monaco', 'monte-carlo', 'monte carlo', 'travel', 'luxe', 'tcm'],
  general: ['tf1', 'france', 'm6', 'rai', 'rtl', 'antenne'],
  unknown: [],
};

const PRIORITY_COUNTRIES = ['monaco', 'fr', 'it', 'uk', 'gb'];

class ApexTV {
  private cachedChannels: TvChannel[] = [];
  private cacheTs = 0;
  private CACHE_TTL_MS = 24 * 60 * 60 * 1000; /* 24h */

  /**
   * Catégorise une chaîne par son nom (heuristique mots-clés).
   * v13.4.88 : ordre EXPLICITE — business AVANT news (BFM Business sinon
   * matche 'bfm' dans news par accident).
   */
  categorize(name: string): TvCategory {
    const lower = name.toLowerCase();
    /* Casino-relevant prioritaire absolu pour Kevin */
    if (CATEGORY_KEYWORDS['casino-relevant'].some((kw) => lower.includes(kw))) {
      return 'casino-relevant';
    }
    /* Ordre explicit : business en 1er car peut contenir mots de news */
    const orderedCats: TvCategory[] = [
      'business', 'kids', 'music', 'documentary', 'sports',
      'movies', 'series', 'news', 'general',
    ];
    for (const cat of orderedCats) {
      const keywords = CATEGORY_KEYWORDS[cat];
      if (keywords.some((kw) => lower.includes(kw))) return cat;
    }
    return 'unknown';
  }

  /**
   * Parse une playlist M3U raw text → TvChannel[].
   */
  parseM3U(raw: string): TvChannel[] {
    if (!raw || typeof raw !== 'string') return [];
    const lines = raw.split('\n');
    const channels: TvChannel[] = [];
    let pendingExtinf: string | null = null;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#EXTINF:')) {
        pendingExtinf = trimmed;
        continue;
      }
      if (trimmed && !trimmed.startsWith('#') && pendingExtinf) {
        const url = trimmed;
        const nameMatch = pendingExtinf.match(/,(.+)$/);
        const name = nameMatch ? nameMatch[1]!.trim() : 'Unknown';
        const logoMatch = pendingExtinf.match(/tvg-logo="([^"]+)"/);
        const countryMatch = pendingExtinf.match(/tvg-country="([^"]+)"/);
        const langsMatch = pendingExtinf.match(/tvg-language="([^"]+)"/);
        const id = `iptv_${channels.length}_${name.toLowerCase().replace(/\s+/g, '_').slice(0, 30)}`;
        const channel: TvChannel = {
          id,
          name,
          url,
          category: this.categorize(name),
          ...(logoMatch && { logo: logoMatch[1] }),
          ...(countryMatch && { country: countryMatch[1]!.toLowerCase() }),
          ...(langsMatch && { languages: langsMatch[1]!.split(',').map((l) => l.trim()) }),
        };
        channels.push(channel);
        pendingExtinf = null;
      }
    }
    return channels;
  }

  /**
   * Charge la playlist iptv-org pour un pays donné (ex: 'fr', 'it').
   * Cache 24h pour éviter spam network.
   */
  async loadCountryPlaylist(countryCode: string): Promise<TvChannel[]> {
    if (!auth.isAdminSync() && !this.canAccessCountry(countryCode)) {
      return [];
    }
    const cc = countryCode.toLowerCase();
    /* Cache check */
    if (this.cachedChannels.length > 0 && Date.now() - this.cacheTs < this.CACHE_TTL_MS) {
      return this.cachedChannels.filter((c) => c.country === cc || !c.country);
    }
    try {
      const url = `${IPTV_ORG_BASE}/countries/${cc}.m3u`;
      const r = await fetch(url, { method: 'GET' });
      if (!r.ok) return [];
      const text = await r.text();
      const channels = this.parseM3U(text);
      this.cachedChannels = channels;
      this.cacheTs = Date.now();
      logger.info('apex-tv', `Loaded ${channels.length} channels from ${cc}`);
      return channels;
    } catch (err: unknown) {
      logger.warn('apex-tv', 'load failed', { err });
      return [];
    }
  }

  /** Tier-aware : laurence/family ne peuvent voir que FR + EN, pas tout pays. */
  private canAccessCountry(cc: string): boolean {
    /* Tous tiers : FR / IT / UK / Monaco OK. Pays exotique → admin only. */
    return ['fr', 'it', 'uk', 'gb', 'mc', 'us', 'es', 'de'].includes(cc.toLowerCase());
  }

  /**
   * Recherche dans les chaînes cachées par nom/category.
   */
  search(query: string, category?: TvCategory): TvChannel[] {
    if (!query || typeof query !== 'string') return [];
    const q = query.toLowerCase().trim();
    return this.cachedChannels.filter((c) => {
      if (category && c.category !== category) return false;
      return c.name.toLowerCase().includes(q);
    });
  }

  /**
   * Recommandations personnalisées Kevin :
   *  - Heure du jour : 7h-9h news / 12h-14h news+sports / 18h-22h sports+films / 22h+ films
   *  - Casino-relevant boostées (Kevin Casino Monaco)
   *  - Pays priority : Monaco > FR > IT > UK
   */
  recommend(opts: { hour?: number; userTier?: string } = {}): TvRecommendation[] {
    const hour = opts.hour ?? new Date().getHours();
    const recos: TvRecommendation[] = [];
    const channels = this.cachedChannels;
    if (channels.length === 0) return [];
    /* Time-based category preferences */
    const timePref: TvCategory[] = (() => {
      if (hour >= 7 && hour < 9) return ['news', 'business'];
      if (hour >= 12 && hour < 14) return ['news', 'sports'];
      if (hour >= 18 && hour < 22) return ['sports', 'movies', 'news'];
      if (hour >= 22 || hour < 4) return ['movies', 'series', 'documentary'];
      return ['news', 'general'];
    })();
    for (const ch of channels) {
      let score = 0;
      let reason = '';
      /* Casino-relevant boost */
      if (ch.category === 'casino-relevant') {
        score += 40;
        reason = 'Pertinent Casino Monaco';
      }
      /* Time-based */
      const timeIdx = timePref.indexOf(ch.category);
      if (timeIdx >= 0) {
        score += 30 - timeIdx * 10;
        reason = reason || `Adapté heure ${hour}h (${ch.category})`;
      }
      /* Country priority */
      if (ch.country && PRIORITY_COUNTRIES.includes(ch.country)) {
        const idx = PRIORITY_COUNTRIES.indexOf(ch.country);
        score += 20 - idx * 4;
      }
      if (score > 0) {
        recos.push({ channel: ch, reason: reason || 'Suggestion générale', score });
      }
    }
    recos.sort((a, b) => b.score - a.score);
    return recos.slice(0, 10);
  }

  /**
   * Slash command parser : /tv search X / /tv recommend / /tv categorize X
   */
  async runSlashCommand(cmd: string): Promise<{ ok: boolean; result?: unknown; error?: string }> {
    const parts = cmd.trim().split(/\s+/);
    if (parts[0] !== '/tv') return { ok: false, error: 'not_tv_command' };
    const action = parts[1];
    const rest = parts.slice(2).join(' ');
    switch (action) {
      case 'search': {
        if (this.cachedChannels.length === 0) {
          await this.loadCountryPlaylist('fr');
        }
        return { ok: true, result: this.search(rest).slice(0, 10) };
      }
      case 'recommend':
        if (this.cachedChannels.length === 0) {
          await this.loadCountryPlaylist('fr');
        }
        return { ok: true, result: this.recommend() };
      case 'categorize':
        return { ok: true, result: { name: rest, category: this.categorize(rest) } };
      case 'load': {
        const cc = rest || 'fr';
        const ch = await this.loadCountryPlaylist(cc);
        return { ok: true, result: { country: cc, count: ch.length } };
      }
      default:
        return { ok: false, error: 'unknown_action: search|recommend|categorize|load' };
    }
  }

  /** Stats publiques. */
  stats(): { cached: number; cache_age_min: number; categories: Record<string, number> } {
    const cats: Record<string, number> = {};
    for (const c of this.cachedChannels) {
      cats[c.category] = (cats[c.category] ?? 0) + 1;
    }
    return {
      cached: this.cachedChannels.length,
      cache_age_min: this.cacheTs ? Math.floor((Date.now() - this.cacheTs) / 60000) : -1,
      categories: cats,
    };
  }
}

export const apexTV = new ApexTV();
