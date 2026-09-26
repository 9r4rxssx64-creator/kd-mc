"""Subscriptions API — équivalent Apex axSubscription flow."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
import uuid

router = APIRouter()

# In-memory fallback (migrer vers Supabase en prod)
_subscriptions = {}


class SubscriptionRequest(BaseModel):
    prenom: str
    nom: str
    email: EmailStr
    phone: str
    adresse: Optional[str] = None
    ville: Optional[str] = None
    msg: Optional[str] = None
    plan: str = "free"
    cgu: bool


class SubscriptionOut(BaseModel):
    id: str
    status: str
    created_at: str
    prenom: str
    nom: str
    email: str
    plan: str


@router.post("/request", response_model=SubscriptionOut)
async def request_subscription(req: SubscriptionRequest):
    """Soumettre une demande d'inscription."""
    if not req.cgu:
        raise HTTPException(status_code=400, detail="CGU non acceptées")
    if len(req.phone) < 8:
        raise HTTPException(status_code=400, detail="Téléphone invalide")

    sub_id = f"sub_{uuid.uuid4().hex[:12]}"
    sub = {
        "id": sub_id,
        "status": "pending",
        "created_at": datetime.utcnow().isoformat(),
        "prenom": req.prenom,
        "nom": req.nom,
        "email": req.email,
        "phone": req.phone,
        "adresse": req.adresse or "",
        "ville": req.ville or "",
        "msg": req.msg or "",
        "plan": req.plan,
    }
    _subscriptions[sub_id] = sub
    # TODO: persist Supabase + notifier admin par email
    return SubscriptionOut(**{k: sub[k] for k in SubscriptionOut.__fields__})


@router.get("/pending")
async def list_pending():
    """Liste des demandes en attente (admin only - TODO: JWT check)."""
    pending = [s for s in _subscriptions.values() if s["status"] == "pending"]
    return pending


@router.post("/{sub_id}/approve")
async def approve_subscription(sub_id: str):
    """Approuver une demande. Génère PIN + envoie email/WhatsApp."""
    sub = _subscriptions.get(sub_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    sub["status"] = "approved"
    sub["approved_at"] = datetime.utcnow().isoformat()
    import random
    sub["init_pin"] = str(random.randint(100000, 999999))
    # TODO: envoyer email via SendGrid/EmailJS
    return sub
