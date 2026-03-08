from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from math import fabs

from .velocity import MotionState


@dataclass
class RuleResult:
    status: str  # normal | violation | accident
    violation_tags: list[str]
    accident_tags: list[str]


def _iou(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    x1 = max(ax1, bx1)
    y1 = max(ay1, by1)
    x2 = min(ax2, bx2)
    y2 = min(ay2, by2)
    inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


class RuleEngine:
    def __init__(self, speed_limit_mps: float = 16.7, lane_lateral_px: float = 20.0, expected_lane_direction: float = 0.0) -> None:
        self.speed_limit_mps = speed_limit_mps
        self.lane_lateral_px = lane_lateral_px
        self.expected_lane_direction = expected_lane_direction

    def evaluate(
        self,
        motion: MotionState,
        bbox: tuple[float, float, float, float],
        other_boxes: list[tuple[float, float, float, float]],
        class_name: str,
        previous_direction: float | None,
        bike_tilt_deg: float = 0.0,
    ) -> RuleResult:
        violations: list[str] = []
        accidents: list[str] = []

        # Accident logic per requirement
        if motion.velocity_drop_ratio > 0.60:
            accidents.append("sudden_velocity_drop")

        if previous_direction is not None and fabs(motion.direction_deg - previous_direction) > 45.0:
            accidents.append("direction_change")

        has_collision = any(_iou(bbox, obox) > 0.45 for obox in other_boxes)
        if has_collision:
            accidents.append("collision_overlap")

        if class_name == "motorcycle" and bike_tilt_deg > 50.0:
            accidents.append("bike_tilt")

        # Violation logic per requirement
        if motion.speed > self.speed_limit_mps:
            violations.append("overspeed")

        if fabs(motion.direction_deg - self.expected_lane_direction) > 150.0:
            violations.append("wrong_direction")

        if motion.lateral_delta > self.lane_lateral_px:
            violations.append("lane_anomaly")

        status = "normal"
        if violations:
            status = "violation"
        if accidents:
            status = "accident"

        return RuleResult(status=status, violation_tags=violations, accident_tags=accidents)

    @staticmethod
    def summarize_violation_types(tags: list[str]) -> list[dict]:
        label_map = {
            "overspeed": ("Speeding", "high"),
            "wrong_direction": ("Wrong Way", "critical"),
            "lane_anomaly": ("Lane Change", "medium"),
        }
        count = Counter(tags)
        out = []
        idx = 1
        for key, qty in count.items():
            label, severity = label_map.get(key, (key, "low"))
            out.append({"id": f"v{idx}", "label": label, "count": qty, "severity": severity})
            idx += 1
        return out

