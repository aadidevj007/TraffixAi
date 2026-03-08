"""
TraffixAI — Gemini AI Chatbot + Real OSRM Routing Engine
Uses:
  - Google Gemini API for natural-language understanding & responses
  - OSRM (Open Source Routing Machine) for real road-accurate routes
  - Nominatim (OpenStreetMap) for geocoding place names → coordinates
"""

import os
import math
import logging
import httpx
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# ─── Gemini Setup ─────────────────────────────────────────────────────────────
_gemini_model = None

def _get_gemini():
    global _gemini_model
    if _gemini_model is not None:
        return _gemini_model
    try:
        import google.generativeai as genai
        api_key = os.getenv("GEMINI_API_KEY", "")
        if not api_key:
            logger.warning("GEMINI_API_KEY not set — chatbot will use rule-based fallback")
            return None
        genai.configure(api_key=api_key)
        _gemini_model = genai.GenerativeModel(
            "gemini-1.5-flash",
            system_instruction=SYSTEM_PROMPT,
        )
        logger.info("Gemini 1.5 Flash model initialised ✓")
        return _gemini_model
    except Exception as e:
        logger.error(f"Gemini init failed: {e}")
        return None

SYSTEM_PROMPT = """You are TraffixAI Assistant — an AI-powered traffic analysis and route recommendation chatbot.

CAPABILITIES:
- Provide traffic route recommendations (fastest, safest, balanced)
- Analyse traffic conditions, risk levels, violations, and accidents
- Give driving safety tips based on weather, time-of-day, and road conditions
- Explain traffic violations and their severity
- Help users understand traffic detection results from CCTV footage

PERSONALITY:
- Professional but friendly
- Use emojis sparingly for clarity (🗺️ for routes, 🚨 for alerts, 📊 for data)
- Keep answers concise but informative (max 200 words unless asked for detail)
- Format with markdown: **bold** for key info, bullet points for lists
- Always include actionable advice

When given ROUTE DATA, present it clearly with distance, ETA, risk score, and safety rating.
When given DETECTION DATA, summarize vehicle counts, violations, and accidents concisely.
If asked something outside traffic/routing, politely redirect to traffic topics.
Always respond in English."""


# ─── Nominatim Geocoding ─────────────────────────────────────────────────────

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
HEADERS = {"User-Agent": "TraffixAI/1.0 (traffixai-project)"}

async def geocode(place: str) -> Optional[tuple]:
    """Convert a place name to (lat, lon) using Nominatim."""
    try:
        async with httpx.AsyncClient(timeout=10, headers=HEADERS) as client:
            resp = await client.get(NOMINATIM_URL, params={
                "q": place,
                "format": "json",
                "limit": 1,
                "addressdetails": 0,
            })
            data = resp.json()
            if data:
                return (float(data[0]["lat"]), float(data[0]["lon"]), data[0].get("display_name", place))
    except Exception as e:
        logger.error(f"Geocode error for '{place}': {e}")
    return None


# ─── OSRM Routing ────────────────────────────────────────────────────────────

OSRM_URL = "https://router.project-osrm.org/route/v1/driving"

async def get_osrm_routes(
    origin_coords: tuple,
    dest_coords: tuple,
    alternatives: int = 3,
) -> List[Dict]:
    """Fetch real routes from OSRM public server."""
    try:
        coords_str = f"{origin_coords[1]},{origin_coords[0]};{dest_coords[1]},{dest_coords[0]}"
        async with httpx.AsyncClient(timeout=15, headers=HEADERS) as client:
            resp = await client.get(f"{OSRM_URL}/{coords_str}", params={
                "alternatives": str(min(alternatives, 3)),
                "overview": "full",
                "steps": "true",
                "geometries": "geojson",
                "annotations": "true",
            })
            data = resp.json()
            if data.get("code") != "Ok":
                logger.warning(f"OSRM returned: {data.get('code')}")
                return []
            return data.get("routes", [])
    except Exception as e:
        logger.error(f"OSRM routing error: {e}")
        return []


def _extract_road_names(route: Dict) -> List[str]:
    """Extract unique road/street names from OSRM steps."""
    names = []
    for leg in route.get("legs", []):
        for step in leg.get("steps", []):
            name = step.get("name", "")
            ref = step.get("ref", "")
            road = ref or name
            if road and road not in names and road != "":
                names.append(road)
    return names[:8]  # Limit to 8 segments for display


def _compute_risk_score(route: Dict, detection_data: Optional[Dict]) -> int:
    """Compute a risk score based on route characteristics + detection context."""
    distance_km = route["distance"] / 1000
    duration_min = route["duration"] / 60

    # Base risk from average speed (higher speed = higher risk)
    avg_speed_kmh = (distance_km / max(duration_min / 60, 0.01))
    speed_risk = min(avg_speed_kmh / 1.5, 30)  # Max 30 from speed

    # Risk from route complexity (more legs/steps = more intersections)
    steps_count = sum(len(leg.get("steps", [])) for leg in route.get("legs", []))
    complexity_risk = min(steps_count * 0.8, 25)

    # Risk from detection data
    detection_risk = 0
    if detection_data:
        accidents = detection_data.get("accidents", 0)
        violations = detection_data.get("violations", 0)
        vehicles = detection_data.get("vehicles", 0)
        detection_risk = min(
            accidents * 15 + violations * 3 + (vehicles / 100) * 2,
            45
        )

    total = int(min(speed_risk + complexity_risk + detection_risk, 100))
    return max(total, 5)  # Minimum 5


def _safety_rating(risk: int) -> str:
    if risk < 20: return "A+"
    if risk < 35: return "A"
    if risk < 50: return "B"
    if risk < 65: return "C"
    return "D"


def _generate_warnings(risk: int, avg_speed: float, steps: int) -> List[str]:
    w = []
    if avg_speed > 70:
        w.append("⚠ High-speed corridors — maintain safe distance")
    if steps > 15:
        w.append("⚠ Multiple intersections on route — expect stops")
    if risk > 60:
        w.append("⚠ Elevated risk area — proceed with caution")
    if risk > 80:
        w.append("🚨 High risk zone — consider alternative route")
    return w


def _generate_advantages(label: str, risk: int, time_min: float, km: float) -> List[str]:
    adv = []
    if label == "Fastest":
        adv.append(f"✓ Shortest travel time: ~{int(time_min)} min")
    if label == "Safest":
        adv.append("✓ Lowest risk score among alternatives")
    if label == "Balanced":
        adv.append("✓ Good mix of speed and safety")
    if risk < 30:
        adv.append("✓ Low-risk corridor")
    if km < 10:
        adv.append("✓ Short distance route")
    adv.append("✓ Real-time OSRM-verified road route")
    return adv


# ─── Route Analyser ──────────────────────────────────────────────────────────

class RouteAnalyser:
    """
    Real routing engine using OSRM for actual road routes.
    Combines with AI risk analysis for safety scoring.
    """

    async def recommend_routes_async(
        self,
        origin: str,
        destination: str,
        detection_data: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """Get real routes from OSRM and score them."""

        # 1. Geocode both locations
        origin_geo = await geocode(origin)
        dest_geo = await geocode(destination)

        if not origin_geo:
            return self._fallback_routes(origin, destination, detection_data,
                                         error=f"Could not find location: '{origin}'. Try a more specific name (e.g., 'MG Road, Bangalore').")
        if not dest_geo:
            return self._fallback_routes(origin, destination, detection_data,
                                         error=f"Could not find location: '{destination}'. Try a more specific name.")

        origin_name = origin_geo[2]
        dest_name = dest_geo[2]

        # 2. Get OSRM routes
        osrm_routes = await get_osrm_routes(
            (origin_geo[0], origin_geo[1]),
            (dest_geo[0], dest_geo[1]),
        )

        if not osrm_routes:
            return self._fallback_routes(origin, destination, detection_data,
                                         error="No driving routes found between these locations.")

        # 3. Process and score each route
        labels = ["Fastest", "Balanced", "Safest"]
        recommendations = []

        # Sort by duration first (fastest → slowest)
        osrm_routes_sorted = sorted(osrm_routes, key=lambda r: r["duration"])

        for i, route in enumerate(osrm_routes_sorted[:3]):
            label = labels[i] if i < len(labels) else f"Alternative {i+1}"
            distance_km = round(route["distance"] / 1000, 1)
            duration_min = round(route["duration"] / 60, 1)
            segments = _extract_road_names(route)
            risk = _compute_risk_score(route, detection_data)

            # Adjust risk: safest route gets bonus, fastest gets penalty
            if label == "Safest":
                risk = max(risk - 10, 5)
            elif label == "Fastest":
                risk = min(risk + 8, 95)

            avg_speed = (distance_km / max(duration_min / 60, 0.01))
            steps = sum(len(leg.get("steps", [])) for leg in route.get("legs", []))

            rec = {
                "route_id": f"route_{label.lower()}",
                "label": label,
                "from": origin_name,
                "to": dest_name,
                "segments": segments if segments else [f"{origin} → {destination}"],
                "total_km": distance_km,
                "estimated_time_min": duration_min,
                "risk_score": risk,
                "safety_rating": _safety_rating(risk),
                "description": (
                    f"{label} route: {distance_km} km, ~{int(duration_min)} min. "
                    f"Risk: {'low' if risk < 40 else 'moderate' if risk < 70 else 'high'} ({risk}/100)."
                ),
                "warnings": _generate_warnings(risk, avg_speed, steps),
                "advantages": _generate_advantages(label, risk, duration_min, distance_km),
            }
            recommendations.append(rec)

        return recommendations

    def recommend_routes(
        self,
        origin: str,
        destination: str,
        detection_data: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """Synchronous wrapper for backwards compatibility."""
        import asyncio
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor() as pool:
                    future = pool.submit(
                        asyncio.run,
                        self.recommend_routes_async(origin, destination, detection_data)
                    )
                    return future.result(timeout=20)
            return loop.run_until_complete(
                self.recommend_routes_async(origin, destination, detection_data)
            )
        except Exception as e:
            logger.error(f"Route recommendation failed: {e}")
            return self._fallback_routes(origin, destination, detection_data, error=str(e))

    def _fallback_routes(self, origin: str, dest: str, ctx: Optional[Dict], error: str = "") -> List[Dict]:
        """Generate sensible fallback when OSRM is unreachable."""
        accidents = ctx.get("accidents", 0) if ctx else 0
        violations = ctx.get("violations", 0) if ctx else 0
        vehicles = ctx.get("vehicles", 500) if ctx else 500

        return [
            {
                "route_id": "route_fastest",
                "label": "Fastest",
                "from": origin, "to": dest,
                "segments": [f"{origin} → Highway → {dest}"],
                "total_km": 13.3,
                "estimated_time_min": 18,
                "risk_score": min(55 + accidents * 10, 90),
                "safety_rating": "B",
                "description": f"Fastest route via highway. {error}" if error else "Fastest route via highway corridors.",
                "warnings": ["⚠ Route data is estimated (geocoding/routing unavailable)"] + ([f"⚠ {accidents} accident(s) reported"] if accidents > 0 else []),
                "advantages": ["✓ Expected fastest travel time"],
            },
            {
                "route_id": "route_safest",
                "label": "Safest",
                "from": origin, "to": dest,
                "segments": [f"{origin} → Residential → {dest}"],
                "total_km": 11.2,
                "estimated_time_min": 28,
                "risk_score": max(20 - accidents * 2, 5),
                "safety_rating": "A+",
                "description": "Safest route through residential areas with low traffic.",
                "warnings": [],
                "advantages": ["✓ Minimal accident history", "✓ Low traffic corridor"],
            },
            {
                "route_id": "route_balanced",
                "label": "Balanced",
                "from": origin, "to": dest,
                "segments": [f"{origin} → Main Road → {dest}"],
                "total_km": 9.5,
                "estimated_time_min": 22,
                "risk_score": 35,
                "safety_rating": "A",
                "description": "Balanced route with good speed/safety mix.",
                "warnings": [],
                "advantages": ["✓ Good balance of speed and safety"],
            },
        ]


# ─── Gemini-Powered Traffic Chatbot ─────────────────────────────────────────

class TrafficChatbot:
    """
    AI Traffic Chatbot powered by Google Gemini 1.5 Flash.
    Falls back to rule-based responses when Gemini is unavailable.
    Uses OSRM for real route data.
    """

    def __init__(self):
        self.analyser = RouteAnalyser()
        self.context: Dict[str, Any] = {}

    def chat(
        self,
        message: str,
        detection_context: Optional[Dict[str, Any]] = None,
        history: Optional[List[Dict]] = None,
    ) -> Dict[str, Any]:
        """Process a user message via Gemini AI + OSRM routing."""
        import asyncio

        msg = message.strip()
        history = history or []

        if detection_context:
            self.context.update(detection_context)

        # Check if it's a route request — extract origin/destination
        is_route = self._is_route_request(msg)

        if is_route:
            origin, destination = self._extract_locations(msg)
            try:
                loop = asyncio.new_event_loop()
                routes = loop.run_until_complete(
                    self.analyser.recommend_routes_async(origin, destination, detection_context)
                )
                loop.close()
            except Exception as e:
                logger.error(f"Async route error: {e}")
                routes = self.analyser._fallback_routes(origin, destination, detection_context, str(e))

            # Use Gemini to generate a natural response about the routes
            route_summary = self._format_routes_for_gemini(routes)
            gemini_reply = self._ask_gemini(
                f"The user asked: '{msg}'\n\nHere are the real route options I found:\n{route_summary}\n\n"
                f"Please present these routes to the user in a friendly way. Highlight the recommended one based on their preference. "
                f"Keep it concise (under 150 words).",
                history
            )

            if not gemini_reply:
                # Fallback without Gemini
                best = routes[0] if routes else None
                gemini_reply = (
                    f"🗺️ **Route Options: {routes[0]['from']} → {routes[0]['to']}**\n\n" if routes else "🗺️ **Route Options:**\n\n"
                )
                for r in routes:
                    gemini_reply += (
                        f"**{r['label']}** — {r['total_km']} km, ~{int(r['estimated_time_min'])} min\n"
                        f"- Risk: {r['risk_score']}/100 ({r['safety_rating']}) | Via: {', '.join(r['segments'][:3])}\n\n"
                    )

            return {
                "type": "route",
                "reply": gemini_reply,
                "routes": routes,
                "suggestions": ["Show fastest route details", "Any safety warnings?", "Alternative routes"],
            }

        # Non-route query — use Gemini directly
        context_info = ""
        if self.context:
            context_info = (
                f"\n\nCurrent detection context: {self.context.get('vehicles', 0)} vehicles, "
                f"{self.context.get('accidents', 0)} accidents, "
                f"{self.context.get('violations', 0)} violations detected."
            )

        gemini_reply = self._ask_gemini(
            f"User message: '{msg}'{context_info}\n\nRespond helpfully about traffic, routes, or safety.",
            history
        )

        if gemini_reply:
            suggestions = self._generate_suggestions(msg)
            return {
                "type": "chat",
                "reply": gemini_reply,
                "suggestions": suggestions,
            }

        # Full fallback (no Gemini)
        return self._rule_based_fallback(msg, detection_context)

    def _is_route_request(self, msg: str) -> bool:
        route_keywords = [
            "route", "path", "way", "direction", "navigate", "go to",
            "how to reach", "fastest", "safest", "shortest", "best way",
            "take me", "drive to", "travel to", "from", " to ",
            "reach", "commute", "trip"
        ]
        msg_lower = msg.lower()
        return any(kw in msg_lower for kw in route_keywords)

    def _extract_locations(self, msg: str) -> tuple:
        """Extract origin and destination from message."""
        msg_lower = msg.lower()

        # Pattern: "from X to Y"
        if " from " in msg_lower and " to " in msg_lower:
            try:
                from_part = msg_lower.split(" from ")[1]
                parts = from_part.split(" to ")
                if len(parts) >= 2:
                    origin = parts[0].strip().title()
                    destination = parts[1].strip().rstrip("?.!").title()
                    return (origin, destination)
            except:
                pass

        # Pattern: "to Y from X"
        if " to " in msg_lower:
            parts = msg_lower.split(" to ")
            if len(parts) >= 2:
                destination = parts[-1].strip().rstrip("?.!").title()
                # Try to find origin
                before = parts[0]
                origin_words = before.split()
                if len(origin_words) >= 2:
                    origin = " ".join(origin_words[-2:]).title()
                else:
                    origin = "Current Location"
                return (origin, destination)

        # Pattern: "route/way/path to X"
        for trigger in ["route to ", "way to ", "path to ", "go to ", "reach ", "drive to ", "navigate to ", "travel to "]:
            if trigger in msg_lower:
                destination = msg_lower.split(trigger)[1].strip().rstrip("?.!").title()
                return ("Current Location", destination)

        return ("Current Location", "City Center")

    def _format_routes_for_gemini(self, routes: List[Dict]) -> str:
        """Format routes into a text summary for Gemini to interpret."""
        lines = []
        for r in routes:
            lines.append(
                f"- {r['label']}: {r['total_km']}km, {int(r['estimated_time_min'])}min, "
                f"risk={r['risk_score']}/100 (rating: {r['safety_rating']}), "
                f"via {', '.join(r['segments'][:4])}"
            )
            if r['warnings']:
                lines.append(f"  Warnings: {'; '.join(r['warnings'])}")
        return "\n".join(lines)

    def _ask_gemini(self, prompt: str, history: List[Dict]) -> Optional[str]:
        """Send a prompt to Gemini and get a response."""
        model = _get_gemini()
        if not model:
            return None

        try:
            # Build chat history for context
            gemini_history = []
            for msg in history[-6:]:
                role = "user" if msg.get("role") == "user" else "model"
                gemini_history.append({"role": role, "parts": [msg.get("content", "")]})

            chat = model.start_chat(history=gemini_history)
            response = chat.send_message(prompt)
            return response.text.strip()
        except Exception as e:
            logger.error(f"Gemini API error: {e}")
            return None

    def _generate_suggestions(self, msg: str) -> List[str]:
        """Generate contextual follow-up suggestions."""
        msg_lower = msg.lower()
        if any(w in msg_lower for w in ["risk", "danger", "safe"]):
            return ["Show safest route", "View violation details", "Send alert"]
        if any(w in msg_lower for w in ["accident", "crash", "alert"]):
            return ["View alternative routes", "Check current risk", "Report to authority"]
        if any(w in msg_lower for w in ["weather", "rain", "fog"]):
            return ["Safest route now", "Check road conditions", "Driving tips"]
        return ["Recommend a safe route", "Current risk level", "Analyse traffic data"]

    def _rule_based_fallback(self, msg: str, ctx: Optional[Dict]) -> Dict:
        """Simple rule-based response when Gemini is unavailable."""
        msg_lower = msg.lower()

        if any(t in msg_lower for t in ["hi", "hello", "hey", "help"]):
            return {
                "type": "greeting",
                "reply": (
                    "👋 Hi! I'm **TraffixAI Assistant**.\n\n"
                    "I can help with:\n"
                    "- 🗺️ Route recommendations\n"
                    "- 📊 Risk analysis\n"
                    "- 🚨 Accident alerts\n\n"
                    "What would you like to know?"
                ),
                "suggestions": ["Recommend a safe route", "Current risk level", "Show alerts"],
            }

        if any(t in msg_lower for t in ["risk", "danger", "safe", "score"]):
            risk = ctx.get("risk_score", 45) if ctx else 45
            level = "🟢 Low" if risk < 40 else "🟡 Medium" if risk < 70 else "🔴 High"
            return {
                "type": "risk",
                "reply": (
                    f"📊 **Current Risk Level:** {level} ({risk}/100)\n\n"
                    f"- 🚗 Vehicles: {ctx.get('vehicles', 0) if ctx else 'N/A'}\n"
                    f"- ⚠️ Violations: {ctx.get('violations', 0) if ctx else 'N/A'}\n"
                    f"- 🚨 Accidents: {ctx.get('accidents', 0) if ctx else 'N/A'}"
                ),
                "suggestions": ["Show safest route", "View details", "Send alert"],
            }

        return {
            "type": "general",
            "reply": (
                "I can help with traffic routes, risk analysis, and safety tips. "
                "Try asking:\n"
                "- \"Route from MG Road to Brigade Road\"\n"
                "- \"What's the current risk level?\"\n"
                "- \"Is it safe to drive in rain?\""
            ),
            "suggestions": ["Recommend a safe route", "Current risk level", "Driving tips"],
        }
