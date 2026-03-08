# Real-Time Traffic CV Pipeline

## Script
- `ai_models/realtime_traffic_cv.py`

## Install
```bash
pip install ultralytics deep-sort-realtime opencv-python numpy scipy
```

## Run
```bash
python ai_models/realtime_traffic_cv.py --source traffic.mp4 --model yolov8n.pt --output outputs/annotated.mp4 --json outputs/events.jsonl --overspeed 260 --expected-direction 0 --view
```

## Output
- Annotated video: `outputs/annotated.mp4`
- Per-frame events: `outputs/events.jsonl`

Each JSON line:
```json
{
  "track_id": 12,
  "speed": 241.38,
  "direction_angle": -18.72,
  "violation_type": "ACCIDENT",
  "timestamp": 12.367
}
```

