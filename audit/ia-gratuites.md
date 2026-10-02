# 🔎 Les IA gratuites — vérifiées pour de vrai

> Écrit automatiquement par la CI (elle a le réseau ouvert, pas moi).
> Dernier passage : **2026-10-02 21:19 UTC**. Rien n'est recopié de mémoire.

## 🎨 Qui transforme ta photo aujourd'hui

| Ce qu'on teste | Résultat | Moteur qui a servi | Gratuit ? |
|---|---|---|---|
| figurine (garde ton visage) | ✅ image reçue (1000 Ko) | replicate-edit:flux-kontext-pro | 💰 **payant** |
| poses de danse | ❌ 502 — Je n'ai pas pu fabriquer les poses à partir de ta photo. Je préfère te le dire plutôt que de te rendre quelqu'un d'autre. — `edit#1:create_429: Request was throttled. Your rate limit for creating predictions is reduced to 6 requests per minute with a burst of 1 requests while you have less than $5.0 in | edit#2:create_429: Request was throttle` | — | — |

> 🔴 **Quelque chose ne marche pas** — le détail est dans le tableau, avec la cause exacte.

## 🔑 Les clés

| Fournisseur | Nom du secret | État | Ce qu'il a répondu |
|---|---|---|---|
| cerebras | `CEREBRAS_API_KEY` | ❌ refuse (404) | {"message":"Model does not exist or you do not have access to it.","type":"not_found_error","param":"model","code":"mode |
| nvidia | `NVIDIA_API_KEY` | ⚪ pas de clé — rien à faire tant que tu n'en veux pas | — |
| sambanova | `SAMBANOVA_API_KEY` | ⚪ pas de clé — rien à faire tant que tu n'en veux pas | — |
| huggingface | `HF_TOKEN` | ⚪ pas de clé — rien à faire tant que tu n'en veux pas | — |
| nebius | `NEBIUS_API_KEY` | ⚪ pas de clé — rien à faire tant que tu n'en veux pas | — |
| scaleway | `SCALEWAY_API_KEY` | ⚪ pas de clé — rien à faire tant que tu n'en veux pas | — |
| glm | `GLM_API_KEY` | ⚪ pas de clé — rien à faire tant que tu n'en veux pas | — |
| qwen | `DASHSCOPE_API_KEY` | ⚪ pas de clé — rien à faire tant que tu n'en veux pas | — |
| xai (déjà à toi) | `XAI_API_KEY` | ❌ refuse (404) | {"code":"not-found","error":"The model grok-2-latest does not exist or your team d789441e-69ba-47cf-b446-710e80009150 do |
| perplexity (déjà à toi) | `PERPLEXITI_API_KEY` | ❌ refuse (401) | {"error":{"message":"Invalid API key provided. You can find your API key at https://console.perplexity.ai.","type":"inva |

## 🔗 Les liens que je t'ai donnés répondent-ils ?

| Fournisseur | Lien | État |
|---|---|---|
| cerebras | [cloud.cerebras.ai/](https://cloud.cerebras.ai/) | ✅ répond |
| nvidia | [build.nvidia.com/](https://build.nvidia.com/) | ✅ répond |
| perplexity (déjà à toi) | [www.perplexity.ai/settings/api](https://www.perplexity.ai/settings/api) | 🟡 refuse les robots (le lien marche pour toi) |
| huggingface | [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) | ✅ répond |
| glm | [open.bigmodel.cn/](https://open.bigmodel.cn/) | ✅ répond |
| xai (déjà à toi) | [console.x.ai/](https://console.x.ai/) | ✅ répond |
| sambanova | [cloud.sambanova.ai/](https://cloud.sambanova.ai/) | ✅ répond |
| scaleway | [console.scaleway.com/](https://console.scaleway.com/) | ✅ répond |
| nebius | [studio.nebius.com/](https://studio.nebius.com/) | ✅ répond |
| qwen | [modelstudio.console.alibabacloud.com/](https://modelstudio.console.alibabacloud.com/) | ✅ répond |

> ✅ Tous les liens répondent — aucun ne t'enverra dans le mur.

---

*« 🟡 refuse les robots » veut dire que le site bloque les visites automatiques :
le lien marche très bien depuis ton iPhone, c'est juste la CI qu'il refuse.*
