# TraffixAI Project Flowchart

This document maps the main TraffixAI runtime flows across the Next.js frontend,
FastAPI backend, AI detection pipeline, MongoDB persistence, Firebase auth, and
external services.

## 1. System Architecture

```mermaid
flowchart LR
    user[User] --> ui[Next.js Frontend]
    admin[Admin or Authority] --> ui

    ui --> auth[Firebase Auth]
    ui --> apiClient[frontend/lib/api.ts]
    apiClient --> backend[FastAPI backend/main.py]

    backend --> firebaseAdmin[Firebase Admin token verification]
    backend --> mongo[(MongoDB)]
    backend --> uploads[(Local uploads/processed media)]
    backend --> vision[YOLO + OpenCV TrafficMonitor]
    backend --> rules[Rule, risk, and severity logic]
    backend --> llm[Cloudflare Llama LLM Judge]
    backend --> alerts[Email / Twilio WhatsApp alerts]
    backend --> laws[data/indian-traffic-laws.json]

    vision --> rules
    rules --> llm
    rules --> mongo
    llm --> mongo
    uploads --> ui
    mongo --> ui
```

## 2. User Upload And Analysis Flow

```mermaid
flowchart TD
    start["User opens /upload"] --> signin{Signed in?}
    signin -->|No| login[Login or signup with Firebase]
    signin -->|Yes| choose[Choose image or video]
    login --> choose

    choose --> meta[Enter location, date, time, description]
    meta --> submit[Submit media]
    submit --> mediaType{Media type}

    mediaType -->|Image| imageApi[POST /upload-image]
    mediaType -->|Video| videoApi[POST /upload-video]

    imageApi --> saveRaw[Save original file in backend uploads]
    videoApi --> saveRaw

    saveRaw --> analyze{Analyze file}
    analyze -->|Image| processImage[process_image]
    analyze -->|Video| processVideo[process_video]

    processImage --> frame[analyze_frame]
    processVideo --> sampleFrames[Read video frames and sample interval]
    sampleFrames --> frame

    frame --> yolo[YOLO object detection and tracking]
    yolo --> trafficRules[TrafficMonitor violation modules]
    trafficRules --> incidents[Objects, boxes, events, violations, accidents]
    incidents --> annotate[Create annotated image or processed video]
    annotate --> risk[_risk_score]
    risk --> judge[LLMJudge or rule fallback]
    judge --> severity[Accident severity and violation judgment]

    severity --> emergency{High severity?}
    emergency -->|Yes| whatsapp[Send emergency WhatsApp if configured]
    emergency -->|No| normalReview[Mark for admin review when applicable]
    whatsapp --> normalReview

    normalReview --> store[_store_upload]
    store --> mongo[(uploads collection)]
    store --> response[Return analysis result to frontend]
    response --> verdict["Redirect to /judge or verdict view"]
    verdict --> reports["User can view /reports and export PDF"]
```

## 3. Admin Review Flow

```mermaid
flowchart TD
    adminLogin["Admin opens /admin-login or /admin"] --> authCheck{Admin allowed?}
    authCheck -->|Firebase Admin role| adminPage["/admin"]
    authCheck -->|Local admin session| adminPage
    authCheck -->|No| denied[Redirect or deny access]

    adminPage --> fetchQueue["GET /admin/requests"]
    fetchQueue --> requireAdmin[require_admin dependency]
    requireAdmin --> queue[(MongoDB uploads where sentToAdmin = true)]
    queue --> dashboard[Admin dashboard, queue, accepted, rejected tabs]

    dashboard --> inspect[Inspect evidence, processed media, events, risk, LLM summary]
    inspect --> decision{Decision}

    decision -->|Approve| approve["PATCH /admin/requests/{id} status=approved"]
    decision -->|Reject| reject["PATCH /admin/requests/{id} status=rejected"]
    decision -->|Emergency| emergency["POST /admin/send-emergency"]

    approve --> updateMongo[(Update upload status)]
    reject --> updateMongo
    emergency --> twilio[Twilio WhatsApp alert]
    emergency --> alertLog[(alerts collection)]
    updateMongo --> userReports[Approved reports become visible/exportable]
```

## 4. Reports, Dashboard, And Analytics Flow

```mermaid
flowchart LR
    pages[Frontend pages] --> api[frontend/lib/api.ts]

    api --> reports["GET /reports"]
    api --> result["GET /analysis-result/{report_id}"]
    api --> stats["GET /dashboard/stats"]
    api --> userDensity["GET /analytics/user/density"]
    api --> adminOverview["GET /analytics/admin/overview"]

    reports --> auth[Firebase bearer token / local admin header]
    result --> mongo[(MongoDB uploads)]
    stats --> mongo
    userDensity --> mongo
    adminOverview --> mongo

    mongo --> reportCards["/reports cards"]
    mongo --> pdf[PDF export with html2canvas + jsPDF]
    mongo --> charts[Dashboard and admin charts]
```

## 5. Route Safety Recommendation Flow

```mermaid
flowchart TD
    routePage["User opens /ai-recommendation"] --> form[Enter origin, destination, travel mode]
    form --> api["POST /route-safety-recommendation"]
    api --> validate[Validate origin and destination]
    validate --> approvedAccidents[Query approved admin-forwarded accident reports]
    approvedAccidents --> tokenize[Tokenize route and stored locations]
    tokenize --> match{Location overlap found?}
    match -->|Yes| caution[Return higher caution summary and matched locations]
    match -->|No| normal[Return normal caution summary]
    caution --> maps[Google Maps directions link]
    normal --> maps
    maps --> frontend[Render route safety advice and precautions]
```

## 6. Legacy Realtime Monitoring Flow

```mermaid
flowchart TD
    legacyUpload["POST /api/upload"] --> saveLegacy[Save video and video_id in memory]
    saveLegacy --> websocket["Client connects to /ws/monitor/{video_id}"]
    websocket --> openVideo[Open saved video with OpenCV]
    openVideo --> readFrame[Read frames with skip interval]
    readFrame --> analyze[analyze_frame]
    analyze --> sendProgress[Send progress, frame stats, violations over WebSocket]
    sendProgress --> moreFrames{More frames?}
    moreFrames -->|Yes| readFrame
    moreFrames -->|No| done[Send done message and close]
```

## Main Data Stores

```mermaid
flowchart LR
    users[(users collection)] --> authProfiles[Synced Firebase user profiles and roles]
    uploads[(uploads collection)] --> reports[Analysis reports and admin review status]
    alerts[(alerts collection)] --> alertHistory[Email and WhatsApp alert history]
    stats[(stats collection)] --> globalStats[Global counters]
    files[(backend uploads/processed folders)] --> media[Original and annotated media files]
```
