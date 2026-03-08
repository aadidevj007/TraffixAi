# TraffixAI

AI-powered traffic monitoring platform with accident and violation detection from uploaded images/videos.

## Stack
- Frontend: Next.js 14, React, TailwindCSS, Framer Motion, Chart.js, Lucide
- Auth: Firebase Authentication (Google + Email/Password)
- Backend: FastAPI
- AI: YOLOv8, DeepSORT, OpenCV, NumPy
- Database: MongoDB
- Storage: Local filesystem (`backend/uploads`, `backend/processed`)

## Architecture
`Next.js UI` -> `Firebase Auth ID Token` -> `FastAPI API` -> `MongoDB`

FastAPI runs the AI pipeline:
- YOLOv8 vehicle/person detection
- DeepSORT object tracking
- Velocity + direction estimation
- Rule engine for accidents/violations
- Annotated media output

## Project Structure
```text
traffixai/
  frontend/
    app/
    components/
    lib/
  backend/
    main.py
    detection/
      yolo_detector.py
      tracker.py
      velocity.py
      rule_engine.py
      visualization.py
    uploads/
    processed/
  database/
    mongodb_schema.js
```

## MongoDB Collections
- `users`
  - `_id`, `firebase_uid`, `name`, `email`, `role`, `created_at`, `updated_at`
- `uploads`
  - `_id`, `user_id`, `media_type`, `video_path`, `processed_video`, `accident_detected`, `violation_type`, `density_score`, `timestamp`, `status`, `detection`, etc.
- `system_stats`
  - `_id: "global"`, `total_users`, `total_uploads`, `total_accidents`, `total_violations`

## Setup

### 1. Frontend
```bash
cd frontend
npm install
```

Create `frontend/.env.local`:
```env
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 2. Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

Create `backend/.env`:
```env
PORT=8000
CORS_ORIGINS=http://localhost:3000
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=traffixai
FIREBASE_CREDENTIALS_PATH=../firebase/serviceAccountKey.json
YOLO_MODEL_PATH=./yolov8n.pt
```

### 3. MongoDB schema
```bash
mongosh "mongodb://127.0.0.1:27017/traffixai" ../database/mongodb_schema.js
```

### 4. Run
Backend:
```bash
cd backend
python main.py
```

Frontend:
```bash
cd frontend
npm run dev
```

## Core API Endpoints
- `POST /auth/sync-user`
- `POST /upload-image`
- `POST /upload-video`
- `GET /reports`
- `PATCH /reports/{report_id}`
- `DELETE /reports/{report_id}`
- `POST /reports/forward`
- `GET /admin/requests`
- `PATCH /admin/requests/{request_id}`
- `GET /users`
- `PATCH /admin/users/{user_id}/role`
- `GET /dashboard/stats`
- `GET /analytics/user/density`
- `GET /analytics/admin/overview`

## Notes
- Backend verifies Firebase ID tokens using Firebase Admin SDK.
- Admin routes are protected by MongoDB role (`Admin`).
- Role assignment on first sync defaults to `User`; promote admins via MongoDB or `/admin/users/{id}/role`.

