from __future__ import annotations

import os
from typing import Any

import httpx


class LLMJudge:
    """Llama + Cloudflare AI judge for upload analysis decisions."""

    def __init__(self) -> None:
        self.cloudflare_account_id = os.getenv("CLOUDFLARE_ACCOUNT_ID", "").strip()
        self.cloudflare_api_token = os.getenv("CLOUDFLARE_API_TOKEN", "").strip()
        self.cloudflare_llm_model = os.getenv("CLOUDFLARE_LLM_MODEL", "@cf/meta/llama-3.1-8b-instruct")

    @property
    def enabled(self) -> bool:
        return bool(self.cloudflare_account_id and self.cloudflare_api_token)

    async def judge_upload(
        self,
        *,
        media_type: str,
        location: str,
        detection: dict[str, Any],
    ) -> dict[str, Any]:
        baseline = {
            "enabled": self.enabled,
            "status": "missing_credentials" if not self.enabled else "ready",
            "model": self.cloudflare_llm_model,
            "verdict": "manual_review",
            "confidence": 0.0,
            "summary": "LLM judge not configured; fallback to rule-based detection output.",
            "recommended_action": "manual_review",
        }
        if not self.enabled:
            return baseline

        prompt = self._build_prompt(media_type=media_type, location=location, detection=detection)
        try:
            response_text = await self._call_llama(prompt)
            parsed = self._parse_judge_response(response_text)
            return {
                "enabled": True,
                "status": "ready",
                "model": self.cloudflare_llm_model,
                "verdict": parsed["verdict"],
                "confidence": parsed["confidence"],
                "summary": parsed["summary"],
                "recommended_action": parsed["recommended_action"],
                "raw": response_text,
            }
        except Exception as exc:
            return {
                **baseline,
                "status": "error",
                "summary": f"LLM judge failed: {exc}",
            }

    def _build_prompt(self, *, media_type: str, location: str, detection: dict[str, Any]) -> str:
        return (
            "You are the final judge for a traffic safety upload result.\n"
            "Given the AI detection output, return a concise judgment.\n"
            "Return plain text only using exactly these lines:\n"
            "VERDICT: <safe|needs_review|critical>\n"
            "CONFIDENCE: <0.00 to 1.00>\n"
            "ACTION: <log_only|send_to_admin|emergency_alert>\n"
            "SUMMARY: <one short sentence>\n\n"
            f"Media Type: {media_type}\n"
            f"Location: {location or 'Unknown'}\n"
            f"Vehicles: {int(detection.get('vehicles', 0))}\n"
            f"Pedestrians: {int(detection.get('pedestrians', 0))}\n"
            f"Violations: {int(detection.get('violations', 0))}\n"
            f"Accidents: {int(detection.get('accidents', 0))}\n"
            f"Risk Score: {int(detection.get('risk_score', 0))}\n"
            f"Violation Types: {detection.get('violation_types', [])}\n"
        )

    async def _call_llama(self, prompt: str) -> str:
        url = (
            f"https://api.cloudflare.com/client/v4/accounts/"
            f"{self.cloudflare_account_id}/ai/run/{self.cloudflare_llm_model}"
        )
        headers = {
            "Authorization": f"Bearer {self.cloudflare_api_token}",
            "Content-Type": "application/json",
        }
        payload = {
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are a strict traffic safety judge. "
                        "Follow output format exactly and be concise."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            "max_tokens": 220,
            "temperature": 0.15,
        }

        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()
            return data.get("result", {}).get("response", "").strip()

    def _parse_judge_response(self, text: str) -> dict[str, Any]:
        parsed: dict[str, str] = {}
        for raw_line in text.splitlines():
            if ":" not in raw_line:
                continue
            key, value = raw_line.split(":", 1)
            parsed[key.strip().lower()] = value.strip()

        verdict = parsed.get("verdict", "needs_review").lower()
        if verdict not in {"safe", "needs_review", "critical"}:
            verdict = "needs_review"

        action = parsed.get("action", "send_to_admin").lower()
        if action not in {"log_only", "send_to_admin", "emergency_alert"}:
            action = "send_to_admin"

        try:
            confidence = float(parsed.get("confidence", "0.6"))
        except ValueError:
            confidence = 0.6
        confidence = max(0.0, min(1.0, confidence))

        summary = parsed.get("summary", "Traffic event requires review.")

        return {
            "verdict": verdict,
            "confidence": confidence,
            "recommended_action": action,
            "summary": summary,
        }
