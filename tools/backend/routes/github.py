"""GitHub proxy — contourne Safari iOS PWA CORS restrictions."""

import os
import httpx
from fastapi import APIRouter, HTTPException, Header
from typing import Optional

router = APIRouter()

GITHUB_PAT = os.getenv("GITHUB_PAT", "")
ALLOWED_REPOS = os.getenv("ALLOWED_REPOS", "9r4rxssx64-creator/CMCteams").split(",")


@router.get("/read")
async def read_file(
    path: str,
    branch: str = "main",
    repo: str = "9r4rxssx64-creator/CMCteams",
    authorization: Optional[str] = Header(None),
):
    """
    Lit un fichier d'un repo GitHub.
    Remplace les appels directs Apex → api.github.com qui échouent en Safari PWA.
    """
    if repo not in ALLOWED_REPOS:
        raise HTTPException(status_code=403, detail=f"Repo {repo} not allowed")

    # Priorité 1 : raw.githubusercontent.com (simple, public repos)
    raw_url = f"https://raw.githubusercontent.com/{repo}/{branch}/{path}"
    headers = {"User-Agent": "apex-backend"}
    if GITHUB_PAT:
        headers["Authorization"] = f"Bearer {GITHUB_PAT}"

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            r = await client.get(raw_url, headers=headers)
            if r.status_code == 200:
                return {"content": r.text, "source": "raw"}
        except Exception:
            pass

        # Fallback API GitHub
        api_url = f"https://api.github.com/repos/{repo}/contents/{path}?ref={branch}"
        r = await client.get(api_url, headers=headers)
        if r.status_code != 200:
            raise HTTPException(
                status_code=r.status_code,
                detail=f"GitHub error: {r.text[:200]}",
            )
        data = r.json()
        import base64
        content = base64.b64decode(data["content"]).decode("utf-8")
        return {"content": content, "source": "api"}


@router.get("/list")
async def list_dir(
    path: str = "",
    branch: str = "main",
    repo: str = "9r4rxssx64-creator/CMCteams",
):
    """Liste les fichiers d'un dossier."""
    if repo not in ALLOWED_REPOS:
        raise HTTPException(status_code=403, detail=f"Repo {repo} not allowed")

    url = f"https://api.github.com/repos/{repo}/contents/{path}?ref={branch}"
    headers = {"User-Agent": "apex-backend"}
    if GITHUB_PAT:
        headers["Authorization"] = f"Bearer {GITHUB_PAT}"

    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get(url, headers=headers)
        if r.status_code != 200:
            raise HTTPException(status_code=r.status_code, detail=r.text[:200])
        items = r.json()
        return [
            {"name": i["name"], "path": i["path"], "type": i["type"], "size": i.get("size", 0)}
            for i in items
        ]
