"""AI chat — multi-provider (Anthropic primary, OpenAI fallback)."""

import os
import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional, Any
from services.anthropic_client import call_anthropic
from services.openai_client import call_openai

router = APIRouter()

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"


class Message(BaseModel):
    role: str  # user | assistant
    content: str


class ChatRequest(BaseModel):
    messages: List[Message]
    system: Optional[str] = None
    model: Optional[str] = None
    max_tokens: int = 4096
    provider: Optional[str] = None  # "anthropic" | "openai" | None (auto)


class ChatResponse(BaseModel):
    content: str
    provider_used: str
    model: str
    tokens_in: int
    tokens_out: int


@router.post("/completion", response_model=ChatResponse)
async def chat_completion(req: ChatRequest):
    """
    Chat completion avec fallback multi-provider.
    Priorité : Anthropic (Claude Sonnet 4.6) → OpenAI (GPT-4o-mini) si Anthropic fail.
    Le PAT/API key reste côté serveur, jamais exposé au client.
    """
    provider = req.provider or "anthropic"

    if provider == "anthropic":
        try:
            result = await call_anthropic(
                messages=[m.dict() for m in req.messages],
                system=req.system,
                model=req.model or "claude-sonnet-4-6",
                max_tokens=req.max_tokens,
            )
            return ChatResponse(
                content=result["content"],
                provider_used="anthropic",
                model=result["model"],
                tokens_in=result["tokens_in"],
                tokens_out=result["tokens_out"],
            )
        except Exception as e:
            print(f"[CHAT] Anthropic failed: {e}, trying OpenAI fallback")
            # Auto-fallback
            try:
                result = await call_openai(
                    messages=[m.dict() for m in req.messages],
                    system=req.system,
                    model="gpt-4o-mini",
                    max_tokens=req.max_tokens,
                )
                return ChatResponse(
                    content=result["content"],
                    provider_used="openai-fallback",
                    model=result["model"],
                    tokens_in=result["tokens_in"],
                    tokens_out=result["tokens_out"],
                )
            except Exception as e2:
                raise HTTPException(status_code=503, detail=f"Both providers failed: {e} / {e2}")

    elif provider == "openai":
        result = await call_openai(
            messages=[m.dict() for m in req.messages],
            system=req.system,
            model=req.model or "gpt-4o-mini",
            max_tokens=req.max_tokens,
        )
        return ChatResponse(
            content=result["content"],
            provider_used="openai",
            model=result["model"],
            tokens_in=result["tokens_in"],
            tokens_out=result["tokens_out"],
        )

    raise HTTPException(status_code=400, detail=f"Unknown provider {provider}")


@router.post("/proxy")
async def chat_proxy(request: Request):
    """
    Passthrough vers Anthropic Messages API.
    Accepte le schéma natif Anthropic (tools, tool_use, tool_result, images).
    La clé API reste côté serveur — jamais exposée au client.

    Usage frontend : POST /api/chat/proxy avec le body Anthropic standard
    (model, max_tokens, system, messages, tools, ...).
    Réponse : JSON brut d'Anthropic.
    """
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY non configure sur le serveur")

    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="JSON body invalide")

    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }

    timeout = httpx.Timeout(180.0, connect=10.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(ANTHROPIC_API_URL, json=body, headers=headers)
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Timeout Anthropic (>180s)")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Upstream error: {e}")

    return JSONResponse(status_code=resp.status_code, content=resp.json() if resp.headers.get("content-type","").startswith("application/json") else {"error": resp.text[:500]})
