// Chiffrement des secrets au repos (clés d'API saisies dans l'interface) + mots de passe.
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

function cle(secret: string): Buffer {
  return scryptSync(secret, "bibi-secrets-v1", 32);
}

export function chiffrer(clair: string, secret: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", cle(secret), iv);
  const data = Buffer.concat([c.update(clair, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), data]).toString("base64");
}

export function dechiffrer(b64: string, secret: string): string | null {
  try {
    const buf = Buffer.from(b64, "base64");
    const d = createDecipheriv("aes-256-gcm", cle(secret), buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
  } catch {
    return null; // secret changé ou donnée corrompue : on ne plante pas
  }
}

export function hacherMotDePasse(mdp: string): string {
  const sel = randomBytes(16);
  const h = scryptSync(mdp, sel, 64);
  return `scrypt$${sel.toString("hex")}$${h.toString("hex")}`;
}

export function verifierMotDePasse(mdp: string, stocke: string): boolean {
  const [algo, selHex, hHex] = stocke.split("$");
  if (algo !== "scrypt" || !selHex || !hHex) return false;
  const attendu = Buffer.from(hHex, "hex");
  const calcule = scryptSync(mdp, Buffer.from(selHex, "hex"), attendu.length);
  return timingSafeEqual(attendu, calcule);
}

export function egalConstant(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export const nouveauJeton = (): string => randomBytes(32).toString("base64url");
export const empreinte = (jeton: string): string => createHash("sha256").update(jeton).digest("hex");
