#!/usr/bin/env python3
"""free_keyword_ideas.py — Idées de mots-clés GRATUITES (Google Autocomplete).

Aucune clé API. Alternative gratuite au keyword research payant (DataForSEO/SE Ranking).
Récupère les suggestions Google Autocomplete (+ expansions a-z) pour un seed.

Usage:
    python free_keyword_ideas.py "planning casino" [--lang fr] [--json]

Note: dépend du réseau. Donne des IDÉES réelles (demande implicite), pas le volume exact.
Pour le volume : Google Keyword Planner (compte Ads gratuit) ou Google Trends (relatif).
"""
import argparse
import json
import sys
import urllib.parse
import urllib.request

ENDPOINT = "https://suggestqueries.google.com/complete/search"


def suggest(seed: str, lang: str = "fr") -> list[str]:
    params = urllib.parse.urlencode({"client": "firefox", "q": seed, "hl": lang})
    req = urllib.request.Request(f"{ENDPOINT}?{params}", headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read().decode("utf-8", "replace"))
            return data[1] if isinstance(data, list) and len(data) > 1 else []
    except Exception as e:  # noqa: BLE001 — règle Kevin : exposer la cause exacte
        print(f"[warn] suggest('{seed}') a échoué : {e}", file=sys.stderr)
        return []


def expand(seed: str, lang: str) -> list[str]:
    ideas: set[str] = set(suggest(seed, lang))
    # expansions alphabétiques "seed a", "seed b", ... (intentions plus larges)
    for ch in "abcdefghijklmnopqrstuvwxyz":
        for kw in suggest(f"{seed} {ch}", lang):
            ideas.add(kw)
    # questions (intention informationnelle / GEO)
    for q in ("comment", "pourquoi", "meilleur", "prix", "avis", "alternative"):
        for kw in suggest(f"{q} {seed}", lang):
            ideas.add(kw)
    return sorted(ideas)


def main() -> int:
    ap = argparse.ArgumentParser(description="Idées de mots-clés gratuites (Google Autocomplete)")
    ap.add_argument("seed", help="Mot-clé de départ")
    ap.add_argument("--lang", default="fr", help="Langue (défaut fr)")
    ap.add_argument("--json", action="store_true", help="Sortie JSON")
    args = ap.parse_args()

    ideas = expand(args.seed, args.lang)
    if args.json:
        print(json.dumps({"seed": args.seed, "lang": args.lang, "count": len(ideas), "ideas": ideas}, ensure_ascii=False, indent=2))
    else:
        print(f"# {len(ideas)} idées pour « {args.seed} » (Google Autocomplete, gratuit)\n")
        for kw in ideas:
            print(f"- {kw}")
    return 0 if ideas else 1


if __name__ == "__main__":
    raise SystemExit(main())
