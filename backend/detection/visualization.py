from __future__ import annotations

import base64
from typing import Literal

import cv2
import numpy as np


StatusType = Literal["normal", "violation", "accident"]


def status_color(status: StatusType) -> tuple[int, int, int]:
    if status == "accident":
        return (0, 0, 255)
    if status == "violation":
        return (0, 215, 255)
    return (0, 220, 0)


def draw_overlay(
    frame: np.ndarray,
    bbox: tuple[float, float, float, float],
    label: str,
    track_id: int,
    speed_mps: float,
    status: StatusType,
) -> None:
    x1, y1, x2, y2 = map(int, bbox)
    color = status_color(status)
    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
    text = f"ID:{track_id} {label} {speed_mps:.1f}m/s {status.upper()}"
    cv2.rectangle(frame, (x1, max(0, y1 - 24)), (x1 + 300, y1), color, -1)
    cv2.putText(frame, text, (x1 + 4, y1 - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)


def frame_to_base64(frame: np.ndarray) -> str:
    ok, encoded = cv2.imencode(".jpg", frame)
    if not ok:
        return ""
    return base64.b64encode(encoded.tobytes()).decode("utf-8")

