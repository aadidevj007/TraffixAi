# Traffic Infer API + Dashboard Charts + Deployment

## 1. Python YOLOv8 inference server

File: `backend/yolo_infer_server.py`

Install:
```bash
pip install ultralytics fastapi uvicorn python-multipart opencv-python numpy
```

Run:
```bash
python backend/yolo_infer_server.py --weights ai_models/yolov8n.pt --host 0.0.0.0 --port 8010
```

Endpoint:
- `POST /infer` with form-data file field `file`
- Response:
```json
{
  "vehicles": [
    { "bbox": [10.1, 20.2, 120.3, 220.4], "class": "car", "confidence": 0.93 }
  ],
  "densityScore": 1
}
```

---

## 2. Next.js API route

File: `frontend/app/api/trafficInfer/route.ts`

Request:
- `POST /api/trafficInfer`
- multipart form-data:
  - `image`: uploaded image file
  - `userId`: user uid string

Flow:
1. Upload image to YOLO Python server (`TRAFFIC_INFER_SERVER_URL`).
2. Store image in Firebase Storage under `uploads/{userId}/...`.
3. Save Firestore `uploads` document:
   - `userId`
   - `imageUrl`
   - `timestamp`
   - `detectedVehicles`
   - `densityScore`
4. Return JSON inference result.

Required env vars:
- `TRAFFIC_INFER_SERVER_URL` (example: `http://127.0.0.1:8010/infer`)
- `FIREBASE_SERVICE_ACCOUNT_KEY_JSON` (service account JSON string)
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`

---

## 3. Charts added

### User Dashboard chart
File: `frontend/components/charts/UserDensityChart.tsx`
- X-axis: Date
- Y-axis: Average traffic density per day
- Data source: Firestore `uploads` filtered by userId

Mounted in:
- `frontend/app/dashboard/page.tsx`

### Admin Dashboard charts
File: `frontend/components/charts/AdminTrafficCharts.tsx`
- Line chart: daily upload counts
- Bar chart: average density per day
- Data source: Firestore `uploads`

Mounted in:
- `frontend/app/admin/page.tsx`

---

## 4. Firestore rules

Updated file:
- `firebase/firestore.rules`

Includes `uploads` collection access rules for:
- owner user
- admin/authority roles

Deploy rules:
```bash
firebase deploy --only firestore:rules
```

---

## 5. Firebase deployment setup

Added:
- `firebase.json`
- `.firebaserc`
- `scripts/deploy_firebase.ps1`
- `scripts/deploy_firebase.sh`
- `.github/workflows/firebase-deploy.yml`

Local deploy:
```bash
./scripts/deploy_firebase.sh
```
or on Windows:
```powershell
./scripts/deploy_firebase.ps1
```

GitHub secrets needed:
- `FIREBASE_TOKEN`
- `FIREBASE_PROJECT_ID`

