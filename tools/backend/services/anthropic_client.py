"""Anthropic client wrapper."""

import os
from anthropic import AsyncAnthropic

_client = None


def get_client() -> AsyncAnthropic:
    global _client
    if _client is None:
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY env var missing")
        _client = AsyncAnthropic(api_key=api_key)
    return _client


async def call_anthropic(messages, system=None, model="claude-sonnet-4-6", max_tokens=4096):
    """Call Anthropic API. Returns dict with content + metadata."""
    client = get_client()
    kwargs = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": messages,
    }
    if system:
        kwargs["system"] = system

    resp = await client.messages.create(**kwargs)
    content = ""
    for block in resp.content:
        if hasattr(block, "text"):
            content += block.text

    return {
        "content": content,
        "model": resp.model,
        "tokens_in": resp.usage.input_tokens,
        "tokens_out": resp.usage.output_tokens,
    }
