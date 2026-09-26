"""OpenAI client wrapper — fallback si Anthropic down."""

import os
from openai import AsyncOpenAI

_client = None


def get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY env var missing (fallback nécessaire)")
        _client = AsyncOpenAI(api_key=api_key)
    return _client


async def call_openai(messages, system=None, model="gpt-4o-mini", max_tokens=4096):
    """Call OpenAI API. Returns dict with content + metadata."""
    client = get_client()

    # OpenAI attend system en tête de messages
    oai_messages = []
    if system:
        oai_messages.append({"role": "system", "content": system})
    oai_messages.extend(messages)

    resp = await client.chat.completions.create(
        model=model,
        messages=oai_messages,
        max_tokens=max_tokens,
    )
    return {
        "content": resp.choices[0].message.content,
        "model": resp.model,
        "tokens_in": resp.usage.prompt_tokens,
        "tokens_out": resp.usage.completion_tokens,
    }
