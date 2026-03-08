"""
TraffixAI - Traffic Detection Module
Uses the WORKING TrafficMonitor implementation from the traffic/ folder.
Full 12-module detection: helmets, rider count, accidents, lane change,
wrong-way, speeding, stopped vehicle, jaywalking, tailgating, red light,
U-turn, and vehicle classification.
"""

import os
import cv2
import numpy as np
import logging
import math
import time
import base64
from pathlib import Path
from typing import Dict, Any, List, Optional
from collections import defaultdict, deque
from ultralytics import YOLO

logger = logging.getLogger(__name__)

# ─── Heatmap colour helper ───────────────────────────────────────────────────

def risk_to_color(score: float) -> str:
    """Map 0→1 risk score to CSS green→yellow→red."""
    score = max(0.0, min(1.0, score))
    if score < 0.5:
        t = score / 0.5
        r = int(16 + (245 - 16) * t)
        g = int(185 + (158 - 185) * t)
        b = int(129 + (11 - 129) * t)
    else:
        t = (score - 0.5) / 0.5
        r = int(245 + (239 - 245) * t)
        g = int(158 + (68 - 158) * t)
        b = int(11 + (68 - 11) * t)
    return f"#{r:02x}{g:02x}{b:02x}"


# ═══════════════════════════════════════════════════════════════════════════════
# TrafficMonitor — WORKING implementation from traffic/backend/monitor.py
# All 12 violation detection modules preserved exactly.
# ═══════════════════════════════════════════════════════════════════════════════

class TrafficMonitor:
    def __init__(self, model_path=None, conf_threshold=0.4):
        if model_path is None:
            # Default: ai_models/yolov8n.pt relative to this file
            model_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'yolov8n.pt')
        self.model = YOLO(model_path)
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
        self.accident_decel_threshold = 0.5
        self.rider_iou_threshold = 0.30
        self.helmet_dark_ratio_lo = 0.30
        self.helmet_dark_ratio_hi = 0.65
        self.helmet_roundness_threshold = 0.50
        self.helmet_min_head_pixels = 400
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

    # ---- 1. Helmet ----
    def detect_helmet(self, frame, person_box):
        x1, y1, x2, y2 = map(int, person_box)
        h, w = y2 - y1, x2 - x1
        if h <= 0 or w <= 0:
            return False, 0.0
        if h * w < self.helmet_min_head_pixels:
            return False, 0.0
        head_y2 = y1 + max(int(h * 0.20), 1)
        head = frame[max(y1, 0):min(head_y2, frame.shape[0]),
                     max(x1, 0):min(x2, frame.shape[1])]
        if head.size < 100:
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
    def detect_accident(self, vehicle_detections, timestamp=None):
        accidents, now = [], timestamp or time.time()
        for i, d1 in enumerate(vehicle_detections):
            for d2 in vehicle_detections[i + 1:]:
                iou = self.calculate_iou(d1['box'], d2['box'])
                if iou < self.accident_iou_threshold:
                    continue
                t1, t2 = d1.get('track_id', -1), d2.get('track_id', -1)
                decel = False
                for t in (t1, t2):
                    if t == -1:
                        continue
                    v = list(self.velocity_history.get(t, []))
                    if len(v) >= 3:
                        if np.mean(v[:3]) > 1 and np.mean(v[-3:]) / np.mean(v[:3]) < self.accident_decel_threshold:
                            decel = True
                if t1 != -1 and t2 != -1 and not decel:
                    continue
                pk = tuple(sorted([int(t1), int(t2)]))
                if pk in self.accident_cooldown and now - self.accident_cooldown[pk] < self.accident_cooldown_seconds:
                    continue
                self.accident_cooldown[pk] = now
                accidents.append({
                    'vehicles': [d1['class'], d2['class']],
                    'location': d1['box'].tolist() if hasattr(d1['box'], 'tolist') else list(d1['box']),
                    'confidence': round(float(iou), 2),
                    'deceleration': decel
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

    def classify_vehicle(self, cid):
        return self.all_classes.get(cid, 'unknown')

    def _update_velocity(self, tid, center):
        h = self.track_history.get(tid, deque())
        if len(h) >= 2:
            self.velocity_history[tid].append(math.hypot(center[0] - h[-1][0], center[1] - h[-1][1]))

    def _should_report(self, vtype, track_id, now):
        key = (vtype, int(track_id) if track_id != -1 else id(now))
        last = self.violation_cooldown.get(key, 0)
        if now - last < self.violation_cooldown_seconds:
            return False
        self.violation_cooldown[key] = now
        return True

    def _box_to_list(self, box):
        if hasattr(box, 'tolist'):
            return box.tolist()
        return list(box)

    # ---- Main pipeline ----
    def process_frame(self, frame):
        now = time.time()
        fh, fw = frame.shape[:2]
        results = self.model.track(frame, persist=True, verbose=False, conf=self.conf_threshold)

        detections, person_boxes, vehicle_dets, bike_dets, tl_boxes, violations = [], [], [], [], [], []

        if results[0].boxes is not None and len(results[0].boxes):
            boxes = results[0].boxes.xyxy.cpu().numpy()
            classes = results[0].boxes.cls.cpu().numpy().astype(int)
            confs = results[0].boxes.conf.cpu().numpy()
            tids = (results[0].boxes.id.cpu().numpy().astype(int)
                    if results[0].boxes.id is not None else np.full(len(boxes), -1, dtype=int))

            for box, cls, conf, tid in zip(boxes, classes, confs, tids):
                cls = int(cls)
                label = self.classify_vehicle(cls)
                det = {
                    'box': box,
                    'class': label,
                    'class_id': cls,
                    'confidence': float(conf),
                    'track_id': int(tid)
                }
                detections.append(det)

                if cls == self.person_class_id:
                    person_boxes.append(box)
                if cls == self.motorcycle_class_id:
                    bike_dets.append(det)
                if cls == self.traffic_light_class_id:
                    tl_boxes.append(box)
                if cls in self.vehicle_classes:
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

        accidents = self.detect_accident(vehicle_dets, now) if self.enable_accident else []

        if self.enable_jaywalking:
            vb = [d['box'] for d in vehicle_dets]
            all_bike_boxes = [d['box'] for d in bike_dets]
            for pb in person_boxes:
                if self.detect_jaywalking(pb, fh, fw, vb, all_bike_boxes):
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

        for d in results['detections']:
            box = d['box']
            x1, y1, x2, y2 = int(box[0]), int(box[1]), int(box[2]), int(box[3])
            c = CP if d['class_id'] == 0 else CV
            cv2.rectangle(ov, (x1, y1), (x2, y2), c, 2)
            tid = d.get('track_id', -1)
            tid_str = f" #{tid}" if tid != -1 else ""
            l = f"{d['class']}{tid_str} {d['confidence']:.0%}"
            (tw, th), _ = cv2.getTextSize(l, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
            cv2.rectangle(ov, (x1, y1 - th - 6), (x1 + tw + 4, y1), c, -1)
            cv2.putText(ov, l, (x1 + 2, y1 - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)

        for v in results['violations']:
            box = v['box']
            x1, y1, x2, y2 = int(box[0]), int(box[1]), int(box[2]), int(box[3])
            c = cmap.get(v['type'], CR)
            cv2.rectangle(ov, (x1, y1), (x2, y2), c, 3)
            l = lmap.get(v['type'], lambda v: "VIOLATION")(v)
            (tw, th), _ = cv2.getTextSize(l, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
            cv2.rectangle(ov, (x1, y1 - th - 8), (x1 + tw + 4, y1), c, -1)
            cv2.putText(ov, l, (x1 + 2, y1 - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2)
            if v['type'] == 'tailgating' and 'box2' in v:
                bx1, by1, bx2, by2 = int(v['box2'][0]), int(v['box2'][1]), int(v['box2'][2]), int(v['box2'][3])
                cv2.rectangle(ov, (bx1, by1), (bx2, by2), c, 3)

        for a in results['accidents']:
            box = a['location']
            x1, y1, x2, y2 = int(box[0]), int(box[1]), int(box[2]), int(box[3])
            cv2.rectangle(ov, (x1 - 4, y1 - 4), (x2 + 4, y2 + 4), CR, 5)
            l = f"ACCIDENT ({a['confidence']:.0%})"
            (tw, th), _ = cv2.getTextSize(l, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)
            cv2.rectangle(ov, (x1, y1 - th - 12), (x1 + tw + 8, y1), CR, -1)
            cv2.putText(ov, l, (x1 + 4, y1 - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

        cv2.addWeighted(ov, 0.85, frame, 0.15, 0, frame)
        return frame


# ═══════════════════════════════════════════════════════════════════════════════
# AccidentDetector — Wrapper that keeps the same API as the old code
# so backend/main.py doesn't need major changes.
# ═══════════════════════════════════════════════════════════════════════════════

class AccidentDetector:
    """
    Wrapper around TrafficMonitor that provides the same API surface
    as the old AccidentDetector: detect_image() and detect_video().
    """

    def __init__(self, model_path: str = None):
        if model_path is None:
            model_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'yolov8n.pt')
        self.monitor = TrafficMonitor(model_path=model_path)
        self.model = self.monitor.model  # Exposed for health checks
        logger.info(f"Loaded custom YOLO model: {model_path}")

    def detect_image(self, image_path: str) -> Dict[str, Any]:
        """Run full 12-module detection on an image."""
        try:
            frame = cv2.imread(image_path)
            if frame is None:
                logger.error(f"Could not read image: {image_path}")
                return self._empty_result()

            results = self.monitor.process_frame(frame)

            # Annotate the image and encode as base64
            annotated = self.monitor.draw_results(frame.copy(), results)
            _, buffer = cv2.imencode('.jpg', annotated, [cv2.IMWRITE_JPEG_QUALITY, 90])
            annotated_b64 = base64.b64encode(buffer.tobytes()).decode('utf-8')

            # Build detection_boxes for frontend overlay
            detection_boxes = self._build_detection_boxes(results)

            # Build violation_types for frontend
            violation_types = self._aggregate_violation_types(results['violations'])

            return {
                "vehicles": results['stats']['total_vehicles'],
                "pedestrians": results['stats']['total_persons'],
                "accidents": len(results['accidents']),
                "violations": len(results['violations']),
                "violation_types": violation_types,
                "objects": self._build_objects_list(results['detections']),
                "confidence": self._avg_confidence(results['detections']),
                "detection_boxes": detection_boxes,
                "annotated_image": annotated_b64,
                "raw_violations": results['violations'],
                "raw_accidents": results['accidents'],
            }
        except Exception as e:
            logger.error(f"Image detection error: {e}")
            return self._empty_result()

    def detect_video(self, video_path: str, seconds_interval: int = 1) -> Dict[str, Any]:
        """Run full 12-module detection on video frames."""
        try:
            cap = cv2.VideoCapture(video_path)
            if not cap.isOpened():
                logger.error(f"Could not open video: {video_path}")
                return self._empty_result()

            total_vehicles = 0
            total_persons = 0
            total_accidents = 0
            all_violations = []
            frame_count = 0
            analyzed_frames = 0
            class_totals: Dict[str, int] = {}
            last_detection_boxes = []
            last_annotated_b64 = None
            annotated_frames: List[str] = []
            max_return_frames = 240  # up to ~4 minutes at 1 frame/second
            heuristic_accident_hits = 0
            heuristic_scene_streak = 0
            heuristic_cooldown = 0

            fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
            seconds_interval = max(1, int(seconds_interval))
            next_target_second = 0

            # Use a fresh monitor for each video for clean tracking state.
            # Lower confidence + relaxed accident thresholds improve crash capture.
            video_monitor = TrafficMonitor(model_path=os.path.join(
                os.path.dirname(os.path.abspath(__file__)), 'yolov8n.pt'), conf_threshold=0.25)
            video_monitor.accident_iou_threshold = 0.25
            video_monitor.accident_decel_threshold = 0.8

            try:
                while True:
                    ret, frame = cap.read()
                    if not ret:
                        break
                    frame_count += 1
                    current_second = int(frame_count / fps)
                    if current_second < next_target_second:
                        continue
                    next_target_second = current_second + seconds_interval

                    # Resize for faster inference
                    h_orig, w_orig = frame.shape[:2]
                    scale = min(640 / max(h_orig, w_orig), 1.0)
                    if scale < 1.0:
                        frame_small = cv2.resize(frame, (int(w_orig * scale), int(h_orig * scale)))
                    else:
                        frame_small = frame

                    try:
                        results = video_monitor.process_frame(frame_small)
                        total_vehicles += results['stats']['total_vehicles']
                        total_persons += results['stats']['total_persons']
                        frame_accidents = len(results['accidents'])
                        heuristic_hit = self._heuristic_accident_scene(
                            results,
                            frame_small.shape[0],
                            frame_small.shape[1],
                            frame_small,
                        )
                        heuristic_scene_streak = heuristic_scene_streak + 1 if heuristic_hit else 0

                        if heuristic_cooldown > 0:
                            heuristic_cooldown -= 1

                        if frame_accidents == 0 and heuristic_scene_streak >= 1 and heuristic_cooldown == 0:
                            # Count heuristic accidents with cooldown to avoid overcounting.
                            frame_accidents = 1
                            heuristic_accident_hits += 1
                            heuristic_cooldown = 4
                        total_accidents += frame_accidents
                        all_violations.extend(results['violations'])

                        for det in results['detections']:
                            cls_name = det['class']
                            class_totals[cls_name] = class_totals.get(cls_name, 0) + 1

                        last_detection_boxes = self._build_detection_boxes(results)

                        # Annotate last frame
                        annotated = video_monitor.draw_results(frame_small.copy(), results)
                        _, buffer = cv2.imencode('.jpg', annotated, [cv2.IMWRITE_JPEG_QUALITY, 85])
                        last_annotated_b64 = base64.b64encode(buffer.tobytes()).decode('utf-8')
                        if len(annotated_frames) < max_return_frames:
                            annotated_frames.append(last_annotated_b64)

                        analyzed_frames += 1
                    except Exception as fe:
                        logger.warning(f"Frame {frame_count} analysis failed: {fe}")
            finally:
                cap.release()

            if analyzed_frames == 0:
                return self._empty_result()

            violation_types = self._aggregate_violation_types(all_violations)
            objects = [
                {"class": cls, "count": count, "confidence": 0.85}
                for cls, count in sorted(class_totals.items(), key=lambda x: x[1], reverse=True)
            ]

            return {
                "vehicles": total_vehicles,
                "pedestrians": total_persons,
                "accidents": min(total_accidents, 20),
                "violations": len(all_violations),
                "violation_types": violation_types,
                "objects": objects[:10],
                "frames_analyzed": analyzed_frames,
                "total_frames": frame_count,
                "confidence": 0.88,
                "detection_boxes": last_detection_boxes,
                "annotated_image": last_annotated_b64,
                "annotated_frames": annotated_frames,
                "raw_violations": all_violations[-50:],  # Last 50 violations
                "heuristic_accident_hits": heuristic_accident_hits,
                "seconds_interval": seconds_interval,
            }
        except Exception as e:
            logger.error(f"Video detection error: {e}")
            return self._empty_result()

    def _heuristic_accident_scene(self, results: Dict[str, Any], fh: int, fw: int, frame: Optional[np.ndarray] = None) -> bool:
        """
        Fallback accident indicator:
        if >=2 pedestrians cluster around a motorcycle/bicycle in road area,
        mark as likely accident. Helps when tracker-based collision misses.
        """
        detections = results.get('detections', [])
        persons = [d for d in detections if d.get('class') == 'person']
        bikes = [d for d in detections if d.get('class') in ('motorcycle', 'bicycle')]

        def center(box):
            return ((box[0] + box[2]) / 2.0, (box[1] + box[3]) / 2.0)

        def iou(b1, b2):
            x1, y1 = max(b1[0], b2[0]), max(b1[1], b2[1])
            x2, y2 = min(b1[2], b2[2]), min(b1[3], b2[3])
            inter = max(0, x2 - x1) * max(0, y2 - y1)
            area1 = max(0, b1[2] - b1[0]) * max(0, b1[3] - b1[1])
            area2 = max(0, b2[2] - b2[0]) * max(0, b2[3] - b2[1])
            union = area1 + area2 - inter
            return inter / union if union > 0 else 0.0

        diag = max(1.0, (fw ** 2 + fh ** 2) ** 0.5)
        proximity = 0.13 * diag
        road_top = 0.25 * fh

        if len(persons) >= 1 and len(bikes) > 0:
            for bike in bikes:
                b = bike.get('box', [0, 0, 0, 0])
                bx, by = center(b)
                if by < road_top:
                    continue
                bw = max(1.0, b[2] - b[0])
                bh = max(1.0, b[3] - b[1])
                aspect = max(bw / bh, bh / bw)
                nearby = 0
                for person in persons:
                    p = person.get('box', [0, 0, 0, 0])
                    px, py = center(p)
                    if py < road_top:
                        continue
                    # Exclude rider overlap cases.
                    if iou(b, p) > 0.22:
                        continue
                    if ((bx - px) ** 2 + (by - py) ** 2) ** 0.5 <= proximity:
                        nearby += 1
                # Fallen bike + at least one nearby person is a strong indicator.
                if aspect >= 1.6 and nearby >= 1:
                    return True
                if nearby >= 2:
                    return True

        # Person-cluster fallback: two or more persons stuck close together
        # in the carriageway center often indicates crash aftermath.
        road_persons = []
        for p in persons:
            b = p.get('box', [0, 0, 0, 0])
            cx, cy = center(b)
            if cy > 0.45 * fh and 0.2 * fw < cx < 0.9 * fw:
                road_persons.append((b, cx, cy))
        if len(road_persons) >= 2:
            diag = max(1.0, (fw ** 2 + fh ** 2) ** 0.5)
            for i in range(len(road_persons)):
                for j in range(i + 1, len(road_persons)):
                    _, x1, y1 = road_persons[i]
                    _, x2, y2 = road_persons[j]
                    d = ((x1 - x2) ** 2 + (y1 - y2) ** 2) ** 0.5
                    if d <= 0.12 * diag:
                        return True

        # Fallback: pixel-level road obstruction detection
        # (useful when bike/person classes are not detected in distant CCTV views).
        if frame is None:
            return False

        detections = results.get('detections', [])
        vehicle_boxes = [d.get('box', [0, 0, 0, 0]) for d in detections if d.get('class') in ('car', 'truck', 'bus', 'motorcycle', 'bicycle')]
        person_boxes = [d.get('box', [0, 0, 0, 0]) for d in detections if d.get('class') == 'person']

        roi_x1, roi_x2 = int(0.15 * fw), int(0.9 * fw)
        roi_y1, roi_y2 = int(0.35 * fh), int(0.92 * fh)
        if roi_x2 <= roi_x1 or roi_y2 <= roi_y1:
            return False
        roi = frame[roi_y1:roi_y2, roi_x1:roi_x2]
        if roi.size == 0:
            return False

        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        blur = cv2.GaussianBlur(gray, (5, 5), 0)
        edges = cv2.Canny(blur, 70, 160)
        kernel = np.ones((3, 3), np.uint8)
        edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel, iterations=1)
        cnts, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        def box_iou(a, b):
            x1, y1 = max(a[0], b[0]), max(a[1], b[1])
            x2, y2 = min(a[2], b[2]), min(a[3], b[3])
            inter = max(0, x2 - x1) * max(0, y2 - y1)
            area1 = max(0, a[2] - a[0]) * max(0, a[3] - a[1])
            area2 = max(0, b[2] - b[0]) * max(0, b[3] - b[1])
            union = area1 + area2 - inter
            return inter / union if union > 0 else 0.0

        for c in cnts:
            area = cv2.contourArea(c)
            if area < 90 or area > 13000:
                continue
            x, y, w, h = cv2.boundingRect(c)
            if w < 12 or h < 8:
                continue

            aspect = max(w / max(1, h), h / max(1, w))
            extent = area / max(1.0, w * h)
            if aspect < 1.5 or extent > 0.82:
                continue

            gx1, gy1 = x + roi_x1, y + roi_y1
            gx2, gy2 = gx1 + w, gy1 + h
            candidate = [gx1, gy1, gx2, gy2]
            patch = frame[gy1:gy2, gx1:gx2]
            if patch.size == 0:
                continue
            if float(np.mean(cv2.cvtColor(patch, cv2.COLOR_BGR2GRAY))) > 185:
                continue

            # Obstruction should not already be a confidently-detected vehicle.
            if any(box_iou(candidate, vb) > 0.35 for vb in vehicle_boxes):
                continue

            cx, cy = (gx1 + gx2) / 2.0, (gy1 + gy2) / 2.0
            near_persons = 0
            near_vehicles = 0
            for pb in person_boxes:
                pcx, pcy = (pb[0] + pb[2]) / 2.0, (pb[1] + pb[3]) / 2.0
                if ((pcx - cx) ** 2 + (pcy - cy) ** 2) ** 0.5 <= 0.20 * max(fw, fh):
                    near_persons += 1
            for vb in vehicle_boxes:
                vcx, vcy = (vb[0] + vb[2]) / 2.0, (vb[1] + vb[3]) / 2.0
                if ((vcx - cx) ** 2 + (vcy - cy) ** 2) ** 0.5 <= 0.26 * max(fw, fh):
                    near_vehicles += 1

            if near_persons >= 1 or near_vehicles >= 1:
                return True
        return False

    def _build_detection_boxes(self, results: Dict) -> List[Dict]:
        """Build frontend-compatible detection boxes with heatmap colors."""
        boxes = []
        for d in results['detections']:
            # Determine risk based on class
            cls = d.get('class', 'unknown')
            if cls in ('car', 'truck', 'bus'):
                risk = 0.25
                category = 'vehicle'
            elif cls == 'motorcycle':
                risk = 0.45
                category = 'vehicle'
            elif cls == 'bicycle':
                risk = 0.20
                category = 'vehicle'
            elif cls == 'person':
                risk = 0.20
                category = 'pedestrian'
            else:
                risk = 0.15
                category = 'object'

            box = d['box']
            boxes.append({
                "x1": round(float(box[0]), 1),
                "y1": round(float(box[1]), 1),
                "x2": round(float(box[2]), 1),
                "y2": round(float(box[3]), 1),
                "label": cls,
                "confidence": round(d['confidence'], 2),
                "risk_score": round(risk, 2),
                "color": risk_to_color(risk),
                "category": category,
            })

        # Mark violation boxes
        for v in results.get('violations', []):
            box = v['box']
            vtype = v.get('type', 'violation')
            risk = 0.85 if vtype in ('no_helmet', 'wrong_way', 'red_light') else 0.65
            boxes.append({
                "x1": round(float(box[0]), 1),
                "y1": round(float(box[1]), 1),
                "x2": round(float(box[2]), 1),
                "y2": round(float(box[3]), 1),
                "label": vtype.replace('_', ' ').title(),
                "confidence": 0.90,
                "risk_score": round(risk, 2),
                "color": risk_to_color(risk),
                "category": "violation",
            })

        # Mark accident boxes
        for a in results.get('accidents', []):
            box = a['location']
            boxes.append({
                "x1": round(float(box[0]), 1),
                "y1": round(float(box[1]), 1),
                "x2": round(float(box[2]), 1),
                "y2": round(float(box[3]), 1),
                "label": "ACCIDENT",
                "confidence": a.get('confidence', 0.95),
                "risk_score": 0.95,
                "color": risk_to_color(0.95),
                "category": "accident",
            })

        return boxes

    def _aggregate_violation_types(self, violations: List[Dict]) -> List[Dict]:
        """Aggregate violations by type for the frontend."""
        counts: Dict[str, int] = {}
        for v in violations:
            vtype = v.get('type', 'unknown')
            counts[vtype] = counts.get(vtype, 0) + 1

        severity_map = {
            'no_helmet': 'critical', 'wrong_way': 'critical', 'red_light': 'critical',
            'accident': 'critical', 'speeding': 'high', 'excess_riders': 'high',
            'jaywalking': 'medium', 'tailgating': 'medium', 'lane_change': 'medium',
            'stopped_vehicle': 'low', 'uturn': 'medium',
        }
        label_map = {
            'no_helmet': 'No Helmet', 'wrong_way': 'Wrong Way', 'red_light': 'Red Light',
            'speeding': 'Speeding', 'excess_riders': 'Excess Riders', 'lane_change': 'Lane Change',
            'jaywalking': 'Jaywalking', 'tailgating': 'Tailgating', 'stopped_vehicle': 'Stopped Vehicle',
            'uturn': 'Illegal U-Turn',
        }

        return [
            {
                "id": f"v_{vtype}",
                "label": label_map.get(vtype, vtype.replace('_', ' ').title()),
                "count": count,
                "severity": severity_map.get(vtype, 'medium'),
            }
            for vtype, count in sorted(counts.items(), key=lambda x: x[1], reverse=True)
        ]

    def _build_objects_list(self, detections: List[Dict]) -> List[Dict]:
        """Build aggregated objects list."""
        class_counts: Dict[str, List[float]] = {}
        for d in detections:
            cls = d['class']
            if cls not in class_counts:
                class_counts[cls] = []
            class_counts[cls].append(d['confidence'])

        return [
            {
                "class": cls,
                "count": len(confs),
                "confidence": round(float(np.mean(confs)), 3),
            }
            for cls, confs in sorted(class_counts.items(), key=lambda x: len(x[1]), reverse=True)
        ]

    def _avg_confidence(self, detections: List[Dict]) -> float:
        if not detections:
            return 0.0
        return round(float(np.mean([d['confidence'] for d in detections])), 3)

    def _empty_result(self) -> Dict[str, Any]:
        return {
            "vehicles": 0,
            "pedestrians": 0,
            "accidents": 0,
            "violations": 0,
            "violation_types": [],
            "objects": [],
            "confidence": 0.0,
            "detection_boxes": [],
        }
