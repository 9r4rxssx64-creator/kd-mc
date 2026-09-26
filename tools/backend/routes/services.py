"""Services balance endpoint — proxy aux APIs admin pour récupérer soldes/quotas."""

import os
import httpx
from fastapi import APIRouter, HTTPException
from typing import Dict, Any

router = APIRouter()


async def _fetch_anthropic_usage() -> Dict[str, Any]:
    """Anthropic n'expose PAS de balance API public (admin console only).
    On retourne juste un placeholder; Kevin entre manuellement dans l'app."""
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        return {"available": False, "reason": "no_key"}
    # Test que la clé est valide via un ping minimal
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            r = await c.post(
                "https://api.anthropic.com/v1/messages",
                json={"model": "claude-haiku-4-5-20251001", "max_tokens": 1,
                      "messages": [{"role": "user", "content": "1"}]},
                headers={"x-api-key": api_key, "anthropic-version": "2023-06-01"}
            )
            return {"available": True, "key_valid": r.status_code != 401, "status_code": r.status_code}
    except Exception as e:
        return {"available": False, "error": str(e)[:100]}


async def _fetch_openai_balance() -> Dict[str, Any]:
    """OpenAI dashboard credits via /v1/dashboard/billing/credit_grants (deprecated)."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return {"available": False, "reason": "no_key"}
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            r = await c.get(
                "https://api.openai.com/v1/dashboard/billing/credit_grants",
                headers={"Authorization": f"Bearer {api_key}"}
            )
            if r.status_code == 200:
                d = r.json()
                return {"available": True, "balance": d.get("total_available", 0), "currency": "USD"}
            return {"available": False, "status_code": r.status_code}
    except Exception as e:
        return {"available": False, "error": str(e)[:100]}


async def _fetch_railway_usage() -> Dict[str, Any]:
    """Railway via GraphQL API."""
    token = os.getenv("RAILWAY_TOKEN")
    if not token:
        return {"available": False, "reason": "no_token"}
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            r = await c.post(
                "https://backboard.railway.com/graphql/v2",
                json={"query": "query { me { id email } }"},
                headers={"Authorization": f"Bearer {token}"}
            )
            if r.status_code == 200:
                return {"available": True, "data": r.json()}
            return {"available": False, "status_code": r.status_code}
    except Exception as e:
        return {"available": False, "error": str(e)[:100]}


@router.get("/balances")
async def get_balances():
    """Retourne les soldes/status disponibles via les API admin."""
    out = {
        "anthropic": await _fetch_anthropic_usage(),
        "openai": await _fetch_openai_balance(),
        "railway": await _fetch_railway_usage(),
    }
    return {"balances": out}


@router.get("/health-check")
async def services_health():
    """Test rapide chaque clé configurée."""
    keys = {
        "anthropic": bool(os.getenv("ANTHROPIC_API_KEY")),
        "openai": bool(os.getenv("OPENAI_API_KEY")),
        "github": bool(os.getenv("GITHUB_PAT")),
        "railway": bool(os.getenv("RAILWAY_TOKEN")),
        "stripe": bool(os.getenv("STRIPE_SECRET_KEY")),
    }
    return {"keys_configured": keys}
