"""
Apex AI / CMCteams Backend — FastAPI
Point d'entrée principal. Deploy sur Railway / Fly.io / Render.

Usage local :
    pip install -r requirements.txt
    uvicorn main:app --reload --port 8000

Docs : http://localhost:8000/docs
"""

import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from routes import github, chat, pdf, auth, subscription, services

load_dotenv()

ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "https://9r4rxssx64-creator.github.io,http://localhost:3000"
).split(",")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown hooks."""
    print(f"[APEX BACKEND] Starting. Allowed origins: {ALLOWED_ORIGINS}")
    yield
    print("[APEX BACKEND] Shutdown.")


app = FastAPI(
    title="Apex AI / CMCteams Backend",
    version="1.0.0",
    description="Backend pro pour Apex AI + CMCteams — multi-provider IA, parser PDF, auth, subscriptions",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(github.router, prefix="/api/github", tags=["GitHub proxy"])
app.include_router(chat.router, prefix="/api/chat", tags=["AI chat"])
app.include_router(pdf.router, prefix="/api/pdf", tags=["PDF parser"])
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(subscription.router, prefix="/api/subscriptions", tags=["Subscriptions"])
app.include_router(services.router, prefix="/api/services", tags=["Services balances"])


@app.get("/")
async def root():
    return {
        "service": "Apex AI / CMCteams Backend",
        "version": "1.0.0",
        "status": "operational",
        "docs": "/docs",
        "endpoints": [
            "/api/github/read",
            "/api/chat/completion",
            "/api/pdf/parse-cadres",
            "/api/auth/login",
            "/api/subscriptions/request",
        ],
    }


@app.get("/health")
async def health():
    return {"status": "ok"}
