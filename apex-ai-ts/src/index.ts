/**
 * apex-ai-ts entry point
 *
 * Layer TypeScript pour Apex AI : type-checking sans changer le code de production.
 * Migration progressive : on type les modules un par un, on push tests, on garde
 * apex-ai/index.html (vanilla JS) comme source de vérité runtime.
 *
 * Usage : npm run type-check (verifie les types sans build)
 *         npm run test (execute tests Vitest)
 */

import "./types/apex";
import * as compliance from "./modules/compliance/age";
import * as aiSafety from "./modules/ai-safety/jailbreak";
import * as code from "./modules/code/github";

export { compliance, aiSafety, code };

console.log("[apex-ai-ts] entry loaded — TypeScript layer active");
