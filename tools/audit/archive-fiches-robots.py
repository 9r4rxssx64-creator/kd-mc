#!/usr/bin/env python3
"""Garde la MÉMOIRE des fiches d'incident fermées lors du ménage (Kevin 24.09.2026
« garde une mémoire, historique etc »).

Une fiche fermée n'est pas supprimée sur GitHub (elle se rouvre en 1 clic), mais on
garde en plus NOTRE trace, dans le dépôt : numéro, dates, titre, famille, étiquettes.

Usage : python3 tools/audit/archive-fiches-robots.py 2026-09-24
Écrit : archives/fiches-robots-fermees-<date>.json + archives/FICHES_ROBOTS_FERMEES_<date>.md
Seulement des métadonnées publiques du dépôt — jamais le corps des fiches (on ne
recopie pas ce qu'un robot a pu y écrire).
"""
import json, os, subprocess, sys, collections

import datetime

# La date sert à fabriquer un CHEMIN de fichier et une URL : on ne la prend jamais telle
# quelle. On la reconstruit à partir d'un vrai objet date — une valeur comme
# « ../../etc » ou « 2026-09-24&x=… » est refusée net (injection de chemin / d'URL).
try:
    JOUR = datetime.date.fromisoformat(sys.argv[1]).isoformat() if len(sys.argv) > 1 else None
except ValueError:
    JOUR = None
if not JOUR:
    sys.exit("usage : archive-fiches-robots.py AAAA-MM-JJ (une vraie date)")
T = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
if not T:
    sys.exit("jeton GitHub absent (GH_TOKEN / GITHUB_TOKEN)")
DEPOT = "9r4rxssx64-creator/CMCteams"

def api(chemin):
    o = subprocess.run(["curl", "-s", "-H", "Authorization: Bearer " + T,
                        "-H", "Accept: application/vnd.github+json",
                        "https://api.github.com/repos/" + DEPOT + chemin],
                       capture_output=True, text=True).stdout
    return json.loads(o)

def famille(titre):
    t = titre.lower()
    for cle, nom in (("apis health", "APIs Health"), ("deploy drift", "Apex v13 deploy drift"),
                     ("ultra audit", "Ultra Audit Crew"), ("auto-rollback", "Auto-rollback"),
                     ("régression critique", "Régression critique"), ("regression critique", "Régression critique"),
                     ("uptime", "Uptime"), ("cdn", "CDN"), ("centre de contrôle", "Centre de contrôle")):
        if cle in t:
            return nom
    return "Autre"

fiches, page = [], 1
while page <= 20:
    d = api(f"/issues?state=closed&since={JOUR}T00:00:00Z&per_page=100&page={page}")
    if not isinstance(d, list) or not d:
        break
    for it in d:
        if "pull_request" in it:
            continue
        if not (it.get("closed_at") or "").startswith(JOUR):
            continue
        if it.get("state_reason") != "not_planned":
            continue
        if (it.get("user") or {}).get("login") != "github-actions[bot]":
            continue
        fiches.append({
            "numero": it["number"],
            "titre": it["title"],
            "famille": famille(it["title"]),
            "ouverte_le": it["created_at"],
            "fermee_le": it["closed_at"],
            "etiquettes": [l["name"] for l in it.get("labels", [])],
            "lien": it["html_url"],
        })
    page += 1

fiches.sort(key=lambda f: f["numero"])
par_fam = collections.Counter(f["famille"] for f in fiches)
os.makedirs("archives", exist_ok=True)
base = f"archives/fiches-robots-fermees-{JOUR}"
with open(base + ".json", "w", encoding="utf-8") as fh:
    json.dump({"date": JOUR, "total": len(fiches), "par_famille": dict(par_fam), "fiches": fiches},
              fh, ensure_ascii=False, indent=1)

plus_vieille = min((f["ouverte_le"] for f in fiches), default="")[:10]
plus_recente = max((f["ouverte_le"] for f in fiches), default="")[:10]
L = [f"# 🗄️ Fiches de robots fermées le {JOUR}", "",
     f"> Ménage demandé par Kevin (« sois sûr qu'ils ne servent à rien… commence », puis",
     f"> « rien, continue », puis « garde une mémoire, historique »).",
     f"> **Rien n'est supprimé** : chaque fiche reste sur GitHub, fermée, et se **rouvre en 1 clic**.",
     "",
     "## En un coup d'œil", "",
     f"- **{len(fiches)} fiches fermées**, toutes écrites par un robot (`github-actions[bot]`)",
     f"- ouvertes entre le **{plus_vieille}** et le **{plus_recente}** — plus aucune depuis",
     "- **0** avec un responsable, **0** avec un commentaire, **0** citée dans le code ou les documents",
     "- fermées comme « **non planifiées** » (pas « résolues ») : c'est la vérité, personne ne les a traitées",
     "",
     "## Pourquoi on était sûr qu'elles ne servaient à rien (mesuré le 24.09.2026)", "",
     "| Vérification | Résultat |", "|---|---|",
     "| Auteur | 452 sur 453 ouvertes par un robot |",
     "| Suivi humain | 0 responsable, 0 commentaire, 0 mention de Kevin |",
     "| Références | aucune dans le code ni dans les documents |",
     "| Pourquoi plus rien depuis le 14.08 | exécutions programmées **retirées le 15.08.2026** (suspension du compte GitHub) |",
     "| « Régression critique » / « revert impossible » | tests de régression d'Apex v13 **relancés : 104/104 verts** |",
     "",
     "## Par famille", "", "| Famille | Nombre |", "|---|---|"]
for fam, n in par_fam.most_common():
    L.append(f"| {fam} | {n} |")
L += ["", "## Gardée ouverte", "",
      "- **n°248** « fb-health agent error » : rapport automatique d'Apex, mais ouvert **avec le compte de Kevin**",
      "  → règle de prudence : on ne ferme que ce qu'un robot a ouvert. À trancher par Kevin.", "",
      "## Retrouver une fiche", "",
      f"- Toutes celles de ce ménage : [fiches fermées, non planifiées](https://github.com/{DEPOT}/issues?q=is%3Aissue+is%3Aclosed+reason%3Anot-planned)",
      "- La liste complète (numéro, titre, dates, étiquettes, lien) : "
      f"[fiches-robots-fermees-{JOUR}.json](fiches-robots-fermees-{JOUR}.json)", "",
      "## Liste complète", "", "| N° | Ouverte le | Famille | Titre |", "|---|---|---|---|"]
for f in fiches:
    titre = f["titre"].replace("|", "/")[:80]
    L.append(f"| [{f['numero']}]({f['lien']}) | {f['ouverte_le'][:10]} | {f['famille']} | {titre} |")
with open(f"archives/FICHES_ROBOTS_FERMEES_{JOUR}.md", "w", encoding="utf-8") as fh:
    fh.write("\n".join(L) + "\n")
print(f"archive écrite : {len(fiches)} fiches · " + " · ".join(f"{k} {v}" for k, v in par_fam.most_common()))
