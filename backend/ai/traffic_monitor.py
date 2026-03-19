"""
Traffic Monitor module for FastAPI backend.
Refactored from traffic_monitor.py for API use.
All 12 violation modules preserved.
"""

import cv2
import numpy as np
from ultralytics import YOLO
from collections import defaultdict, deque
import time
import math
import os


class TrafficMonitor:
    def __init__(self, model_path=None, conf_threshold=0.4):
        root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        if model_path is None:
            # Prefer a general detector by default; accident-only models are
            # too narrow for full traffic analytics.
            explicit = os.getenv("YOLO_MODEL_PATH") or os.getenv("YOLO_WEIGHTS_PATH")
            candidates = [
                os.path.join(root, "backend", "models", "yolov8n.pt"),
                os.path.join(root, "backend", "models", "accident_model.pt"),
                os.path.join(root, "traffic_models", "yolov8n.pt"),
                os.path.join(root, "traffic_models", "YOLO-Weights", "best-versi-1.pt"),
                os.path.join(root, "traffic_models", "YOLO-Weights", "yolov8m-dataset-7000-300.pt"),
                os.path.join(root, "traffic_models", "YOLO-Weights", "yolov8s-100.pt"),
                os.path.join(root, "yolov8n.pt"),
            ]
            if explicit and os.path.exists(explicit):
                model_path = explicit
            else:
                model_path = next((p for p in candidates if os.path.exists(p)), candidates[-1])
        self.model = YOLO(model_path)
        self.root_dir = root
        explicit_crash_model = os.getenv("ACCIDENT_MODEL_PATH") or os.getenv("CRASH_MODEL_PATH")
        crash_candidates = [
            explicit_crash_model,
            os.path.join(root, "backend", "models", "accident_model.pt"),
            os.path.join(root, "traffic_models", "YOLO-Weights", "accident_model.pt"),
            os.path.join(root, "traffic", "YOLO-Weights", "accident_model.pt"),
        ]
        crash_model_path = next((p for p in crash_candidates if p and os.path.exists(p)), None)
        self.crash_model = YOLO(crash_model_path) if crash_model_path else None
        self.model_names = getattr(self.model, "names", {}) or {}
        self.track_history = defaultdict(lambda: deque(maxlen=60))
        self.velocity_history = defaultdict(lambda: deque(maxlen=20))
        self.accident_cooldown = {}
        self.violation_cooldown = {}
        self.stopped_vehicle_timers = {}
        self.dominant_direction = None
        self.direction_votes = deque(maxlen=200)
        self.conf_threshold = conf_threshold
        self.violation_cooldown_seconds = 5

        self.person_class_id = 0
        self.motorcycle_class_id = 3
        self.bicycle_class_id = 1
        self.traffic_light_class_id = 9

        self.vehicle_classes = {
            1: 'bicycle', 2: 'car', 3: 'motorcycle', 5: 'bus', 7: 'truck',
        }
        self.all_classes = {**self.vehicle_classes, 0: 'person', 9: 'traffic light'}

        # Thresholds
        self.accident_iou_threshold = 0.50
        self.accident_overlap_over_smaller_threshold = float(
            os.getenv("ACCIDENT_OVERLAP_OVER_SMALLER_THRESHOLD", "0.45")
        )
        self.accident_decel_threshold = 0.5
        self.accident_min_track_history = int(os.getenv("ACCIDENT_MIN_TRACK_HISTORY", "4"))
        self.accident_motion_threshold = float(os.getenv("ACCIDENT_MOTION_THRESHOLD", "1.2"))
        self.crash_conf_threshold = float(os.getenv("CRASH_CONF_THRESHOLD", "0.72"))
        self.crash_vehicle_iou_threshold = float(os.getenv("CRASH_VEHICLE_IOU_THRESHOLD", "0.10"))
        self.crash_min_vehicle_matches = int(os.getenv("CRASH_MIN_VEHICLE_MATCHES", "2"))
        self.crash_force_confidence_threshold = float(
            os.getenv("CRASH_FORCE_CONFIDENCE_THRESHOLD", "0.98")
        )
        self.fallen_bike_aspect_ratio = float(os.getenv("FALLEN_BIKE_ASPECT_RATIO", "1.45"))
        self.fallen_bike_min_area_ratio = float(os.getenv("FALLEN_BIKE_MIN_AREA_RATIO", "0.010"))
        self.fallen_bike_person_distance_factor = float(
            os.getenv("FALLEN_BIKE_PERSON_DISTANCE_FACTOR", "1.35")
        )
        self.rider_iou_threshold = 0.30
        self.helmet_dark_ratio_lo = 0.30
        self.helmet_dark_ratio_hi = 0.65
        self.helmet_roundness_threshold = 0.50
        self.helmet_min_head_pixels = 400  # min head crop area to analyze
        self.lane_change_x_pct = 0.10
        self.lane_change_window = 20
        self.accident_cooldown_seconds = 8
        self.speed_threshold_px = 100
        self.stopped_time_threshold = 8.0
        self.stopped_speed_threshold = 1.5
        self.tailgate_distance_pct = 0.05
        self.jaywalking_zone_top_pct = 0.20
        self.jaywalking_zone_bot_pct = 0.20
        self.uturn_angle_threshold = 150
        self.wrong_way_min_history = 20

        # Module toggles
        self.enable_helmet = True
        self.enable_riders = True
        self.enable_accident = True
        self.enable_lane_change = True
        self.enable_wrong_way = True
        self.enable_speeding = True
        self.enable_stopped = True
        self.enable_jaywalking = True
        self.enable_tailgating = True
        self.enable_red_light = True
        self.enable_uturn = True
        self.enable_crash_model = os.getenv("ENABLE_CRASH_MODEL_AUX", "false").strip().lower() in {
            "1", "true", "yes"
        }
        # Static image crash inference is noisy without motion cues.
        # Keep disabled by default; can be enabled via env if needed.
        self.enable_static_image_accident = os.getenv(
            "ENABLE_STATIC_IMAGE_ACCIDENT_DETECTION", "false"
        ).strip().lower() == "true"
        self.static_accident_iou_threshold = float(
            os.getenv("STATIC_ACCIDENT_IOU_THRESHOLD", "0.28")
        )
        self.static_accident_overlap_threshold = float(
            os.getenv("STATIC_ACCIDENT_OVERLAP_THRESHOLD", "0.38")
        )
        self.static_accident_center_factor = float(
            os.getenv("STATIC_ACCIDENT_CENTER_FACTOR", "0.55")
        )

    def _name_for_class(self, cid):
        """Resolve class id to model-provided name, with legacy fallback labels."""
        if isinstance(self.model_names, dict) and cid in self.model_names:
            return str(self.model_names[cid])
        if isinstance(self.model_names, list) and 0 <= cid < len(self.model_names):
            return str(self.model_names[cid])
        return self.all_classes.get(cid, "unknown")

    def _contains_any(self, text, keywords):
        t = (text or "").strip().lower()
        return any(k in t for k in keywords)

    def reset_state(self):
        """Reset trackers/cooldowns between independent uploads."""
        self.track_history.clear()
        self.velocity_history.clear()
        self.accident_cooldown.clear()
        self.violation_cooldown.clear()
        self.stopped_vehicle_timers.clear()
        self.direction_votes.clear()
        self.dominant_direction = None
        # Best-effort reset for Ultralytics tracker internals.
        try:
            if getattr(self.model, "predictor", None) is not None:
                self.model.predictor.trackers = None
        except Exception:
            pass

    # ---- 1. Helmet ----
    def detect_helmet(self, frame, person_box):
        x1, y1, x2, y2 = map(int, person_box)
        h, w = y2 - y1, x2 - x1
        if h <= 0 or w <= 0:
            return False, 0.0
        # Skip if person crop is too small to reliably analyze
        if h * w < self.helmet_min_head_pixels:
            return False, 0.0
        head_y2 = y1 + max(int(h * 0.20), 1)  # top 20% for head region
        head = frame[max(y1, 0):min(head_y2, frame.shape[0]),
                     max(x1, 0):min(x2, frame.shape[1])]
        if head.size < 100:  # need at least 100 pixels to analyze
            return False, 0.0
        score = 0.0
        hsv = cv2.cvtColor(head, cv2.COLOR_BGR2HSV)
        dm = cv2.inRange(hsv, np.array([0, 40, 0]), np.array([180, 255, 120]))
        dr = np.count_nonzero(dm) / dm.size
        if self.helmet_dark_ratio_lo < dr < self.helmet_dark_ratio_hi:
            score += 0.35
        gray = cv2.cvtColor(head, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(cv2.GaussianBlur(gray, (5, 5), 0), 40, 120)
        cnts, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if cnts:
            lg = max(cnts, key=cv2.contourArea)
            a, p = cv2.contourArea(lg), cv2.arcLength(lg, True)
            if p > 0 and 4 * math.pi * a / (p * p) > self.helmet_roundness_threshold:
                score += 0.35
        if np.var(gray.astype(np.float32)) < 800:
            score += 0.3
        return score >= 0.7, round(score, 2)

    # ---- 2. Rider count ----
    def count_bike_riders(self, bike_box, person_boxes):
        riders = [p for p in person_boxes if self.calculate_iou(bike_box, p) >= self.rider_iou_threshold]
        return len(riders), riders

    # ---- 3. Accident ----
    def detect_accident(self, vehicle_detections, timestamp=None, is_static_image=False):
        """
        Detect vehicle accidents.
        For static images (is_static_image=True or all track_ids==-1), we cannot
        rely on deceleration history. In that case, use strict geometric overlap
        cues (IoU + overlap ratio + center distance) to infer likely collisions.
        For video frames with track history, deceleration is required alongside IoU.
        """
        accidents, now = [], timestamp or time.time()

        # Determine if we have any real track history (video mode)
        has_tracks = any(d.get('track_id', -1) != -1 for d in vehicle_detections)
        if is_static_image and not self.enable_static_image_accident:
            return accidents

        if is_static_image or not has_tracks:
            for i, d1 in enumerate(vehicle_detections):
                for d2 in vehicle_detections[i + 1:]:
                    b1 = d1['box']
                    b2 = d2['box']
                    iou = self.calculate_iou(b1, b2)

                    ix1 = max(b1[0], b2[0])
                    iy1 = max(b1[1], b2[1])
                    ix2 = min(b1[2], b2[2])
                    iy2 = min(b1[3], b2[3])
                    inter_w = max(0.0, ix2 - ix1)
                    inter_h = max(0.0, iy2 - iy1)
                    inter_area = inter_w * inter_h
                    area1 = max(1.0, (b1[2] - b1[0]) * (b1[3] - b1[1]))
                    area2 = max(1.0, (b2[2] - b2[0]) * (b2[3] - b2[1]))
                    overlap_ratio = inter_area / min(area1, area2)

                    c1x = (b1[0] + b1[2]) / 2.0
                    c1y = (b1[1] + b1[3]) / 2.0
                    c2x = (b2[0] + b2[2]) / 2.0
                    c2y = (b2[1] + b2[3]) / 2.0
                    center_dist = math.hypot(c1x - c2x, c1y - c2y)
                    diag1 = math.hypot(b1[2] - b1[0], b1[3] - b1[1])
                    diag2 = math.hypot(b2[2] - b2[0], b2[3] - b2[1])
                    avg_diag = max(1.0, (diag1 + diag2) / 2.0)
                    close_enough = center_dist <= (self.static_accident_center_factor * avg_diag)

                    if not close_enough:
                        continue
                    if iou < self.static_accident_iou_threshold:
                        continue
                    if overlap_ratio < self.static_accident_overlap_threshold:
                        continue

                    conf = min(0.98, max(iou, overlap_ratio * 0.8))
                    accidents.append({
                        'vehicles': [d1['class'], d2['class']],
                        'location': b1.tolist() if hasattr(b1, 'tolist') else list(b1),
                        'confidence': round(float(conf), 2),
                        'deceleration': False
                    })
            return accidents

        for i, d1 in enumerate(vehicle_detections):
            for d2 in vehicle_detections[i + 1:]:
                iou = self.calculate_iou(d1['box'], d2['box'])
                if iou < self.accident_iou_threshold:
                    continue
                overlap_ratio = self.calculate_overlap_over_smaller(d1['box'], d2['box'])
                if overlap_ratio < self.accident_overlap_over_smaller_threshold:
                    continue
                t1, t2 = d1.get('track_id', -1), d2.get('track_id', -1)
                if t1 == -1 or t2 == -1:
                    continue
                decel = False
                moving = False
                for t in (t1, t2):
                    v = list(self.velocity_history.get(t, []))
                    if len(v) < self.accident_min_track_history:
                        continue
                    if float(np.mean(v[-3:])) >= self.accident_motion_threshold:
                        moving = True
                    earlier = max(float(np.mean(v[:3])), 0.01)
                    recent = float(np.mean(v[-3:]))
                    if earlier > 1 and recent / earlier < self.accident_decel_threshold:
                        decel = True
                if not moving:
                    continue
                # Require deceleration evidence when tracks are known
                if not decel:
                    continue
                pk = tuple(sorted([int(t1), int(t2)]))
                if pk in self.accident_cooldown and now - self.accident_cooldown[pk] < self.accident_cooldown_seconds:
                    continue
                self.accident_cooldown[pk] = now
                accidents.append({
                    'vehicles': [d1['class'], d2['class']],
                    'location': self.calculate_intersection_box(d1['box'], d2['box']),
                    'vehicle_boxes': [self._box_to_list(d1['box']), self._box_to_list(d2['box'])],
                    'confidence': round(float(iou), 2),
                    'deceleration': decel,
                    'source': 'motion',
                })
        return accidents

    def detect_crash_scene(self, frame, vehicle_detections):
        if self.crash_model is None:
            return []
        results = self.crash_model.predict(frame, verbose=False, conf=self.crash_conf_threshold)
        if not results or results[0].boxes is None:
            return []

        crashes = []
        for box, conf in zip(results[0].boxes.xyxy.cpu().numpy(), results[0].boxes.conf.cpu().numpy()):
            matched_vehicles = []
            matched_vehicle_boxes = []
            for det in vehicle_detections:
                if self.calculate_iou(box, det['box']) >= self.crash_vehicle_iou_threshold:
                    matched_vehicles.append(det['class'])
                    matched_vehicle_boxes.append(det['box'])

            if len(matched_vehicles) < self.crash_min_vehicle_matches and float(conf) < self.crash_force_confidence_threshold:
                continue

            crashes.append({
                'vehicles': matched_vehicles[:3] or ['accident'],
                'location': self.calculate_focus_box(box, matched_vehicle_boxes),
                'vehicle_boxes': [self._box_to_list(vb) for vb in matched_vehicle_boxes[:3]],
                'confidence': round(float(conf), 2),
                'deceleration': None,
                'source': 'crash_model',
            })
        return crashes

    def detect_fallen_bike_accident(self, bike_detections, person_boxes, frame_shape, timestamp=None):
        fh, fw = frame_shape[:2]
        frame_area = max(float(fh * fw), 1.0)
        now = timestamp or time.time()
        accidents = []

        for bike in bike_detections:
            box = bike["box"]
            width = max(float(box[2] - box[0]), 1.0)
            height = max(float(box[3] - box[1]), 1.0)
            area_ratio = (width * height) / frame_area
            aspect_ratio = width / height
            center_y = (float(box[1]) + float(box[3])) / 2.0
            if aspect_ratio < self.fallen_bike_aspect_ratio:
                continue
            if area_ratio < self.fallen_bike_min_area_ratio:
                continue
            if center_y < fh * 0.35:
                continue

            nearby_person = False
            person_count = 0
            for pb in person_boxes:
                px = (float(pb[0]) + float(pb[2])) / 2.0
                py = (float(pb[1]) + float(pb[3])) / 2.0
                bx = (float(box[0]) + float(box[2])) / 2.0
                by = (float(box[1]) + float(box[3])) / 2.0
                distance = math.hypot(px - bx, py - by)
                if distance <= max(width, height) * self.fallen_bike_person_distance_factor:
                    nearby_person = True
                    person_count += 1

            if not nearby_person:
                continue

            event_key = ("fallen_bike", bike.get("track_id", -1), int(center_y // 25), int(float(box[0]) // 25))
            last_seen = self.accident_cooldown.get(event_key, 0)
            if now - last_seen < self.accident_cooldown_seconds:
                continue
            self.accident_cooldown[event_key] = now

            confidence = min(
                0.96,
                0.55 + ((aspect_ratio - self.fallen_bike_aspect_ratio) * 0.10) + min(person_count, 2) * 0.08,
            )
            accidents.append({
                "vehicles": [bike["class"]],
                "location": self._box_to_list(box),
                "vehicle_boxes": [self._box_to_list(box)],
                "confidence": round(float(confidence), 2),
                "deceleration": None,
                "source": "fallen_bike",
            })

        return accidents


    # ---- 4. Lane change ----
    def detect_lane_change(self, track_id, current_pos, fw):
        self.track_history[track_id].append(current_pos)
        w = list(self.track_history[track_id])[-self.lane_change_window:]
        if len(w) < 8:
            return False
        xs = [p[0] for p in w]
        return abs(xs[-1] - xs[0]) > fw * self.lane_change_x_pct and float(np.var(xs)) > (fw * 0.02) ** 2

    # ---- 5. Wrong-way ----
    def detect_wrong_way(self, track_id, fh):
        h = list(self.track_history.get(track_id, []))
        if len(h) < self.wrong_way_min_history:
            return False
        dy = h[-1][1] - h[0][1]
        d = 1 if dy > 0 else -1
        if abs(dy) > fh * 0.05:
            self.direction_votes.append(d)
        if len(self.direction_votes) < 30:
            return False
        dom = 1 if sum(self.direction_votes) > 0 else -1
        return d != 0 and d != dom and abs(dy) > fh * 0.08

    # ---- 6. Speeding ----
    def detect_speeding(self, track_id):
        v = list(self.velocity_history.get(track_id, []))
        if len(v) < 3:
            return False, 0.0
        s = float(np.mean(v[-5:]))
        return s > self.speed_threshold_px, round(s, 1)

    # ---- 7. Stopped vehicle ----
    def detect_stopped_vehicle(self, track_id, timestamp=None):
        now = timestamp or time.time()
        v = list(self.velocity_history.get(track_id, []))
        if len(v) < 5:
            return False, 0.0
        s = float(np.mean(v[-5:]))
        if s < self.stopped_speed_threshold:
            if track_id not in self.stopped_vehicle_timers:
                self.stopped_vehicle_timers[track_id] = now
            el = now - self.stopped_vehicle_timers[track_id]
            return el > self.stopped_time_threshold, round(el, 1)
        self.stopped_vehicle_timers.pop(track_id, None)
        return False, 0.0

    # ---- 8. Jaywalking ----
    def detect_jaywalking(self, person_box, fh, fw, vehicle_boxes, bike_boxes):
        px1, py1, px2, py2 = person_box
        person_cx = (px1 + px2) / 2
        person_cy = (py1 + py2) / 2
        person_h = py2 - py1
        person_w = px2 - px1
        if person_h < fh * 0.08 or person_w < fw * 0.02:
            return False
        all_veh = list(vehicle_boxes) + list(bike_boxes)
        for vbox in all_veh:
            if self.calculate_iou(person_box, vbox) >= 0.08:
                return False
        safe_top = fh * self.jaywalking_zone_top_pct
        safe_bot = fh * (1 - self.jaywalking_zone_bot_pct)
        if not (safe_top < person_cy < safe_bot):
            return False
        edge_margin = fw * 0.10
        if person_cx < edge_margin or person_cx > (fw - edge_margin):
            return False
        nearby_count = 0
        for vbox in vehicle_boxes:
            vcx = (vbox[0] + vbox[2]) / 2
            vcy = (vbox[1] + vbox[3]) / 2
            dist = math.hypot(person_cx - vcx, person_cy - vcy)
            if dist < fh * 0.3:
                nearby_count += 1
        if nearby_count < 2:
            return False
        veh_centers_y = [(vb[1] + vb[3]) / 2 for vb in vehicle_boxes]
        if veh_centers_y:
            closest_vy = min(veh_centers_y, key=lambda vy: abs(vy - person_cy))
            if abs(closest_vy - person_cy) > fh * 0.15:
                return False
        return True

    # ---- 9. Tailgating ----
    def detect_tailgating(self, vehicle_detections, fh):
        tails, gap = [], fh * self.tailgate_distance_pct
        sv = sorted(vehicle_detections, key=lambda d: (d['box'][1] + d['box'][3]) / 2)
        for i in range(len(sv) - 1):
            v1, v2 = sv[i], sv[i + 1]
            if min(v1['box'][2], v2['box'][2]) - max(v1['box'][0], v2['box'][0]) < 0:
                continue
            g = abs(v2['box'][1] - v1['box'][3])
            if 0 < g < gap:
                tails.append({
                    'type': 'tailgating',
                    'vehicles': [v1['class'], v2['class']],
                    'gap_px': round(float(g), 1),
                    'box': v1['box'].tolist() if hasattr(v1['box'], 'tolist') else list(v1['box']),
                    'box2': v2['box'].tolist() if hasattr(v2['box'], 'tolist') else list(v2['box'])
                })
        return tails

    # ---- 10. Red light ----
    def detect_red_light_violation(self, tl_boxes, vehicle_detections, fh):
        viols = []
        for tl in tl_boxes:
            sl = tl[3]
            for v in vehicle_detections:
                if v['box'][1] > sl:
                    vs = self.velocity_history.get(v.get('track_id', -1), deque())
                    if len(vs) >= 2 and float(np.mean(list(vs)[-3:])) > 3:
                        viols.append({
                            'type': 'red_light',
                            'vehicle': v['class'],
                            'track_id': v.get('track_id', -1),
                            'box': v['box'].tolist() if hasattr(v['box'], 'tolist') else list(v['box'])
                        })
        return viols

    # ---- 11. U-turn ----
    def detect_uturn(self, track_id):
        h = list(self.track_history.get(track_id, []))
        if len(h) < 20:
            return False
        n = len(h)
        f, l = h[:n // 3], h[2 * n // 3:]
        if len(f) < 2 or len(l) < 2:
            return False
        d1 = np.array([f[-1][0] - f[0][0], f[-1][1] - f[0][1]])
        d2 = np.array([l[-1][0] - l[0][0], l[-1][1] - l[0][1]])
        m1, m2 = np.linalg.norm(d1), np.linalg.norm(d2)
        if m1 < 5 or m2 < 5:
            return False
        cos_a = np.clip(np.dot(d1, d2) / (m1 * m2), -1, 1)
        return math.degrees(math.acos(cos_a)) > self.uturn_angle_threshold

    # ---- Helpers ----
    def calculate_iou(self, b1, b2):
        x1, y1 = max(b1[0], b2[0]), max(b1[1], b2[1])
        x2, y2 = min(b1[2], b2[2]), min(b1[3], b2[3])
        inter = max(0, x2 - x1) * max(0, y2 - y1)
        union = (b1[2] - b1[0]) * (b1[3] - b1[1]) + (b2[2] - b2[0]) * (b2[3] - b2[1]) - inter
        return inter / union if union > 0 else 0

    def calculate_intersection_box(self, b1, b2):
        x1, y1 = max(b1[0], b2[0]), max(b1[1], b2[1])
        x2, y2 = min(b1[2], b2[2]), min(b1[3], b2[3])
        if x2 <= x1 or y2 <= y1:
            return self.calculate_enclosing_box([b1, b2])
        return [x1, y1, x2, y2]

    def calculate_enclosing_box(self, boxes):
        valid_boxes = [b for b in boxes if b is not None]
        x1 = min(b[0] for b in valid_boxes)
        y1 = min(b[1] for b in valid_boxes)
        x2 = max(b[2] for b in valid_boxes)
        y2 = max(b[3] for b in valid_boxes)
        return [x1, y1, x2, y2]

    def calculate_focus_box(self, crash_box, vehicle_boxes):
        if not vehicle_boxes:
            return self._box_to_list(crash_box)
        vehicle_union = self.calculate_enclosing_box(vehicle_boxes)
        x1 = max(crash_box[0], vehicle_union[0])
        y1 = max(crash_box[1], vehicle_union[1])
        x2 = min(crash_box[2], vehicle_union[2])
        y2 = min(crash_box[3], vehicle_union[3])
        if x2 <= x1 or y2 <= y1:
            return vehicle_union
        return [x1, y1, x2, y2]

    def calculate_overlap_over_smaller(self, b1, b2):
        x1, y1 = max(b1[0], b2[0]), max(b1[1], b2[1])
        x2, y2 = min(b1[2], b2[2]), min(b1[3], b2[3])
        inter = max(0, x2 - x1) * max(0, y2 - y1)
        area1 = (b1[2] - b1[0]) * (b1[3] - b1[1])
        area2 = (b2[2] - b2[0]) * (b2[3] - b2[1])
        smaller = min(area1, area2)
        return inter / smaller if smaller > 0 else 0

    def classify_vehicle(self, cid):
        return self._name_for_class(cid)

    def _update_velocity(self, tid, center):
        h = self.track_history.get(tid, deque())
        if len(h) >= 2:
            self.velocity_history[tid].append(math.hypot(center[0] - h[-1][0], center[1] - h[-1][1]))

    def _should_report(self, vtype, track_id, now):
        """Return True if this (type, track_id) hasn't been reported recently."""
        key = (vtype, int(track_id) if track_id != -1 else id(now))
        last = self.violation_cooldown.get(key, 0)
        if now - last < self.violation_cooldown_seconds:
            return False
        self.violation_cooldown[key] = now
        return True

    def _box_to_list(self, box):
        """Convert numpy array box to plain list for JSON serialization."""
        if hasattr(box, 'tolist'):
            return box.tolist()
        return list(box)

    # ---- Main pipeline ----
    def process_frame(self, frame, *, is_static_image=False):
        now = time.time()
        fh, fw = frame.shape[:2]
        if is_static_image:
            results = self.model(frame, verbose=False, conf=self.conf_threshold)
        else:
            # Tracker can fail on some OpenCV/codec/runtime combinations; fallback
            # to plain inference so analysis still completes.
            try:
                results = self.model.track(frame, persist=True, verbose=False, conf=self.conf_threshold)
            except Exception:
                results = self.model(frame, verbose=False, conf=self.conf_threshold)

        # YOLO may return None/empty results on some inputs; fall back to
        # an empty detection payload so downstream logic doesn't crash.
        if not results or results[0] is None:
            return {
                'detections': [],
                'violations': [],
                'accidents': [],
                'stats': {
                    'total_vehicles': 0,
                    'total_persons': 0,
                    'total_bikes': 0,
                    'traffic_lights': 0
                }
            }

        detections, person_boxes, vehicle_dets, bike_dets, tl_boxes, violations = [], [], [], [], [], []
        model_accidents = []

        if results[0].boxes is not None and len(results[0].boxes):
            boxes = results[0].boxes.xyxy.cpu().numpy()
            classes = results[0].boxes.cls.cpu().numpy().astype(int)
            confs = results[0].boxes.conf.cpu().numpy()
            tids = (results[0].boxes.id.cpu().numpy().astype(int)
                    if results[0].boxes.id is not None else np.full(len(boxes), -1, dtype=int))

            for box, cls, conf, tid in zip(boxes, classes, confs, tids):
                cls = int(cls)
                label = self.classify_vehicle(cls)
                label_l = label.lower()
                is_person = cls == self.person_class_id or self._contains_any(label_l, ['person', 'pedestrian'])
                is_motorcycle = cls == self.motorcycle_class_id or self._contains_any(
                    label_l, ['motorcycle', 'motorbike', 'scooter']
                )
                is_bicycle = cls == self.bicycle_class_id or self._contains_any(
                    label_l, ['bicycle', ' cycle', 'bike']
                )
                is_traffic_light = cls == self.traffic_light_class_id or self._contains_any(
                    label_l, ['traffic light', 'signal light']
                )
                is_vehicle = (
                    cls in self.vehicle_classes
                    or self._contains_any(label_l, ['car', 'bus', 'truck', 'van', 'vehicle', 'auto', 'rickshaw'])
                    or is_motorcycle
                    or is_bicycle
                )
                is_accident_label = self._contains_any(label_l, ['accident', 'crash', 'collision'])
                det = {
                    'box': box,
                    'class': label,
                    'class_id': cls,
                    'confidence': float(conf),
                    'track_id': int(tid)
                }
                detections.append(det)

                if is_person:
                    person_boxes.append(box)
                if is_motorcycle:
                    bike_dets.append(det)
                if is_traffic_light:
                    tl_boxes.append(box)
                if is_accident_label:
                    model_accidents.append({
                        'vehicles': ['accident'],
                        'location': self._box_to_list(box),
                        'confidence': round(float(conf), 2),
                        'deceleration': False,
                        'source': 'model_class',
                    })
                if is_vehicle:
                    vehicle_dets.append(det)
                    c = ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2)
                    if tid != -1:
                        self._update_velocity(tid, c)
                        if self.enable_lane_change and self.detect_lane_change(tid, c, fw):
                            if self._should_report('lane_change', tid, now):
                                violations.append({'type': 'lane_change', 'vehicle': label,
                                                   'track_id': int(tid), 'box': self._box_to_list(box)})
                        if self.enable_wrong_way and self.detect_wrong_way(tid, fh):
                            if self._should_report('wrong_way', tid, now):
                                violations.append({'type': 'wrong_way', 'vehicle': label,
                                                   'track_id': int(tid), 'box': self._box_to_list(box)})
                        if self.enable_speeding:
                            sp, spd = self.detect_speeding(tid)
                            if sp and self._should_report('speeding', tid, now):
                                violations.append({'type': 'speeding', 'vehicle': label, 'speed': spd,
                                                   'track_id': int(tid), 'box': self._box_to_list(box)})
                        if self.enable_stopped:
                            st_flag, dur = self.detect_stopped_vehicle(tid, now)
                            if st_flag and self._should_report('stopped_vehicle', tid, now):
                                violations.append({'type': 'stopped_vehicle', 'vehicle': label, 'duration': dur,
                                                   'track_id': int(tid), 'box': self._box_to_list(box)})
                        if self.enable_uturn and self.detect_uturn(tid):
                            if self._should_report('uturn', tid, now):
                                violations.append({'type': 'uturn', 'vehicle': label,
                                                   'track_id': int(tid), 'box': self._box_to_list(box)})

        checked = set()
        for bike in bike_dets:
            bike_tid = bike.get('track_id', -1)
            if self.enable_riders:
                cnt, rboxes = self.count_bike_riders(bike['box'], person_boxes)
                bike['rider_count'] = cnt
                if cnt > 2 and self._should_report('excess_riders', bike_tid, now):
                    violations.append({'type': 'excess_riders', 'count': cnt,
                                       'box': self._box_to_list(bike['box'])})
            else:
                rboxes = []
                bike['rider_count'] = 0
            if self.enable_helmet:
                for rb in rboxes:
                    k = tuple(rb.tolist())
                    if k in checked:
                        continue
                    checked.add(k)
                    w, hc = self.detect_helmet(frame, rb)
                    if not w and self._should_report('no_helmet', bike_tid, now):
                        violations.append({'type': 'no_helmet', 'box': self._box_to_list(rb),
                                           'helmet_confidence': hc})

        accidents = (
            self.detect_accident(vehicle_dets, now, is_static_image=is_static_image)
            if self.enable_accident
            else []
        )
        if self.enable_accident and self.enable_crash_model:
            accidents.extend(self.detect_crash_scene(frame, vehicle_dets))
        if self.enable_accident:
            accidents.extend(self.detect_fallen_bike_accident(bike_dets, person_boxes, frame.shape, now))
        # Merge model-native accident class detections (for custom accident-only models).
        for a in model_accidents:
            accidents.append(a)

        if self.enable_jaywalking:
            vb = [d['box'] for d in vehicle_dets]
            all_bike_boxes = [d['box'] for d in bike_dets]
            for pb in person_boxes:
                if self.detect_jaywalking(pb, fh, fw, vb, all_bike_boxes):
                    # Quantize position to 50px grid to avoid re-reporting
                    # the same person whose box shifts slightly each frame
                    gx = int((pb[0] + pb[2]) / 2) // 50
                    gy = int((pb[1] + pb[3]) / 2) // 50
                    pseudo_id = gx * 10000 + gy
                    if self._should_report('jaywalking', pseudo_id, now):
                        violations.append({'type': 'jaywalking', 'box': self._box_to_list(pb)})

        if self.enable_tailgating:
            for tg in self.detect_tailgating(vehicle_dets, fh):
                pseudo_id = int((tg['box'][0] + tg['box'][2]) / 2)
                if self._should_report('tailgating', pseudo_id, now):
                    violations.append(tg)

        if self.enable_red_light and tl_boxes:
            violations.extend(self.detect_red_light_violation(tl_boxes, vehicle_dets, fh))

        # Convert all remaining numpy boxes in detections to lists for JSON
        json_detections = []
        for d in detections:
            json_detections.append({
                'box': self._box_to_list(d['box']),
                'class': d['class'],
                'class_id': d['class_id'],
                'confidence': d['confidence'],
                'track_id': d['track_id']
            })

        return {
            'detections': json_detections,
            'violations': violations,
            'accidents': accidents,
            'stats': {
                'total_vehicles': len(vehicle_dets),
                'total_persons': len(person_boxes),
                'total_bikes': len(bike_dets),
                'traffic_lights': len(tl_boxes)
            }
        }

    # ---- Drawing ----
    def draw_results(self, frame, results):
        ov = frame.copy()
        results = results or {}
        detections = results.get('detections', []) or []
        violations = results.get('violations', []) or []
        accidents = results.get('accidents', []) or []
        CV, CP, CR = (0, 220, 100), (200, 180, 0), (0, 0, 255)
        cmap = {
            'lane_change': (0, 165, 255), 'excess_riders': CR, 'no_helmet': CR,
            'wrong_way': (255, 0, 255), 'speeding': (0, 80, 255), 'stopped_vehicle': (128, 128, 255),
            'jaywalking': (0, 200, 255), 'tailgating': (255, 100, 0), 'red_light': (50, 50, 255),
            'uturn': (200, 0, 200)
        }
        lmap = {
            'excess_riders': lambda v: f"! {v.get('count', '?')} RIDERS",
            'no_helmet': lambda v: "! NO HELMET",
            'lane_change': lambda v: f"LANE CHANGE ({v.get('vehicle', '')})",
            'wrong_way': lambda v: f"WRONG WAY ({v.get('vehicle', '')})",
            'speeding': lambda v: f"SPEEDING {v.get('speed', '')} px/f",
            'stopped_vehicle': lambda v: f"STOPPED {v.get('duration', '')}s",
            'jaywalking': lambda v: "JAYWALKING",
            'tailgating': lambda v: f"TAILGATING ({v.get('gap_px', '')}px)",
            'red_light': lambda v: f"RED LIGHT ({v.get('vehicle', '')})",
            'uturn': lambda v: f"U-TURN ({v.get('vehicle', '')})"
        }

        for d in detections:
            box = d.get('box')
            if not isinstance(box, (list, tuple)) or len(box) < 4:
                continue
            x1, y1, x2, y2 = int(box[0]), int(box[1]), int(box[2]), int(box[3])
            c = CP if d.get('class', '').lower() in ('person', 'pedestrian') else CV
            cv2.rectangle(ov, (x1, y1), (x2, y2), c, 2)
            tid = d.get('track_id', -1)
            tid_str = f" #{tid}" if tid != -1 else ""
            l = f"{d['class']}{tid_str} {d['confidence']:.0%}"
            (tw, th), _ = cv2.getTextSize(l, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
            cv2.rectangle(ov, (x1, y1 - th - 6), (x1 + tw + 4, y1), c, -1)
            cv2.putText(ov, l, (x1 + 2, y1 - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)

        for v in violations:
            box = v.get('box')
            if not isinstance(box, (list, tuple)) or len(box) < 4:
                continue
            x1, y1, x2, y2 = int(box[0]), int(box[1]), int(box[2]), int(box[3])
            vtype = v.get('type', 'violation')
            c = cmap.get(vtype, CR)
            cv2.rectangle(ov, (x1, y1), (x2, y2), c, 3)
            l = lmap.get(vtype, lambda v: "VIOLATION")(v)
            (tw, th), _ = cv2.getTextSize(l, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
            cv2.rectangle(ov, (x1, y1 - th - 8), (x1 + tw + 4, y1), c, -1)
            cv2.putText(ov, l, (x1 + 2, y1 - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2)
            if vtype == 'tailgating' and 'box2' in v and isinstance(v.get('box2'), (list, tuple)) and len(v.get('box2', [])) >= 4:
                bx1, by1, bx2, by2 = int(v['box2'][0]), int(v['box2'][1]), int(v['box2'][2]), int(v['box2'][3])
                cv2.rectangle(ov, (bx1, by1), (bx2, by2), c, 3)

        for a in accidents:
            box = a.get('location')
            if not isinstance(box, (list, tuple)) or len(box) < 4:
                continue
            x1, y1, x2, y2 = int(box[0]), int(box[1]), int(box[2]), int(box[3])
            cv2.rectangle(ov, (x1 - 4, y1 - 4), (x2 + 4, y2 + 4), CR, 5)
            l = f"ACCIDENT ({float(a.get('confidence', 0.0)):.0%})"
            (tw, th), _ = cv2.getTextSize(l, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)
            cv2.rectangle(ov, (x1, y1 - th - 12), (x1 + tw + 8, y1), CR, -1)
            cv2.putText(ov, l, (x1 + 4, y1 - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

        cv2.addWeighted(ov, 0.85, frame, 0.15, 0, frame)
        return frame
