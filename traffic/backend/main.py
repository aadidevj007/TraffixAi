"""
FastAPI backend for Traffic Anomaly Detection.
Provides video upload, image upload, and WebSocket-based frame streaming with YOLO detections.
"""

import os
import uuid
import asyncio
import tempfile
import base64

import cv2
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

from monitor import TrafficMonitor

# Load environment variables
load_dotenv()

CLOUDFLARE_ACCOUNT_ID = os.getenv("CLOUDFLARE_ACCOUNT_ID", "")
CLOUDFLARE_API_TOKEN = os.getenv("CLOUDFLARE_API_TOKEN", "")
CLOUDFLARE_MODEL = "@cf/black-forest-labs/flux-2-dev"

app = FastAPI(title="Traffic Anomaly Detection API")


@app.on_event("startup")
async def check_cloudflare_credentials():
    """Log Cloudflare credential status on startup."""
    print("\n" + "=" * 60)
    print("🔧 CLOUDFLARE CONFIGURATION CHECK")
    print("=" * 60)
    if CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_ACCOUNT_ID != "your_account_id_here":
        masked_id = CLOUDFLARE_ACCOUNT_ID[:4] + "***" + CLOUDFLARE_ACCOUNT_ID[-4:]
        print(f"  ✅ ACCOUNT_ID : {masked_id}")
    else:
        print("  ❌ ACCOUNT_ID : NOT SET or placeholder")

    if CLOUDFLARE_API_TOKEN and CLOUDFLARE_API_TOKEN != "your_api_token_here":
        masked_token = CLOUDFLARE_API_TOKEN[:4] + "***" + CLOUDFLARE_API_TOKEN[-4:]
        print(f"  ✅ API_TOKEN  : {masked_token}")
    else:
        print("  ❌ API_TOKEN  : NOT SET or placeholder")

    print(f"  🤖 MODEL     : {CLOUDFLARE_MODEL}")

    if (not CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_ACCOUNT_ID == "your_account_id_here" or
            not CLOUDFLARE_API_TOKEN or CLOUDFLARE_API_TOKEN == "your_api_token_here"):
        print("\n  ⚠️  Update backend/.env with real Cloudflare credentials!")
    else:
        print("\n  🚀 Cloudflare AI ready for dashboard generation!")
    print("=" * 60 + "\n")

# CORS for dev (Vite runs on :5173)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Store uploaded video paths keyed by video_id
video_store: dict[str, str] = {}

# Lazy-loaded monitor (loads YOLO model once)
_monitor: TrafficMonitor | None = None


def get_monitor() -> TrafficMonitor:
    global _monitor
    if _monitor is None:
        _monitor = TrafficMonitor()
    return _monitor


# ─── Health ───────────────────────────────────────────────────────────
@app.get("/api/health")
async def health():
    return {"status": "ok"}


# ─── Upload Video ─────────────────────────────────────────────────────
@app.post("/api/upload")
async def upload_video(file: UploadFile = File(...)):
    """Accept a video file, save to temp dir, return a video_id."""
    video_id = str(uuid.uuid4())
    suffix = os.path.splitext(file.filename or "video.mp4")[1]
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix, prefix=f"traffic_{video_id}_")
    contents = await file.read()
    tmp.write(contents)
    tmp.close()
    video_store[video_id] = tmp.name
    return JSONResponse({"video_id": video_id, "filename": file.filename})


# ─── Analyze Image ───────────────────────────────────────────────────
@app.post("/api/analyze-image")
async def analyze_image(file: UploadFile = File(...)):
    """Accept an image, run detection, return annotated JPEG + JSON results."""
    contents = await file.read()
    np_arr = __import__('numpy').frombuffer(contents, __import__('numpy').uint8)
    frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if frame is None:
        return JSONResponse({"error": "Could not decode image"}, status_code=400)

    monitor = get_monitor()
    results = monitor.process_frame(frame)
    annotated = monitor.draw_results(frame.copy(), results)

    # Encode annotated image
    _, buffer = cv2.imencode('.jpg', annotated, [cv2.IMWRITE_JPEG_QUALITY, 90])
    import base64
    img_b64 = base64.b64encode(buffer.tobytes()).decode('utf-8')

    return JSONResponse({
        "image": img_b64,
        "stats": results["stats"],
        "violations": results["violations"],
        "accidents": results["accidents"],
    })


# ─── Generate AI Dashboard ───────────────────────────────────────────
CLOUDFLARE_LLM = "@cf/meta/llama-3.1-8b-instruct"


class DashboardRequest(BaseModel):
    stats: dict = {}
    cumulative: dict = {}
    violationCounts: dict = {}
    totalViolations: int = 0


async def _call_cloudflare(model: str, payload: dict, expect_json: bool = True, use_multipart: bool = False):
    """Helper to call any Cloudflare Workers AI model."""
    url = f"https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/run/{model}"
    headers = {
        "Authorization": f"Bearer {CLOUDFLARE_API_TOKEN}",
    }
    async with httpx.AsyncClient(timeout=120.0) as client:
        if use_multipart:
            # Flux models require multipart/form-data
            data = {k: str(v) for k, v in payload.items()}
            resp = await client.post(url, data=data, headers=headers)
        else:
            headers["Content-Type"] = "application/json"
            resp = await client.post(url, json=payload, headers=headers)
        if resp.status_code != 200:
            raise Exception(f"Cloudflare API error ({resp.status_code}): {resp.text[:500]}")
        if expect_json:
            return resp.json()
        return resp.content  # raw bytes for image models


@app.post("/api/generate-dashboard")
async def generate_dashboard(req: DashboardRequest):
    """Generate an AI-powered dashboard: LLM summary + SDXL image."""
    if not CLOUDFLARE_ACCOUNT_ID or not CLOUDFLARE_API_TOKEN:
        return JSONResponse(
            {"error": "Cloudflare credentials not configured. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in .env"},
            status_code=500,
        )

    cumulative = req.cumulative
    vc = req.violationCounts
    total_v = req.totalViolations

    # Map violation types to readable labels
    violation_labels = {
        "lane_change": "Illegal Lane Changes", "wrong_way": "Wrong Way Driving",
        "speeding": "Speeding", "stopped_vehicle": "Stopped Vehicles",
        "no_helmet": "No Helmet", "excess_riders": "Excess Riders",
        "jaywalking": "Jaywalking", "tailgating": "Tailgating",
        "red_light": "Red Light Violations", "uturn": "Illegal U-Turns",
        "accident": "Accidents",
    }

    violation_parts = []
    for vtype, count in sorted(vc.items(), key=lambda x: x[1], reverse=True):
        label = violation_labels.get(vtype, vtype.replace("_", " ").title())
        violation_parts.append(f"{count} {label}")
    violation_summary = ", ".join(violation_parts) if violation_parts else "no violations"

    # ── Pre-compute data for prompts (no API calls needed) ─────────
    veh_count = cumulative.get("total_vehicles", 0)
    ped_count = cumulative.get("total_persons", 0)
    bike_count = cumulative.get("total_bikes", 0)
    top_violations = ", ".join(violation_parts[:3]) if violation_parts else "None"
    # Quick risk estimate from raw data (used for image prompt so we don't wait for LLM)
    quick_risk = "CRITICAL" if total_v > 50 else "HIGH" if total_v > 15 else "MEDIUM" if total_v > 5 else "LOW"

    # ── Build both prompts ────────────────────────────────────────────
    llm_prompt = f"""You are a traffic safety analyst AI. Analyze the following traffic monitoring data and provide a structured JSON response.

TRAFFIC DATA:
- Total Vehicles Detected: {veh_count}
- Total Pedestrians: {ped_count}
- Total Bikes/Motorcycles: {bike_count}
- Vehicle Breakdown: {cumulative.get('by_class', {})}
- Total Violations: {total_v}
- Violation Breakdown: {violation_summary}

Respond ONLY with a valid JSON object (no markdown, no code fences) with these exact keys:
{{
  "summary": "A 2-3 sentence overall summary of the traffic situation",
  "risk_level": "low" or "medium" or "high" or "critical",
  "risk_score": a number from 0 to 100,
  "top_concerns": ["concern 1", "concern 2", "concern 3"],
  "recommendations": ["recommendation 1", "recommendation 2", "recommendation 3"],
  "insight": "One surprising or notable insight from this data"
}}"""

    # ── Run LLM for analysis ────────────────────────────────────────
    try:
        print("[LLM] Getting analysis summary...")
        llm_result = await _call_cloudflare(CLOUDFLARE_LLM, {
            "messages": [
                {"role": "system", "content": "You are a traffic safety analyst. Always respond with valid JSON only."},
                {"role": "user", "content": llm_prompt}
            ],
            "max_tokens": 512,
            "temperature": 0.3,
        })
        llm_text = llm_result.get("result", {}).get("response", "")
        import json
        clean = llm_text.strip()
        if clean.startswith("```"):
            clean = clean.split("\n", 1)[1] if "\n" in clean else clean[3:]
            clean = clean.rsplit("```", 1)[0]
        analysis = json.loads(clean)
        print("[LLM] ✅ Got structured analysis")
    except Exception as e:
        print(f"[LLM] Fallback used: {e}")
        analysis = {
            "summary": f"Detected {veh_count} vehicles, {ped_count} pedestrians, and {total_v} violations. "
                       f"Breakdown: {violation_summary}.",
            "risk_level": "critical" if total_v > 50 else "high" if total_v > 15 else "medium" if total_v > 5 else "low",
            "risk_score": min(100, total_v * 2),
            "top_concerns": violation_parts[:3] if violation_parts else ["No major concerns"],
            "recommendations": ["Increase traffic enforcement", "Consider traffic calming measures", "Improve pedestrian safety"],
            "insight": f"Most common violation: {violation_parts[0] if violation_parts else 'none detected'}.",
            "llm_error": str(e),
        }

    # ── Render dashboard image locally (matplotlib) ───────────────
    image_b64 = None
    try:
        print("[IMAGE] Rendering dashboard image with matplotlib...")
        from dashboard_renderer import render_dashboard_image
        image_b64 = render_dashboard_image(
            cumulative=cumulative,
            violation_counts=vc,
            total_violations=total_v,
            analysis=analysis,
        )
        print(f"[IMAGE] ✅ Rendered ({len(image_b64)} chars)")
    except Exception as e:
        print(f"[IMAGE] ❌ Render failed: {e}")
        import traceback
        traceback.print_exc()
        analysis["image_error"] = str(e)

    return JSONResponse({
        "analysis": analysis,
        "image": image_b64,
        "violation_data": dict(vc),
        "vehicle_data": cumulative.get("by_class", {}),
        "totals": {
            "vehicles": cumulative.get("total_vehicles", 0),
            "persons": cumulative.get("total_persons", 0),
            "bikes": cumulative.get("total_bikes", 0),
            "violations": total_v,
        }
    })


# ─── WebSocket: stream processed frames ──────────────────────────────
@app.websocket("/ws/monitor/{video_id}")
async def ws_monitor(websocket: WebSocket, video_id: str):
    await websocket.accept()

    path = video_store.get(video_id)
    if not path or not os.path.exists(path):
        await websocket.send_json({"error": "Video not found"})
        await websocket.close()
        return

    monitor = get_monitor()
    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
    frame_delay = 1.0 / fps

    # Cumulative tracking sets
    seen_vehicles = set()
    seen_persons = set()
    seen_bikes = set()
    vehicle_class_counts = {}
    frame_number = 0
    skip_interval = 2  # Process every Nth frame for speed

    try:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                await websocket.send_json({"done": True})
                break

            frame_number += 1

            # Skip frames for speed (still count them for progress)
            if frame_number % skip_interval != 0:
                continue

            # Resize for faster inference
            h_orig, w_orig = frame.shape[:2]
            scale = min(640 / max(h_orig, w_orig), 1.0)
            if scale < 1.0:
                frame_small = cv2.resize(frame, (int(w_orig * scale), int(h_orig * scale)))
            else:
                frame_small = frame

            # Run detection on resized frame
            results = monitor.process_frame(frame_small)

            # Track unique IDs for cumulative counts
            for det in results['detections']:
                tid = det.get('track_id', -1)
                cid = det.get('class_id', -1)
                cls_name = det.get('class', 'unknown')
                if tid != -1:
                    if cid == 0:
                        seen_persons.add(tid)
                    elif cid in (3, 1):
                        seen_bikes.add(tid)
                        if tid not in seen_vehicles:
                            vehicle_class_counts[cls_name] = vehicle_class_counts.get(cls_name, 0) + 1
                        seen_vehicles.add(tid)
                    elif cid in (2, 5, 7):
                        if tid not in seen_vehicles:
                            vehicle_class_counts[cls_name] = vehicle_class_counts.get(cls_name, 0) + 1
                        seen_vehicles.add(tid)

            # Draw annotations on (possibly resized) frame
            annotated = monitor.draw_results(frame_small.copy(), results)

            # Encode frame as JPEG
            _, buffer = cv2.imencode('.jpg', annotated, [cv2.IMWRITE_JPEG_QUALITY, 65])
            jpeg_bytes = buffer.tobytes()

            # Send binary frame
            await websocket.send_bytes(jpeg_bytes)

            # Send JSON stats with cumulative counts
            await websocket.send_json({
                "stats": results["stats"],
                "cumulative": {
                    "total_vehicles": len(seen_vehicles),
                    "total_persons": len(seen_persons),
                    "total_bikes": len(seen_bikes),
                    "by_class": vehicle_class_counts,
                },
                "progress": {
                    "frame": frame_number,
                    "total": total_frames,
                    "percent": round(frame_number / total_frames * 100, 1) if total_frames > 0 else 0,
                },
                "violations": results["violations"],
                "accidents": results["accidents"],
            })

            # Minimal delay for faster throughput
            await asyncio.sleep(frame_delay * 0.15)

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"error": str(e)})
        except Exception:
            pass
    finally:
        cap.release()


# ─── Cleanup on shutdown ─────────────────────────────────────────────
@app.on_event("shutdown")
async def cleanup():
    for path in video_store.values():
        try:
            os.unlink(path)
        except OSError:
            pass


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
