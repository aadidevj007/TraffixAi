from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np

try:
    from deep_sort_realtime.deepsort_tracker import DeepSort
except Exception:  # pragma: no cover
    DeepSort = None


@dataclass
class TrackedObject:
    track_id: int
    bbox: tuple[float, float, float, float]
    class_name: str
    confidence: float


class ObjectTracker:
    def __init__(self) -> None:
        self._fallback_id = 1
        self._tracker = None
        if DeepSort is not None:
            try:
                self._tracker = DeepSort(max_age=20, n_init=2)
            except Exception:
                self._tracker = None

    def update(self, frame: np.ndarray, detections: list[tuple[list[float], float, str]]) -> list[TrackedObject]:
        if self._tracker is None:
            return self._fallback_update(detections)

        tracks = self._tracker.update_tracks(detections, frame=frame)
        out: list[TrackedObject] = []
        for track in tracks:
            if not track.is_confirmed():
                continue
            ltrb = track.to_ltrb()
            det_class = getattr(track, "det_class", "unknown")
            det_conf = float(getattr(track, "det_conf", 0.0) or 0.0)
            out.append(
                TrackedObject(
                    track_id=int(track.track_id),
                    bbox=(float(ltrb[0]), float(ltrb[1]), float(ltrb[2]), float(ltrb[3])),
                    class_name=str(det_class),
                    confidence=det_conf,
                )
            )
        return out

    def _fallback_update(self, detections: list[tuple[list[float], float, str]]) -> list[TrackedObject]:
        out: list[TrackedObject] = []
        for (xywh, conf, class_name) in detections:
            x, y, w, h = xywh
            out.append(
                TrackedObject(
                    track_id=self._fallback_id,
                    bbox=(x, y, x + w, y + h),
                    class_name=class_name,
                    confidence=float(conf),
                )
            )
            self._fallback_id += 1
        return out

