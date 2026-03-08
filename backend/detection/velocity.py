from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass
from math import atan2, degrees, sqrt


@dataclass
class MotionState:
    speed: float
    direction_deg: float
    velocity_drop_ratio: float
    lateral_delta: float


class VelocityEstimator:
    def __init__(self, max_history: int = 8, fps: float = 10.0, pixel_to_meter: float = 0.07) -> None:
        self.max_history = max_history
        self.fps = fps
        self.pixel_to_meter = pixel_to_meter
        self.positions: dict[int, deque[tuple[float, float]]] = defaultdict(lambda: deque(maxlen=max_history))
        self.speeds: dict[int, deque[float]] = defaultdict(lambda: deque(maxlen=max_history))

    def update(self, track_id: int, bbox: tuple[float, float, float, float]) -> MotionState:
        x1, y1, x2, y2 = bbox
        cx = (x1 + x2) / 2.0
        cy = (y1 + y2) / 2.0

        history = self.positions[track_id]
        speed_history = self.speeds[track_id]
        history.append((cx, cy))

        if len(history) < 2:
            return MotionState(speed=0.0, direction_deg=0.0, velocity_drop_ratio=0.0, lateral_delta=0.0)

        (px, py), (nx, ny) = history[-2], history[-1]
        dx = nx - px
        dy = ny - py
        distance_px = sqrt((dx * dx) + (dy * dy))
        speed_mps = distance_px * self.pixel_to_meter * self.fps
        speed_history.append(speed_mps)

        prev_speed = speed_history[-2] if len(speed_history) > 1 else speed_mps
        velocity_drop_ratio = 0.0
        if prev_speed > 0:
            velocity_drop_ratio = max(0.0, min(1.0, (prev_speed - speed_mps) / prev_speed))

        direction = degrees(atan2(dy, dx))
        return MotionState(
            speed=speed_mps,
            direction_deg=direction,
            velocity_drop_ratio=velocity_drop_ratio,
            lateral_delta=abs(dy),
        )

