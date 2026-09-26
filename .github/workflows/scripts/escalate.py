#!/usr/bin/env python3
"""
Apex audit escalation — generates a corrective plan via Anthropic API.

Called by .github/workflows/apex-audit-escalate.yml when Apex pushes a
finding via repository_dispatch (event_type=apex-audit).

Inputs (env):
  - ANTHROPIC_API_KEY  : Anthropic API key (GitHub Secret)
  - PAYLOAD_FILE       : path to JSON file with audit payload
  - GITHUB_RUN_ID      : run identifier (used in plan filename)

Outputs (GITHUB_OUTPUT):
  - plan_path          : relative path to the generated plan markdown
  - issue_title        : GitHub Issue title
  - issue_body         : GitHub Issue body (max ~4000 chars)

Behavior:
  - Reads payload (finding + audit_summary)
  - Calls Claude (claude-sonnet-4-5) to produce a remediation plan
  - Writes the plan to docs/apex-escalades/{ts}-{id}.md
  - Emits issue title and short body for follow-up

Free tier:
  - GitHub Actions = unlimited minutes for public repos
  - Replaces paid n8n webhook
"""

from __future__ import annotations

import json
import os
import pathlib
import re
import sys
import time
from typing import Any

# anthropic SDK (installed in workflow step)
try:
    import anthropic
except ImportError:  # pragma: no cover
    print("ERROR: anthropic SDK not installed. Run: pip install anthropic")
    sys.exit(1)


CLAUDE_MODEL = "claude-sonnet-4-5-20250929"
PLAN_DIR = pathlib.Path("docs/apex-escalades")
MAX_PLAN_CHARS = 8000
MAX_ISSUE_BODY = 3500


def _safe_id(value: str, fallback: str) -> str:
    """Sanitize value for filename (alnum + dashes)."""
    safe = re.sub(r"[^a-zA-Z0-9_\-]+", "-", value or fallback)[:40].strip("-")
    return safe or fallback


def _read_payload(path: str) -> dict[str, Any]:
    """Read and normalize the dispatch payload."""
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"WARN: payload unreadable ({exc}) — using empty default")
        data = {}
    if not isinstance(data, dict):
        data = {"raw": data}
    return data


def _build_prompt(payload: dict[str, Any]) -> str:
    """Build the user prompt for Claude based on the audit payload."""
    finding = payload.get("finding") or payload.get("Finding") or {}
    summary = payload.get("audit_summary") or payload.get("summary") or "n/a"
    source = payload.get("source") or "apex_v13"

    finding_str = json.dumps(finding, ensure_ascii=False, indent=2)[:4000]

    return (
        "Tu es Claude Code, l'agent autonome qui corrige Apex AI v13 quand "
        "le self-audit detecte un probleme P0/P1.\n\n"
        f"Source : {source}\n"
        f"Resume : {summary}\n\n"
        "Finding (JSON) :\n"
        f"```json\n{finding_str}\n```\n\n"
        "Genere un plan correctif au format markdown francais avec :\n"
        "1. Diagnostic (cause racine probable)\n"
        "2. Plan d'action concret (3-5 etapes precises avec commandes ou code)\n"
        "3. Tests pour verifier la correction\n"
        "4. Risques et rollback\n"
        "5. Une checklist finale\n\n"
        "Reste concis (max 6000 caracteres). Privilegie les actions automatisees "
        "et les commandes shell / TypeScript prets a copier."
    )


def _call_claude(prompt: str, api_key: str) -> str:
    """Call Anthropic API and return the plan as markdown text."""
    client = anthropic.Anthropic(api_key=api_key)
    response = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=4096,
        system=(
            "Tu es Claude Code (Anthropic), expert remediation senior. "
            "Tu produis des plans correctifs courts, actionnables, en francais."
        ),
        messages=[{"role": "user", "content": prompt}],
    )
    chunks: list[str] = []
    for block in response.content:
        # SDK 0.40 : block.type in {"text"}
        text = getattr(block, "text", None)
        if isinstance(text, str):
            chunks.append(text)
    return "".join(chunks).strip() or "(reponse vide Anthropic)"


def _save_plan(plan_md: str, payload: dict[str, Any], run_id: str) -> pathlib.Path:
    """Save the markdown plan into docs/apex-escalades/."""
    PLAN_DIR.mkdir(parents=True, exist_ok=True)
    finding = payload.get("finding") or {}
    fid = _safe_id(str(finding.get("id", "")), f"run-{run_id}")
    ts = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    out = PLAN_DIR / f"{ts}-{fid}.md"

    header = (
        "# Apex escalation plan\n\n"
        f"- Generated: {ts}\n"
        f"- Run ID: {run_id}\n"
        f"- Finding ID: {finding.get('id', 'n/a')}\n"
        f"- Severity: {finding.get('severity', 'n/a')}\n"
        f"- Axis: {finding.get('axis', 'n/a')}\n"
        f"- Title: {finding.get('title', 'n/a')}\n\n"
        "---\n\n"
    )
    body = plan_md[:MAX_PLAN_CHARS]
    out.write_text(header + body + "\n", encoding="utf-8")
    return out


def _build_issue(payload: dict[str, Any], plan_path: pathlib.Path, plan_md: str) -> tuple[str, str]:
    """Build the GitHub Issue title + short body."""
    finding = payload.get("finding") or {}
    severity = str(finding.get("severity", "info")).upper()
    title_short = str(finding.get("title", "Apex audit escalation"))[:80]
    issue_title = f"[Apex audit] {severity} — {title_short}"

    excerpt = plan_md.strip().splitlines()[:30]
    excerpt_md = "\n".join(excerpt)[:MAX_ISSUE_BODY]

    issue_body = (
        f"**Severity** : {finding.get('severity', 'n/a')}\n"
        f"**Axis** : {finding.get('axis', 'n/a')}\n"
        f"**Description** : {finding.get('description', 'n/a')}\n\n"
        "## Plan correctif (extrait)\n\n"
        f"{excerpt_md}\n\n"
        f"_Plan complet : `{plan_path}`_\n"
        "_Auto-genere par GitHub Actions (gratuit) — remplace n8n payant._\n"
    )
    return issue_title, issue_body


def _emit_outputs(plan_path: pathlib.Path, issue_title: str, issue_body: str) -> None:
    """Write GitHub Actions outputs (plan_path, issue_title, issue_body)."""
    output_file = os.environ.get("GITHUB_OUTPUT")
    if not output_file:
        print("WARN: GITHUB_OUTPUT not set — skipping outputs")
        return
    body_escaped = issue_body.replace("\r\n", "\n")
    delimiter = f"EOF_{int(time.time())}"
    with open(output_file, "a", encoding="utf-8") as fh:
        fh.write(f"plan_path={plan_path.as_posix()}\n")
        fh.write(f"issue_title={issue_title}\n")
        fh.write(f"issue_body<<{delimiter}\n{body_escaped}\n{delimiter}\n")


def main() -> int:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    payload_file = os.environ.get("PAYLOAD_FILE", "/tmp/payload.json")
    run_id = os.environ.get("GITHUB_RUN_ID", str(int(time.time())))

    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY missing — add it in GitHub Settings > Secrets")
        return 1

    payload = _read_payload(payload_file)
    print(f"Payload keys: {list(payload.keys())}")

    prompt = _build_prompt(payload)
    print(f"Prompt size: {len(prompt)} chars")

    try:
        plan_md = _call_claude(prompt, api_key)
    except (anthropic.APIError, anthropic.APIConnectionError) as exc:
        print(f"ERROR: Anthropic API call failed: {exc}")
        return 2
    except Exception as exc:  # pragma: no cover
        print(f"ERROR: unexpected failure: {exc}")
        return 3

    plan_path = _save_plan(plan_md, payload, run_id)
    print(f"Plan written: {plan_path} ({plan_path.stat().st_size} bytes)")

    issue_title, issue_body = _build_issue(payload, plan_path, plan_md)
    _emit_outputs(plan_path, issue_title, issue_body)
    print("Outputs emitted to GITHUB_OUTPUT")
    return 0


if __name__ == "__main__":
    sys.exit(main())
