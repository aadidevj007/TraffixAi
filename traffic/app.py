"""
Streamlit Traffic Monitoring System
Multi-task detection with 12 violation modules:
  Helmets, Bike Riders, Accidents, Vehicle Classification, Lane Changes,
  Wrong-Way Driving, Speeding, Stopped Vehicle, Jaywalking, Tailgating,
  Red Light Violation, Illegal U-Turn
"""

import streamlit as st
import cv2
import numpy as np
from ultralytics import YOLO
from collections import defaultdict, deque
import tempfile
from PIL import Image
import time
import math


class TrafficMonitor:
    def __init__(self, model_path='yolov8n.pt', conf_threshold=0.4):
        """Initialize the traffic monitoring system"""
        self.model = YOLO(model_path)
        self.track_history = defaultdict(lambda: deque(maxlen=60))
        self.velocity_history = defaultdict(lambda: deque(maxlen=20))
        self.accident_cooldown = {}
        self.violation_cooldown = {}         # (type, track_id) -> last_alert_time
        self.stopped_vehicle_timers = {}     # track_id -> first_stopped_time
        self.dominant_direction = None       # auto-detected traffic flow direction
        self.direction_votes = deque(maxlen=200)
        self.conf_threshold = conf_threshold
        self.violation_cooldown_seconds = 3  # suppress same violation for N seconds

        # ---- COCO Class IDs ----
        self.person_class_id = 0
        self.motorcycle_class_id = 3
        self.bicycle_class_id = 1
        self.traffic_light_class_id = 9

        self.vehicle_classes = {
            1: 'bicycle', 2: 'car', 3: 'motorcycle',
            5: 'bus', 7: 'truck',
        }
        self.all_classes = {
            **self.vehicle_classes,
            0: 'person', 9: 'traffic light',
        }

        # ---- Optimized Thresholds (locked) ----
        # Existing modules
        self.accident_iou_threshold = 0.50       # stricter overlap needed = fewer false accident alerts
        self.accident_decel_threshold = 0.5      # require noticeable deceleration
        self.rider_iou_threshold = 0.20          # higher overlap ensures person is truly ON the bike
        self.helmet_dark_ratio_lo = 0.20
        self.helmet_dark_ratio_hi = 0.70
        self.helmet_roundness_threshold = 0.40   # stricter roundness for helmet shape
        self.lane_change_x_pct = 0.10            # 10% of frame width = significant lateral move
        self.lane_change_window = 20             # watch over more frames to confirm lane change
        self.accident_cooldown_seconds = 8       # longer cooldown to prevent duplicate accident reports

        # New modules
        self.speed_threshold_px = 100            # higher threshold = only flag truly fast vehicles
        self.stopped_time_threshold = 8.0        # 8 seconds stationary before flagging
        self.stopped_speed_threshold = 1.5       # stricter stationary check
        self.tailgate_distance_pct = 0.05        # 5% of frame height = realistic close following
        self.jaywalking_zone_top_pct = 0.20      # top 20% = sidewalk / safe zone
        self.jaywalking_zone_bot_pct = 0.20      # bottom 20% = safe zone
        self.uturn_angle_threshold = 150         # 150° = only flag sharp near-180° turns
        self.wrong_way_min_history = 20          # need more frames to judge direction confidently

        # Module enable flags
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

    # ================================================================== #
    #  1. HELMET DETECTION (multi-feature)
    # ================================================================== #
    def detect_helmet(self, frame, person_box):
        x1, y1, x2, y2 = map(int, person_box)
        h, w = y2 - y1, x2 - x1
        if h <= 0 or w <= 0:
            return False, 0.0

        head_y2 = y1 + max(int(h * 0.25), 1)
        head_region = frame[max(y1, 0):min(head_y2, frame.shape[0]),
                           max(x1, 0):min(x2, frame.shape[1])]
        if head_region.size == 0:
            return False, 0.0

        score = 0.0

        hsv = cv2.cvtColor(head_region, cv2.COLOR_BGR2HSV)
        dark_mask = cv2.inRange(hsv, np.array([0, 30, 0]), np.array([180, 255, 140]))
        dark_ratio = np.count_nonzero(dark_mask) / dark_mask.size
        if self.helmet_dark_ratio_lo < dark_ratio < self.helmet_dark_ratio_hi:
            score += 0.4

        gray = cv2.cvtColor(head_region, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        edges = cv2.Canny(blurred, 30, 100)
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if contours:
            largest = max(contours, key=cv2.contourArea)
            area = cv2.contourArea(largest)
            perimeter = cv2.arcLength(largest, True)
            if perimeter > 0:
                circularity = 4 * math.pi * area / (perimeter * perimeter)
                if circularity > self.helmet_roundness_threshold:
                    score += 0.4

        if np.var(gray.astype(np.float32)) < 1200:
            score += 0.2

        return score >= 0.5, round(score, 2)

    # ================================================================== #
    #  2. BIKE RIDER COUNTING (IoU-gated)
    # ================================================================== #
    def count_bike_riders(self, bike_box, person_boxes):
        riders = []
        for pbox in person_boxes:
            iou = self.calculate_iou(bike_box, pbox)
            if iou >= self.rider_iou_threshold:
                riders.append(pbox)
        return len(riders), riders

    # ================================================================== #
    #  3. ACCIDENT DETECTION (vehicle-only + velocity)
    # ================================================================== #
    def detect_accident(self, vehicle_detections, timestamp=None):
        accidents = []
        now = timestamp or time.time()
        for i, det1 in enumerate(vehicle_detections):
            for det2 in vehicle_detections[i + 1:]:
                iou = self.calculate_iou(det1['box'], det2['box'])
                if iou < self.accident_iou_threshold:
                    continue
                tid1, tid2 = det1.get('track_id', -1), det2.get('track_id', -1)
                decel = False
                for tid in (tid1, tid2):
                    if tid == -1:
                        continue
                    vels = self.velocity_history.get(tid, deque())
                    if len(vels) >= 3:
                        recent = np.mean(list(vels)[-3:])
                        earlier = np.mean(list(vels)[:3])
                        if earlier > 1 and recent / earlier < self.accident_decel_threshold:
                            decel = True
                if tid1 != -1 and tid2 != -1 and not decel:
                    continue
                pair = tuple(sorted([int(tid1), int(tid2)]))
                if pair in self.accident_cooldown and now - self.accident_cooldown[pair] < self.accident_cooldown_seconds:
                    continue
                self.accident_cooldown[pair] = now
                accidents.append({
                    'vehicles': [det1['class'], det2['class']],
                    'location': det1['box'], 'confidence': round(float(iou), 2),
                    'deceleration': decel,
                })
        return accidents

    # ================================================================== #
    #  4. LANE CHANGE DETECTION (resolution-normalized)
    # ================================================================== #
    def detect_lane_change(self, track_id, current_pos, frame_width):
        self.track_history[track_id].append(current_pos)
        window = list(self.track_history[track_id])[-self.lane_change_window:]
        if len(window) < 8:
            return False
        x_positions = [p[0] for p in window]
        x_shift = abs(x_positions[-1] - x_positions[0])
        var_thresh = (frame_width * 0.02) ** 2
        return x_shift > frame_width * self.lane_change_x_pct and float(np.var(x_positions)) > var_thresh

    # ================================================================== #
    #  5. WRONG-WAY DRIVING (auto-detect dominant flow)
    # ================================================================== #
    def detect_wrong_way(self, track_id, frame_height):
        history = list(self.track_history.get(track_id, []))
        if len(history) < self.wrong_way_min_history:
            return False

        # Primary direction = vertical movement (top-to-bottom vs bottom-to-top)
        y_start = history[0][1]
        y_end = history[-1][1]
        dy = y_end - y_start

        # Vote for dominant direction
        direction = 1 if dy > 0 else -1  # +1 = top-to-bottom, -1 = bottom-to-top
        if abs(dy) > frame_height * 0.05:  # only vote if meaningful movement
            self.direction_votes.append(direction)

        # Need enough votes to establish dominant direction
        if len(self.direction_votes) < 30:
            return False

        dominant = 1 if sum(self.direction_votes) > 0 else -1

        # This vehicle moving opposite to dominant?
        return direction != 0 and direction != dominant and abs(dy) > frame_height * 0.08

    # ================================================================== #
    #  6. SPEEDING ESTIMATION (pixel-based)
    # ================================================================== #
    def detect_speeding(self, track_id):
        vels = list(self.velocity_history.get(track_id, []))
        if len(vels) < 3:
            return False, 0.0
        avg_speed = float(np.mean(vels[-5:]))
        return avg_speed > self.speed_threshold_px, round(avg_speed, 1)

    # ================================================================== #
    #  7. STOPPED VEHICLE (stationary in lane)
    # ================================================================== #
    def detect_stopped_vehicle(self, track_id, timestamp=None):
        now = timestamp or time.time()
        vels = list(self.velocity_history.get(track_id, []))
        if len(vels) < 5:
            return False, 0.0

        avg_speed = float(np.mean(vels[-5:]))

        if avg_speed < self.stopped_speed_threshold:
            if track_id not in self.stopped_vehicle_timers:
                self.stopped_vehicle_timers[track_id] = now
            elapsed = now - self.stopped_vehicle_timers[track_id]
            return elapsed > self.stopped_time_threshold, round(elapsed, 1)
        else:
            self.stopped_vehicle_timers.pop(track_id, None)
            return False, 0.0

    # ================================================================== #
    #  8. PEDESTRIAN JAYWALKING
    # ================================================================== #
    def detect_jaywalking(self, person_box, frame_height, frame_width,
                          vehicle_boxes, bike_boxes):
        """Strict jaywalking: person must be walking ON the road among vehicles,
        not riding, not a passenger, and not standing on the sidewalk."""
        px1, py1, px2, py2 = person_box
        person_cx = (px1 + px2) / 2
        person_cy = (py1 + py2) / 2
        person_h = py2 - py1
        person_w = px2 - px1

        # 1. Skip tiny detections (noise / far-away people)
        if person_h < frame_height * 0.08 or person_w < frame_width * 0.02:
            return False

        # 2. Skip persons overlapping with ANY vehicle or bike
        #    (they're riders, passengers, or standing beside their vehicle)
        all_veh = list(vehicle_boxes) + list(bike_boxes)
        for vbox in all_veh:
            iou = self.calculate_iou(person_box, vbox)
            if iou >= 0.08:
                return False

        # 3. Person must be in the road zone (central band of frame)
        safe_top = frame_height * self.jaywalking_zone_top_pct
        safe_bot = frame_height * (1 - self.jaywalking_zone_bot_pct)
        if not (safe_top < person_cy < safe_bot):
            return False

        # 4. Person must not be at the far left/right edges (sidewalks)
        edge_margin = frame_width * 0.10
        if person_cx < edge_margin or person_cx > (frame_width - edge_margin):
            return False

        # 5. Must have at least 2 vehicles nearby to confirm it's a road
        nearby_count = 0
        for vbox in vehicle_boxes:
            vcx = (vbox[0] + vbox[2]) / 2
            vcy = (vbox[1] + vbox[3]) / 2
            dist = math.hypot(person_cx - vcx, person_cy - vcy)
            if dist < frame_height * 0.3:
                nearby_count += 1
        if nearby_count < 2:
            return False

        # 6. Person's vertical position should be similar to vehicles
        #    (same "lane" band — they're on the road, not on an overpass)
        veh_centers_y = [(vb[1] + vb[3]) / 2 for vb in vehicle_boxes]
        if veh_centers_y:
            closest_vy = min(veh_centers_y, key=lambda vy: abs(vy - person_cy))
            if abs(closest_vy - person_cy) > frame_height * 0.15:
                return False

        return True

    # ================================================================== #
    #  9. TAILGATING (too-close following)
    # ================================================================== #
    def detect_tailgating(self, vehicle_detections, frame_height):
        tailgates = []
        min_gap = frame_height * self.tailgate_distance_pct

        # Sort vehicles by vertical center (approximate lane position)
        sorted_vehs = sorted(vehicle_detections,
                             key=lambda d: (d['box'][1] + d['box'][3]) / 2)

        for i in range(len(sorted_vehs) - 1):
            v1 = sorted_vehs[i]
            v2 = sorted_vehs[i + 1]

            # Check if roughly same lane (x overlap)
            x_overlap = min(v1['box'][2], v2['box'][2]) - max(v1['box'][0], v2['box'][0])
            if x_overlap < 0:
                continue  # different lanes

            # Vertical gap
            gap = abs(v2['box'][1] - v1['box'][3])
            if 0 < gap < min_gap:
                tailgates.append({
                    'type': 'tailgating',
                    'vehicles': [v1['class'], v2['class']],
                    'gap_px': round(gap, 1),
                    'box': v1['box'],
                    'box2': v2['box'],
                })
        return tailgates

    # ================================================================== #
    #  10. RED LIGHT VIOLATION
    # ================================================================== #
    def detect_red_light_violation(self, traffic_light_boxes, vehicle_detections, frame_height):
        violations = []
        for tl_box in traffic_light_boxes:
            # Stop line = bottom of traffic light box (approximate)
            stop_line_y = tl_box[3]

            for veh in vehicle_detections:
                veh_top = veh['box'][1]
                # Vehicle crossed stop line (its top is below the light)
                if veh_top > stop_line_y:
                    # Check if vehicle is moving (not already past)
                    vels = self.velocity_history.get(veh.get('track_id', -1), deque())
                    if len(vels) >= 2 and float(np.mean(list(vels)[-3:])) > 3:
                        violations.append({
                            'type': 'red_light',
                            'vehicle': veh['class'],
                            'track_id': veh.get('track_id', -1),
                            'box': veh['box'],
                        })
        return violations

    # ================================================================== #
    #  11. ILLEGAL U-TURN
    # ================================================================== #
    def detect_uturn(self, track_id):
        history = list(self.track_history.get(track_id, []))
        if len(history) < 20:
            return False

        # Compare direction in first third vs last third
        n = len(history)
        first = history[:n // 3]
        last = history[2 * n // 3:]

        if len(first) < 2 or len(last) < 2:
            return False

        dir1 = np.array([first[-1][0] - first[0][0], first[-1][1] - first[0][1]])
        dir2 = np.array([last[-1][0] - last[0][0], last[-1][1] - last[0][1]])

        mag1 = np.linalg.norm(dir1)
        mag2 = np.linalg.norm(dir2)

        if mag1 < 5 or mag2 < 5:
            return False

        cos_angle = np.dot(dir1, dir2) / (mag1 * mag2)
        cos_angle = np.clip(cos_angle, -1, 1)
        angle = math.degrees(math.acos(cos_angle))

        return angle > self.uturn_angle_threshold

    # ================================================================== #
    #  HELPERS
    # ================================================================== #
    def calculate_iou(self, box1, box2):
        x1 = max(box1[0], box2[0])
        y1 = max(box1[1], box2[1])
        x2 = min(box1[2], box2[2])
        y2 = min(box1[3], box2[3])
        intersection = max(0, x2 - x1) * max(0, y2 - y1)
        area1 = (box1[2] - box1[0]) * (box1[3] - box1[1])
        area2 = (box2[2] - box2[0]) * (box2[3] - box2[1])
        union = area1 + area2 - intersection
        return intersection / union if union > 0 else 0

    def classify_vehicle(self, class_id):
        return self.all_classes.get(class_id, 'unknown')

    def _update_velocity(self, track_id, center):
        history = self.track_history.get(track_id, deque())
        if len(history) >= 2:
            prev = history[-1]
            speed = math.hypot(center[0] - prev[0], center[1] - prev[1])
            self.velocity_history[track_id].append(speed)

    def _should_report(self, vtype, track_id, now):
        """Return True if this (type, track_id) hasn't been reported recently."""
        key = (vtype, int(track_id) if track_id != -1 else id(now))
        last = self.violation_cooldown.get(key, 0)
        if now - last < self.violation_cooldown_seconds:
            return False
        self.violation_cooldown[key] = now
        return True

    # ================================================================== #
    #  MAIN PROCESSING PIPELINE
    # ================================================================== #
    def process_frame(self, frame):
        now = time.time()
        fh, fw = frame.shape[:2]
        results = self.model.track(frame, persist=True, verbose=False,
                                   conf=self.conf_threshold)

        detections = []
        person_boxes = []
        vehicle_detections = []
        bike_detections = []
        traffic_light_boxes = []
        violations = []

        if results[0].boxes is not None and len(results[0].boxes):
            boxes = results[0].boxes.xyxy.cpu().numpy()
            classes = results[0].boxes.cls.cpu().numpy().astype(int)
            confs = results[0].boxes.conf.cpu().numpy()
            track_ids = (results[0].boxes.id.cpu().numpy().astype(int)
                         if results[0].boxes.id is not None
                         else np.full(len(boxes), -1, dtype=int))

            for box, cls, conf, track_id in zip(boxes, classes, confs, track_ids):
                cls = int(cls)
                label = self.classify_vehicle(cls)
                detection = {
                    'box': box, 'class': label, 'class_id': cls,
                    'confidence': float(conf), 'track_id': int(track_id),
                }
                detections.append(detection)

                if cls == self.person_class_id:
                    person_boxes.append(box)
                if cls == self.motorcycle_class_id:
                    bike_detections.append(detection)
                if cls == self.traffic_light_class_id:
                    traffic_light_boxes.append(box)

                if cls in self.vehicle_classes:
                    vehicle_detections.append(detection)
                    center = ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2)

                    if track_id != -1:
                        self._update_velocity(track_id, center)

                        # 4. Lane change
                        if self.enable_lane_change:
                            if self.detect_lane_change(track_id, center, fw):
                                if self._should_report('lane_change', track_id, now):
                                    violations.append({
                                        'type': 'lane_change', 'vehicle': label,
                                        'track_id': int(track_id), 'box': box,
                                    })

                        # 5. Wrong-way driving
                        if self.enable_wrong_way:
                            if self.detect_wrong_way(track_id, fh):
                                if self._should_report('wrong_way', track_id, now):
                                    violations.append({
                                        'type': 'wrong_way', 'vehicle': label,
                                        'track_id': int(track_id), 'box': box,
                                    })

                        # 6. Speeding
                        if self.enable_speeding:
                            is_speeding, spd = self.detect_speeding(track_id)
                            if is_speeding:
                                if self._should_report('speeding', track_id, now):
                                    violations.append({
                                        'type': 'speeding', 'vehicle': label,
                                        'speed': spd, 'track_id': int(track_id),
                                        'box': box,
                                    })

                        # 7. Stopped vehicle
                        if self.enable_stopped:
                            is_stopped, dur = self.detect_stopped_vehicle(track_id, now)
                            if is_stopped:
                                if self._should_report('stopped_vehicle', track_id, now):
                                    violations.append({
                                        'type': 'stopped_vehicle', 'vehicle': label,
                                        'duration': dur, 'track_id': int(track_id),
                                        'box': box,
                                    })

                        # 11. Illegal U-turn
                        if self.enable_uturn:
                            if self.detect_uturn(track_id):
                                if self._should_report('uturn', track_id, now):
                                    violations.append({
                                        'type': 'uturn', 'vehicle': label,
                                        'track_id': int(track_id), 'box': box,
                                    })

        # ---- 1 & 2: Helmet + Rider count ----
        checked = set()
        for bike in bike_detections:
            bike_tid = bike.get('track_id', -1)
            if self.enable_riders:
                count, rider_boxes = self.count_bike_riders(bike['box'], person_boxes)
                bike['rider_count'] = count
                if count > 2:
                    if self._should_report('excess_riders', bike_tid, now):
                        violations.append({
                            'type': 'excess_riders', 'count': count, 'box': bike['box'],
                        })
            else:
                rider_boxes = []
                bike['rider_count'] = 0

            if self.enable_helmet:
                for rbox in rider_boxes:
                    key = tuple(rbox.tolist())
                    if key in checked:
                        continue
                    checked.add(key)
                    wearing, hconf = self.detect_helmet(frame, rbox)
                    if not wearing:
                        # Use bike track_id as proxy for rider identity
                        if self._should_report('no_helmet', bike_tid, now):
                            violations.append({
                                'type': 'no_helmet', 'box': rbox,
                                'helmet_confidence': hconf,
                            })

        # ---- 3: Accident ----
        accidents = []
        if self.enable_accident:
            accidents = self.detect_accident(vehicle_detections, now)

        # ---- 8: Jaywalking ----
        if self.enable_jaywalking:
            veh_boxes = [d['box'] for d in vehicle_detections]
            all_bike_boxes = [d['box'] for d in bike_detections]
            for i, pbox in enumerate(person_boxes):
                if self.detect_jaywalking(pbox, fh, fw, veh_boxes, all_bike_boxes):
                    # Use position-based key since pedestrians have no track_id
                    pseudo_id = int((pbox[0] + pbox[2]) / 2) * 10000 + int((pbox[1] + pbox[3]) / 2)
                    if self._should_report('jaywalking', pseudo_id, now):
                        violations.append({
                            'type': 'jaywalking', 'box': pbox,
                        })

        # ---- 9: Tailgating ----
        if self.enable_tailgating:
            tailgates = self.detect_tailgating(vehicle_detections, fh)
            for tg in tailgates:
                pseudo_id = int((tg['box'][0] + tg['box'][2]) / 2)
                if self._should_report('tailgating', pseudo_id, now):
                    violations.append(tg)

        # ---- 10: Red light ----
        if self.enable_red_light and traffic_light_boxes:
            rl_violations = self.detect_red_light_violation(
                traffic_light_boxes, vehicle_detections, fh)
            violations.extend(rl_violations)

        return {
            'detections': detections,
            'violations': violations,
            'accidents': accidents,
            'stats': {
                'total_vehicles': len(vehicle_detections),
                'total_persons': len(person_boxes),
                'total_bikes': len(bike_detections),
                'traffic_lights': len(traffic_light_boxes),
            },
        }

    # ================================================================== #
    #  DRAWING / VISUALIZATION
    # ================================================================== #
    def draw_results(self, frame, results):
        overlay = frame.copy()

        # Colour palette
        C_VEH = (0, 220, 100)       # green
        C_PER = (200, 180, 0)       # teal
        C_VIO = (0, 0, 255)         # red
        C_LAN = (0, 165, 255)       # orange
        C_ACC = (0, 0, 255)         # red
        C_SPEED = (0, 80, 255)      # dark orange
        C_WRONG = (255, 0, 255)     # magenta
        C_STOP = (128, 128, 255)    # salmon
        C_JAY = (0, 200, 255)       # yellow
        C_TAIL = (255, 100, 0)      # cyan-blue
        C_RED = (50, 50, 255)       # deep red
        C_UTURN = (200, 0, 200)     # purple

        # Draw detections
        for det in results['detections']:
            x1, y1, x2, y2 = map(int, det['box'])
            c = C_PER if det['class_id'] == self.person_class_id else C_VEH
            cv2.rectangle(overlay, (x1, y1), (x2, y2), c, 2)
            lbl = f"{det['class']} {det['confidence']:.0%}"
            (tw, th), _ = cv2.getTextSize(lbl, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
            cv2.rectangle(overlay, (x1, y1 - th - 6), (x1 + tw + 4, y1), c, -1)
            cv2.putText(overlay, lbl, (x1 + 2, y1 - 4),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)

        # Draw violations with type-specific colours
        colour_map = {
            'lane_change': C_LAN, 'excess_riders': C_VIO, 'no_helmet': C_VIO,
            'wrong_way': C_WRONG, 'speeding': C_SPEED, 'stopped_vehicle': C_STOP,
            'jaywalking': C_JAY, 'tailgating': C_TAIL, 'red_light': C_RED,
            'uturn': C_UTURN,
        }

        for v in results['violations']:
            x1, y1, x2, y2 = map(int, v['box'])
            c = colour_map.get(v['type'], C_VIO)
            cv2.rectangle(overlay, (x1, y1), (x2, y2), c, 3)

            lbl_map = {
                'excess_riders': f"! {v.get('count', '?')} RIDERS",
                'no_helmet':     "! NO HELMET",
                'lane_change':   f"LANE CHANGE ({v.get('vehicle', '')})",
                'wrong_way':     f"WRONG WAY ({v.get('vehicle', '')})",
                'speeding':      f"SPEEDING {v.get('speed', '')} px/f",
                'stopped_vehicle': f"STOPPED {v.get('duration', '')}s",
                'jaywalking':    "JAYWALKING",
                'tailgating':    f"TAILGATING ({v.get('gap_px', '')}px)",
                'red_light':     f"RED LIGHT ({v.get('vehicle', '')})",
                'uturn':         f"U-TURN ({v.get('vehicle', '')})",
            }
            lbl = lbl_map.get(v['type'], "VIOLATION")

            (tw, th), _ = cv2.getTextSize(lbl, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
            cv2.rectangle(overlay, (x1, y1 - th - 8), (x1 + tw + 4, y1), c, -1)
            cv2.putText(overlay, lbl, (x1 + 2, y1 - 5),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2)

            # For tailgating draw the second vehicle box too
            if v['type'] == 'tailgating' and 'box2' in v:
                bx1, by1, bx2, by2 = map(int, v['box2'])
                cv2.rectangle(overlay, (bx1, by1), (bx2, by2), c, 3)

        # Draw accidents
        for acc in results['accidents']:
            x1, y1, x2, y2 = map(int, acc['location'])
            cv2.rectangle(overlay, (x1 - 4, y1 - 4), (x2 + 4, y2 + 4), C_ACC, 5)
            lbl = f"ACCIDENT ({acc['confidence']:.0%})"
            (tw, th), _ = cv2.getTextSize(lbl, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)
            cv2.rectangle(overlay, (x1, y1 - th - 12), (x1 + tw + 8, y1), C_ACC, -1)
            cv2.putText(overlay, lbl, (x1 + 4, y1 - 6),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

        cv2.addWeighted(overlay, 0.85, frame, 0.15, 0, frame)
        return frame


# ====================================================================== #
#  STREAMLIT UI
# ====================================================================== #
def main():
    st.set_page_config(
        page_title="Traffic Monitor",
        page_icon="🚦",
        layout="wide",
        initial_sidebar_state="expanded",
    )

    st.markdown("""
    <style>
    .block-container { padding-top: 1.2rem; }
    h1 { color: #00d4aa; }
    .stTabs [data-baseweb="tab-list"] { gap: 8px; }
    </style>
    """, unsafe_allow_html=True)

    st.title("🚦 Traffic Anomaly & Violation Detection")
    st.caption("12-module detection: Helmets · Riders · Accidents · Vehicles · Lane Changes · "
               "Wrong-Way · Speeding · Stopped Vehicle · Jaywalking · Tailgating · Red Light · U-Turn")

    # ---- Sidebar ----
    with st.sidebar:
        st.header("⚙️ Settings")
        detection_mode = st.selectbox("Detection Mode",
                                      ["📷 Image", "🎥 Video", "📹 Webcam"])

        st.divider()
        st.subheader("🧩 Modules")
        col_a, col_b = st.columns(2)
        with col_a:
            en_helmet = st.checkbox("Helmet", True)
            en_riders = st.checkbox("Rider Count", True)
            en_accident = st.checkbox("Accidents", True)
            en_lane = st.checkbox("Lane Change", True)
            en_wrong = st.checkbox("Wrong-Way", True)
            en_uturn = st.checkbox("U-Turn", True)
        with col_b:
            en_speed = st.checkbox("Speeding", True)
            en_stopped = st.checkbox("Stopped Vehicle", True)
            en_jaywalking = st.checkbox("Jaywalking", True)
            en_tailgate = st.checkbox("Tailgating", True)
            en_redlight = st.checkbox("Red Light", True)

    # ---- Initialize monitor ----
    if 'monitor' not in st.session_state:
        with st.spinner("🔄 Loading YOLOv8 model…"):
            st.session_state.monitor = TrafficMonitor()

    monitor = st.session_state.monitor
    monitor.enable_helmet = en_helmet
    monitor.enable_riders = en_riders
    monitor.enable_accident = en_accident
    monitor.enable_lane_change = en_lane
    monitor.enable_wrong_way = en_wrong
    monitor.enable_speeding = en_speed
    monitor.enable_stopped = en_stopped
    monitor.enable_jaywalking = en_jaywalking
    monitor.enable_tailgating = en_tailgate
    monitor.enable_red_light = en_redlight
    monitor.enable_uturn = en_uturn

    # ================================================================= #
    #  IMAGE MODE
    # ================================================================= #
    if detection_mode == "📷 Image":
        uploaded = st.file_uploader("Upload an image", type=['jpg', 'jpeg', 'png', 'bmp', 'webp'])
        if uploaded:
            file_bytes = np.asarray(bytearray(uploaded.read()), dtype=np.uint8)
            image = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)

            col_l, col_r = st.columns(2)
            with col_l:
                st.subheader("📥 Original")
                st.image(cv2.cvtColor(image, cv2.COLOR_BGR2RGB), width="stretch")

            with st.spinner("⏳ Analysing…"):
                t0 = time.time()
                res = monitor.process_frame(image)
                elapsed = time.time() - t0
                output = monitor.draw_results(image.copy(), res)

            with col_r:
                st.subheader("📤 Detected")
                st.image(cv2.cvtColor(output, cv2.COLOR_BGR2RGB), width="stretch")

            # Stats
            c1, c2, c3, c4, c5 = st.columns(5)
            c1.metric("🚗 Vehicles", res['stats']['total_vehicles'])
            c2.metric("🚶 Persons", res['stats']['total_persons'])
            c3.metric("🏍️ Bikes", res['stats']['total_bikes'])
            c4.metric("⚠️ Violations", len(res['violations']))
            c5.metric("🚨 Accidents", len(res['accidents']))
            st.caption(f"⏱ {elapsed:.2f}s")

            # Violation breakdown
            _show_violations(res)

    # ================================================================= #
    #  VIDEO MODE
    # ================================================================= #
    elif detection_mode == "🎥 Video":
        uploaded_video = st.file_uploader("Upload a video",
                                          type=['mp4', 'avi', 'mov', 'mkv', 'mpeg4'])
        if uploaded_video:
            # Write to temp file and CLOSE it before OpenCV reads (Windows lock issue)
            tfile = tempfile.NamedTemporaryFile(delete=False, suffix='.mp4')
            tfile.write(uploaded_video.read())
            tfile.close()

            cap = cv2.VideoCapture(tfile.name)
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            fps = cap.get(cv2.CAP_PROP_FPS) or 30

            # --- Validate video file ---
            if total_frames <= 0 or not cap.isOpened():
                cap.release()
                # Try reading one frame as a last-resort check
                cap2 = cv2.VideoCapture(tfile.name)
                ret_test, _ = cap2.read()
                cap2.release()
                if not ret_test:
                    st.error(
                        "❌ **Cannot read this video file.**\n\n"
                        "The file appears to be corrupted or incomplete "
                        "(missing moov atom / metadata header).\n\n"
                        "**Try one of these fixes:**\n"
                        "1. Re-download or re-export the video\n"
                        "2. Convert it with FFmpeg: `ffmpeg -i input.mp4 -c copy -movflags faststart output.mp4`\n"
                        "3. Use a different format (AVI, MOV)"
                    )
                    import os
                    os.unlink(tfile.name)
                    st.stop()
                else:
                    # Frame count unknown but video is readable — proceed
                    cap = cv2.VideoCapture(tfile.name)
                    total_frames = 0  # unknown, we'll count as we go

            st.info(f"📹 {total_frames if total_frames > 0 else '?'} frames @ {fps:.0f} FPS")

            stframe = st.empty()
            progress = st.progress(0)
            stats_area = st.empty()
            stop = st.button("⏹ Stop")

            tot_v, tot_a, idx = 0, 0, 0
            violation_log = defaultdict(int)  # type -> unique count
            seen_vehicle_ids = set()          # unique vehicle track IDs

            while cap.isOpened() and not stop:
                ret, frame = cap.read()
                if not ret:
                    break
                idx += 1
                if idx % 2 != 0:
                    continue
                res = monitor.process_frame(frame)
                out = monitor.draw_results(frame.copy(), res)
                stframe.image(cv2.cvtColor(out, cv2.COLOR_BGR2RGB),
                              channels="RGB", width="stretch")

                # Track unique vehicles by track_id
                for d in res['detections']:
                    tid = d.get('track_id', -1)
                    if tid != -1 and d['class_id'] in monitor.vehicle_classes:
                        seen_vehicle_ids.add(tid)

                # Count only new (cooldown-filtered) violations
                for v in res['violations']:
                    violation_log[v['type']] += 1
                tot_v = sum(violation_log.values())
                tot_a += len(res['accidents'])

                if total_frames > 0:
                    progress.progress(min(idx / total_frames, 1.0))
                with stats_area.container():
                    c1, c2, c3, c4, c5 = st.columns(5)
                    c1.metric("🚗 Total Vehicles", len(seen_vehicle_ids))
                    c2.metric("⚠️ Violations", tot_v)
                    c3.metric("🚨 Accidents", tot_a)
                    c4.metric("📊 Frame", f"{idx}/{total_frames if total_frames > 0 else '?'}")
                    # Show top violation type
                    if violation_log:
                        top_type = max(violation_log, key=violation_log.get)
                        c5.metric("🔝 Top", f"{top_type} ({violation_log[top_type]})")
            cap.release()
            progress.progress(1.0)

            # Clean up temp file
            import os
            try:
                os.unlink(tfile.name)
            except OSError:
                pass

            if idx == 0:
                st.error("❌ No frames could be read from this video. The file may be corrupted.")
            else:
                st.success(f"✅ Video processing complete! ({idx} frames analysed)")
                # Show violation summary
                if violation_log:
                    st.subheader("📊 Violation Summary")
                    summary_cols = st.columns(min(len(violation_log), 4))
                    for i, (vtype, count) in enumerate(sorted(violation_log.items(), key=lambda x: -x[1])):
                        summary_cols[i % len(summary_cols)].metric(vtype.replace('_', ' ').title(), count)

    # ================================================================= #
    #  WEBCAM MODE
    # ================================================================= #
    elif detection_mode == "📹 Webcam":
        st.info("Click **Start** to begin real-time detection.")
        c_start, c_stop = st.columns(2)
        with c_start:
            start = st.button("▶️ Start")
        with c_stop:
            stop = st.button("⏹ Stop")
        if start:
            st.session_state.webcam_running = True
        if stop:
            st.session_state.webcam_running = False
        if st.session_state.get('webcam_running', False):
            cap = cv2.VideoCapture(0)
            stframe = st.empty()
            stats_area = st.empty()
            fc, t0 = 0, time.time()
            while st.session_state.get('webcam_running', False):
                ret, frame = cap.read()
                if not ret:
                    st.error("❌ Webcam error"); break
                fc += 1
                res = monitor.process_frame(frame)
                out = monitor.draw_results(frame.copy(), res)
                stframe.image(cv2.cvtColor(out, cv2.COLOR_BGR2RGB),
                              channels="RGB", width="stretch")
                cfps = fc / (time.time() - t0) if (time.time() - t0) > 0 else 0
                with stats_area.container():
                    c1, c2, c3, c4 = st.columns(4)
                    c1.metric("🚗 Vehicles", res['stats']['total_vehicles'])
                    c2.metric("⚠️ Violations", len(res['violations']))
                    c3.metric("🚨 Accidents", len(res['accidents']))
                    c4.metric("🎯 FPS", f"{cfps:.1f}")
            cap.release()


def _show_violations(res):
    """Display detailed violation breakdown."""
    # Group violations by type
    by_type = defaultdict(list)
    for v in res['violations']:
        by_type[v['type']].append(v)

    if not by_type and not res['accidents']:
        st.success("✅ No violations or anomalies detected!")
        return

    type_labels = {
        'no_helmet': ('🪖 No Helmet', 'warning'),
        'excess_riders': ('🏍️ Excess Riders', 'warning'),
        'lane_change': ('↔️ Lane Change', 'info'),
        'wrong_way': ('🚫 Wrong-Way Driving', 'error'),
        'speeding': ('💨 Speeding', 'error'),
        'stopped_vehicle': ('🛑 Stopped Vehicle', 'warning'),
        'jaywalking': ('🚶 Jaywalking', 'warning'),
        'tailgating': ('📏 Tailgating', 'warning'),
        'red_light': ('🔴 Red Light Violation', 'error'),
        'uturn': ('↩️ Illegal U-Turn', 'error'),
    }

    for vtype, items in by_type.items():
        label, severity = type_labels.get(vtype, (vtype, 'info'))
        st.subheader(f"{label} ({len(items)})")
        for v in items:
            msg = _format_violation(v)
            getattr(st, severity)(msg)

    if res['accidents']:
        st.subheader(f"🚨 Accidents ({len(res['accidents'])})")
        for a in res['accidents']:
            st.error(f"Collision: {' ↔ '.join(a['vehicles'])} — IoU {a['confidence']:.0%}"
                     + (" (sudden deceleration)" if a.get('deceleration') else ""))


def _format_violation(v):
    t = v['type']
    if t == 'no_helmet':
        return f"Rider without helmet (score: {v.get('helmet_confidence', 'N/A')})"
    if t == 'excess_riders':
        return f"{v['count']} riders on motorcycle (max 2 allowed)"
    if t == 'lane_change':
        return f"Lane change by {v.get('vehicle', '?')} (Track #{v.get('track_id', '?')})"
    if t == 'wrong_way':
        return f"{v.get('vehicle', '?')} driving against traffic flow (Track #{v.get('track_id', '?')})"
    if t == 'speeding':
        return f"{v.get('vehicle', '?')} moving at {v.get('speed', '?')} px/frame (Track #{v.get('track_id', '?')})"
    if t == 'stopped_vehicle':
        return f"{v.get('vehicle', '?')} stationary for {v.get('duration', '?')}s (Track #{v.get('track_id', '?')})"
    if t == 'jaywalking':
        return "Pedestrian detected in vehicle lane"
    if t == 'tailgating':
        return f"{' → '.join(v.get('vehicles', []))} — gap only {v.get('gap_px', '?')}px"
    if t == 'red_light':
        return f"{v.get('vehicle', '?')} ran red light (Track #{v.get('track_id', '?')})"
    if t == 'uturn':
        return f"{v.get('vehicle', '?')} made illegal U-turn (Track #{v.get('track_id', '?')})"
    return str(v)


if __name__ == '__main__':
    main()
