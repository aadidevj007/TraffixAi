"""
FastAPI backend for Traffic Anomaly Detection.
Provides video upload, image upload, and WebSocket-based frame streaming with YOLO detections.
"""

import os
import uuid
import asyncio
import tempfile
import base64
import json
import re
from pathlib import Path

import cv2
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

from monitor import TrafficMonitor

# Load environment variables
load_dotenv()

CLOUDFLARE_ACCOUNT_ID = os.getenv("CLOUDFLARE_ACCOUNT_ID", "")
CLOUDFLARE_API_TOKEN = os.getenv("CLOUDFLARE_API_TOKEN", "")
CLOUDFLARE_MODEL = "@cf/black-forest-labs/flux-2-dev"
CLOUDFLARE_LLM = "@cf/meta/llama-3.1-8b-instruct"
CLOUDFLARE_EMBEDDING_MODEL = "@cf/baai/bge-small-en-v1.5"

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
law_corpus_cache: list[dict] | None = None

VIOLATION_LAW_ID_MAP = {
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
    try:
        results = monitor.process_frame(frame, persist_tracks=False) or {}
        annotated = monitor.draw_results(frame.copy(), results)
    except Exception as e:
        return JSONResponse({"error": f"AI analysis failed: {e}"}, status_code=500)

    # Encode annotated image
    _, buffer = cv2.imencode('.jpg', annotated, [cv2.IMWRITE_JPEG_QUALITY, 90])
    import base64
    img_b64 = base64.b64encode(buffer.tobytes()).decode('utf-8')

    return JSONResponse({
        "image": img_b64,
        "stats": results.get("stats", {}),
        "violations": results.get("violations", []),
        "accidents": results.get("accidents", []),
    })


# ─── Generate AI Dashboard ───────────────────────────────────────────
class DashboardRequest(BaseModel):
    stats: dict = Field(default_factory=dict)
    cumulative: dict = Field(default_factory=dict)
    violationCounts: dict = Field(default_factory=dict)
    totalViolations: int = 0


class ExecutiveSummaryRequest(BaseModel):
    stats: dict = Field(default_factory=dict)
    cumulative: dict = Field(default_factory=dict)
    violationCounts: dict = Field(default_factory=dict)
    totalViolations: int = 0
    accidents: list = Field(default_factory=list)


class TrafficLawQueryRequest(BaseModel):
    question: str
    incident_context: dict = Field(default_factory=dict)


class TrafficLawAnalysisRequest(BaseModel):
    stats: dict = Field(default_factory=dict)
    violations: list = Field(default_factory=list)
    accidents: list = Field(default_factory=list)


def _traffic_law_file() -> Path:
    return Path(__file__).resolve().parents[1] / "traffic_rag" / "indian-traffic-laws.json"


def _normalize_text(text: str) -> str:
    return re.sub(r"[^a-z0-9\s]", " ", text.lower())


def _tokenize(text: str) -> list[str]:
    return [tok for tok in _normalize_text(text).split() if len(tok) > 2]


def _load_law_corpus() -> list[dict]:
    global law_corpus_cache
    if law_corpus_cache is not None:
        return law_corpus_cache

    law_file = _traffic_law_file()
    with law_file.open("r", encoding="utf-8") as f:
        rows = json.load(f)

    law_corpus_cache = []
    for row in rows:
        searchable_text = " ".join([
            str(row.get("id", "")),
            str(row.get("section", "")),
            str(row.get("title", "")),
            str(row.get("text", "")),
        ])
        law_corpus_cache.append({
            **row,
            "searchable_text": searchable_text,
            "tokens": set(_tokenize(searchable_text)),
        })
    return law_corpus_cache


def _law_entry_lookup() -> dict[str, dict]:
    return {entry["id"]: entry for entry in _load_law_corpus()}


def _build_incident_context_text(incident_context: dict) -> str:
    if not incident_context:
        return ""
    parts = []
    stats = incident_context.get("stats") or {}
    if stats:
        parts.append(
            f"Stats: vehicles={stats.get('total_vehicles', 0)}, persons={stats.get('total_persons', 0)}, "
            f"bikes={stats.get('total_bikes', 0)}, traffic_lights={stats.get('traffic_lights', 0)}"
        )
    violations = incident_context.get("violations") or []
    if violations:
        parts.append("Detected violations: " + ", ".join(str(v) for v in violations[:10]))
    accidents = incident_context.get("accidents") or []
    if accidents:
        parts.append("Detected accidents: " + ", ".join(str(a) for a in accidents[:5]))
    return "\n".join(parts)


def _law_queries_from_analysis(violations: list, accidents: list) -> list[str]:
    query_map = {
        "no_helmet": "helmet violation for rider and pillion Indian traffic law section and penalty",
        "excess_riders": "triple riding two wheeler section 128 penalty India",
        "lane_change": "improper lane change lane cutting road regulation penalty India",
        "wrong_way": "wrong way driving dangerous driving section 184 penalty India",
        "speeding": "over speeding motor vehicles act section 183 penalty India",
        "stopped_vehicle": "unsafe obstructive stopping vehicle penalty India",
        "jaywalking": "pedestrian road crossing obstruction traffic rule India",
        "tailgating": "dangerous driving tailgating improper following distance India",
        "red_light": "jumping red light traffic signal violation penalty India",
        "uturn": "illegal u turn dangerous driving traffic violation India",
        "accident": "driver duty after accident reporting medical aid hit and run BNS MVA India",
    }

    generated_queries: list[str] = []
    seen_types = set()

    for violation in violations:
        if isinstance(violation, dict):
            vtype = str(violation.get("type", "")).strip()
        else:
            vtype = str(violation).strip()
        if not vtype or vtype in seen_types:
            continue
        seen_types.add(vtype)
        generated_queries.append(query_map.get(vtype, f"{vtype.replace('_', ' ')} traffic law penalty India"))

    if accidents and "accident" not in seen_types:
        generated_queries.append(query_map["accident"])

    return generated_queries


def _detected_violation_types(violations: list, accidents: list) -> list[str]:
    detected_types: list[str] = []
    for violation in violations:
        vtype = violation.get("type") if isinstance(violation, dict) else violation
        if vtype and vtype not in detected_types:
            detected_types.append(vtype)
    if accidents and "accident" not in detected_types:
        detected_types.append("accident")
    return detected_types


def _direct_law_candidates_for_types(detected_types: list[str]) -> list[dict]:
    lookup = _law_entry_lookup()
    selected: list[dict] = []
    seen = set()
    for vtype in detected_types:
        for law_id in VIOLATION_LAW_ID_MAP.get(str(vtype), []):
            if law_id in lookup and law_id not in seen:
                selected.append(lookup[law_id])
                seen.add(law_id)
    return selected


def _extract_penalty(text: str) -> str:
    marker = "Penalty:"
    if marker not in text:
        return "Penalty not explicitly stated in the retrieved text."
    return text.split(marker, 1)[1].strip()


def _score_law_entry(entry: dict, tokens: set[str]) -> float:
    overlap = len(tokens & entry["tokens"])
    if overlap == 0:
        return 0.0
    title_bonus = 2 if any(tok in _normalize_text(str(entry.get("title", ""))) for tok in tokens) else 0
    section_bonus = 1 if any(tok in _normalize_text(str(entry.get("section", ""))) for tok in tokens) else 0
    return overlap + title_bonus + section_bonus


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


async def _call_llama_text(prompt: str, system_prompt: str | None = None, max_tokens: int = 700) -> str:
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})
    result = await _call_cloudflare(CLOUDFLARE_LLM, {
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0.2,
    })
    return result.get("result", {}).get("response", "").strip()


@app.post("/api/traffic-law-query")
async def traffic_law_query(req: TrafficLawQueryRequest):
    if not CLOUDFLARE_ACCOUNT_ID or not CLOUDFLARE_API_TOKEN:
        return JSONResponse(
            {"error": "Cloudflare credentials not configured. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in .env"},
            status_code=500,
        )

    question = (req.question or "").strip()
    if not question:
        return JSONResponse({"error": "Question is required"}, status_code=400)

    corpus = _load_law_corpus()
    incident_text = _build_incident_context_text(req.incident_context)
    composite_question = question if not incident_text else f"{question}\n\nIncident context:\n{incident_text}"
    incident_types = _detected_violation_types(
        req.incident_context.get("violations") or [],
        req.incident_context.get("accidents") or [],
    ) if req.incident_context else []
    direct_candidates = _direct_law_candidates_for_types(incident_types)

    expansion_prompt = (
        "You are an expert in Indian traffic laws, the Motor Vehicles Act, road regulations, and BNS 2023.\n"
        f"User question: {composite_question}\n"
        "Generate 3 short search variations to retrieve the most relevant traffic-law provisions.\n"
        "Prefer terms like section number, helmet, speeding, wrong-way, red light, accident reporting, challan, or BNS when relevant.\n"
        "Return only one variation per line."
    )
    expansion_text = await _call_llama_text(
        expansion_prompt,
        system_prompt="You generate concise legal search queries for Indian traffic-law retrieval.",
        max_tokens=180,
    )
    expanded_queries = [question] + [line.strip("- ").strip() for line in expansion_text.splitlines() if line.strip()]

    scored: dict[str, tuple[float, dict]] = {
        entry["id"]: (1000.0 - idx, entry) for idx, entry in enumerate(direct_candidates)
    }
    for query in expanded_queries:
        tokens = set(_tokenize(query))
        if incident_text:
            tokens.update(_tokenize(incident_text))
        for entry in corpus:
            score = _score_law_entry(entry, tokens)
            if score <= 0:
                continue
            current = scored.get(entry["id"])
            if current is None or score > current[0]:
                scored[entry["id"]] = (score, entry)

    candidates = [item[1] for item in sorted(scored.values(), key=lambda item: item[0], reverse=True)[:8]]
    if not candidates:
        candidates = corpus[:5]

    rerank_prompt = (
        "You are a senior Indian legal counsel specializing in road safety and traffic litigation.\n"
        f"Question: {composite_question}\n\n"
        "Pick the most relevant law chunks for answering this question accurately.\n"
        "Return only the IDs, comma-separated.\n\n"
        "Chunks:\n"
        + "\n\n".join(
            f"ID: {item['id']}\nSection: {item.get('section', '')}\nTitle: {item.get('title', '')}\nText: {item.get('text', '')}"
            for item in candidates
        )
    )
    rerank_text = await _call_llama_text(
        rerank_prompt,
        system_prompt="Return only relevant chunk IDs from the provided legal snippets.",
        max_tokens=120,
    )
    relevant_ids = {part.strip() for part in rerank_text.split(",") if part.strip()}
    context_entries = [item for item in candidates if item["id"] in relevant_ids] or candidates[:4]

    context = "\n\n---\n\n".join(
        f"ID: {item['id']}\nSection: {item.get('section', '')}\nTitle: {item.get('title', '')}\nText: {item.get('text', '')}"
        for item in context_entries
    )

    final_prompt = (
        "You are an authoritative assistant for Indian traffic laws.\n"
        "Answer strictly from the provided context. If the context is insufficient, say that clearly.\n"
        "Mention the relevant section or rule when available.\n"
        "Keep the answer practical and concise.\n\n"
        f"Question:\n{composite_question}\n\n"
        f"Context:\n{context}\n\n"
        "Answer:"
    )
    answer = await _call_llama_text(
        final_prompt,
        system_prompt="Answer Indian traffic-law questions using only the provided retrieved context.",
        max_tokens=500,
    )

    return JSONResponse({
        "answer": answer,
        "sources": [
            {
                "id": item["id"],
                "section": item.get("section"),
                "title": item.get("title"),
                "text": item.get("text"),
            }
            for item in context_entries
        ],
        "expanded_queries": expanded_queries[:4],
    })


@app.post("/api/traffic-law-from-analysis")
async def traffic_law_from_analysis(req: TrafficLawAnalysisRequest):
    if not CLOUDFLARE_ACCOUNT_ID or not CLOUDFLARE_API_TOKEN:
        return JSONResponse(
            {"error": "Cloudflare credentials not configured. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in .env"},
            status_code=500,
        )

    detected_types = _detected_violation_types(req.violations, req.accidents)
    analysis_queries = _law_queries_from_analysis(req.violations, req.accidents)
    if not analysis_queries:
        return JSONResponse({
            "summary": "No violation-specific law mapping was needed because no violations or accidents were detected.",
            "sources": [],
            "detected_types": [],
        })

    corpus = _load_law_corpus()
    direct_candidates = _direct_law_candidates_for_types(detected_types)
    token_pool = set()
    for query in analysis_queries:
        token_pool.update(_tokenize(query))

    scored: dict[str, tuple[float, dict]] = {
        entry["id"]: (1000.0 - idx, entry) for idx, entry in enumerate(direct_candidates)
    }
    for entry in corpus:
        score = _score_law_entry(entry, token_pool)
        if score <= 0:
            continue
        current = scored.get(entry["id"])
        if current is None or score > current[0]:
            scored[entry["id"]] = (score, entry)

    candidates = [item[1] for item in sorted(scored.values(), key=lambda item: item[0], reverse=True)[:10]]
    if not candidates:
        candidates = corpus[:5]

    incident_text = _build_incident_context_text({
        "stats": req.stats,
        "violations": req.violations,
        "accidents": req.accidents,
    })

    summary_prompt = (
        "You are an Indian traffic law assistant.\n"
        "Based on the detected traffic analysis, identify the most applicable laws and penalties.\n"
        "Organize the answer as short bullet-like paragraphs covering each detected violation.\n"
        "Mention section numbers where available and avoid inventing laws outside the provided context.\n\n"
        f"Detected types: {', '.join(map(str, detected_types))}\n"
        f"Incident context:\n{incident_text}\n\n"
        "Legal snippets:\n"
        + "\n\n".join(
            f"ID: {item['id']}\nSection: {item.get('section', '')}\nTitle: {item.get('title', '')}\nText: {item.get('text', '')}"
            for item in candidates
        )
        + "\n\nAnswer:"
    )

    summary = await _call_llama_text(
        summary_prompt,
        system_prompt="Use only the provided legal snippets to explain which Indian traffic laws apply to the detected violations.",
        max_tokens=550,
    )

    structured_laws = []
    lookup = _law_entry_lookup()
    for detected_type in detected_types:
        mapped_ids = VIOLATION_LAW_ID_MAP.get(str(detected_type), [])
        entries = [lookup[law_id] for law_id in mapped_ids if law_id in lookup][:2]
        if not entries:
            continue
        structured_laws.append({
            "violation_type": detected_type,
            "laws": [
                {
                    "id": entry["id"],
                    "section": entry.get("section"),
                    "title": entry.get("title"),
                    "penalty": _extract_penalty(str(entry.get("text", ""))),
                    "text": entry.get("text"),
                }
                for entry in entries
            ],
        })

    return JSONResponse({
        "summary": summary,
        "sources": [
            {
                "id": item["id"],
                "section": item.get("section"),
                "title": item.get("title"),
                "text": item.get("text"),
            }
            for item in candidates[:6]
        ],
        "detected_types": detected_types,
        "structured_laws": structured_laws,
    })


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


@app.post("/api/executive-summary")
async def executive_summary(req: ExecutiveSummaryRequest):
    if not CLOUDFLARE_ACCOUNT_ID or not CLOUDFLARE_API_TOKEN:
        return JSONResponse(
            {"error": "Cloudflare credentials not configured. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in .env"},
            status_code=500,
        )

    cumulative = req.cumulative or {}
    vc = req.violationCounts or {}
    total_v = req.totalViolations or 0
    accidents = req.accidents or []

    violation_parts = []
    for vtype, count in sorted(vc.items(), key=lambda x: x[1], reverse=True):
        label = vtype.replace("_", " ").title()
        violation_parts.append(f"{count} {label}")
    violation_summary = ", ".join(violation_parts[:8]) if violation_parts else "No violations detected"

    veh_count = cumulative.get("total_vehicles", req.stats.get("total_vehicles", 0) if req.stats else 0)
    ped_count = cumulative.get("total_persons", req.stats.get("total_persons", 0) if req.stats else 0)
    bike_count = cumulative.get("total_bikes", req.stats.get("total_bikes", 0) if req.stats else 0)
    accident_count = len(accidents)

    prompt = f"""
You are an executive traffic-monitoring analyst.
Create a concise executive summary of what happened in this traffic video.
Focus on the overall traffic situation, key violations, severity, and notable incident patterns.

Video analysis data:
- Total vehicles observed: {veh_count}
- Total pedestrians observed: {ped_count}
- Total bikes observed: {bike_count}
- Total violations detected: {total_v}
- Total accidents detected: {accident_count}
- Violation breakdown: {violation_summary}

Return ONLY valid JSON with these exact keys:
{{
  "headline": "one-sentence executive headline",
  "summary": "2-4 sentence executive summary of the video",
  "highlights": ["highlight 1", "highlight 2", "highlight 3"],
  "severity": "low" or "medium" or "high" or "critical"
}}
"""

    try:
        llm_result = await _call_cloudflare(CLOUDFLARE_LLM, {
            "messages": [
                {"role": "system", "content": "You are a concise executive traffic safety analyst. Return valid JSON only."},
                {"role": "user", "content": prompt},
            ],
            "max_tokens": 350,
            "temperature": 0.2,
        })
        raw_text = llm_result.get("result", {}).get("response", "").strip()
        clean = raw_text
        if clean.startswith("```"):
            clean = clean.split("\n", 1)[1] if "\n" in clean else clean[3:]
            clean = clean.rsplit("```", 1)[0]
        parsed = json.loads(clean)
    except Exception:
        severity = "critical" if accident_count > 0 or total_v > 25 else "high" if total_v > 10 else "medium" if total_v > 3 else "low"
        top_items = violation_parts[:3] if violation_parts else ["Traffic flow remained largely compliant"]
        parsed = {
            "headline": f"{total_v} violations detected across the analyzed traffic video.",
            "summary": (
                f"The video shows approximately {veh_count} vehicles, {ped_count} pedestrians, and {bike_count} bikes. "
                f"A total of {total_v} violations were detected"
                + (f", along with {accident_count} accident events. " if accident_count else ". ")
                + f"Most prominent issues were {', '.join(top_items) if top_items else 'none'}."
            ),
            "highlights": top_items,
            "severity": severity,
        }

    return JSONResponse(parsed)


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
    # Cumulative tracking sets
    seen_vehicles = set()
    seen_persons = set()
    seen_bikes = set()
    vehicle_class_counts = {}
    frame_number = 0
    skip_interval = 2  # Process every Nth frame for speed
    crash_check_interval = 3  # Run the heavier crash model less often

    try:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                final_frame = total_frames if total_frames > 0 else frame_number
                await websocket.send_json({
                    "progress": {
                        "frame": final_frame,
                        "total": total_frames,
                        "percent": 100.0,
                    },
                    "done": True,
                })
                break

            frame_number += 1

            # Skip frames for speed (still count them for progress)
            if frame_number % skip_interval != 0:
                if total_frames > 0:
                    await websocket.send_json({
                        "progress": {
                            "frame": frame_number,
                            "total": total_frames,
                            "percent": round(frame_number / total_frames * 100, 1),
                        }
                    })
                continue

            # Resize for faster inference
            h_orig, w_orig = frame.shape[:2]
            scale = min(512 / max(h_orig, w_orig), 1.0)
            if scale < 1.0:
                frame_small = cv2.resize(frame, (int(w_orig * scale), int(h_orig * scale)))
            else:
                frame_small = frame

            # Run detection on resized frame
            run_crash_model = (frame_number % crash_check_interval == 0)
            results = monitor.process_frame(frame_small, run_crash_model=run_crash_model)

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

            # Yield back to the event loop without intentionally slowing throughput.
            await asyncio.sleep(0)

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
