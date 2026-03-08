from __future__ import annotations

import os
import re
import uuid
from collections import Counter, defaultdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal
from urllib.parse import quote_plus

import cv2
import numpy as np
from bson import ObjectId
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pymongo import MongoClient
from pymongo.collection import Collection

import firebase_admin
from firebase_admin import auth as firebase_auth
from firebase_admin import credentials

from ai.traffic_monitor import TrafficMonitor

load_dotenv()


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


def serialize_id(doc: dict[str, Any]) -> dict[str, Any]:
    out = {**doc}
    if "_id" in out:
        out["id"] = str(out["_id"])
        del out["_id"]
    return out


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

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
PROCESSED_DIR = BASE_DIR / "processed"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

mongo_uri = os.getenv("MONGODB_URI", "mongodb://127.0.0.1:27017")
mongo_db_name = os.getenv("MONGODB_DB", "traffixai")
mongo_client = MongoClient(mongo_uri)
mongo_db = mongo_client[mongo_db_name]
users_col: Collection = mongo_db["users"]
uploads_col: Collection = mongo_db["uploads"]
stats_col: Collection = mongo_db["system_stats"]

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
_model_path = os.getenv(
    "YOLO_MODEL_PATH",
    str(BASE_DIR / "models" / "yolov8n.pt"),
)
monitor = TrafficMonitor(
    model_path=_model_path,
    conf_threshold=float(os.getenv("CONF_THRESHOLD", "0.4")),
)


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


def get_current_user(authorization: str | None = Header(default=None)) -> dict[str, Any]:
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


def require_admin(user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    if user.get("role") != "Admin":
        raise HTTPException(status_code=403, detail="Admin route")
    return user


def _box_to_detection_box(d: dict[str, Any]) -> dict[str, Any]:
    """Convert a TrafficMonitor detection dict to the API detection_box format."""
    box = d["box"]
    label = d["class"]
    confidence = d.get("confidence", 0.0)
    color = "#2dd4a0" if label != "person" else "#10b981"
    category = "pedestrian" if label == "person" else "vehicle"
    return {
        "x1": float(box[0]),
        "y1": float(box[1]),
        "x2": float(box[2]),
        "y2": float(box[3]),
        "label": label,
        "confidence": confidence,
        "risk_score": 0.0,
        "color": color,
        "category": category,
    }


def _violation_box_to_detection_box(v: dict[str, Any]) -> dict[str, Any]:
    """Convert a TrafficMonitor violation dict to the API detection_box format."""
    box = v.get("box", [0, 0, 10, 10])
    label = v.get("type", "violation").replace("_", " ").title()
    return {
        "x1": float(box[0]),
        "y1": float(box[1]),
        "x2": float(box[2]),
        "y2": float(box[3]),
        "label": label,
        "confidence": 1.0,
        "risk_score": 1.0,
        "color": "#e87830",
        "category": "violation",
    }


def _accident_box_to_detection_box(a: dict[str, Any]) -> dict[str, Any]:
    """Convert a TrafficMonitor accident dict to the API detection_box format."""
    box = a.get("location", [0, 0, 10, 10])
    return {
        "x1": float(box[0]),
        "y1": float(box[1]),
        "x2": float(box[2]),
        "y2": float(box[3]),
        "label": "Accident",
        "confidence": float(a.get("confidence", 1.0)),
        "risk_score": 1.0,
        "color": "#ef4444",
        "category": "accident",
    }


def _monitor_results_to_stats(results: dict[str, Any]) -> dict[str, Any]:
    """Normalise TrafficMonitor output to the stats dict used throughout this API."""
    stats = results.get("stats", {})
    violations_list: list[dict] = results.get("violations", [])
    accidents_list: list[dict] = results.get("accidents", [])
    detections: list[dict] = results.get("detections", [])

    violation_type_counter: Counter[str] = Counter(v["type"] for v in violations_list)
    violation_types = [
        {"label": vtype.replace("_", " ").title(), "count": cnt}
        for vtype, cnt in violation_type_counter.items()
    ]

    # Build objects list from detection classes
    objects_counter: Counter[str] = Counter(d["class"] for d in detections)
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

    violation_tags = [v["type"] for v in violations_list]

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
    results = monitor.process_frame(frame, is_static_image=is_static_image)
    annotated = monitor.draw_results(frame, results)
    return annotated, _monitor_results_to_stats(results)


def _frame_to_base64(frame: np.ndarray) -> str:
    import base64
    ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
    if not ok:
        return ""
    return "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode()


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
    frame_interval = max(1, int(fps // 2))  # ~2 frames per second
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 1280)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 720)
    output_path = PROCESSED_DIR / f"processed_{path.stem}_{uuid.uuid4().hex[:8]}.mp4"
    writer = cv2.VideoWriter(
        str(output_path),
        cv2.VideoWriter_fourcc(*"mp4v"),
        fps if fps > 0 else 24.0,
        (width, height),
    )

    frame_idx = 0
    analyzed = 0
    accum = defaultdict(float)
    collected_tags: list[str] = []
    collected_violations: list[dict] = []
    collected_events: list[dict] = []
    collected_objects: Counter[str] = Counter()
    annotated_frames: list[str] = []
    last_annotated: np.ndarray | None = None
    last_boxes: list[dict[str, Any]] = []

    while True:
        ok, frame = cap.read()
        if not ok:
            break

        if frame_idx % frame_interval == 0:
            annotated, stats = analyze_frame(frame.copy())
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

            if len(annotated_frames) < 8:
                annotated_frames.append(_frame_to_base64(annotated))
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
        "processed_path": str(output_path),
        "annotated_frames": annotated_frames,
        "events": collected_events,
        "vehicle_count": int(accum["vehicles"]),
    }
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
) -> str:
    violation_type = ", ".join(sorted(set(v["label"] for v in detection.get("violation_types", []))))
    doc = {
        "user_id": user_uid,
        "media_type": media_type,
        "video_path": video_path,
        "processed_video": processed_video,
        "location": location,
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
            "events": detection.get("events", []),
        },
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    result = uploads_col.insert_one(doc)
    _increment_stats(
        uploads=1,
        accidents=int(detection.get("accidents", 0)),
        violations=int(detection.get("violations", 0)),
    )
    return str(result.inserted_id)


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
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    content = await file.read()
    ext = Path(file.filename or "upload.jpg").suffix or ".jpg"
    src_path = UPLOAD_DIR / f"{uuid.uuid4().hex}{ext}"
    src_path.write_bytes(content)
    analysis = process_image(src_path)

    resolved_uid = user_id or user["uid"]
    upload_id = _store_upload(
        user_uid=resolved_uid,
        media_type="image",
        video_path=str(src_path),
        processed_video=analysis["processed_path"],
        location=location,
        date=date,
        time_str=time_str,
        description=description,
        detection=analysis,
    )
    risk = _risk_score(analysis["violations"], analysis["accidents"], int(analysis["density_score"]))
    return {
        **analysis,
        "id": upload_id,
        "risk_score": risk["score"],
        "risk_level": risk["level"],
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
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    if not (file.content_type or "").startswith("video/"):
        raise HTTPException(status_code=400, detail="File must be a video")
    content = await file.read()
    ext = Path(file.filename or "upload.mp4").suffix or ".mp4"
    src_path = UPLOAD_DIR / f"{uuid.uuid4().hex}{ext}"
    src_path.write_bytes(content)
    analysis = process_video(src_path)

    resolved_uid = user_id or user["uid"]
    upload_id = _store_upload(
        user_uid=resolved_uid,
        media_type="video",
        video_path=str(src_path),
        processed_video=analysis["processed_path"],
        location=location,
        date=date,
        time_str=time_str,
        description=description,
        detection=analysis,
    )
    risk = _risk_score(analysis["violations"], analysis["accidents"], int(analysis["density_score"]))
    return {
        **analysis,
        "id": upload_id,
        "risk_score": risk["score"],
        "risk_level": risk["level"],
        "analyzed_at": now_iso(),
        # Normalised response keys
        "violations": analysis["violations"],
        "vehicles": analysis["vehicles"],
        "events": analysis.get("events", []),
    }


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

    rows = list(uploads_col.find(filt).sort("created_at", -1).limit(limit))
    reports = [serialize_id(row) for row in rows]
    return {"reports": reports, "total": len(reports)}


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
    rows = list(uploads_col.find(filt).sort("created_at", -1).limit(limit))
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
    return {
        "status": "sent",
        "message": payload.message or f"{payload.incident_type} alert sent for {payload.location}",
        "alert": {
            "type": payload.incident_type,
            "location": payload.location,
            "severity": payload.severity,
            "contacts_notified": len(payload.contacts),
            "timestamp": now_iso(),
        },
    }


@app.post("/route-safety-recommendation")
def route_safety_recommendation(
    payload: RouteSafetyRequest,
    _: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    origin = payload.origin.strip()
    destination = payload.destination.strip()
    if not origin or not destination:
        raise HTTPException(status_code=400, detail="Origin and destination are required")

    route_tokens = _tokenize_location(f"{origin} {destination}")
    accident_rows = list(
        uploads_col.find(
            {
                "status": "approved",
                "sentToAdmin": True,
                "accident_detected": True,
                "location": {"$exists": True, "$ne": ""},
            },
            {"location": 1, "created_at": 1, "detection.accidents": 1},
        ).sort("created_at", -1).limit(500)
    )

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


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8000")),
        reload=os.getenv("DEBUG", "true").lower() == "true",
    )
