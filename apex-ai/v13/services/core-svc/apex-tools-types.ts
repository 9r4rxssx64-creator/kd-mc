/**
 * APEX v13 — Tool types (no runtime, breaks circular deps).
 *
 * Both `apex-tools.ts` and `apex-tools-registry/*.ts` import this file
 * for the `ApexTool` interface. By isolating the type here, neither
 * side has a runtime dependency on the other → no circular cycle.
 */

export interface ApexTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description?: string; enum?: readonly string[] }>;
    required?: readonly string[];
  };
  /* Tier requis pour exécuter ce tool */
  minTier: 'admin' | 'laurence' | 'family' | 'client_pro' | 'client_free';
  /* Action niveau impact :
   * A = auto (pas de validation)
   * B = notify (Kevin reçoit info en push)
   * C = validate (Kevin doit valider avant) */
  impactLevel: 'A' | 'B' | 'C';
}
