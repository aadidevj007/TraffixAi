# Render Backend Deploy

Use Render for the FastAPI backend, then point the Vercel frontend at the Render URL.

## What URL you will get

After the Render web service finishes deploying, Render gives you a public base URL like:

`https://traffixai-backend.onrender.com`

Use that full base URL as the frontend env var:

`NEXT_PUBLIC_API_URL=https://traffixai-backend.onrender.com`

## Render setup

1. Open [Render Dashboard](https://dashboard.render.com/).
2. Click `New` -> `Blueprint`.
3. Connect the GitHub repo `aadidevj007/TraffixAi`.
4. Render will detect [render.yaml](/E:/traffixai/render.yaml).
5. Create the `traffixai-backend` web service.

Render docs used:

- [Deploy a FastAPI App](https://render.com/docs/deploy-fastapi)
- [Blueprint YAML Reference](https://render.com/docs/blueprint-spec)
- [Health Checks](https://render.com/docs/health-checks)
- [Persistent Disks](https://render.com/docs/disks)

## Required Render environment variables

Set these in the Render service before the first successful deploy:

- `MONGODB_URI`
- `MONGODB_DB`
- `CORS_ORIGINS`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_CREDENTIALS_PATH`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_LLM_MODEL`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM`
- `EMERGENCY_WHATSAPP_TO`

## Important values

### `CORS_ORIGINS`

This backend requires explicit allowed origins because it uses credentialed CORS.

Set it to a comma-separated list like:

```text
http://localhost:3000,https://frontend-aadidevj007s-projects.vercel.app,https://your-production-frontend-domain.vercel.app
```

### `FIREBASE_CREDENTIALS_PATH`

For Render, prefer mounting the Firebase service account JSON as a secret file and set:

```text
FIREBASE_CREDENTIALS_PATH=/etc/secrets/serviceAccountKey.json
```

### Model weights

The runtime model files are already committed in Git LFS:

- [backend/models/yolov8n.pt](/E:/traffixai/backend/models/yolov8n.pt)
- [backend/models/accident_model.pt](/E:/traffixai/backend/models/accident_model.pt)

Render will pull them during deploy from GitHub/LFS.

## Filesystem note

Render web services use an ephemeral filesystem by default. That means anything written to local folders like `backend/uploads` and `backend/processed` can disappear after restart or redeploy.

If you want those generated files to persist on Render, attach a persistent disk and mount it under:

- `/opt/render/project/src/backend/uploads`
- `/opt/render/project/src/backend/processed`

Or update the app later to store media in Firebase Storage / object storage instead.

## After Render gives you the backend URL

Set this on the Vercel frontend project:

```text
NEXT_PUBLIC_API_URL=https://your-render-service.onrender.com
```

Then redeploy the frontend.
