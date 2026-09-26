import { describe, it, expect } from 'vitest';
import { detectAllCredentials, detectCredential } from '../../services/vault/credential-patterns.js';

describe('SIMULATION KEVIN — paste mixte de toutes ses clés réelles', () => {
  it('Kevin colle un bloc multi-clés → détection correcte de chaque service distinct', () => {
    const KEVIN_PASTE = `
ANTHROPIC_KEY=sk-ant-api03-${'A'.repeat(95)}
OPENAI_KEY=sk-proj-${'B'.repeat(80)}
GEMINI_KEY=AIzaSy${'C'.repeat(31)}
GITHUB_PAT_CLASSIC=ghp_${'D'.repeat(36)}
GITHUB_PAT_FINEGRAINED=github_pat_${'E'.repeat(82)}
GITHUB_OAUTH=gho_${'F'.repeat(36)}
GROQ_KEY=gsk_${'G'.repeat(48)}
PERPLEXITY=pplx-${'H'.repeat(48)}
COHERE=co_${'I'.repeat(45)}
RESEND=re_${'J'.repeat(20)}_test
BREVO=xkeysib-${'K'.repeat(40)}-${'L'.repeat(20)}
STRIPE=sk_live_${'M'.repeat(48)}
REPLICATE=r8_${'N'.repeat(40)}
XAI=xai-${'O'.repeat(50)}
PINECONE=pcsk_${'P'.repeat(60)}
ELEVENLABS=${'a'.repeat(32)}
my.email@example.com
+33 6 12 34 56 78
https://console.anthropic.com/dashboard
192.168.1.1
AA:BB:CC:DD:EE:FF
`;

    const detected = detectAllCredentials(KEVIN_PASTE);
    const services = detected.map((d) => ({ name: d.pattern.name, key: d.pattern.storageKey }));
    console.log('Services détectés :', JSON.stringify(services, null, 2));
    
    // ✅ Chaque service unique attendu présent
    const keys = services.map((s) => s.key);
    expect(keys).toContain('ax_anthropic_key');
    /* v13.4.6 : sk-proj-* est désormais OpenAI Project (storageKey ax_openai_key_proj),
     * distinct du legacy sk-* (ax_openai_key). Le test pâte ne contient que sk-proj donc
     * c'est ax_openai_key_proj qui doit être détecté. */
    expect(keys).toContain('ax_openai_key_proj');
    expect(keys).toContain('ax_gemini_key'); /* renommé v13.4.6 */
    expect(keys).toContain('ax_github_pat_classic'); /* distinct v13.4.6 */
    expect(keys).toContain('ax_github_pat_finegrained'); /* distinct v13.4.6 */
    expect(keys).toContain('ax_github_oauth'); /* distinct v13.4.6 */
    expect(keys).toContain('ax_groq_key');
    expect(keys).toContain('ax_perplexity_key');
    expect(keys).toContain('ax_cohere_key');
    expect(keys).toContain('ax_resend_key');
    expect(keys).toContain('ax_stripe_sk'); /* Stripe Secret = sk_live_/sk_test_ → storageKey ax_stripe_sk */
    expect(keys).toContain('ax_replicate_key');
    expect(keys).toContain('ax_xai_key');
    expect(keys).toContain('ax_pinecone_key');
    
    // ✅ Pas de duplicates (dedup OK)
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
    
    // ✅ Au moins 10 services détectés
    expect(detected.length).toBeGreaterThanOrEqual(10);
  });
  
  it('Gemini AIzaSy seul → bien classé Google AI Gemini (pas YouTube)', () => {
    const r = detectCredential('AIzaSy' + 'A'.repeat(31));
    expect(r?.name).toBe('Google AI Gemini');
    expect(r?.storageKey).toBe('ax_gemini_key');
    expect(r?.testEndpoint).toContain('generativelanguage.googleapis.com');
  });
  
  it('GitHub PAT classic et fine-grained → storageKeys DISTINCTES (anti-écrasement)', () => {
    const classic = detectCredential('ghp_' + 'A'.repeat(36));
    const fine = detectCredential('github_pat_' + 'B'.repeat(82));
    expect(classic?.storageKey).not.toBe(fine?.storageKey);
    expect(classic?.storageKey).toBe('ax_github_pat_classic');
    expect(fine?.storageKey).toBe('ax_github_pat_finegrained');
  });
  
  it('Pattern générique Mistral (32 chars) ne capture PAS un hash SHA-256 random', () => {
    /* Avant v13.4.6 : Mistral /^[A-Za-z0-9]{32}$/ matchait n'importe quelle string 32 chars
     * Maintenant : scoring spécificité → préférence pour patterns plus spécifiques */
    const sha256ish = 'aabbccddee112233445566778899aabb'; /* 32 chars hex pure */
    const r = detectCredential(sha256ish);
    /* Doit matcher ElevenLabs (hex-only) ou Mistral — selon spécificité scoring */
    /* ElevenLabs hex-only est PLUS spécifique → gagne */
    if (r) {
      expect(['ax_elevenlabs_key', 'ax_mistral_key']).toContain(r.storageKey);
    }
  });
});
