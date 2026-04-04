from __future__ import annotations

import asyncio
import base64
import json
import math
import os
import re
import smtplib
import uuid
from collections import Counter, defaultdict
from datetime import UTC, datetime
from email.message import EmailMessage
from pathlib import Path
from typing import Any, Literal
from urllib.parse import quote_plus

import cv2
import httpx
import numpy as np
from bson import ObjectId
from bson.errors import InvalidDocument
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from pymongo import MongoClient
from pymongo.collection import Collection

import firebase_admin
from firebase_admin import auth as firebase_auth
from firebase_admin import credentials
try:
    from twilio.base.exceptions import TwilioException
    from twilio.rest import Client as TwilioClient
except Exception:  # pragma: no cover - optional dependency fallback
    TwilioException = Exception
    TwilioClient = None

from ai.llm_judge import LLMJudge
from ai.traffic_monitor import TrafficMonitor

BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(BACKEND_DIR / ".env")


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


def serialize_id(doc: dict[str, Any]) -> dict[str, Any]:
    out = {**doc}
    if "_id" in out:
        out["id"] = str(out["_id"])
        del out["_id"]
    return out


def _sanitize_for_mongo(value: Any) -> Any:
    """Recursively convert numpy scalars/arrays into plain Python types."""
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, np.floating):
        value = float(value)
        return value if math.isfinite(value) else 0.0
    if isinstance(value, np.bool_):
        return bool(value)
    if isinstance(value, np.generic):
        value = value.item()
        if isinstance(value, float):
            return value if math.isfinite(value) else 0.0
        return value
    if isinstance(value, np.ndarray):
        return value.tolist()
    if isinstance(value, dict):
        cleaned: dict[Any, Any] = {}
        for k, v in value.items():
            clean_k = _sanitize_for_mongo(k)
            if not isinstance(clean_k, (str, int, float, bool)):
                clean_k = str(clean_k)
            cleaned[clean_k] = _sanitize_for_mongo(v)
        return cleaned
    if isinstance(value, set):
        return [_sanitize_for_mongo(v) for v in value]
    if isinstance(value, (list, tuple)):
        return [_sanitize_for_mongo(v) for v in value]
    if isinstance(value, float):
        return value if math.isfinite(value) else 0.0
    return value


def _safe_box_coords(box: Any, default: tuple[float, float, float, float] = (0.0, 0.0, 10.0, 10.0)) -> tuple[float, float, float, float]:
    """Return valid 4-point box coords even when model output is malformed."""
    if box is None:
        return default
    if hasattr(box, "tolist"):
        box = box.tolist()
    try:
        seq = list(box)
    except Exception:
        return default
    if len(seq) < 4:
        return default
    try:
        x1, y1, x2, y2 = float(seq[0]), float(seq[1]), float(seq[2]), float(seq[3])
    except Exception:
        return default
    for val in (x1, y1, x2, y2):
        if not math.isfinite(val):
            return default
    return x1, y1, x2, y2


def parse_object_id(raw_id: str) -> ObjectId:
    try:
        return ObjectId(raw_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid report id") from exc


class RiskRequest(BaseModel):
    violations: int
    accidents: int
    vehicle_density: int


class AlertRequest(BaseModel):
    incident_type: str
    location: str
    severity: str
    contacts: list[str] = []
    message: str = ""


class ReportStatusUpdate(BaseModel):
    status: Literal["pending", "approved", "rejected", "active"]


class ForwardReportRequest(BaseModel):
    sourceReportId: str | None = None
    sentToAdmin: bool = True


class AdminRequestStatusUpdate(BaseModel):
    status: Literal["pending", "approved", "rejected"]
    reviewedBy: str | None = None


class AuthSyncRequest(BaseModel):
    name: str = "User"
    email: str | None = None
    role: Literal["User", "Admin", "Authority"] = "User"


class UserRoleUpdate(BaseModel):
    role: Literal["User", "Admin", "Authority"]


RouteMode = Literal["driving", "walking", "bicycling", "transit", "two_wheeler"]


class RouteSafetyRequest(BaseModel):
    origin: str
    destination: str
    mode: RouteMode = "driving"


class LegacyDashboardRequest(BaseModel):
    stats: dict[str, Any] = {}
    cumulative: dict[str, Any] = {}
    violationCounts: dict[str, int] = {}
    totalViolations: int = 0


class LegacyExecutiveSummaryRequest(BaseModel):
    stats: dict[str, Any] = {}
    cumulative: dict[str, Any] = {}
    violationCounts: dict[str, int] = {}
    totalViolations: int = 0
    accidents: list[dict[str, Any]] = []


class LegacyTrafficLawQueryRequest(BaseModel):
    question: str
    incident_context: dict[str, Any] = {}


class LegacyTrafficLawAnalysisRequest(BaseModel):
    stats: dict[str, Any] = {}
    violations: list[dict[str, Any] | str] = []
    accidents: list[dict[str, Any]] = []


app = FastAPI(
    title="TraffixAI Backend",
    version="2.0.0",
    description="Traffic monitoring backend with Firebase auth, MongoDB storage, and AI detection pipeline.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = BACKEND_DIR
PROJECT_ROOT = BASE_DIR.parent
UPLOAD_DIR = BASE_DIR / "uploads"
PROCESSED_DIR = BASE_DIR / "processed"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
app.mount("/processed", StaticFiles(directory=str(PROCESSED_DIR)), name="processed")

AUTHORITY_EMAIL = os.getenv("AUTHORITY_EMAIL", "aadidevj4047@gmail.com")

mongo_uri = os.getenv("MONGODB_URI")
if not mongo_uri:
    raise RuntimeError("MONGODB_URI is required. Set your MongoDB Atlas connection string in backend/.env")
mongo_client = MongoClient(mongo_uri)


def _resolve_mongo_db_name(client: MongoClient, configured_name: str) -> str:
    """Prefer existing DB casing when Atlas already has the same name with different case."""
    name = (configured_name or "traffixai").strip()
    if not name:
        return "traffixai"
    try:
        existing_names = client.list_database_names()
    except Exception:
        return name
    lowered = name.lower()
    for existing in existing_names:
        if existing.lower() == lowered:
            return existing
    return name


mongo_db_name = _resolve_mongo_db_name(mongo_client, os.getenv("MONGODB_DB", "traffixai"))
mongo_db = mongo_client[mongo_db_name]
users_col: Collection = mongo_db["users"]
uploads_col: Collection = mongo_db["uploads"]
stats_col: Collection = mongo_db["system_stats"]
alerts_col: Collection = mongo_db["alerts"]

if not stats_col.find_one({"_id": "global"}):
    stats_col.insert_one(
        {
            "_id": "global",
            "total_users": 0,
            "total_uploads": 0,
            "total_accidents": 0,
            "total_violations": 0,
            "updated_at": now_iso(),
        }
    )

if not firebase_admin._apps:
    cred_path = os.getenv(
        "FIREBASE_CREDENTIALS_PATH",
        str(Path(__file__).resolve().parent.parent / "firebase" / "serviceAccountKey.json"),
    )
    if Path(cred_path).exists():
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)

# ── TrafficMonitor (replaces old YOLODetector + tracker + velocity + RuleEngine) ──
def _resolve_model_path() -> str:
    explicit = os.getenv("YOLO_MODEL_PATH") or os.getenv("YOLO_WEIGHTS_PATH")
    if explicit and Path(explicit).exists():
        return explicit

    # Prefer a general detector by default; accident-only models are too narrow
    # for full traffic analytics (vehicles/persons/violations).
    candidates = [
        BASE_DIR / "models" / "yolov8n.pt",
        BASE_DIR / "models" / "accident_model.pt",
        PROJECT_ROOT / "traffic_models" / "yolov8n.pt",
        PROJECT_ROOT / "traffic_models" / "YOLO-Weights" / "best-versi-1.pt",
        PROJECT_ROOT / "traffic_models" / "YOLO-Weights" / "yolov8m-dataset-7000-300.pt",
        PROJECT_ROOT / "traffic_models" / "YOLO-Weights" / "yolov8s-100.pt",
        PROJECT_ROOT / "traffic" / "yolov8n.pt",
        PROJECT_ROOT / "traffic" / "YOLO-Weights" / "best-versi-1.pt",
        PROJECT_ROOT / "traffic" / "YOLO-Weights" / "yolov8m-dataset-7000-300.pt",
        PROJECT_ROOT / "traffic" / "YOLO-Weights" / "yolov8s-100.pt",
        PROJECT_ROOT / "yolov8n.pt",
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)
    # Last fallback
    return str(BASE_DIR / "models" / "accident_model.pt")


_model_path = _resolve_model_path()
monitor = TrafficMonitor(
    model_path=_model_path,
    conf_threshold=float(os.getenv("CONF_THRESHOLD", "0.25")),
)
llm_judge = LLMJudge()
legacy_video_store: dict[str, str] = {}
_law_corpus_cache: list[dict[str, Any]] | None = None


# ── helpers ──────────────────────────────────────────────────────────────────────

def _increment_stats(*, uploads: int = 0, accidents: int = 0, violations: int = 0, users: int = 0) -> None:
    stats_col.update_one(
        {"_id": "global"},
        {
            "$inc": {
                "total_uploads": uploads,
                "total_accidents": accidents,
                "total_violations": violations,
                "total_users": users,
            },
            "$set": {"updated_at": now_iso()},
        },
    )


def _risk_score(violations: int, accidents: int, density: int) -> dict[str, Any]:
    score = min(100, int((violations * 6) + (accidents * 30) + (density * 0.15)))
    if score >= 70:
        level = "high"
    elif score >= 35:
        level = "medium"
    else:
        level = "low"
    return {"score": score, "level": level}


VIOLATION_FINE_MAP: dict[str, dict[str, str]] = {
    "No Helmet": {
        "fine": "INR 1,000 (1st offence); INR 2,000 + 3-month licence suspension (repeat)",
        "law": "MV Act Section 129 & 194D",
        "ipc": "IPC Section 304A (if accident caused) — Culpable homicide not amounting to murder",
        "jail": "Up to 2 years imprisonment if accident results in death; 6 months for repeat offence",
        "consequence": "Licence suspended for 3 months on repeat. If accident occurs without helmet, rider is held contributorily negligent reducing insurance claim.",
    },
    "Speeding": {
        "fine": "INR 1,000–2,000; INR 4,000 for LMV/HMV",
        "law": "MV Act Section 183",
        "ipc": "IPC Section 304A — Causing death by negligence; IPC Section 279 — Rash driving",
        "jail": "IPC 279: Up to 6 months OR fine up to INR 1,000 or both. IPC 304A: Up to 2 years if death results",
        "consequence": "Community service order possible. Repeated speeding leads to permanent licence cancellation under Section 19 MV Act.",
    },
    "Wrong Way": {
        "fine": "INR 5,000",
        "law": "MV Act Section 177 & 184",
        "ipc": "IPC Section 279 (rash driving) & IPC Section 338 (grievous hurt by act endangering life)",
        "jail": "IPC 338: Up to 2 years + fine. IPC 279: Up to 6 months + fine",
        "consequence": "Vehicle may be impounded for 30 days. Licence suspended pending court ruling under dangerous driving provisions.",
    },
    "Signal Jump": {
        "fine": "INR 1,000–5,000",
        "law": "MV Act Section 119 & 177",
        "ipc": "IPC Section 279 — Rash driving on public way; IPC Section 304A if death occurs",
        "jail": "Up to 6 months + fine (IPC 279). Up to 2 years (IPC 304A if death results)",
        "consequence": "Court summons issued. Insurance invalidated during accident if signal-jump proven.",
    },
    "No Seatbelt": {
        "fine": "INR 1,000",
        "law": "MV Act Section 194B",
        "ipc": "IPC Section 304A read with 304 if recklessness proven in accident context",
        "jail": "No direct imprisonment for offence itself; 2 years if recklessness contributes to death",
        "consequence": "Contributory negligence in accident reduces insurance payout. Repeat offenders face challan and court appearance.",
    },
    "Excess Riders": {
        "fine": "INR 2,000 + INR 1,000 per additional passenger",
        "law": "MV Act Section 194C",
        "ipc": "IPC Section 304A if overloading contributes to accident causing death",
        "jail": "Up to 2 years under IPC 304A if accident with fatality",
        "consequence": "Vehicle impounded. Driver licence suspended. Passenger also liable for abetment.",
    },
    "Lane Change": {
        "fine": "INR 500–1,000",
        "law": "MV Act Section 177",
        "ipc": "IPC Section 279 for rash lane cutting; IPC 338 for causing grievous hurt",
        "jail": "Up to 6 months (IPC 279) or 2 years (IPC 338)",
        "consequence": "Repeated lane violations result in defensive driving course mandate by court.",
    },
    "Jaywalking": {
        "fine": "INR 100–500",
        "law": "State Traffic Rules & IPC Section 283",
        "ipc": "IPC Section 283 — Danger or obstruction in public way",
        "jail": "Fine of INR 200 or up to 1 month simple imprisonment under IPC 283",
        "consequence": "Police warning slip issued. Repeat pedestrian offences may lead to community service.",
    },
    "Tailgating": {
        "fine": "INR 1,000",
        "law": "MV Act Section 184",
        "ipc": "IPC Section 279 — Rash or negligent driving",
        "jail": "Up to 6 months + fine under IPC 279; Up to 2 years under IPC 304A if death results",
        "consequence": "Considered dangerous driving. Licence liable for suspension on repeat.",
    },
    "Red Light": {
        "fine": "INR 1,000–5,000",
        "law": "MV Act Section 119 & 177",
        "ipc": "IPC Section 279 & 304A if accident caused",
        "jail": "6 months to 2 years depending on consequences of the violation",
        "consequence": "Traffic camera evidence used in court. Insurance company can deny claims for red-light violations.",
    },
    "Illegal U-Turn": {
        "fine": "INR 500–1,000",
        "law": "MV Act Section 177",
        "ipc": "IPC Section 279 if rash / endangering others",
        "jail": "Up to 6 months + fine (IPC 279)",
        "consequence": "Challan recorded on digital VAHAN portal. Repeated violations flagged for enforcement action.",
    },
    "Stopped Vehicle": {
        "fine": "INR 500",
        "law": "MV Act Section 122 & 177",
        "ipc": "IPC Section 283 — Danger or obstruction on public road",
        "jail": "Up to 1 month simple imprisonment + fine under IPC 283",
        "consequence": "Towing charges applied. Vehicle held until fine paid at nearest traffic station.",
    },
}

class SendEmergencyRequest(BaseModel):
    location: str
    severity: str
    reportId: str | None = None


def _build_violation_judgment(violation_types: list[dict[str, Any]]) -> list[dict[str, Any]]:
    enriched: list[dict[str, Any]] = []
    for item in violation_types or []:
        label = str(item.get("label", "Unknown"))
        fine_meta = VIOLATION_FINE_MAP.get(label, {
            "fine": "As per local authority",
            "law": "Traffic Regulation",
            "ipc": "Applicable IPC provisions based on outcome",
            "jail": "As determined by court",
            "consequence": "Vehicle may be impounded and licence suspended pending investigation.",
        })
        enriched.append(
            {
                "label": label,
                "count": int(item.get("count", 0)),
                "fine": fine_meta.get("fine", "As per authority"),
                "law": fine_meta.get("law", "Traffic Regulation"),
                "ipc": fine_meta.get("ipc", "Applicable IPC provisions"),
                "jail": fine_meta.get("jail", "As determined by court"),
                "consequence": fine_meta.get("consequence", "Subject to court ruling."),
            }
        )
    return enriched


def _accident_severity(accidents: int, risk_score: int) -> str:
    if accidents <= 0:
        return "none"
    if risk_score >= 80:
        return "high"
    if risk_score >= 45:
        return "medium"
    return "low"


def _processed_media_url(processed_path: str) -> str:
    return f"/processed/{Path(processed_path).name}"


def _normalize_whatsapp_address(raw: str, *, default: str = "") -> str:
    value = (raw or default).strip()
    if not value:
        return ""
    if value.startswith("whatsapp:"):
        return value
    if value.startswith("+"):
        return f"whatsapp:{value}"
    return f"whatsapp:+{value}"


def _send_emergency_whatsapp(*, location: str, severity: str) -> dict[str, Any]:
    sid = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
    token = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
    from_whatsapp = _normalize_whatsapp_address(
        os.getenv("TWILIO_WHATSAPP_FROM", ""),
        default="whatsapp:+14155238886",
    )
    to_whatsapp = _normalize_whatsapp_address(
        os.getenv("EMERGENCY_WHATSAPP_TO", ""),
        default="",
    )
    if not sid or not token or TwilioClient is None:
        return {"sent": False, "reason": "twilio_not_configured"}
    if not from_whatsapp:
        return {"sent": False, "reason": "missing_twilio_whatsapp_from"}
    if not to_whatsapp:
        return {"sent": False, "reason": "missing_emergency_whatsapp_to"}

    body = (
        "TraffixAI Emergency Alert\n"
        f"Accident severity: {severity.upper()}\n"
        f"Location: {location}\n"
        "Immediate assistance requested."
    )
    try:
        client = TwilioClient(sid, token)
        msg = client.messages.create(
            from_=from_whatsapp,
            to=to_whatsapp,
            body=body,
        )
        return {"sent": True, "sid": msg.sid, "to": to_whatsapp}
    except TwilioException as exc:
        return {
            "sent": False,
            "reason": str(exc),
            "from": from_whatsapp,
            "to": to_whatsapp,
        }
    except Exception as exc:
        return {
            "sent": False,
            "reason": f"{type(exc).__name__}: {exc}",
            "from": from_whatsapp,
            "to": to_whatsapp,
        }


async def _safe_run_llm_judge(
    *,
    media_type: str,
    location: str,
    detection: dict[str, Any],
    timeout_seconds: float = 8.0,
) -> dict[str, Any]:
    try:
        return await asyncio.wait_for(
            llm_judge.judge_upload(
                media_type=media_type,
                location=location,
                detection=detection,
            ),
            timeout=timeout_seconds,
        )
    except Exception:
        return {
            "enabled": llm_judge.enabled,
            "status": "timeout_or_error",
            "model": getattr(llm_judge, "cloudflare_llm_model", "unknown"),
            "verdict": "needs_review",
            "confidence": 0.0,
            "summary": "LLM judge timed out. Using detection fallback.",
            "recommended_action": "send_to_admin",
        }


async def _safe_send_emergency_whatsapp(
    *,
    location: str,
    severity: str,
    timeout_seconds: float = 6.0,
) -> dict[str, Any]:
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(_send_emergency_whatsapp, location=location, severity=severity),
            timeout=timeout_seconds,
        )
    except Exception:
        return {"sent": False, "reason": "timeout_or_error"}


def _send_email_alert(*, recipients: list[str], subject: str, body: str) -> None:
    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_password = os.getenv("SMTP_PASSWORD", "")
    from_email = os.getenv("ALERT_FROM_EMAIL", smtp_user or "noreply@traffixai.local")

    if not smtp_user or not smtp_password:
        raise HTTPException(
            status_code=500,
            detail="SMTP is not configured. Set SMTP_USER and SMTP_PASSWORD in backend environment.",
        )

    msg = EmailMessage()
    msg["From"] = from_email
    msg["To"] = ", ".join(recipients)
    msg["Subject"] = subject
    msg.set_content(body)

    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=30) as server:
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.send_message(msg)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to send distress email: {exc}") from exc


def _queue_alert(
    *,
    payload: AlertRequest,
    recipients: list[str],
    status: str,
    error: str | None = None,
) -> None:
    alerts_col.insert_one(
        {
            "incident_type": payload.incident_type,
            "location": payload.location,
            "severity": payload.severity,
            "contacts": payload.contacts,
            "message": payload.message,
            "recipients": recipients,
            "status": status,
            "error": error,
            "created_at": now_iso(),
        }
    )


def _tokenize_location(raw: str) -> set[str]:
    stop_words = {
        "road", "rd", "street", "st", "avenue", "ave", "junction", "signal", "near",
        "the", "and", "to", "from", "at", "in", "of", "for", "city", "area",
    }
    tokens = {
        t
        for t in re.findall(r"[a-z0-9]+", (raw or "").lower())
        if len(t) >= 3 and t not in stop_words
    }
    return tokens


def _normalize_location(raw: str | None) -> str:
    value = (raw or "").strip()
    return value if value else "Unknown"


def _mode_label(mode: RouteMode) -> str:
    labels = {
        "driving": "Car / Taxi",
        "walking": "Walking",
        "bicycling": "Cycle",
        "transit": "Public Transit",
        "two_wheeler": "Two-Wheeler",
    }
    return labels.get(mode, "Car / Taxi")


def _mode_speed_advice(mode: RouteMode) -> str:
    speeds = {
        "driving": "Keep speed in the posted limit (typically 30-60 km/h in city zones).",
        "walking": "Use sidewalks and crossings; avoid high-speed carriageways.",
        "bicycling": "Maintain controlled pace (~15-25 km/h) and keep left where required.",
        "transit": "Plan for transfer buffer time; avoid unsafe boarding points.",
        "two_wheeler": "Maintain 30-50 km/h in city roads, wear helmet, avoid blind-spot riding.",
    }
    return speeds.get(mode, speeds["driving"])


def _google_maps_directions_link(origin: str, destination: str, mode: str) -> str:
    travel_mode = "driving" if mode == "two_wheeler" else mode
    return (
        "https://www.google.com/maps/dir/?api=1"
        f"&origin={quote_plus(origin)}"
        f"&destination={quote_plus(destination)}"
        f"&travelmode={quote_plus(travel_mode)}"
    )


def _get_token_from_auth(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Invalid auth header")
    return authorization.split(" ", 1)[1].strip()


def get_current_user(
    authorization: str | None = Header(default=None),
    x_local_admin: str | None = Header(default=None, alias="X-Local-Admin"),
) -> dict[str, Any]:
    # Local admin mode used by frontend admin-login bypass.
    if (x_local_admin or "").strip().lower() == "true":
        return {"uid": "local-admin", "email": "admin@traffixai.local", "role": "Admin"}

    if not firebase_admin._apps:
        return {"uid": "local-dev", "email": "local@traffixai.dev", "role": "Admin"}
    token = _get_token_from_auth(authorization)
    try:
        decoded = firebase_auth.verify_id_token(token)
    except Exception as exc:
        raise HTTPException(status_code=401, detail=f"Invalid Firebase token: {exc}") from exc

    user = users_col.find_one({"firebase_uid": decoded["uid"]})
    role = user.get("role", "User") if user else "User"
    return {"uid": decoded["uid"], "email": decoded.get("email"), "role": role}


def get_optional_user(
    authorization: str | None = Header(default=None),
    x_local_admin: str | None = Header(default=None, alias="X-Local-Admin"),
) -> dict[str, Any]:
    if not authorization and not x_local_admin:
        return {"uid": "anonymous", "email": "guest@traffixai.local", "role": "User"}
    return get_current_user(authorization=authorization, x_local_admin=x_local_admin)


def require_admin(user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    if user.get("role") != "Admin":
        raise HTTPException(status_code=403, detail="Admin route")
    return user


def _box_to_detection_box(d: dict[str, Any]) -> dict[str, Any]:
    """Convert a TrafficMonitor detection dict to the API detection_box format."""
    x1, y1, x2, y2 = _safe_box_coords(d.get("box"))
    label = d["class"]
    confidence = d.get("confidence", 0.0)
    color = "#2dd4a0" if label != "person" else "#10b981"
    category = "pedestrian" if label == "person" else "vehicle"
    return {
        "x1": x1,
        "y1": y1,
        "x2": x2,
        "y2": y2,
        "label": label,
        "confidence": confidence,
        "risk_score": 0.0,
        "color": color,
        "category": category,
    }


def _violation_box_to_detection_box(v: dict[str, Any]) -> dict[str, Any]:
    """Convert a TrafficMonitor violation dict to the API detection_box format."""
    x1, y1, x2, y2 = _safe_box_coords(v.get("box"))
    label = v.get("type", "violation").replace("_", " ").title()
    return {
        "x1": x1,
        "y1": y1,
        "x2": x2,
        "y2": y2,
        "label": label,
        "confidence": 1.0,
        "risk_score": 1.0,
        "color": "#e87830",
        "category": "violation",
    }


def _accident_box_to_detection_box(a: dict[str, Any]) -> dict[str, Any]:
    """Convert a TrafficMonitor accident dict to the API detection_box format."""
    x1, y1, x2, y2 = _safe_box_coords(a.get("location"))
    return {
        "x1": x1,
        "y1": y1,
        "x2": x2,
        "y2": y2,
        "label": "Accident",
        "confidence": float(a.get("confidence", 1.0)),
        "risk_score": 1.0,
        "color": "#ef4444",
        "category": "accident",
    }


def _monitor_results_to_stats(results: dict[str, Any]) -> dict[str, Any]:
    """Normalise TrafficMonitor output to the stats dict used throughout this API."""
    results = results or {}
    stats = results.get("stats", {}) if isinstance(results.get("stats", {}), dict) else {}
    violations_list: list[dict] = [v for v in (results.get("violations", []) or []) if isinstance(v, dict)]
    accidents_list: list[dict] = [a for a in (results.get("accidents", []) or []) if isinstance(a, dict)]
    detections: list[dict] = [d for d in (results.get("detections", []) or []) if isinstance(d, dict)]

    violation_type_counter: Counter[str] = Counter(str(v.get("type", "unknown")) for v in violations_list)
    violation_types = [
        {"label": vtype.replace("_", " ").title(), "count": cnt}
        for vtype, cnt in violation_type_counter.items()
    ]

    # Build objects list from detection classes
    objects_counter: Counter[str] = Counter(str(d.get("class", "unknown")) for d in detections)
    avg_conf = (
        sum(d.get("confidence", 0.0) for d in detections) / max(len(detections), 1)
        if detections
        else 0.0
    )
    objects = [
        {"class": cls, "count": cnt, "confidence": round(avg_conf, 3)}
        for cls, cnt in objects_counter.items()
    ]

    vehicles = stats.get("total_vehicles", 0)
    pedestrians = stats.get("total_persons", 0)
    num_violations = len(violations_list)
    num_accidents = len(accidents_list)
    density_score = min(100, int((vehicles * 2.0) + (pedestrians * 1.3)))

    # detection_boxes: vehicles/persons, then violations, then accidents
    detection_boxes: list[dict] = []
    for d in detections:
        detection_boxes.append(_box_to_detection_box(d))
    for v in violations_list:
        detection_boxes.append(_violation_box_to_detection_box(v))
    for a in accidents_list:
        detection_boxes.append(_accident_box_to_detection_box(a))

    # events: flat list for API consumers
    events: list[dict] = list(violations_list) + [
        {"type": "accident", **a} for a in accidents_list
    ]

    violation_tags = [str(v.get("type", "unknown")) for v in violations_list]

    return {
        "vehicles": vehicles,
        "pedestrians": pedestrians,
        "accidents": num_accidents,
        "violations": num_violations,
        "violation_tags": violation_tags,
        "violation_types": violation_types,
        "detection_boxes": detection_boxes,
        "confidence": round(avg_conf, 3),
        "objects": objects,
        "density_score": density_score,
        # Extra monitor-specific keys
        "events": events,
        "vehicle_count": vehicles,
    }


# ── Core analysis functions ───────────────────────────────────────────────────────

def analyze_frame(frame: np.ndarray, *, is_static_image: bool = False) -> tuple[np.ndarray, dict[str, Any]]:
    """Run TrafficMonitor on a single frame and return (annotated_frame, stats)."""
    try:
        results = monitor.process_frame(frame, is_static_image=is_static_image) or {}
        stats = _monitor_results_to_stats(results)
        try:
            annotated = monitor.draw_results(frame.copy(), results)
        except Exception:
            annotated = frame.copy()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {exc}") from exc
    return annotated, stats


def _frame_to_base64(frame: np.ndarray) -> str:
    ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
    if not ok:
        return ""
    return "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode()


def _frame_to_base64_raw(frame: np.ndarray) -> str:
    ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
    if not ok:
        return ""
    return base64.b64encode(buf.tobytes()).decode()


def _legacy_stats_from_detection(detection: dict[str, Any]) -> dict[str, Any]:
    by_class: dict[str, int] = {}
    bike_count = 0
    for obj in detection.get("objects", []):
        cls = str(obj.get("class", "unknown"))
        cnt = int(obj.get("count", 0))
        if cnt <= 0:
            continue
        by_class[cls] = by_class.get(cls, 0) + cnt
        if cls in {"bicycle", "motorcycle", "bike"}:
            bike_count += cnt

    return {
        "total_vehicles": int(detection.get("vehicles", 0)),
        "total_persons": int(detection.get("pedestrians", 0)),
        "total_bikes": bike_count,
        "traffic_lights": int(by_class.get("traffic light", 0)),
        "violations": int(detection.get("violations", 0)),
        "accidents": int(detection.get("accidents", 0)),
        "risk_score": int(detection.get("risk_score", 0)),
        "by_class": by_class,
    }


def _legacy_event_lists(detection: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    events = detection.get("events", []) or []
    violations: list[dict[str, Any]] = []
    accidents: list[dict[str, Any]] = []
    for event in events:
        if not isinstance(event, dict):
            continue
        if str(event.get("type", "")).lower() == "accident":
            accidents.append(event)
        else:
            violations.append(event)
    return violations, accidents


def _traffic_law_file() -> Path:
    candidates = [
        PROJECT_ROOT / "traffic" / "traffic_rag" / "indian-traffic-laws.json",
        PROJECT_ROOT / "data" / "indian-traffic-laws.json",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    raise FileNotFoundError("Indian traffic law corpus not found")


def _load_traffic_law_corpus() -> list[dict[str, Any]]:
    global _law_corpus_cache
    if _law_corpus_cache is not None:
        return _law_corpus_cache
    try:
        with _traffic_law_file().open("r", encoding="utf-8") as fp:
            rows = json.load(fp)
    except Exception:
        rows = []

    corpus: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        searchable = " ".join(
            [
                str(row.get("id", "")),
                str(row.get("section", "")),
                str(row.get("title", "")),
                str(row.get("text", "")),
            ]
        )
        corpus.append(
            {
                **row,
                "_search": searchable.lower(),
            }
        )
    _law_corpus_cache = corpus
    return corpus


def _law_lookup() -> dict[str, dict[str, Any]]:
    return {str(item.get("id", "")): item for item in _load_traffic_law_corpus() if item.get("id")}


def _violation_key(label: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", label.strip().lower()).strip("_")


def _cloudflare_llama_ready() -> bool:
    return bool(
        getattr(llm_judge, "cloudflare_account_id", "").strip()
        and getattr(llm_judge, "cloudflare_api_token", "").strip()
    )


async def _call_cloudflare_llama_text(
    *,
    prompt: str,
    system_prompt: str | None = None,
    max_tokens: int = 600,
    temperature: float = 0.2,
) -> str:
    account_id = getattr(llm_judge, "cloudflare_account_id", "").strip()
    token = getattr(llm_judge, "cloudflare_api_token", "").strip()
    model = getattr(llm_judge, "cloudflare_llm_model", "@cf/meta/llama-3.1-8b-instruct")
    if not account_id or not token:
        raise RuntimeError("cloudflare_credentials_missing")

    url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{model}"
    messages: list[dict[str, str]] = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})
    payload = {
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=90.0) as client:
        resp = await client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
    text = str(data.get("result", {}).get("response", "")).strip()
    if not text:
        raise RuntimeError("empty_llama_response")
    return text


def process_image(path: Path) -> dict[str, Any]:
    frame = cv2.imread(str(path))
    if frame is None:
        raise HTTPException(status_code=400, detail="Invalid image file")
    monitor.reset_state()
    annotated, frame_stats = analyze_frame(frame, is_static_image=True)
    out_name = f"processed_{path.stem}_{uuid.uuid4().hex[:8]}.jpg"
    out_path = PROCESSED_DIR / out_name
    cv2.imwrite(str(out_path), annotated)
    frame_stats["annotated_image"] = _frame_to_base64(annotated)
    frame_stats["processed_path"] = str(out_path)
    frame_stats["frames_analyzed"] = 1
    frame_stats["total_frames"] = 1
    return frame_stats


def process_video(path: Path) -> dict[str, Any]:
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise HTTPException(status_code=400, detail="Invalid video file")
    monitor.reset_state()

    fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
    target_analysis_fps = float(os.getenv("ANALYSIS_TARGET_FPS", "20.0"))
    frame_interval = max(1, int(round(fps / max(target_analysis_fps, 0.1))))
    sample_fps = round((fps / frame_interval), 2) if frame_interval > 0 else 0.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    duration_seconds = (total_frames / fps) if fps and fps > 0 else 0.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 1280)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 720)
    output_path = PROCESSED_DIR / f"processed_{path.stem}_{uuid.uuid4().hex[:8]}.mp4"
    codec_candidates = ("mp4v", "avc1", "XVID", "MJPG")
    writer = None
    for codec in codec_candidates:
        candidate = cv2.VideoWriter(
            str(output_path),
            cv2.VideoWriter_fourcc(*codec),
            fps if fps > 0 else 24.0,
            (width, height),
        )
        if candidate.isOpened():
            writer = candidate
            break
        candidate.release()
    if writer is None:
        cap.release()
        raise HTTPException(status_code=500, detail="Could not initialize video writer")

    frame_idx = 0
    analyzed = 0
    accum = defaultdict(float)
    collected_tags: list[str] = []
    collected_violations: list[dict] = []
    collected_events: list[dict] = []
    collected_objects: Counter[str] = Counter()
    preview_frames_enabled = os.getenv("VIDEO_PREVIEW_FRAMES_ENABLED", "0").strip().lower() in {"1", "true", "yes"}
    annotated_frames: list[str] = []
    max_preview_frames = int(os.getenv("VIDEO_PREVIEW_MAX_FRAMES", "8"))
    last_preview_second = -1
    last_annotated: np.ndarray | None = None
    last_boxes: list[dict[str, Any]] = []

    while True:
        ok, frame = cap.read()
        if not ok:
            break

        if frame_idx % frame_interval == 0:
            try:
                annotated, stats = analyze_frame(frame.copy())
            except HTTPException:
                # Continue processing remaining frames when one frame fails.
                frame_idx += 1
                writer.write(frame)
                continue
            analyzed += 1
            accum["vehicles"] += stats["vehicles"]
            accum["pedestrians"] += stats["pedestrians"]
            accum["accidents"] += stats["accidents"]
            accum["violations"] += stats["violations"]
            accum["confidence"] += stats["confidence"]
            accum["density_score"] += stats["density_score"]
            collected_tags.extend(stats["violation_tags"])
            collected_violations.extend([
                b for b in stats["detection_boxes"] if b["category"] == "violation"
            ])
            collected_events.extend(stats.get("events", []))
            last_boxes = stats["detection_boxes"]
            for obj in stats["objects"]:
                collected_objects[obj["class"]] += int(obj["count"])
            last_annotated = annotated

            if preview_frames_enabled and max_preview_frames > 0:
                current_second = int(frame_idx / max(fps, 1.0))
                if (
                    len(annotated_frames) < max_preview_frames
                    and current_second != last_preview_second
                ):
                    annotated_frames.append(_frame_to_base64(annotated))
                    last_preview_second = current_second
            writer.write(annotated)
        else:
            writer.write(frame)

        frame_idx += 1

    cap.release()
    writer.release()

    if analyzed == 0:
        raise HTTPException(status_code=400, detail="No frames analyzed from video")

    avg_conf = accum["confidence"] / analyzed
    avg_density = accum["density_score"] / analyzed

    # Deduplicate violation types across frames
    vtype_counter: Counter[str] = Counter(t for t in collected_tags)
    violation_types = [
        {"label": vtype.replace("_", " ").title(), "count": cnt}
        for vtype, cnt in vtype_counter.items()
    ]

    agg = {
        "vehicles": int(accum["vehicles"]),
        "pedestrians": int(accum["pedestrians"]),
        "accidents": int(accum["accidents"]),
        "violations": int(accum["violations"]),
        "violation_tags": collected_tags,
        "violation_types": violation_types,
        "detection_boxes": last_boxes,
        "confidence": round(avg_conf, 3),
        "objects": [
            {"class": k, "count": v, "confidence": round(avg_conf, 3)}
            for k, v in collected_objects.items()
        ],
        "density_score": round(avg_density, 2),
        "frames_analyzed": analyzed,
        "total_frames": total_frames,
        "duration_seconds": round(duration_seconds, 2),
        "analysis_sample_fps": sample_fps,
        "processed_path": str(output_path),
        "events": collected_events,
        "vehicle_count": int(accum["vehicles"]),
    }
    if preview_frames_enabled and annotated_frames:
        agg["annotated_frames"] = annotated_frames
    if last_annotated is not None:
        agg["annotated_image"] = _frame_to_base64(last_annotated)
    return agg


def _store_upload(
    *,
    user_uid: str,
    media_type: str,
    video_path: str,
    processed_video: str,
    location: str,
    date: str,
    time_str: str,
    description: str,
    detection: dict[str, Any],
    sent_to_admin: bool = False,
    llm_judge: dict[str, Any] | None = None,
    judge: dict[str, Any] | None = None,
) -> str:
    normalized_location = _normalize_location(location)
    violation_type = ", ".join(sorted(set(v["label"] for v in detection.get("violation_types", []))))
    doc = {
        "user_id": user_uid,
        "media_type": media_type,
        "video_path": video_path,
        "processed_video": processed_video,
        "location": normalized_location,
        "date": date,
        "time": time_str,
        "description": description,
        "accident_detected": detection.get("accidents", 0) > 0,
        "violation_type": violation_type,
        "density_score": detection.get("density_score", 0),
        "timestamp": now_iso(),
        "status": "pending",
        "sentToAdmin": sent_to_admin,
        "incidentType": (
            "Accident"
            if detection.get("accidents", 0) > 0
            else ("Violation" if detection.get("violations", 0) > 0 else "Monitoring")
        ),
        "detection": {
            "vehicles": detection.get("vehicles", 0),
            "pedestrians": detection.get("pedestrians", 0),
            "accidents": detection.get("accidents", 0),
            "violations": detection.get("violations", 0),
            "risk_score": _risk_score(
                detection.get("violations", 0),
                detection.get("accidents", 0),
                detection.get("density_score", 0),
            )["score"],
            "violation_types": detection.get("violation_types", []),
            "detection_boxes": detection.get("detection_boxes", []),
            "objects": detection.get("objects", []),
            "confidence": detection.get("confidence", 0.0),
            "frames_analyzed": detection.get("frames_analyzed", 1),
            "total_frames": detection.get("total_frames", 1),
            "duration_seconds": detection.get("duration_seconds", 0.0),
            "analysis_sample_fps": detection.get("analysis_sample_fps", 0.0),
            "events": detection.get("events", []),
        },
        # Store judge and LLM verdict for admin retrieval
        "judge": judge or {},
        "llm_judge": llm_judge or {},
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    doc = _sanitize_for_mongo(doc)
    try:
        result = uploads_col.insert_one(doc)
    except InvalidDocument:
        # Last-resort cleanup for nested non-serializable values from model output.
        doc = _sanitize_for_mongo(json.loads(json.dumps(doc, default=str)))
        result = uploads_col.insert_one(doc)
    _increment_stats(
        uploads=1,
        accidents=int(detection.get("accidents", 0)),
        violations=int(detection.get("violations", 0)),
    )
    return str(result.inserted_id)


def _report_to_result_payload(row: dict[str, Any]) -> dict[str, Any]:
    detection = row.get("detection", {}) or {}
    processed = row.get("processed_video", "") or row.get("video_path", "")
    processed_url = ""
    if processed:
        processed_url = processed if str(processed).startswith("/processed/") else _processed_media_url(str(processed))

    return {
        "id": str(row.get("_id")),
        "media_type": row.get("media_type", "image"),
        "vehicles": int(detection.get("vehicles", 0)),
        "pedestrians": int(detection.get("pedestrians", 0)),
        "violations": int(detection.get("violations", 0)),
        "accidents": int(detection.get("accidents", 0)),
        "risk_score": int(detection.get("risk_score", 0)),
        "location": row.get("location", "Unknown"),
        "violation_types": detection.get("violation_types", []),
        "frames_analyzed": int(detection.get("frames_analyzed", 0) or 0),
        "total_frames": int(detection.get("total_frames", 0) or 0),
        "duration_seconds": float(detection.get("duration_seconds", 0) or 0),
        "analysis_sample_fps": float(detection.get("analysis_sample_fps", 0) or 0),
        "events": detection.get("events", []),
        "detection_boxes": detection.get("detection_boxes", []),
        "objects": detection.get("objects", []),
        "annotated_image": detection.get("annotated_image", ""),
        "annotated_frames": detection.get("annotated_frames", []),
        "confidence": float(detection.get("confidence", 0) or 0),
        "processed_media_url": processed_url,
        "llm_judge": row.get("llm_judge", {}) or {},
        "judge": row.get("judge", {}) or {},
        "analyzed_at": row.get("timestamp") or row.get("created_at") or now_iso(),
    }


# ── Routes ────────────────────────────────────────────────────────────────────────

@app.get("/")
def root() -> dict[str, Any]:
    return {"status": "ok", "service": "TraffixAI", "timestamp": now_iso()}


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "healthy",
        "firebase_initialized": bool(firebase_admin._apps),
        "mongo": "connected",
        "monitor_loaded": monitor.model is not None,
        "model_path": _model_path,
        "authority_email": AUTHORITY_EMAIL,
    }


@app.post("/auth/sync-user")
def sync_user(payload: AuthSyncRequest, user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    uid = user["uid"]
    existing = users_col.find_one({"firebase_uid": uid})
    if existing:
        users_col.update_one(
            {"firebase_uid": uid},
            {"$set": {"name": payload.name, "email": payload.email or user.get("email"), "updated_at": now_iso()}},
        )
    else:
        users_col.insert_one(
            {
                "firebase_uid": uid,
                "name": payload.name,
                "email": payload.email or user.get("email"),
                "role": "User",
                "created_at": now_iso(),
                "updated_at": now_iso(),
            }
        )
        _increment_stats(users=1)

    final = users_col.find_one({"firebase_uid": uid})
    return {"user": serialize_id(final or {})}


@app.post("/upload-image")
async def upload_image(
    file: UploadFile = File(...),
    location: str = Form("Unknown"),
    date: str = Form(""),
    time_str: str = Form("", alias="time"),
    description: str = Form(""),
    user_id: str = Form(""),
    user: dict[str, Any] = Depends(get_optional_user),
) -> dict[str, Any]:
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    content = await file.read()
    ext = Path(file.filename or "upload.jpg").suffix or ".jpg"
    src_path = UPLOAD_DIR / f"{uuid.uuid4().hex}{ext}"
    src_path.write_bytes(content)
    analysis = process_image(src_path)
    risk = _risk_score(analysis["violations"], analysis["accidents"], int(analysis["density_score"]))
    analysis["risk_score"] = risk["score"]
    analysis["risk_level"] = risk["level"]
    analysis["llm_judge"] = await _safe_run_llm_judge(
        media_type="image",
        location=_normalize_location(location),
        detection=analysis,
    )
    normalized_location = _normalize_location(location)
    violation_judgment = _build_violation_judgment(analysis.get("violation_types", []))
    severity = _accident_severity(int(analysis.get("accidents", 0)), int(analysis.get("risk_score", 0)))
    send_to_admin = severity in {"low", "medium"} or severity == "none"
    emergency_result = None
    if severity == "high":
        emergency_result = await _safe_send_emergency_whatsapp(location=normalized_location, severity=severity)
        send_to_admin = True
    analysis["judge"] = {
        "accident_severity": severity,
        "violation_judgment": violation_judgment,
        "admin_forwarded": send_to_admin,
        "emergency_whatsapp": emergency_result,
    }
    analysis["processed_media_url"] = _processed_media_url(analysis["processed_path"])

    resolved_uid = user_id or user["uid"]
    upload_id = _store_upload(
        user_uid=resolved_uid,
        media_type="image",
        video_path=str(src_path),
        processed_video=analysis["processed_path"],
        location=normalized_location,
        date=date,
        time_str=time_str,
        description=description,
        detection=analysis,
        sent_to_admin=send_to_admin,
        llm_judge=analysis.get("llm_judge"),
        judge=analysis.get("judge"),
    )
    return {
        **analysis,
        "id": upload_id,
        "location": normalized_location,
        "media_type": "image",
        "analyzed_at": now_iso(),
        # Normalised response keys
        "violations": analysis["violations"],
        "vehicles": analysis["vehicles"],
        "events": analysis.get("events", []),
    }


@app.post("/upload-video")
async def upload_video(
    file: UploadFile = File(...),
    location: str = Form("Unknown"),
    date: str = Form(""),
    time_str: str = Form("", alias="time"),
    description: str = Form(""),
    user_id: str = Form(""),
    user: dict[str, Any] = Depends(get_optional_user),
) -> dict[str, Any]:
    if not (file.content_type or "").startswith("video/"):
        raise HTTPException(status_code=400, detail="File must be a video")
    content = await file.read()
    ext = Path(file.filename or "upload.mp4").suffix or ".mp4"
    src_path = UPLOAD_DIR / f"{uuid.uuid4().hex}{ext}"
    src_path.write_bytes(content)
    analysis = process_video(src_path)
    risk = _risk_score(analysis["violations"], analysis["accidents"], int(analysis["density_score"]))
    analysis["risk_score"] = risk["score"]
    analysis["risk_level"] = risk["level"]
    analysis["llm_judge"] = await _safe_run_llm_judge(
        media_type="video",
        location=_normalize_location(location),
        detection=analysis,
    )
    normalized_location = _normalize_location(location)
    violation_judgment = _build_violation_judgment(analysis.get("violation_types", []))
    severity = _accident_severity(int(analysis.get("accidents", 0)), int(analysis.get("risk_score", 0)))
    send_to_admin = severity in {"low", "medium"} or severity == "none"
    emergency_result = None
    if severity == "high":
        emergency_result = await _safe_send_emergency_whatsapp(location=normalized_location, severity=severity)
        send_to_admin = True
    analysis["judge"] = {
        "accident_severity": severity,
        "violation_judgment": violation_judgment,
        "admin_forwarded": send_to_admin,
        "emergency_whatsapp": emergency_result,
    }
    analysis["processed_media_url"] = _processed_media_url(analysis["processed_path"])

    resolved_uid = user_id or user["uid"]
    upload_id = _store_upload(
        user_uid=resolved_uid,
        media_type="video",
        video_path=str(src_path),
        processed_video=analysis["processed_path"],
        location=normalized_location,
        date=date,
        time_str=time_str,
        description=description,
        detection=analysis,
        sent_to_admin=send_to_admin,
        llm_judge=analysis.get("llm_judge"),
        judge=analysis.get("judge"),
    )
    return _sanitize_for_mongo({
        **analysis,
        "id": upload_id,
        "location": normalized_location,
        "media_type": "video",
        "analyzed_at": now_iso(),
        # Normalised response keys
        "violations": analysis["violations"],
        "vehicles": analysis["vehicles"],
        "events": analysis.get("events", []),
    })


@app.get("/reports")
def get_reports(
    limit: int = Query(default=50, le=500),
    status: str | None = None,
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    filt: dict[str, Any] = {}
    if user["role"] != "Admin":
        filt["user_id"] = user["uid"]
    if status:
        filt["status"] = status

    projection = {
        "user_id": 1,
        "media_type": 1,
        "location": 1,
        "status": 1,
        "video_path": 1,
        "processed_video": 1,
        "sentToAdmin": 1,
        "incidentType": 1,
        "created_at": 1,
        "updated_at": 1,
        "detection.vehicles": 1,
        "detection.pedestrians": 1,
        "detection.accidents": 1,
        "detection.violations": 1,
        "detection.risk_score": 1,
        "detection.confidence": 1,
        "detection.violation_types": 1,
        "detection.annotated_image": 1,
        "detection.annotated_frames": 1,
        "judge": 1,
        "llm_judge": 1,
    }
    rows = list(uploads_col.find(filt, projection).sort("created_at", -1).limit(limit))
    reports = [serialize_id(row) for row in rows]
    return {"reports": reports, "total": len(reports)}


@app.get("/analysis-result/{report_id}")
def get_analysis_result(report_id: str) -> dict[str, Any]:
    oid = parse_object_id(report_id)
    row = uploads_col.find_one({"_id": oid})
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    return _report_to_result_payload(row)


@app.patch("/reports/{report_id}")
def update_report(
    report_id: str,
    payload: ReportStatusUpdate,
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    oid = parse_object_id(report_id)
    row = uploads_col.find_one({"_id": oid})
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    if user["role"] != "Admin" and row.get("user_id") != user["uid"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    uploads_col.update_one({"_id": oid}, {"$set": {"status": payload.status, "updated_at": now_iso()}})
    return {"message": "Report updated", "status": payload.status}


@app.delete("/reports/{report_id}")
def delete_report(
    report_id: str,
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    oid = parse_object_id(report_id)
    row = uploads_col.find_one({"_id": oid})
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    if user["role"] != "Admin" and row.get("user_id") != user["uid"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    uploads_col.delete_one({"_id": oid})
    return {"message": "Report deleted"}


@app.post("/reports/forward")
def forward_report(
    payload: ForwardReportRequest,
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    if not payload.sourceReportId:
        raise HTTPException(status_code=400, detail="sourceReportId is required")
    source_oid = parse_object_id(payload.sourceReportId)
    row = uploads_col.find_one({"_id": source_oid})
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    if user["role"] != "Admin" and row.get("user_id") != user["uid"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    uploads_col.update_one(
        {"_id": source_oid},
        {"$set": {"sentToAdmin": bool(payload.sentToAdmin), "updated_at": now_iso()}},
    )
    return {"ok": True, "id": payload.sourceReportId, "sourceReportId": payload.sourceReportId}


@app.get("/admin/requests")
def get_admin_requests(
    limit: int = Query(default=200, le=1000),
    status: str | None = None,
    _: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    filt: dict[str, Any] = {"sentToAdmin": True}
    if status:
        filt["status"] = status
    projection = {
        "user_id": 1,
        "media_type": 1,
        "location": 1,
        "description": 1,
        "status": 1,
        "video_path": 1,
        "processed_video": 1,
        "sentToAdmin": 1,
        "incidentType": 1,
        "created_at": 1,
        "updated_at": 1,
        "detection.vehicles": 1,
        "detection.pedestrians": 1,
        "detection.accidents": 1,
        "detection.violations": 1,
        "detection.risk_score": 1,
        "detection.confidence": 1,
        "detection.violation_types": 1,
        "detection.annotated_image": 1,
        "detection.annotated_frames": 1,
        "judge": 1,
        "llm_judge": 1,
    }
    rows = list(uploads_col.find(filt, projection).sort("created_at", -1).limit(limit))
    requests = [serialize_id(row) for row in rows]
    return {"requests": requests, "total": len(requests)}


@app.patch("/admin/requests/{request_id}")
def update_admin_request(
    request_id: str,
    payload: AdminRequestStatusUpdate,
    admin: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    oid = parse_object_id(request_id)
    row = uploads_col.find_one({"_id": oid})
    if not row:
        raise HTTPException(status_code=404, detail="Request not found")
    uploads_col.update_one(
        {"_id": oid},
        {
            "$set": {
                "status": payload.status,
                "reviewedBy": payload.reviewedBy or admin["uid"],
                "reviewedAt": now_iso(),
                "updated_at": now_iso(),
            }
        },
    )
    return {"ok": True, "status": payload.status, "sourceReportId": request_id}


@app.get("/users")
def get_users(_: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    rows = [serialize_id(row) for row in users_col.find({}).sort("created_at", -1)]
    return {"users": rows, "total": len(rows)}


@app.patch("/admin/users/{user_id}/role")
def update_user_role(
    user_id: str,
    payload: UserRoleUpdate,
    _: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    oid = parse_object_id(user_id)
    row = users_col.find_one({"_id": oid})
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    users_col.update_one({"_id": oid}, {"$set": {"role": payload.role, "updated_at": now_iso()}})
    return {"ok": True, "role": payload.role}


@app.post("/predict-risk")
def predict_risk(payload: RiskRequest) -> dict[str, Any]:
    return _risk_score(payload.violations, payload.accidents, payload.vehicle_density)


@app.post("/send-alert")
def send_alert(payload: AlertRequest, _: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    recipients = [AUTHORITY_EMAIL]
    for email in payload.contacts:
        e = (email or "").strip()
        if e and e.lower() not in {r.lower() for r in recipients}:
            recipients.append(e)

    subject = f"[TraffixAI Distress] {payload.incident_type} | {payload.severity.upper()}"
    body = (
        "TraffixAI Distress Signal\n\n"
        f"Incident Type: {payload.incident_type}\n"
        f"Severity: {payload.severity}\n"
        f"Location: {payload.location}\n"
        f"Time (UTC): {now_iso()}\n\n"
        f"Message:\n{payload.message or 'Immediate attention required.'}\n"
    )
    fail_open = os.getenv("ALERT_FAIL_OPEN", "true").strip().lower() == "true"
    alert_status = "sent"
    email_error = None
    try:
        _send_email_alert(recipients=recipients, subject=subject, body=body)
    except HTTPException as exc:
        email_error = str(exc.detail)
        if not fail_open:
            raise
        alert_status = "queued"

    _queue_alert(
        payload=payload,
        recipients=recipients,
        status=alert_status,
        error=email_error,
    )

    return {
        "status": alert_status,
        "message": payload.message or f"{payload.incident_type} alert sent for {payload.location}",
        "alert": {
            "type": payload.incident_type,
            "location": payload.location,
            "severity": payload.severity,
            "contacts_notified": len(recipients),
            "recipients": recipients,
            "delivery_error": email_error,
            "timestamp": now_iso(),
        },
    }


@app.post("/admin/send-emergency")
async def admin_send_emergency(
    payload: SendEmergencyRequest,
    _: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    """Admin-triggered manual WhatsApp emergency alert to emergency services."""
    location = _normalize_location(payload.location)
    severity = (payload.severity or "high").strip()
    result = await _safe_send_emergency_whatsapp(location=location, severity=severity)

    # Log alert in mongo
    alerts_col.insert_one({
        "incident_type": "Admin Emergency Alert",
        "location": location,
        "severity": severity,
        "report_id": payload.reportId,
        "whatsapp": result,
        "status": "sent" if result.get("sent") else "failed",
        "created_at": now_iso(),
        "triggered_by": "admin",
    })

    return {
        "ok": result.get("sent", False),
        "whatsapp": result,
        "location": location,
        "severity": severity,
    }


@app.post("/route-safety-recommendation")
def route_safety_recommendation(
    payload: RouteSafetyRequest,
) -> dict[str, Any]:
    origin = payload.origin.strip()
    destination = payload.destination.strip()
    if not origin or not destination:
        raise HTTPException(status_code=400, detail="Origin and destination are required")

    route_tokens = _tokenize_location(f"{origin} {destination}")
    try:
        accident_rows = list(
            uploads_col.find(
                {
                    "status": "approved",
                    "sentToAdmin": True,
                    "accident_detected": True,
                    "location": {"$exists": True, "$nin": ["", "Unknown", "unknown", "N/A", "n/a"]},
                },
                {"location": 1, "created_at": 1, "detection.accidents": 1},
            )
            .sort("created_at", -1)
            .limit(500)
            .max_time_ms(5000)
        )
    except Exception:
        accident_rows = []

    matched: list[dict[str, Any]] = []
    for row in accident_rows:
        loc = str(row.get("location", "")).strip()
        if not loc:
            continue
        overlap = route_tokens & _tokenize_location(loc)
        if overlap:
            matched.append(
                {
                    "location": loc,
                    "match_terms": sorted(list(overlap)),
                    "created_at": row.get("created_at"),
                    "accidents": int(row.get("detection", {}).get("accidents", 1)),
                }
            )

    mode = payload.mode
    maps_link = _google_maps_directions_link(origin, destination, mode)
    has_accidents = len(matched) > 0
    precautions = [
        "Follow all posted speed limits and lane discipline.",
        "Avoid sudden braking, unsafe overtaking, and mobile phone use while moving.",
        "Use indicators early and maintain safe following distance.",
        "Check weather/visibility and prefer well-lit roads after dark.",
    ]
    if mode in {"driving", "two_wheeler"}:
        precautions.append("Wear seatbelt/helmet and keep emergency contacts available.")
    if mode == "walking":
        precautions.append("Use zebra crossings, footpaths, and reflective clothing at night.")
    if mode == "bicycling":
        precautions.append("Use helmet, front/rear lights, and stay visible to larger vehicles.")
    if mode == "transit":
        precautions.append("Prefer designated stops and avoid unsafe roadside boarding.")

    return {
        "origin": origin,
        "destination": destination,
        "mode": mode,
        "mode_label": _mode_label(mode),
        "maps_link": maps_link,
        "route_summary": (
            "No approved accident clusters matched this route area. Proceed with normal caution."
            if not has_accidents
            else "Approved accident records exist around this corridor. Travel with extra caution or choose alternatives."
        ),
        "speed_advice": _mode_speed_advice(mode),
        "precautions": precautions,
        "accident_check": {
            "has_accidents": has_accidents,
            "matched_count": len(matched),
            "matched_locations": matched[:8],
        },
    }


@app.get("/dashboard/stats")
def dashboard_stats(user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    filt = {"user_id": user["uid"]} if user["role"] != "Admin" else {}
    rows = list(uploads_col.find(filt))
    total_vehicles = sum(int(r.get("detection", {}).get("vehicles", 0)) for r in rows)
    total_pedestrians = sum(int(r.get("detection", {}).get("pedestrians", 0)) for r in rows)
    total_violations = sum(int(r.get("detection", {}).get("violations", 0)) for r in rows)
    total_accidents = sum(int(r.get("detection", {}).get("accidents", 0)) for r in rows)
    return {
        "totalVehicles": total_vehicles,
        "pedestrians": total_pedestrians,
        "violations": total_violations,
        "accidents": total_accidents,
        "reports_total": len(rows),
        "reports_active": sum(1 for r in rows if r.get("status") == "active"),
        "risk": _risk_score(total_violations, total_accidents, total_vehicles),
    }


@app.get("/analytics/user/density")
def analytics_user_density(user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    rows = list(uploads_col.find({"user_id": user["uid"]}).sort("timestamp", 1))
    grouped: dict[str, list[float]] = defaultdict(list)
    for r in rows:
        day = (r.get("timestamp") or now_iso())[:10]
        grouped[day].append(float(r.get("density_score", 0)))
    data = [
        {"day": day, "avgDensity": round(sum(vals) / max(1, len(vals)), 2)}
        for day, vals in sorted(grouped.items())
    ]
    return {"rows": data}


@app.get("/analytics/admin/overview")
def analytics_admin_overview(_: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    rows = list(uploads_col.find({}).sort("timestamp", 1))
    uploads_by_day: Counter[str] = Counter()
    accidents_by_day: Counter[str] = Counter()
    density_by_day: dict[str, list[float]] = defaultdict(list)
    violation_distribution: Counter[str] = Counter()

    for r in rows:
        day = (r.get("timestamp") or now_iso())[:10]
        uploads_by_day[day] += 1
        if r.get("accident_detected"):
            accidents_by_day[day] += 1
        density_by_day[day].append(float(r.get("density_score", 0)))
        for vt in r.get("detection", {}).get("violation_types", []):
            violation_distribution[vt.get("label", "Unknown")] += int(vt.get("count", 1))

    density_rows = [
        {"day": d, "avgDensity": round(sum(v) / max(1, len(v)), 2)}
        for d, v in sorted(density_by_day.items())
    ]
    totals = stats_col.find_one({"_id": "global"}) or {}
    return {
        "uploads_per_day": [{"day": d, "count": c} for d, c in sorted(uploads_by_day.items())],
        "accidents_per_day": [{"day": d, "count": c} for d, c in sorted(accidents_by_day.items())],
        "violation_distribution": [{"label": k, "count": v} for k, v in violation_distribution.items()],
        "density_trends": density_rows,
        "system_stats": {
            "total_users": int(totals.get("total_users", 0)),
            "total_uploads": int(totals.get("total_uploads", 0)),
            "total_accidents": int(totals.get("total_accidents", 0)),
            "total_violations": int(totals.get("total_violations", 0)),
        },
    }


# ── Legacy traffic/backend compatibility routes (single-backend mode) ─────────
VIOLATION_LAW_ID_MAP: dict[str, list[str]] = {
    "no_helmet": ["IND-11", "IND-12"],
    "excess_riders": ["IND-21", "IND-46"],
    "lane_change": ["IND-34", "IND-09"],
    "wrong_way": ["IND-32", "IND-09"],
    "speeding": ["IND-14", "IND-15"],
    "stopped_vehicle": ["IND-44", "IND-26"],
    "jaywalking": ["IND-33", "IND-24"],
    "tailgating": ["IND-09", "IND-42"],
    "red_light": ["IND-22", "IND-23"],
    "uturn": ["IND-09", "IND-24"],
    "accident": ["IND-41", "IND-49", "IND-29", "IND-30", "IND-31"],
}


@app.get("/api/health")
def legacy_health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "TraffixAI Unified Backend",
        "timestamp": now_iso(),
        "llama_ready": _cloudflare_llama_ready(),
        "gemini_ready": bool(os.getenv("GEMINI_API_KEY", "").strip()),
    }


@app.post("/api/upload")
async def legacy_upload(file: UploadFile = File(...)) -> dict[str, Any]:
    video_id = str(uuid.uuid4())
    suffix = Path(file.filename or "video.mp4").suffix or ".mp4"
    upload_path = UPLOAD_DIR / f"legacy_{video_id}{suffix}"
    with upload_path.open("wb") as out:
        out.write(await file.read())
    legacy_video_store[video_id] = str(upload_path)
    return {"video_id": video_id, "filename": file.filename}


@app.post("/api/analyze-image")
async def legacy_analyze_image(file: UploadFile = File(...)) -> dict[str, Any]:
    raw = await file.read()
    np_arr = np.frombuffer(raw, np.uint8)
    frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if frame is None:
        raise HTTPException(status_code=400, detail="Could not decode image")

    monitor.reset_state()
    annotated, detection = analyze_frame(frame, is_static_image=True)
    detection["risk_score"] = _risk_score(
        int(detection.get("violations", 0)),
        int(detection.get("accidents", 0)),
        int(detection.get("density_score", 0)),
    )["score"]
    legacy_stats = _legacy_stats_from_detection(detection)
    violations, accidents = _legacy_event_lists(detection)
    return {
        "image": _frame_to_base64_raw(annotated),
        "stats": legacy_stats,
        "violations": violations,
        "accidents": accidents,
    }


@app.post("/api/traffic-law-query")
async def legacy_traffic_law_query(req: LegacyTrafficLawQueryRequest) -> dict[str, Any]:
    question = (req.question or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question is required")
    corpus = _load_traffic_law_corpus()
    if not corpus:
        return {"answer": "Traffic law corpus is not available on the server.", "sources": []}

    query_tokens = set(_tokenize_location(question))
    ctx_text = " ".join(str(v) for v in (req.incident_context or {}).values())
    query_tokens.update(_tokenize_location(ctx_text))

    ranked: list[tuple[int, dict[str, Any]]] = []
    for row in corpus:
        search_text = str(row.get("_search", ""))
        score = sum(1 for token in query_tokens if token in search_text)
        if score > 0:
            ranked.append((score, row))
    ranked.sort(key=lambda x: x[0], reverse=True)
    top = [r[1] for r in ranked[:5]] if ranked else corpus[:3]

    context = "\n\n---\n\n".join(
        f"ID: {row.get('id')}\nSection: {row.get('section','')}\nTitle: {row.get('title','')}\nText: {row.get('text','')}"
        for row in top[:6]
    )
    answer: str
    model_used = "fallback"
    if _cloudflare_llama_ready():
        try:
            answer = await _call_cloudflare_llama_text(
                prompt=(
                    "Answer the following Indian traffic-law question using only the provided context.\n"
                    "If context is insufficient, clearly state that.\n"
                    f"Question: {question}\n\nContext:\n{context}\n\nAnswer:"
                ),
                system_prompt=(
                    "You are a legal traffic assistant for India. "
                    "Cite relevant sections when possible and avoid invented laws."
                ),
                max_tokens=450,
            )
            model_used = getattr(llm_judge, "cloudflare_llm_model", "llama")
        except Exception:
            answer = ""
    else:
        answer = ""

    if not answer:
        summary_lines = []
        for row in top[:3]:
            section = row.get("section") or "N/A"
            title = row.get("title") or "Traffic Rule"
            summary_lines.append(f"{section}: {title}")
        answer = (
            "Relevant Indian traffic law references found:\n- "
            + "\n- ".join(summary_lines)
            + "\nPlease verify final enforcement action with local authority."
        )

    return {
        "answer": answer,
        "model_used": model_used,
        "sources": [
            {
                "id": row.get("id"),
                "section": row.get("section"),
                "title": row.get("title"),
                "text": row.get("text"),
            }
            for row in top
        ],
    }


@app.post("/api/traffic-law-from-analysis")
async def legacy_traffic_law_from_analysis(req: LegacyTrafficLawAnalysisRequest) -> dict[str, Any]:
    lookup = _law_lookup()
    detected_types: list[str] = []
    for violation in req.violations or []:
        if isinstance(violation, dict):
            raw_type = str(violation.get("type") or violation.get("label") or "")
        else:
            raw_type = str(violation)
        key = _violation_key(raw_type)
        if key and key not in detected_types:
            detected_types.append(key)
    if req.accidents:
        detected_types.append("accident")
    detected_types = list(dict.fromkeys(detected_types))

    structured_laws: list[dict[str, Any]] = []
    for d_type in detected_types:
        laws: list[dict[str, Any]] = []
        for law_id in VIOLATION_LAW_ID_MAP.get(d_type, []):
            entry = lookup.get(law_id)
            if not entry:
                continue
            laws.append(
                {
                    "id": entry.get("id"),
                    "section": entry.get("section"),
                    "title": entry.get("title"),
                    "text": entry.get("text"),
                }
            )
        if laws:
            structured_laws.append({"violation_type": d_type, "laws": laws[:2]})

    summary = ""
    model_used = "fallback"
    if structured_laws and _cloudflare_llama_ready():
        law_context = "\n\n".join(
            f"Violation: {group['violation_type']}\n"
            + "\n".join(
                f"- {law.get('section','')}: {law.get('title','')} | {law.get('text','')}"
                for law in group.get("laws", [])
            )
            for group in structured_laws
        )
        try:
            summary = await _call_cloudflare_llama_text(
                prompt=(
                    "Provide a concise legal consequence summary for detected traffic violations in India.\n"
                    "Focus on penalties, imprisonment, and practical enforcement.\n"
                    f"Detected types: {', '.join(detected_types) or 'none'}\n\n"
                    f"Context:\n{law_context}\n\nSummary:"
                ),
                system_prompt=(
                    "You are an Indian traffic-law analyst. Use only the given context and be precise."
                ),
                max_tokens=500,
            )
            model_used = getattr(llm_judge, "cloudflare_llm_model", "llama")
        except Exception:
            summary = ""
    if not summary:
        summary = (
            "Applicable law references generated from detected violations."
            if structured_laws
            else "No specific violation-to-law mapping found for this analysis."
        )
    sources = [law for group in structured_laws for law in group["laws"]][:6]
    return {
        "summary": summary,
        "model_used": model_used,
        "detected_types": detected_types,
        "structured_laws": structured_laws,
        "sources": sources,
    }


@app.post("/api/generate-dashboard")
async def legacy_generate_dashboard(req: LegacyDashboardRequest) -> dict[str, Any]:
    cumulative = req.cumulative or {}
    total_v = int(req.totalViolations or 0)
    accidents = int((req.stats or {}).get("accidents", 0))
    risk = _risk_score(total_v, accidents, int(cumulative.get("total_vehicles", 0)))
    top_concerns = sorted((req.violationCounts or {}).items(), key=lambda x: x[1], reverse=True)[:3]
    analysis = {
        "summary": (
            f"Detected {cumulative.get('total_vehicles', 0)} vehicles, "
            f"{cumulative.get('total_persons', 0)} pedestrians, and {total_v} violations."
        ),
        "risk_level": risk["level"],
        "risk_score": risk["score"],
        "top_concerns": [f"{k}: {v}" for k, v in top_concerns] or ["No major concerns"],
        "recommendations": [
            "Increase enforcement in high-risk corridors.",
            "Deploy warning signage and speed moderation.",
            "Escalate repeated offenders to authority review.",
        ],
        "insight": "Unified backend generated this dashboard without external renderer.",
    }
    if _cloudflare_llama_ready():
        try:
            llm_text = await _call_cloudflare_llama_text(
                prompt=(
                    "Return a valid JSON object only with keys: summary, risk_level, risk_score, top_concerns, recommendations, insight.\n"
                    f"Vehicles: {cumulative.get('total_vehicles', 0)}\n"
                    f"Pedestrians: {cumulative.get('total_persons', 0)}\n"
                    f"Bikes: {cumulative.get('total_bikes', 0)}\n"
                    f"Violations: {total_v}\n"
                    f"Violation breakdown: {dict(req.violationCounts or {})}\n"
                ),
                system_prompt="You are a traffic operations analyst. JSON only.",
                max_tokens=520,
            )
            parsed = json.loads(llm_text.strip("` \n"))
            if isinstance(parsed, dict):
                analysis.update(parsed)
                analysis["model_used"] = getattr(llm_judge, "cloudflare_llm_model", "llama")
        except Exception:
            pass

    return {
        "analysis": analysis,
        "image": None,
        "violation_data": dict(req.violationCounts or {}),
        "vehicle_data": dict(cumulative.get("by_class", {})),
        "totals": {
            "vehicles": int(cumulative.get("total_vehicles", 0)),
            "persons": int(cumulative.get("total_persons", 0)),
            "bikes": int(cumulative.get("total_bikes", 0)),
            "violations": total_v,
        },
    }


@app.post("/api/executive-summary")
async def legacy_executive_summary(req: LegacyExecutiveSummaryRequest) -> dict[str, Any]:
    cumulative = req.cumulative or {}
    total_v = int(req.totalViolations or 0)
    accident_count = len(req.accidents or [])
    severity = "critical" if accident_count > 0 or total_v >= 25 else "high" if total_v >= 12 else "medium" if total_v >= 4 else "low"
    result = {
        "headline": f"{total_v} traffic violations detected in analyzed footage.",
        "summary": (
            f"Traffic snapshot includes {cumulative.get('total_vehicles', 0)} vehicles, "
            f"{cumulative.get('total_persons', 0)} pedestrians, "
            f"{cumulative.get('total_bikes', 0)} bikes, "
            f"with {total_v} violations and {accident_count} accidents."
        ),
        "highlights": [
            "Unified backend is active.",
            "Violation and accident intelligence included.",
            "Admin review routing is available.",
        ],
        "severity": severity,
    }
    if _cloudflare_llama_ready():
        try:
            llm_text = await _call_cloudflare_llama_text(
                prompt=(
                    "Return valid JSON only with keys: headline, summary, highlights, severity.\n"
                    f"Vehicles={cumulative.get('total_vehicles', 0)}, Pedestrians={cumulative.get('total_persons', 0)}, "
                    f"Bikes={cumulative.get('total_bikes', 0)}, Violations={total_v}, Accidents={accident_count}\n"
                    f"Violation breakdown: {dict(req.violationCounts or {})}\n"
                ),
                system_prompt="You write concise executive summaries for traffic monitoring.",
                max_tokens=360,
            )
            parsed = json.loads(llm_text.strip("` \n"))
            if isinstance(parsed, dict):
                result.update(parsed)
                result["model_used"] = getattr(llm_judge, "cloudflare_llm_model", "llama")
        except Exception:
            pass
    return result


@app.websocket("/ws/monitor/{video_id}")
async def legacy_ws_monitor(websocket: WebSocket, video_id: str) -> None:
    await websocket.accept()
    path = legacy_video_store.get(video_id)
    if not path or not Path(path).exists():
        await websocket.send_json({"error": "Video not found"})
        await websocket.close()
        return

    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        await websocket.send_json({"error": "Could not open video"})
        await websocket.close()
        return

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    frame_num = 0
    skip_interval = max(1, int(os.getenv("WS_MONITOR_SKIP_INTERVAL", "2")))
    try:
        monitor.reset_state()
        while True:
            ok, frame = cap.read()
            if not ok:
                await websocket.send_json(
                    {
                        "progress": {"frame": total_frames or frame_num, "total": total_frames, "percent": 100.0},
                        "done": True,
                    }
                )
                break

            frame_num += 1
            if frame_num % skip_interval != 0:
                if total_frames > 0:
                    await websocket.send_json(
                        {
                            "progress": {
                                "frame": frame_num,
                                "total": total_frames,
                                "percent": round((frame_num / total_frames) * 100, 1),
                            }
                        }
                    )
                continue

            annotated, detection = analyze_frame(frame.copy())
            detection["risk_score"] = _risk_score(
                int(detection.get("violations", 0)),
                int(detection.get("accidents", 0)),
                int(detection.get("density_score", 0)),
            )["score"]
            legacy_stats = _legacy_stats_from_detection(detection)
            violations, accidents = _legacy_event_lists(detection)
            await websocket.send_json(
                {
                    "frame": _frame_to_base64_raw(annotated),
                    "stats": legacy_stats,
                    "violations": violations,
                    "accidents": accidents,
                    "progress": {
                        "frame": frame_num,
                        "total": total_frames,
                        "percent": round((frame_num / total_frames) * 100, 1) if total_frames > 0 else 0.0,
                    },
                }
            )
    except WebSocketDisconnect:
        pass
    finally:
        cap.release()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8000")),
        reload=os.getenv("DEBUG", "true").lower() == "true",
    )
