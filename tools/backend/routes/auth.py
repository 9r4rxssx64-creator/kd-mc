"""JWT Auth via Supabase."""

import os
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from jose import jwt, JWTError
from datetime import datetime, timedelta

router = APIRouter()
security = HTTPBearer()

JWT_SECRET = os.getenv("JWT_SECRET", "change-me-in-prod")
JWT_ALG = "HS256"


class LoginRequest(BaseModel):
    email: str
    pin: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    plan: str


@router.post("/login", response_model=LoginResponse)
async def login(req: LoginRequest):
    """
    Login basique. TODO: integrer Supabase Auth real.
    Pour l'instant : vérif en dur pour demo + retour JWT.
    """
    # TODO: check contre Supabase users table
    # user = await supabase.table("users").select("*").eq("email", req.email).single()
    # if not user or not verify_pin(req.pin, user.pin_hash): raise 401

    # Demo : retourne un JWT pour tout user avec pin "1234"
    if req.pin != "1234":
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = jwt.encode(
        {
            "sub": req.email,
            "plan": "trial",
            "exp": datetime.utcnow() + timedelta(hours=24),
        },
        JWT_SECRET,
        algorithm=JWT_ALG,
    )
    return LoginResponse(access_token=token, user_id=req.email, plan="trial")


def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Dependency pour routes protégées."""
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALG])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
