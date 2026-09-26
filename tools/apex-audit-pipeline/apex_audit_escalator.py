#!/usr/bin/env python3
"""
Apex Audit Escalator
====================

Reads an Apex audit JSON, sends it to the Claude API (Anthropic Opus) with a
remediation-plan prompt, and saves the structured plan locally.

Designed to be run either standalone (CLI) or invoked from an n8n / cron
pipeline (see apex_audit_pipeline.n8n.json).

Environment variables
---------------------
ANTHROPIC_API_KEY      Required. Your Anthropic API key.
ANTHROPIC_MODEL        Optional. Default: claude-opus-4-5-20250514
APEX_AUDIT_INPUT       Optional. Path to audit JSON (overrides --audit).
APEX_AUDIT_OUTPUT_DIR  Optional. Default: ./out
LOG_LEVEL              Optional. Default: INFO

CLI
---
    python3 apex_audit_escalator.py --audit ./examples/audit.json
    python3 apex_audit_escalator.py --audit - < ./audit.json    # stdin
    python3 apex_audit_escalator.py --audit ./audit.json --dry-run

Exit codes
----------
0  success (plan generated + saved)
2  bad input (missing file, invalid JSON, missing API key)
3  API error (network, auth, rate-limit)
4  unexpected error
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import anthropic  # type: ignore
except ImportError:  # pragma: no cover
    anthropic = None  # the script reports the missing dep at runtime


DEFAULT_MODEL = "claude-opus-4-5-20250514"
DEFAULT_OUTPUT_DIR = Path(os.environ.get("APEX_AUDIT_OUTPUT_DIR", "./out"))
DEFAULT_MAX_TOKENS = 8000


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
def _configure_logging() -> logging.Logger:
    level = os.environ.get("LOG_LEVEL", "INFO").upper()
    logging.basicConfig(
        level=getattr(logging, level, logging.INFO),
        format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S%z",
    )
    return logging.getLogger("apex.audit.escalator")


log = _configure_logging()


# ---------------------------------------------------------------------------
# Data shapes
# ---------------------------------------------------------------------------
@dataclass
class EscalationResult:
    request_id: str
    model: str
    status: str
    started_at: str
    finished_at: str
    duration_ms: int
    tokens_input: int
    tokens_output: int
    plan_text: str
    raw_audit: dict = field(default_factory=dict)
    error: str | None = None

    def to_json(self) -> str:
        return json.dumps(asdict(self), ensure_ascii=False, indent=2)


# ---------------------------------------------------------------------------
# Prompt construction
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = """Tu es un architecte senior expert (15 ans d'expérience) chargé
de transformer un audit Apex en plan d'implémentation actionnable.

Contraintes :
- Réponds en français.
- Reste factuel : ne reformule pas l'audit, agis dessus.
- Priorise par sévérité (P0 critique > P1 high > P2 medium > P3 low).
- Pour chaque finding, fournis : (1) résumé 1 ligne, (2) cause racine
  probable, (3) fix concret avec fichiers/fonctions à toucher, (4) test de
  non-régression à ajouter, (5) effort estimé (S/M/L), (6) risque si non
  corrigé.
- Termine par 3 quick-wins déployables aujourd'hui et 3 chantiers >7 jours.
- Format de sortie : Markdown structuré (titres ##, listes, tableaux).
"""

USER_PROMPT_TEMPLATE = """# Audit Apex à traiter

Score global : {score}/100
Verdict : {verdict}
Date audit : {audit_date}

## Findings

{findings_block}

## Contexte projet

{context_block}

---

Génère le plan d'implémentation maintenant.
"""


def _format_findings(findings: list[dict[str, Any]]) -> str:
    if not findings:
        return "_(aucun finding fourni)_"
    lines: list[str] = []
    for i, f in enumerate(findings, 1):
        sev = f.get("severity") or f.get("priority") or "?"
        title = f.get("title") or f.get("name") or "(sans titre)"
        desc = f.get("description") or f.get("detail") or ""
        loc = f.get("location") or f.get("file") or ""
        block = [f"### Finding {i} [{sev}] {title}"]
        if loc:
            block.append(f"- Localisation : `{loc}`")
        if desc:
            block.append(f"- Description : {desc}")
        cwe = f.get("cwe")
        if cwe:
            block.append(f"- CWE : {cwe}")
        cvss = f.get("cvss")
        if cvss:
            block.append(f"- CVSS : {cvss}")
        lines.append("\n".join(block))
    return "\n\n".join(lines)


def _format_context(audit: dict[str, Any]) -> str:
    ctx = audit.get("context") or {}
    if not ctx:
        return "_(non fourni)_"
    if isinstance(ctx, str):
        return ctx
    return "\n".join(f"- **{k}** : {v}" for k, v in ctx.items())


def build_prompt(audit: dict[str, Any]) -> str:
    return USER_PROMPT_TEMPLATE.format(
        score=audit.get("score", "?"),
        verdict=audit.get("verdict", "(non fourni)"),
        audit_date=audit.get("date") or audit.get("timestamp") or "(non datée)",
        findings_block=_format_findings(audit.get("findings", [])),
        context_block=_format_context(audit),
    )


# ---------------------------------------------------------------------------
# Audit loading
# ---------------------------------------------------------------------------
def load_audit(source: str) -> dict[str, Any]:
    if source == "-":
        log.info("Reading audit JSON from stdin")
        raw = sys.stdin.read()
    else:
        path = Path(source)
        if not path.exists():
            raise FileNotFoundError(f"audit file not found: {path}")
        log.info("Reading audit JSON from %s", path)
        raw = path.read_text(encoding="utf-8")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"invalid JSON in audit input: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError("audit JSON must be an object at top level")
    return data


# ---------------------------------------------------------------------------
# Claude API call
# ---------------------------------------------------------------------------
def call_claude(
    audit: dict[str, Any],
    *,
    api_key: str,
    model: str,
    max_tokens: int,
    dry_run: bool,
) -> EscalationResult:
    request_id = str(uuid.uuid4())
    started = datetime.now(timezone.utc)
    user_prompt = build_prompt(audit)

    log.info("escalation request_id=%s model=%s dry_run=%s", request_id, model, dry_run)
    log.debug("prompt size: %d chars", len(user_prompt))

    if dry_run:
        finished = datetime.now(timezone.utc)
        return EscalationResult(
            request_id=request_id,
            model=model,
            status="dry_run",
            started_at=started.isoformat(),
            finished_at=finished.isoformat(),
            duration_ms=int((finished - started).total_seconds() * 1000),
            tokens_input=0,
            tokens_output=0,
            plan_text="(dry-run — prompt non envoyé à l'API)\n\n" + user_prompt,
            raw_audit=audit,
        )

    if anthropic is None:
        raise RuntimeError(
            "Module 'anthropic' missing. Install with: pip install anthropic>=0.39"
        )

    client = anthropic.Anthropic(api_key=api_key)
    t0 = time.monotonic()
    try:
        message = client.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )
    except anthropic.APIStatusError as exc:  # type: ignore[attr-defined]
        log.error("Anthropic API status error: %s", exc)
        raise
    except anthropic.APIConnectionError as exc:  # type: ignore[attr-defined]
        log.error("Anthropic API connection error: %s", exc)
        raise
    except anthropic.RateLimitError as exc:  # type: ignore[attr-defined]
        log.error("Anthropic rate limit hit: %s", exc)
        raise
    duration_ms = int((time.monotonic() - t0) * 1000)
    finished = datetime.now(timezone.utc)

    plan_text = ""
    for block in getattr(message, "content", []) or []:
        # SDK >= 0.39 returns a list of TextBlock objects
        text = getattr(block, "text", None)
        if text:
            plan_text += text
    if not plan_text and isinstance(message, dict):  # defensive fallback
        plan_text = json.dumps(message, ensure_ascii=False, indent=2)

    usage = getattr(message, "usage", None)
    tokens_in = getattr(usage, "input_tokens", 0) if usage else 0
    tokens_out = getattr(usage, "output_tokens", 0) if usage else 0
    log.info(
        "escalation done request_id=%s tokens_in=%d tokens_out=%d duration_ms=%d",
        request_id,
        tokens_in,
        tokens_out,
        duration_ms,
    )

    return EscalationResult(
        request_id=request_id,
        model=model,
        status="ok",
        started_at=started.isoformat(),
        finished_at=finished.isoformat(),
        duration_ms=duration_ms,
        tokens_input=tokens_in,
        tokens_output=tokens_out,
        plan_text=plan_text,
        raw_audit=audit,
    )


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------
def save_result(result: EscalationResult, output_dir: Path) -> tuple[Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    base = f"{stamp}_{result.request_id[:8]}"
    json_path = output_dir / f"{base}.json"
    md_path = output_dir / f"{base}.md"
    json_path.write_text(result.to_json(), encoding="utf-8")
    md_path.write_text(result.plan_text or "(plan vide)", encoding="utf-8")
    log.info("plan saved → %s", md_path)
    log.info("metadata saved → %s", json_path)
    return json_path, md_path


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Escalate an Apex audit JSON to Claude (Anthropic Opus)."
    )
    parser.add_argument(
        "--audit",
        default=os.environ.get("APEX_AUDIT_INPUT", "-"),
        help="Path to audit JSON, or '-' for stdin (default: stdin)",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help=f"Where to save plan + metadata (default: {DEFAULT_OUTPUT_DIR})",
    )
    parser.add_argument(
        "--model",
        default=os.environ.get("ANTHROPIC_MODEL", DEFAULT_MODEL),
        help=f"Anthropic model (default: {DEFAULT_MODEL})",
    )
    parser.add_argument(
        "--max-tokens",
        type=int,
        default=DEFAULT_MAX_TOKENS,
        help=f"Max output tokens (default: {DEFAULT_MAX_TOKENS})",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Do not call the API, just emit the would-be prompt.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    try:
        args = parse_args(argv)
    except SystemExit as exc:
        return int(exc.code or 2)

    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not args.dry_run and not api_key:
        log.error("ANTHROPIC_API_KEY environment variable is required")
        return 2

    try:
        audit = load_audit(args.audit)
    except (FileNotFoundError, ValueError) as exc:
        log.error("invalid audit input: %s", exc)
        return 2

    try:
        result = call_claude(
            audit,
            api_key=api_key,
            model=args.model,
            max_tokens=args.max_tokens,
            dry_run=args.dry_run,
        )
    except Exception as exc:  # noqa: BLE001 — top-level CLI guard
        if anthropic is not None and isinstance(
            exc,
            (
                getattr(anthropic, "APIStatusError", Exception),
                getattr(anthropic, "APIConnectionError", Exception),
                getattr(anthropic, "RateLimitError", Exception),
            ),
        ):
            log.error("Claude API failure: %s", exc)
            return 3
        log.exception("unexpected error: %s", exc)
        return 4

    try:
        save_result(result, args.output_dir)
    except OSError as exc:
        log.error("could not write output: %s", exc)
        return 4

    print(json.dumps(
        {
            "request_id": result.request_id,
            "status": result.status,
            "tokens_input": result.tokens_input,
            "tokens_output": result.tokens_output,
            "duration_ms": result.duration_ms,
            "output_dir": str(args.output_dir),
        },
        ensure_ascii=False,
    ))
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
