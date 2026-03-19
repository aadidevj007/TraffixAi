"""
Multi-Task Traffic Monitoring System (Standalone CLI version)
12 violation modules: helmets, bike riders, accidents, vehicle classification,
lane changes, wrong-way, speeding, stopped vehicle, jaywalking, tailgating,
red light, illegal U-turn.
"""

import cv2
import numpy as np
from ultralytics import YOLO
from collections import defaultdict, deque
import time
import math
import os


class TrafficMonitor:
    def __init__(self, model_path='yolov8n.pt', conf_threshold=0.4):
        self.model = YOLO(model_path)
        self.root_dir = os.path.dirname(os.path.abspath(__file__))
        self.crash_model_path = os.path.join(self.root_dir, 'YOLO-Weights', 'accident_model.pt')
        self.crash_model = YOLO(self.crash_model_path) if os.path.exists(self.crash_model_path) else None
        self.track_history = defaultdict(lambda: deque(maxlen=60))
        self.velocity_history = defaultdict(lambda: deque(maxlen=20))
        self.accident_cooldown = {}
        self.violation_cooldown = {}         # (type, track_id) -> last_alert_time
        self.event_candidate_counts = {}
        self.event_candidate_timestamps = {}
        self.stopped_vehicle_timers = {}
        self.dominant_direction = None
        self.direction_votes = deque(maxlen=200)
        self.conf_threshold = conf_threshold
        self.violation_cooldown_seconds = 3  # suppress same violation for N seconds

        self.person_class_id = 0
        self.motorcycle_class_id = 3
        self.bicycle_class_id = 1
        self.traffic_light_class_id = 9

        self.vehicle_classes = {
            1: 'bicycle', 2: 'car', 3: 'motorcycle', 5: 'bus', 7: 'truck',
        }
        self.all_classes = {**self.vehicle_classes, 0: 'person', 9: 'traffic light'}

        # Optimized Thresholds (locked)
        self.accident_iou_threshold = 0.50
        self.accident_overlap_over_smaller_threshold = 0.60
        self.accident_decel_threshold = 0.5
        self.accident_min_track_history = 5
        self.accident_motion_threshold = 2.0
        self.crash_conf_threshold = 0.70
        self.crash_vehicle_iou_threshold = 0.10
        self.crash_min_vehicle_matches = 2
        self.rider_iou_threshold = 0.20
        self.helmet_dark_ratio_lo = 0.20
        self.helmet_dark_ratio_hi = 0.70
        self.helmet_roundness_threshold = 0.40
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
        self.event_confirmation_window_seconds = 1.5
        self.event_confirmation_frames = {
            'lane_change': 2,
            'wrong_way': 2,
            'speeding': 2,
            'stopped_vehicle': 2,
            'uturn': 2,
            'no_helmet': 2,
            'excess_riders': 2,
            'jaywalking': 2,
            'tailgating': 2,
            'red_light': 2,
        }
        self.min_person_detection_confidence = 0.45
        self.min_vehicle_detection_confidence = 0.45
        self.min_bike_detection_confidence = 0.45
        self.min_traffic_light_confidence = 0.50
        self.min_vehicle_event_area_ratio = 0.0015
        self.min_bike_event_area_ratio = 0.0009
        self.min_person_event_area_ratio = 0.0010

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
        head_y2 = y1 + max(int(h * 0.25), 1)
        head = frame[max(y1, 0):min(head_y2, frame.shape[0]),
                     max(x1, 0):min(x2, frame.shape[1])]
        if head.size == 0:
            return False, 0.0
        score = 0.0
        hsv = cv2.cvtColor(head, cv2.COLOR_BGR2HSV)
        dm = cv2.inRange(hsv, np.array([0, 30, 0]), np.array([180, 255, 140]))
        dr = np.count_nonzero(dm) / dm.size
        if self.helmet_dark_ratio_lo < dr < self.helmet_dark_ratio_hi:
            score += 0.4
        gray = cv2.cvtColor(head, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(cv2.GaussianBlur(gray, (5, 5), 0), 30, 100)
        cnts, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if cnts:
            lg = max(cnts, key=cv2.contourArea)
            a, p = cv2.contourArea(lg), cv2.arcLength(lg, True)
            if p > 0 and 4 * math.pi * a / (p * p) > self.helmet_roundness_threshold:
                score += 0.4
        if np.var(gray.astype(np.float32)) < 1200:
            score += 0.2
        return score >= 0.5, round(score, 2)

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
                overlap_ratio = self.calculate_overlap_over_smaller(d1['box'], d2['box'])
                if overlap_ratio < self.accident_overlap_over_smaller_threshold:
                    continue
                t1, t2 = d1.get('track_id', -1), d2.get('track_id', -1)
                if t1 == -1 or t2 == -1:
                    continue
                v1 = list(self.velocity_history.get(t1, []))
                v2 = list(self.velocity_history.get(t2, []))
                if len(v1) < self.accident_min_track_history or len(v2) < self.accident_min_track_history:
                    continue
                moving = max(np.mean(v1[-3:]), np.mean(v2[-3:])) >= self.accident_motion_threshold
                if not moving:
                    continue
                decel = False
                for v in (v1, v2):
                    earlier = np.mean(v[:3])
                    recent = np.mean(v[-3:])
                    if earlier > 1 and recent / earlier < self.accident_decel_threshold:
                        decel = True
                if not decel:
                    continue
                pk = tuple(sorted([int(t1), int(t2)]))
                if pk in self.accident_cooldown and now - self.accident_cooldown[pk] < self.accident_cooldown_seconds:
                    continue
                self.accident_cooldown[pk] = now
                impact_box = self.calculate_intersection_box(d1['box'], d2['box'])
                accidents.append({'vehicles': [d1['class'], d2['class']], 'location': impact_box,
                                  'vehicle_boxes': [d1['box'], d2['box']],
                                  'confidence': round(float(iou), 2), 'deceleration': decel,
                                  'source': 'motion'})
        return accidents

    def detect_crash_scene(self, frame, vehicle_detections):
        if self.crash_model is None:
            return []
        results = self.crash_model.predict(frame, verbose=False, conf=self.crash_conf_threshold)
        crashes = []
        if not results or results[0].boxes is None:
            return crashes
        for box, conf in zip(results[0].boxes.xyxy.cpu().numpy(), results[0].boxes.conf.cpu().numpy()):
            matched_vehicles = []
            matched_vehicle_boxes = []
            for det in vehicle_detections:
                if self.calculate_iou(box, det['box']) >= self.crash_vehicle_iou_threshold:
                    matched_vehicles.append(det['class'])
                    matched_vehicle_boxes.append(det['box'])
            if len(matched_vehicles) < self.crash_min_vehicle_matches:
                continue
            focus_box = self.calculate_focus_box(box, matched_vehicle_boxes)
            crashes.append({
                'vehicles': matched_vehicles[:3],
                'location': focus_box,
                'vehicle_boxes': matched_vehicle_boxes[:3],
                'confidence': round(float(conf), 2),
                'deceleration': None,
                'source': 'crash_model'
            })
        return crashes

    # ---- 4. Lane change ----
    def detect_lane_change(self, track_id, current_pos, fw):
        self.track_history[track_id].append(current_pos)
        w = list(self.track_history[track_id])[-self.lane_change_window:]
        if len(w) < 8: return False
        xs = [p[0] for p in w]
        return abs(xs[-1] - xs[0]) > fw * self.lane_change_x_pct and float(np.var(xs)) > (fw * 0.02) ** 2

    # ---- 5. Wrong-way ----
    def detect_wrong_way(self, track_id, fh):
        h = list(self.track_history.get(track_id, []))
        if len(h) < self.wrong_way_min_history: return False
        dy = h[-1][1] - h[0][1]
        d = 1 if dy > 0 else -1
        if abs(dy) > fh * 0.05: self.direction_votes.append(d)
        if len(self.direction_votes) < 30: return False
        dom = 1 if sum(self.direction_votes) > 0 else -1
        return d != 0 and d != dom and abs(dy) > fh * 0.08

    # ---- 6. Speeding ----
    def detect_speeding(self, track_id):
        v = list(self.velocity_history.get(track_id, []))
        if len(v) < 3: return False, 0.0
        s = float(np.mean(v[-5:]))
        return s > self.speed_threshold_px, round(s, 1)

    # ---- 7. Stopped vehicle ----
    def detect_stopped_vehicle(self, track_id, timestamp=None):
        now = timestamp or time.time()
        v = list(self.velocity_history.get(track_id, []))
        if len(v) < 5: return False, 0.0
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
        """Strict jaywalking: person must be walking ON the road among vehicles."""
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
            if min(v1['box'][2], v2['box'][2]) - max(v1['box'][0], v2['box'][0]) < 0: continue
            g = abs(v2['box'][1] - v1['box'][3])
            if 0 < g < gap:
                tails.append({'type': 'tailgating', 'vehicles': [v1['class'], v2['class']],
                              'gap_px': round(g, 1), 'box': v1['box'], 'box2': v2['box']})
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
                        viols.append({'type': 'red_light', 'vehicle': v['class'],
                                      'track_id': v.get('track_id', -1), 'box': v['box']})
        return viols

    # ---- 11. U-turn ----
    def detect_uturn(self, track_id):
        h = list(self.track_history.get(track_id, []))
        if len(h) < 20: return False
        n = len(h)
        f, l = h[:n // 3], h[2 * n // 3:]
        if len(f) < 2 or len(l) < 2: return False
        d1 = np.array([f[-1][0] - f[0][0], f[-1][1] - f[0][1]])
        d2 = np.array([l[-1][0] - l[0][0], l[-1][1] - l[0][1]])
        m1, m2 = np.linalg.norm(d1), np.linalg.norm(d2)
        if m1 < 5 or m2 < 5: return False
        cos_a = np.clip(np.dot(d1, d2) / (m1 * m2), -1, 1)
        return math.degrees(math.acos(cos_a)) > self.uturn_angle_threshold

    # ---- Helpers ----
    def calculate_iou(self, b1, b2):
        x1, y1 = max(b1[0], b2[0]), max(b1[1], b2[1])
        x2, y2 = min(b1[2], b2[2]), min(b1[3], b2[3])
        inter = max(0, x2 - x1) * max(0, y2 - y1)
        union = (b1[2]-b1[0])*(b1[3]-b1[1]) + (b2[2]-b2[0])*(b2[3]-b2[1]) - inter
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
            return crash_box
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
        return self.all_classes.get(cid, 'unknown')

    def _update_velocity(self, tid, center):
        h = self.track_history.get(tid, deque())
        if len(h) >= 2:
            self.velocity_history[tid].append(math.hypot(center[0]-h[-1][0], center[1]-h[-1][1]))

    def _should_report(self, vtype, track_id, now):
        """Return True if this (type, track_id) hasn't been reported recently."""
        key = (vtype, int(track_id) if track_id != -1 else id(now))
        last = self.violation_cooldown.get(key, 0)
        if now - last < self.violation_cooldown_seconds:
            return False
        self.violation_cooldown[key] = now
        return True

    def _confirm_event(self, vtype, entity_id, now):
        key = (vtype, entity_id)
        last_seen = self.event_candidate_timestamps.get(key, 0)
        if now - last_seen > self.event_confirmation_window_seconds:
            self.event_candidate_counts[key] = 0
        self.event_candidate_timestamps[key] = now
        self.event_candidate_counts[key] = self.event_candidate_counts.get(key, 0) + 1
        required = self.event_confirmation_frames.get(vtype, 1)
        return self.event_candidate_counts[key] >= required

    def _passes_detection_confidence(self, cls, conf):
        if cls == self.person_class_id:
            return conf >= self.min_person_detection_confidence
        if cls == self.traffic_light_class_id:
            return conf >= self.min_traffic_light_confidence
        if cls == self.motorcycle_class_id or cls == self.bicycle_class_id:
            return conf >= self.min_bike_detection_confidence
        if cls in self.vehicle_classes:
            return conf >= self.min_vehicle_detection_confidence
        return conf >= self.conf_threshold

    def _box_area(self, box):
        return max(0.0, float(box[2] - box[0])) * max(0.0, float(box[3] - box[1]))

    def _is_event_sized_box(self, box, cls, frame_area):
        area_ratio = self._box_area(box) / frame_area if frame_area > 0 else 0.0
        if cls == self.person_class_id:
            return area_ratio >= self.min_person_event_area_ratio
        if cls == self.motorcycle_class_id or cls == self.bicycle_class_id:
            return area_ratio >= self.min_bike_event_area_ratio
        if cls in self.vehicle_classes:
            return area_ratio >= self.min_vehicle_event_area_ratio
        return True

    # ---- Main pipeline ----
    def process_frame(self, frame, persist_tracks=True, run_crash_model=True):
        now = time.time()
        fh, fw = frame.shape[:2]
        frame_area = float(fh * fw)
        results = self.model.track(frame, persist=persist_tracks, verbose=False, conf=self.conf_threshold)

        detections, person_boxes, vehicle_dets, bike_dets, tl_boxes, violations = [], [], [], [], [], []

        if results[0].boxes is not None and len(results[0].boxes):
            boxes = results[0].boxes.xyxy.cpu().numpy()
            classes = results[0].boxes.cls.cpu().numpy().astype(int)
            confs = results[0].boxes.conf.cpu().numpy()
            tids = (results[0].boxes.id.cpu().numpy().astype(int)
                    if results[0].boxes.id is not None else np.full(len(boxes), -1, dtype=int))

            for box, cls, conf, tid in zip(boxes, classes, confs, tids):
                cls = int(cls)
                if not self._passes_detection_confidence(cls, float(conf)):
                    continue
                label = self.classify_vehicle(cls)
                det = {'box': box, 'class': label, 'class_id': cls,
                       'confidence': float(conf), 'track_id': int(tid)}
                detections.append(det)

                if cls == self.person_class_id: person_boxes.append(box)
                if cls == self.motorcycle_class_id: bike_dets.append(det)
                if cls == self.traffic_light_class_id: tl_boxes.append(box)
                if cls in self.vehicle_classes:
                    if not self._is_event_sized_box(box, cls, frame_area):
                        continue
                    vehicle_dets.append(det)
                    c = ((box[0]+box[2])/2, (box[1]+box[3])/2)
                    if tid != -1:
                        self._update_velocity(tid, c)
                        if self.enable_lane_change and self.detect_lane_change(tid, c, fw):
                            if self._confirm_event('lane_change', tid, now) and self._should_report('lane_change', tid, now):
                                violations.append({'type': 'lane_change', 'vehicle': label, 'track_id': int(tid), 'box': box})
                        if self.enable_wrong_way and self.detect_wrong_way(tid, fh):
                            if self._confirm_event('wrong_way', tid, now) and self._should_report('wrong_way', tid, now):
                                violations.append({'type': 'wrong_way', 'vehicle': label, 'track_id': int(tid), 'box': box})
                        if self.enable_speeding:
                            sp, spd = self.detect_speeding(tid)
                            if sp and self._confirm_event('speeding', tid, now) and self._should_report('speeding', tid, now):
                                violations.append({'type': 'speeding', 'vehicle': label, 'speed': spd, 'track_id': int(tid), 'box': box})
                        if self.enable_stopped:
                            st_flag, dur = self.detect_stopped_vehicle(tid, now)
                            if st_flag and self._confirm_event('stopped_vehicle', tid, now) and self._should_report('stopped_vehicle', tid, now):
                                violations.append({'type': 'stopped_vehicle', 'vehicle': label, 'duration': dur, 'track_id': int(tid), 'box': box})
                        if self.enable_uturn and self.detect_uturn(tid):
                            if self._confirm_event('uturn', tid, now) and self._should_report('uturn', tid, now):
                                violations.append({'type': 'uturn', 'vehicle': label, 'track_id': int(tid), 'box': box})

        checked = set()
        for bike in bike_dets:
            bike_tid = bike.get('track_id', -1)
            if self.enable_riders:
                cnt, rboxes = self.count_bike_riders(bike['box'], person_boxes)
                bike['rider_count'] = cnt
                if cnt > 2 and self._confirm_event('excess_riders', bike_tid, now) and self._should_report('excess_riders', bike_tid, now):
                    violations.append({'type': 'excess_riders', 'count': cnt, 'box': bike['box']})
            else:
                rboxes = []; bike['rider_count'] = 0
            if self.enable_helmet:
                for rb in rboxes:
                    k = tuple(rb.tolist())
                    if k in checked: continue
                    checked.add(k)
                    w, hc = self.detect_helmet(frame, rb)
                    if not w and self._confirm_event('no_helmet', bike_tid, now) and self._should_report('no_helmet', bike_tid, now):
                        violations.append({'type': 'no_helmet', 'box': rb, 'helmet_confidence': hc})

        accidents = []
        if self.enable_accident:
            accidents.extend(self.detect_accident(vehicle_dets, now))
            if run_crash_model:
                accidents.extend(self.detect_crash_scene(frame, vehicle_dets))

        if self.enable_jaywalking:
            vb = [d['box'] for d in vehicle_dets]
            all_bike_boxes = [d['box'] for d in bike_dets]
            for pb in person_boxes:
                if self.detect_jaywalking(pb, fh, fw, vb, all_bike_boxes):
                    pseudo_id = int((pb[0] + pb[2]) / 2) * 10000 + int((pb[1] + pb[3]) / 2)
                    if self._confirm_event('jaywalking', pseudo_id, now) and self._should_report('jaywalking', pseudo_id, now):
                        violations.append({'type': 'jaywalking', 'box': pb})

        if self.enable_tailgating:
            for tg in self.detect_tailgating(vehicle_dets, fh):
                pseudo_id = int((tg['box'][0] + tg['box'][2]) / 2)
                if self._confirm_event('tailgating', pseudo_id, now) and self._should_report('tailgating', pseudo_id, now):
                    violations.append(tg)

        if self.enable_red_light and tl_boxes:
            for rv in self.detect_red_light_violation(tl_boxes, vehicle_dets, fh):
                rid = rv.get('track_id', -1)
                if self._confirm_event('red_light', rid, now) and self._should_report('red_light', rid, now):
                    violations.append(rv)

        return {'detections': detections, 'violations': violations, 'accidents': accidents,
                'stats': {'total_vehicles': len(vehicle_dets), 'total_persons': len(person_boxes),
                          'total_bikes': len(bike_dets), 'traffic_lights': len(tl_boxes)}}

    # ---- Drawing ----
    def draw_results(self, frame, results):
        ov = frame.copy()
        CV, CP, CR = (0,220,100), (200,180,0), (0,0,255)
        cmap = {'lane_change': (0,165,255), 'excess_riders': CR, 'no_helmet': CR,
                'wrong_way': (255,0,255), 'speeding': (0,80,255), 'stopped_vehicle': (128,128,255),
                'jaywalking': (0,200,255), 'tailgating': (255,100,0), 'red_light': (50,50,255), 'uturn': (200,0,200)}
        lmap = {'excess_riders': lambda v: f"! {v.get('count','?')} RIDERS",
                'no_helmet': lambda v: "! NO HELMET",
                'lane_change': lambda v: f"LANE CHANGE ({v.get('vehicle','')})",
                'wrong_way': lambda v: f"WRONG WAY ({v.get('vehicle','')})",
                'speeding': lambda v: f"SPEEDING {v.get('speed','')} px/f",
                'stopped_vehicle': lambda v: f"STOPPED {v.get('duration','')}s",
                'jaywalking': lambda v: "JAYWALKING",
                'tailgating': lambda v: f"TAILGATING ({v.get('gap_px','')}px)",
                'red_light': lambda v: f"RED LIGHT ({v.get('vehicle','')})",
                'uturn': lambda v: f"U-TURN ({v.get('vehicle','')})"}

        for d in results['detections']:
            x1,y1,x2,y2 = map(int, d['box'])
            c = CP if d['class_id'] == 0 else CV
            cv2.rectangle(ov,(x1,y1),(x2,y2),c,2)
            l = f"{d['class']} {d['confidence']:.0%}"
            (tw,th),_ = cv2.getTextSize(l, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
            cv2.rectangle(ov,(x1,y1-th-6),(x1+tw+4,y1),c,-1)
            cv2.putText(ov,l,(x1+2,y1-4), cv2.FONT_HERSHEY_SIMPLEX, 0.5,(255,255,255),1)

        for v in results['violations']:
            x1,y1,x2,y2 = map(int, v['box'])
            c = cmap.get(v['type'], CR)
            cv2.rectangle(ov,(x1,y1),(x2,y2),c,3)
            l = lmap.get(v['type'], lambda v: "VIOLATION")(v)
            (tw,th),_ = cv2.getTextSize(l, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
            cv2.rectangle(ov,(x1,y1-th-8),(x1+tw+4,y1),c,-1)
            cv2.putText(ov,l,(x1+2,y1-5), cv2.FONT_HERSHEY_SIMPLEX, 0.55,(255,255,255),2)
            if v['type'] == 'tailgating' and 'box2' in v:
                bx1,by1,bx2,by2 = map(int, v['box2'])
                cv2.rectangle(ov,(bx1,by1),(bx2,by2),c,3)

        for a in results['accidents']:
            x1,y1,x2,y2 = map(int, a['location'])
            cv2.rectangle(ov,(x1-4,y1-4),(x2+4,y2+4),CR,5)
            l = f"ACCIDENT ({a['confidence']:.0%})"
            (tw,th),_ = cv2.getTextSize(l, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)
            cv2.rectangle(ov,(x1,y1-th-12),(x1+tw+8,y1),CR,-1)
            cv2.putText(ov,l,(x1+4,y1-6), cv2.FONT_HERSHEY_SIMPLEX, 0.7,(255,255,255),2)

        cv2.addWeighted(ov, 0.85, frame, 0.15, 0, frame)
        return frame


def main():
    monitor = TrafficMonitor()
    cap = cv2.VideoCapture('traffic_video.mp4')
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break
        res = monitor.process_frame(frame)
        out = monitor.draw_results(frame.copy(), res)
        cv2.imshow('Traffic Monitor', out)
        if cv2.waitKey(1) & 0xFF == ord('q'): break
    cap.release()
    cv2.destroyAllWindows()


if __name__ == '__main__':
    main()
