// @vitest-environment node
// v1.1.298 (09.10.2026) — la clé publique de signature de groupe voyage dans SA colonne (signing_key_pub),
// plus seulement dans prekey_signed (réservé au futur PQXDH). Vrai code du téléphone (index.html extrait),
// vraie crypto, banc tests/unit/_support/groupe-e2e-harness.js.
import { describe, it, expect } from 'vitest';
import { trioSigned, lastFrames, parse } from './_support/groupe-e2e-harness.js';

async function echange(sigField) {
  const t = await trioSigned({ sigField });
  await t.A.send('bonjour signé');
  await t.srv.drain();
  return t;
}

describe('clé de signature de groupe : colonne dédiée', () => {
  it('le téléphone publie la clé dans signing_key_pub UNIQUEMENT (v1.1.299 : prekey_signed rendu à PQXDH)', async () => {
    const { srv } = await echange('les-deux');
    const pub = srv.posts.filter((p) => p.uid === 'alice' && p.body.signing_key_pub);
    expect(pub.length).toBeGreaterThan(0);
    expect(pub.at(-1).body.signing_key_pub).toMatch(/^GSIG1:/);
    expect(srv.posts.some((p) => 'prekey_signed' in p.body)).toBe(false);
  });

  it('serveur « colonne » (prekey_signed rendu à PQXDH) : signature lue dans signing_key_pub, messages authentifiés', async () => {
    const { srv, B, C } = await echange('colonne');
    expect(parse(lastFrames(srv, 'alice').at(-1).ciphertext).body.sg).toEqual(expect.any(String));
    expect(B.shown()).toEqual(['bonjour signé']);
    expect(C.shown()).toEqual(['bonjour signé']);
    expect(B.localStorage.getItem('gsigkey_alice')).toBe(srv.sig.alice);   // jamais « PQXDH:… »
    expect([...B.errors, ...C.errors]).toEqual([]);
  });

  it('v1.1.299 : une clé « GSIG1: » servie dans prekey_signed n\'est PLUS prise pour une clé de signature', async () => {
    const { B } = await echange('ancien');
    expect(B.localStorage.getItem('gsigkey_alice')).toBeNull();   // rien épinglé depuis le champ PQXDH
  });
});
