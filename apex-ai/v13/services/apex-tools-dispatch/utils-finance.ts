/**
 * APEX v13 — Dispatch utilities: utils-finance.
 * Auto-split from services/apex-tools-dispatch.ts (refactor 2026-05-08).
 */

export function financeCalculate(type: string, params: Record<string, unknown>): unknown {
  switch (type) {
    case 'iban_check': {
      const iban = String(params['iban'] ?? '').replace(/\s/g, '').toUpperCase();
      if (iban.length < 14 || iban.length > 34) return { valid: false, reason: 'Longueur IBAN invalide' };
      /* Validation MOD 97 (norme ISO 13616) */
      const rearranged = iban.slice(4) + iban.slice(0, 4);
      const numeric = rearranged
        .split('')
        .map((c) => (/[A-Z]/.test(c) ? (c.charCodeAt(0) - 55).toString() : c))
        .join('');
      let mod = 0;
      for (const d of numeric) mod = (mod * 10 + Number(d)) % 97;
      return { valid: mod === 1, country: iban.slice(0, 2) };
    }
    case 'ir': {
      /* IR France 2026 simplified (tranches officielles) */
      const revenu = Number(params['revenu'] ?? 0);
      const parts = Number(params['parts'] ?? 1);
      const qf = revenu / parts;
      let impot = 0;
      if (qf > 11497) impot += (Math.min(qf, 29315) - 11497) * 0.11;
      if (qf > 29315) impot += (Math.min(qf, 83823) - 29315) * 0.3;
      if (qf > 83823) impot += (Math.min(qf, 180294) - 83823) * 0.41;
      if (qf > 180294) impot += (qf - 180294) * 0.45;
      return { ir_total: Math.round(impot * parts), qf: Math.round(qf), parts };
    }
    case 'credit': {
      /* Mensualité crédit immo (formule classique) */
      const capital = Number(params['capital'] ?? 0);
      const taux = Number(params['taux'] ?? 0) / 100 / 12;
      const duree = Number(params['duree_mois'] ?? 0);
      if (taux === 0) return { mensualite: capital / duree };
      const mens = (capital * taux) / (1 - Math.pow(1 + taux, -duree));
      return { mensualite: Math.round(mens * 100) / 100, total: Math.round(mens * duree * 100) / 100 };
    }
    case 'plus_value': {
      /* PV immo : abattement 6% par an entre 6e et 21e année (impôt) */
      const annees = Number(params['annees'] ?? 0);
      const gain = Number(params['gain'] ?? 0);
      const abattement = annees < 6 ? 0 : annees >= 22 ? 1 : (annees - 5) * 0.06;
      const taxable = gain * (1 - abattement);
      return { taxable: Math.round(taxable), abattement_pct: Math.round(abattement * 100) };
    }
    default:
      throw new Error(`Type calcul inconnu: ${type}`);
  }
}
export function emailValidate(email: string): { valid: boolean; reason?: string; domain?: string } {
  if (!email) return { valid: false, reason: 'Empty' };
  const trimmed = email.trim().toLowerCase();
  const re = /^[a-z0-9._%+-]+@([a-z0-9.-]+\.[a-z]{2,})$/i;
  const m = trimmed.match(re);
  if (!m) return { valid: false, reason: 'Format invalide' };
  if (trimmed.length > 254) return { valid: false, reason: 'Trop long' };
  const domain = m[1] ?? '';
  return { valid: true, domain };
}
export function phoneValidate(
  phone: string,
  country = 'FR',
): { valid: boolean; country: string; normalized?: string; reason?: string } {
  if (!phone) return { valid: false, country, reason: 'Empty' };
  const digits = phone.replace(/[\s().+-]/g, '');
  if (!/^\d+$/.test(digits)) return { valid: false, country, reason: 'Caractères invalides' };
  if (country === 'FR') {
    if (/^0\d{9}$/.test(digits)) return { valid: true, country, normalized: `+33${digits.slice(1)}` };
    if (/^33\d{9}$/.test(digits)) return { valid: true, country, normalized: `+${digits}` };
    return { valid: false, country, reason: 'Format FR invalide' };
  }
  if (country === 'MC') {
    if (/^\d{8}$/.test(digits)) return { valid: true, country, normalized: `+377${digits}` };
    if (/^377\d{8}$/.test(digits)) return { valid: true, country, normalized: `+${digits}` };
    return { valid: false, country, reason: 'Format MC invalide' };
  }
  if (digits.length >= 7 && digits.length <= 15) {
    return { valid: true, country, normalized: `+${digits}` };
  }
  return { valid: false, country, reason: 'Longueur invalide' };
}
export function whatsappLink(phone: string, text?: string): { url: string; phone_clean: string } {
  if (!phone) throw new Error('phone required');
  const clean = phone.replace(/[\s().+-]/g, '');
  if (!/^\d{7,15}$/.test(clean)) throw new Error('Phone digits invalid (7-15)');
  const params = text ? `?text=${encodeURIComponent(text)}` : '';
  return {
    url: `https://wa.me/${clean}${params}`,
    phone_clean: clean,
  };
}
export function vatValidateEu(vat: string): { valid: boolean; country?: string; format_ok: boolean; reason?: string } {
  if (!vat) return { valid: false, format_ok: false, reason: 'Empty' };
  const clean = vat.replace(/\s/g, '').toUpperCase();
  const re = /^([A-Z]{2})([A-Z0-9]{2,12})$/;
  const m = clean.match(re);
  if (!m) return { valid: false, format_ok: false, reason: 'Format invalide (pays + numéro)' };
  const EU_COUNTRIES = [
    'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'ES', 'FI', 'FR',
    'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO',
    'SE', 'SI', 'SK', 'GB', 'XI',
  ];
  const country = m[1] ?? '';
  const isEu = EU_COUNTRIES.includes(country);
  return { valid: isEu, country, format_ok: true };
}
export function compoundInterest(
  principal: number,
  rate: number,
  years: number,
  frequency = 12,
): { final_value: number; total_interest: number; effective_rate: number } {
  if (principal <= 0 || years <= 0) {
    throw new Error('principal and years must be positive');
  }
  const r = rate / 100;
  const n = Math.max(1, frequency);
  const finalValue = principal * Math.pow(1 + r / n, n * years);
  const interest = finalValue - principal;
  const effective = Math.pow(1 + r / n, n) - 1;
  return {
    final_value: Math.round(finalValue * 100) / 100,
    total_interest: Math.round(interest * 100) / 100,
    effective_rate: Math.round(effective * 10000) / 100,
  };
}
export async function currencyConvert(
  amount: number,
  from: string,
  to: string,
): Promise<{ amount: number; from: string; to: string; converted?: number; rate?: number; provider?: string; error?: string }> {
  if (!Number.isFinite(amount)) throw new Error('amount must be a number');
  const fromCode = from.toUpperCase();
  const toCode = to.toUpperCase();
  if (!/^[A-Z]{3}$/.test(fromCode) || !/^[A-Z]{3}$/.test(toCode)) {
    return { amount, from: fromCode, to: toCode, error: 'Codes ISO 4217 invalides' };
  }
  if (fromCode === toCode) {
    return { amount, from: fromCode, to: toCode, converted: amount, rate: 1, provider: 'identity' };
  }
  try {
    const url = `https://api.exchangerate.host/convert?from=${fromCode}&to=${toCode}&amount=${amount}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { amount, from: fromCode, to: toCode, error: `HTTP ${res.status}` };
    const data = (await res.json()) as { result?: number; info?: { rate?: number } };
    if (typeof data.result === 'number') {
      const out: { amount: number; from: string; to: string; converted: number; provider: string; rate?: number } = {
        amount,
        from: fromCode,
        to: toCode,
        converted: Math.round(data.result * 100) / 100,
        provider: 'exchangerate.host',
      };
      if (typeof data.info?.rate === 'number') out.rate = data.info.rate;
      return out;
    }
    return { amount, from: fromCode, to: toCode, error: 'No rate found' };
  } catch (err) {
    return {
      amount,
      from: fromCode,
      to: toCode,
      error: err instanceof Error ? err.message : 'Network failed',
    };
  }
}
