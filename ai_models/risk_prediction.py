"""
TraffixAI - Risk Prediction Module
Computes traffic risk scores from detection data.
"""

import math
import logging
from typing import Dict, Any, Tuple

logger = logging.getLogger(__name__)


class RiskPredictor:
    """
    Calculates traffic risk scores using a weighted formula.

    Risk Score (0-100) = weighted combination of:
      - Violation density
      - Accident frequency
      - Vehicle density (congestion factor)

    Risk Levels:
      - Low:    0–39
      - Medium: 40–69
      - High:   70–100
    """

    # Weights for each factor (must sum to 1.0)
    WEIGHTS = {
        "violations": 0.35,
        "accidents": 0.45,
        "density": 0.20,
    }

    # Normalization maxima tuned for per-upload analysis (single image/video job)
    # rather than city-wide daily aggregates.
    MAX_VIOLATIONS = 30
    MAX_ACCIDENTS = 5
    MAX_VEHICLE_DENSITY = 400

    # Thresholds
    HIGH_RISK_THRESHOLD = 70
    MEDIUM_RISK_THRESHOLD = 40

    def predict(
        self,
        violations: int,
        accidents: int,
        vehicle_density: int,
    ) -> Dict[str, Any]:
        """
        Compute risk score.

        Args:
            violations: Number of traffic violations detected
            accidents: Number of accidents detected
            vehicle_density: Number of vehicles (traffic volume)

        Returns:
            dict with keys: score, level, factors, recommendation
        """
        # Normalize inputs to [0, 1]
        norm_violations = min(violations / self.MAX_VIOLATIONS, 1.0)
        norm_accidents = min(accidents / self.MAX_ACCIDENTS, 1.0)
        norm_density = min(vehicle_density / self.MAX_VEHICLE_DENSITY, 1.0)

        # Apply sigmoid-like boost for high accident counts
        accident_boost = 1 + (0.5 * math.tanh((accidents - 3) / 3))

        # Weighted score
        raw_score = (
            self.WEIGHTS["violations"] * norm_violations +
            self.WEIGHTS["accidents"] * norm_accidents * accident_boost +
            self.WEIGHTS["density"] * norm_density
        )

        # Scale to 0–100 and clamp
        score = int(round(min(max(raw_score * 100, 0), 100)))

        # Avoid showing 0/100 when there are detected incidents.
        if score == 0 and (violations > 0 or accidents > 0):
            score = 5

        level, color, recommendation = self._classify(score, accidents)

        result = {
            "score": score,
            "level": level,
            "color": color,
            "recommendation": recommendation,
            "factors": {
                "violations_normalized": round(norm_violations, 3),
                "accidents_normalized": round(norm_accidents * accident_boost, 3),
                "density_normalized": round(norm_density, 3),
            },
            "inputs": {
                "violations": violations,
                "accidents": accidents,
                "vehicle_density": vehicle_density,
            },
        }

        logger.info(f"Risk prediction: score={score}, level={level}")
        return result

    def _classify(self, score: int, accidents: int) -> Tuple[str, str, str]:
        """Return (level, color_hex, recommendation) based on score."""
        if score >= self.HIGH_RISK_THRESHOLD or accidents >= 5:
            return (
                "High",
                "#ef4444",
                "IMMEDIATE ACTION REQUIRED: Deploy emergency response units, activate traffic management protocol, and alert hospitals.",
            )
        elif score >= self.MEDIUM_RISK_THRESHOLD or accidents >= 2:
            return (
                "Medium",
                "#f59e0b",
                "ELEVATED CAUTION: Increase patrol frequency, monitor intersections actively, and prepare response teams.",
            )
        else:
            return (
                "Low",
                "#10b981",
                "NORMAL CONDITIONS: Continue standard monitoring. Review periodic reports for trend analysis.",
            )


# ─── Standalone prediction ─────────────────────────────────────────────────────
if __name__ == "__main__":
    predictor = RiskPredictor()

    examples = [
        {"violations": 15, "accidents": 3, "vehicle_density": 2500},
        {"violations": 80, "accidents": 10, "vehicle_density": 4500},
        {"violations": 5, "accidents": 0, "vehicle_density": 800},
    ]

    for ex in examples:
        result = predictor.predict(**ex)
        print(
            f"Input: {ex} "
            f"→ Score: {result['score']}, Level: {result['level']}, "
            f"Rec: {result['recommendation'][:60]}..."
        )
