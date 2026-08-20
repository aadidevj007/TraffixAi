'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
    CheckCircle,
    Clock,
    Download,
    Eye,
    FileText,
    Filter,
    RefreshCw,
    ShieldCheck,
    Sparkles,
    XCircle,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getAnalysisResult, getReports } from '@/lib/api';
import { toAbsoluteMediaUrl, toDisplayImageSrc, toProcessedPlayableUrl } from '@/lib/media';
import toast from 'react-hot-toast';

type UploadRecord = {
    id: string;
    media_type?: 'image' | 'video';
    type?: 'image' | 'video';
    location: string;
    description?: string;
    incidentType?: string;
    incident_type?: string;
    status: 'pending' | 'approved' | 'rejected';
    created_at?: string;
    createdAt?: string;
    detection?: {
        vehicles?: number;
        pedestrians?: number;
        accidents?: number;
        violations?: number;
        risk_score?: number;
        confidence?: number;
        violation_types?: Array<{ label?: string; count?: number }>;
    };
    judge?: {
        accident_severity?: string;
        violation_judgment?: Array<{ label?: string; count?: number; fine?: string; law?: string; ipc?: string; jail?: string; consequence?: string }>;
    };
    llm_judge?: {
        verdict?: string;
        confidence?: number;
        summary?: string;
        recommended_action?: string;
        model?: string;
    };
};

type AnalysisPayload = {
    id: string;
    user_id?: string;
    user_details?: {
        firebase_uid?: string;
        name?: string;
        email?: string;
        phone?: string;
        role?: string;
    };
    media_type?: 'image' | 'video';
    vehicles?: number;
    pedestrians?: number;
    violations?: number;
    accidents?: number;
    risk_score?: number;
    location?: string;
    violation_types?: Array<{ label?: string; count?: number }>;
    frames_analyzed?: number;
    total_frames?: number;
    duration_seconds?: number;
    analysis_sample_fps?: number;
    events?: Array<Record<string, unknown>>;
    detection_boxes?: Array<Record<string, unknown>>;
    objects?: Array<{ class?: string; count?: number; confidence?: number }>;
    confidence?: number;
    annotated_image?: string;
    annotated_frames?: string[];
    uploaded_media_path?: string;
    uploaded_media_url?: string;
    processed_media_url?: string;
    description?: string;
    date?: string;
    time?: string;
    status?: string;
    incidentType?: string;
    llm_judge?: UploadRecord['llm_judge'];
    judge?: UploadRecord['judge'];
    analyzed_at?: string;
};

const statusStyles: Record<UploadRecord['status'], string> = {
    pending: 'badge-warning',
    approved: 'badge-success',
    rejected: 'badge-danger',
};

function formatDate(value?: string) {
    return value ? new Date(value).toLocaleString() : 'N/A';
}

function safeFilePart(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'report';
}

function escapeHtml(value: unknown) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatPercent(value?: number) {
    return typeof value === 'number' ? `${Math.round(value * 100)}%` : 'N/A';
}

function titleize(value: unknown) {
    const text = String(value ?? '').replace(/[_-]+/g, ' ').trim();
    if (!text) return 'N/A';
    return text.replace(/\b\w/g, (char) => char.toUpperCase());
}

function riskLabel(score?: number) {
    const value = Number(score || 0);
    if (value >= 70) return 'High Risk';
    if (value >= 35) return 'Medium Risk';
    return 'Low Risk';
}

function mediaUrlCandidates(path?: string | null) {
    const absolute = toAbsoluteMediaUrl(path);
    if (!absolute) return [];

    const candidates = [absolute];
    try {
        const url = new URL(absolute);
        if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
            for (const host of ['127.0.0.1', 'localhost']) {
                for (const port of ['8002', '8001', '8000']) {
                    const next = new URL(url.toString());
                    next.hostname = host;
                    next.port = port;
                    candidates.push(next.toString());
                }
            }
        }
    } catch {
        // Non-URL values are already represented by the original candidate.
    }

    return Array.from(new Set(candidates));
}

function loadImageCandidate(candidates: string[]): Promise<string | null> {
    return new Promise((resolve) => {
        if (!candidates.length) {
            resolve(null);
            return;
        }

        const [current, ...rest] = candidates;
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => resolve(current);
        image.onerror = () => {
            loadImageCandidate(rest).then(resolve);
        };
        image.src = current;
    });
}

async function captureVideoFrame(videoUrl: string): Promise<string | null> {
    return new Promise((resolve) => {
        const video = document.createElement('video');
        video.crossOrigin = 'anonymous';
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';

        const cleanup = () => {
            video.pause();
            video.removeAttribute('src');
            video.load();
        };

        const drawFrame = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth || 1280;
                canvas.height = video.videoHeight || 720;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    cleanup();
                    resolve(null);
                    return;
                }
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
                cleanup();
                resolve(dataUrl);
            } catch {
                cleanup();
                resolve(null);
            }
        };

        video.onloadeddata = () => {
            if (Number.isFinite(video.duration) && video.duration > 1) {
                try {
                    video.currentTime = 1;
                    return;
                } catch {
                    drawFrame();
                    return;
                }
            }
            drawFrame();
        };
        video.onseeked = drawFrame;
        video.onerror = () => {
            cleanup();
            resolve(null);
        };
        video.src = videoUrl;
    });
}

async function captureVideoFrameFromCandidates(candidates: string[]) {
    for (const candidate of candidates) {
        const frame = await captureVideoFrame(candidate);
        if (frame) return frame;
    }
    return null;
}

async function resolveVideoFirstFrame(detail: AnalysisPayload) {
    if (detail.media_type !== 'video') return null;

    const alreadyHasFrame = Boolean(detail.annotated_frames?.[0] || detail.annotated_image);
    if (alreadyHasFrame) return null;

    const candidates = [
        ...mediaUrlCandidates(detail.uploaded_media_url),
        ...mediaUrlCandidates(toProcessedPlayableUrl(detail.processed_media_url)),
        ...mediaUrlCandidates(detail.processed_media_url),
    ];
    return captureVideoFrameFromCandidates(Array.from(new Set(candidates)));
}

function summarizeEvent(event: Record<string, unknown>, index: number) {
    const type = titleize(event.type || event.event || event.label || event.violation || `Incident ${index + 1}`);
    const confidence = typeof event.confidence === 'number' ? ` Confidence ${Math.round(event.confidence * 100)}%.` : '';
    const frame = event.frame !== undefined ? ` Frame ${event.frame}.` : '';
    const time = event.timestamp !== undefined ? ` Timestamp ${event.timestamp}.` : event.time !== undefined ? ` Time ${event.time}.` : '';
    const object = event.object || event.vehicle || event.class || event.track_id;
    const objectText = object ? ` Related object: ${String(object)}.` : '';
    const details = Object.entries(event)
        .filter(([key]) => !['type', 'event', 'label', 'violation', 'confidence', 'frame', 'timestamp', 'time', 'object', 'vehicle', 'class', 'track_id'].includes(key))
        .slice(0, 6)
        .map(([key, value]) => `${titleize(key)}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
        .join('; ');

    return `${type}.${frame}${time}${objectText}${confidence}${details ? ` Additional evidence: ${details}.` : ''}`;
}

function buildResultNarrative(record: UploadRecord, detail: AnalysisPayload) {
    const mediaType = titleize(detail.media_type || record.media_type || record.type || 'image').toLowerCase();
    const location = detail.location || record.location || 'the submitted location';
    const lines = [
        `The submitted ${mediaType} was analyzed for traffic participants, accident indicators, and rule violations at ${location}.`,
        `The system detected ${detail.vehicles ?? 0} vehicle(s), ${detail.pedestrians ?? 0} pedestrian(s), ${detail.violations ?? 0} violation(s), and ${detail.accidents ?? 0} accident indicator(s).`,
    ];

    if (detail.violation_types?.length) {
        lines.push(`Violation evidence includes ${detail.violation_types.map((item) => `${item.count ?? 0} ${item.label || 'unknown violation'}`).join(', ')}.`);
    }

    if (detail.objects?.length) {
        lines.push(`Detected road users and objects include ${detail.objects.map((item) => `${item.count ?? 0} ${item.class || 'unknown object'}`).join(', ')}. These counts help explain the traffic density and the risk score shown at the end of this report.`);
    }

    if (detail.detection_boxes?.length) {
        const boxSummary = detail.detection_boxes
            .slice(0, 10)
            .map((box, index) => titleize(box.label || box.class || box.category || `evidence box ${index + 1}`))
            .join(', ');
        lines.push(`Visual evidence markers were generated for ${boxSummary}${detail.detection_boxes.length > 10 ? ', and additional detections' : ''}.`);
    }

    if (detail.events?.length) {
        lines.push(`Event-level explanation: ${detail.events.map((event, index) => summarizeEvent(event, index)).join(' ')}`);
    } else {
        lines.push('No separate event timeline was provided by the detector, so the report relies on the aggregate detection counts, visual evidence, AI summary, and judge output.');
    }

    if (detail.judge?.violation_judgment?.length) {
        lines.push(`Judge interpretation: ${detail.judge.violation_judgment.map((item) => `${item.label || 'Violation'} can involve ${item.fine || 'a fine'} under ${item.law || 'applicable traffic law'}, with consequences such as ${item.consequence || 'authority review'}`).join(' ')}`);
    }

    if (detail.judge?.accident_severity) {
        lines.push(`Accident severity from judge: ${detail.judge.accident_severity}.`);
    }

    if (detail.llm_judge?.summary) {
        lines.push(`AI explanation: ${detail.llm_judge.summary}`);
    }

    if (detail.llm_judge?.recommended_action) {
        lines.push(`Recommended action: ${detail.llm_judge.recommended_action}`);
    }

    return lines;
}

function evidenceImages(detail: AnalysisPayload, fallbackVideoFrame?: string | null, fallbackUploadedImage?: string | null) {
    const directImage = toDisplayImageSrc(detail.annotated_image);
    const frameImages = (detail.annotated_frames || [])
        .map((frame) => toDisplayImageSrc(frame))
        .filter((frame): frame is string => Boolean(frame));
    const uploadedUrl = toAbsoluteMediaUrl(detail.uploaded_media_url);
    const processedUrl = toAbsoluteMediaUrl(detail.processed_media_url);

    return detail.media_type === 'video'
        ? frameImages.slice(0, 1).length
            ? frameImages.slice(0, 1)
            : directImage
                ? [directImage]
                : fallbackVideoFrame
                    ? [fallbackVideoFrame]
                    : []
        : directImage
            ? [directImage]
            : fallbackUploadedImage
                ? [fallbackUploadedImage]
                : uploadedUrl
                ? [uploadedUrl]
                : processedUrl
                    ? [processedUrl]
                    : frameImages.slice(0, 1);
}

function buildReportHtml(record: UploadRecord, detail: AnalysisPayload, fallbackVideoFrame?: string | null, fallbackUploadedImage?: string | null) {
    const objects = detail.objects || [];
    const violationTypes = detail.violation_types || [];
    const legalRows = detail.judge?.violation_judgment || [];
    const llm = detail.llm_judge || {};
    const generatedAt = new Date().toLocaleString();
    const evidence = evidenceImages(detail, fallbackVideoFrame, fallbackUploadedImage);
    const user = detail.user_details || {};
    const mediaType = detail.media_type || record.media_type || record.type || 'image';
    const riskScore = detail.risk_score ?? record.detection?.risk_score ?? 0;
    const uploadedUrl = toAbsoluteMediaUrl(detail.uploaded_media_url);
    const processedUrl = toAbsoluteMediaUrl(detail.processed_media_url);
    const sourceImageLabel = mediaType === 'video' ? 'First frame from uploaded video or analyzed output' : 'Uploaded image or analyzed output';
    const resultNarrative = buildResultNarrative(record, detail);

    const evidenceHtml = evidence.length
        ? evidence.map((src, index) => `
            <figure class="evidence-card ${index === 0 ? 'featured-evidence' : ''}">
              <img src="${escapeHtml(src)}" alt="Evidence ${index + 1}" crossorigin="anonymous" />
              <figcaption>${sourceImageLabel}</figcaption>
            </figure>
          `).join('')
        : '<div class="legal-card"><h4>Evidence Preview</h4><p>No embedded preview was available for this report export.</p></div>';

    const objectsHtml = objects.length
        ? objects.map((obj) => `
            <tr>
              <td>${escapeHtml(obj.class || 'Unknown')}</td>
              <td>${obj.count ?? 0}</td>
              <td>${typeof obj.confidence === 'number' ? `${Math.round(obj.confidence * 100)}%` : 'N/A'}</td>
            </tr>
          `).join('')
        : '<tr><td colspan="3">No object summary available.</td></tr>';

    const violationsHtml = violationTypes.length
        ? violationTypes.map((item) => `
            <tr>
              <td>${escapeHtml(item.label || 'Unknown')}</td>
              <td>${item.count ?? 0}</td>
            </tr>
          `).join('')
        : '<tr><td colspan="2">No violation types recorded.</td></tr>';

    const legalHtml = legalRows.length
        ? legalRows.map((item) => `
            <div class="legal-card">
              <h4>${escapeHtml(item.label || 'Violation')}${item.count ? ` x${item.count}` : ''}</h4>
              <p><strong>Fine:</strong> ${escapeHtml(item.fine || 'N/A')}</p>
              <p><strong>Law:</strong> ${escapeHtml(item.law || 'N/A')}</p>
              <p><strong>IPC:</strong> ${escapeHtml(item.ipc || 'N/A')}</p>
              <p><strong>Jail:</strong> ${escapeHtml(item.jail || 'N/A')}</p>
              <p><strong>Consequence:</strong> ${escapeHtml(item.consequence || 'N/A')}</p>
            </div>
          `).join('')
        : '<div class="legal-card"><h4>Judge Notes</h4><p>No detailed violation judgment was returned. The judge section still records accident severity and AI verdict metadata below.</p></div>';

    const resultHtml = resultNarrative.map((line) => `<p>${escapeHtml(line)}</p>`).join('');

    const mediaLocationHtml = `
      <div class="media-paths">
        <div><strong>Scene Location</strong><span>${escapeHtml(detail.location || record.location || 'Unknown')}</span></div>
        <div><strong>Original Upload URL</strong><span>${uploadedUrl ? `<a href="${escapeHtml(uploadedUrl)}">${escapeHtml(uploadedUrl)}</a>` : 'N/A'}</span></div>
        <div><strong>Stored Upload Path</strong><span>${escapeHtml(detail.uploaded_media_path || 'N/A')}</span></div>
        <div><strong>Processed Media URL</strong><span>${processedUrl ? `<a href="${escapeHtml(processedUrl)}">${escapeHtml(processedUrl)}</a>` : 'N/A'}</span></div>
      </div>
    `;

    const analysisScopeHtml = `
      <div class="meta-list">
        <div class="meta"><strong>Media Type</strong>${mediaType}</div>
        <div class="meta"><strong>Frames Analyzed</strong>${detail.frames_analyzed ?? 0}</div>
        <div class="meta"><strong>Total Frames</strong>${detail.total_frames ?? 0}</div>
        <div class="meta"><strong>Duration</strong>${detail.duration_seconds ?? 0}s</div>
      </div>
    `;

    return `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>TraffixAI Report ${record.id}</title>
          <style>
            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            html, body {
              width: 210mm;
              min-height: 297mm;
            }
            body {
              margin: 0;
              font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
              color: #111827;
              background:
                radial-gradient(circle at top left, rgba(6,182,212,0.16), transparent 26%),
                radial-gradient(circle at bottom right, rgba(244,63,94,0.14), transparent 24%),
                linear-gradient(180deg, #f8fafc, #eef2ff 44%, #fff7ed);
            }
            .page {
              width: 794px;
              min-height: 1123px;
              padding: 28px;
            }
            .hero, .card {
              background: rgba(255,255,255,0.88);
              border: 1px solid rgba(15,23,42,0.08);
              border-radius: 8px;
              box-shadow: 0 24px 70px rgba(15,23,42,0.12);
            }
            .hero {
              position: relative;
              overflow: hidden;
              padding: 30px;
              margin-bottom: 20px;
              color: #fff;
              background:
                linear-gradient(135deg, rgba(8,47,73,0.96), rgba(15,23,42,0.94) 48%, rgba(127,29,29,0.92)),
                radial-gradient(circle at 78% 18%, rgba(34,211,238,0.26), transparent 28%);
            }
            .hero:after {
              content: "";
              position: absolute;
              inset: auto -60px -120px auto;
              width: 260px;
              height: 260px;
              border-radius: 8px;
              border: 44px solid rgba(255,255,255,0.06);
            }
            .eyebrow {
              letter-spacing: 0.35em;
              text-transform: uppercase;
              font-size: 11px;
              color: #a5f3fc;
            }
            h1 {
              margin: 10px 0 8px;
              font-size: 38px;
              letter-spacing: 0;
            }
            .subtitle {
              color: #dbeafe;
              max-width: 760px;
              line-height: 1.6;
              font-size: 14px;
            }
            .grid {
              display: grid;
              grid-template-columns: repeat(12, 1fr);
              gap: 18px;
            }
            .span-7 { grid-column: span 7; }
            .span-5 { grid-column: span 5; }
            .span-6 { grid-column: span 6; }
            .span-12 { grid-column: span 12; }
            .card {
              padding: 20px;
            }
            .stats {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 12px;
              margin-top: 18px;
            }
            .stat {
              padding: 16px;
              border-radius: 8px;
              border: 1px solid rgba(255,255,255,0.14);
              background: rgba(255,255,255,0.08);
            }
            .stat .label {
              color: #bae6fd;
              font-size: 11px;
              letter-spacing: 0.22em;
              text-transform: uppercase;
            }
            .stat .value {
              margin-top: 8px;
              font-size: 28px;
              font-weight: 700;
            }
            .risk-ribbon {
              display: inline-flex;
              align-items: center;
              gap: 10px;
              margin-top: 16px;
              border-radius: 8px;
              padding: 10px 14px;
              color: #fff;
              background: linear-gradient(135deg, #ef4444, #f97316);
              box-shadow: 0 16px 40px rgba(239,68,68,0.25);
            }
            .risk-ribbon strong { font-size: 20px; }
            .section-title {
              margin: 0 0 14px;
              font-size: 18px;
              color: #0f172a;
            }
            .meta-list {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 12px;
            }
            .meta {
              padding: 14px;
              border-radius: 8px;
              background: linear-gradient(180deg, #ffffff, #f8fafc);
              border: 1px solid rgba(15,23,42,0.08);
              color: #111827;
            }
            .meta strong {
              display: block;
              color: #64748b;
              font-size: 11px;
              letter-spacing: 0.22em;
              text-transform: uppercase;
              margin-bottom: 6px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 10px;
            }
            th, td {
              text-align: left;
              padding: 10px 8px;
              border-bottom: 1px solid rgba(15,23,42,0.08);
              font-size: 13px;
            }
            th { color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.22em; }
            a { color: #0369a1; word-break: break-all; }
            .legal-grid {
              display: grid;
              grid-template-columns: 1fr;
              gap: 12px;
            }
            .evidence-grid {
              display: grid;
              grid-template-columns: 1fr;
              gap: 12px;
            }
            .legal-card, .result-card {
              border-radius: 8px;
              padding: 14px;
              background: linear-gradient(180deg, #ffffff, #f8fafc);
              border: 1px solid rgba(15,23,42,0.08);
            }
            .evidence-card {
              margin: 0;
              border-radius: 8px;
              overflow: hidden;
              border: 1px solid rgba(15,23,42,0.08);
              background: #020617;
            }
            .evidence-card img {
              display: block;
              width: 100%;
              height: 360px;
              object-fit: contain;
              background: #020617;
            }
            .evidence-card figcaption {
              padding: 10px 12px;
              color: #cbd5e1;
              font-size: 12px;
            }
            .legal-card h4 {
              margin: 0 0 8px;
              color: #be123c;
            }
            .legal-card p { margin: 6px 0; font-size: 13px; color: #334155; line-height: 1.5; }
            .result-card p {
              margin: 0 0 10px;
              color: #1f2937;
              font-size: 14px;
              line-height: 1.7;
            }
            .result-card p:last-child { margin-bottom: 0; }
            .media-paths {
              display: grid;
              gap: 10px;
            }
            .media-paths div {
              padding: 12px;
              border-radius: 8px;
              background: #f8fafc;
              border: 1px solid rgba(15,23,42,0.08);
            }
            .media-paths strong {
              display: block;
              margin-bottom: 5px;
              color: #64748b;
              font-size: 10px;
              letter-spacing: 0.2em;
              text-transform: uppercase;
            }
            .media-paths span {
              color: #111827;
              font-size: 12px;
              line-height: 1.45;
              word-break: break-word;
            }
            .final-score {
              margin-top: 18px;
              border-radius: 8px;
              padding: 24px;
              color: #fff;
              background: linear-gradient(135deg, #111827, #7f1d1d 55%, #ea580c);
              box-shadow: 0 26px 70px rgba(127,29,29,0.25);
            }
            .final-score span {
              color: #fed7aa;
              font-size: 11px;
              letter-spacing: 0.28em;
              text-transform: uppercase;
            }
            .final-score strong {
              display: block;
              margin-top: 8px;
              font-size: 46px;
              line-height: 1;
            }
            .footer {
              margin-top: 18px;
              color: #64748b;
              font-size: 12px;
            }
            @page {
              size: A4;
              margin: 10mm;
            }
            @media print {
              html, body {
                width: auto;
                min-height: auto;
              }
              body {
                background: #f8fafc !important;
              }
              .page {
                padding: 0;
              }
              .hero, .card {
                box-shadow: none;
                break-inside: avoid;
                page-break-inside: avoid;
              }
              .stat, .meta, .legal-card, .result-card {
                break-inside: avoid;
                page-break-inside: avoid;
              }
              a {
                color: #0369a1 !important;
                text-decoration: underline;
              }
            }
          </style>
        </head>
        <body>
          <div class="page">
            <section class="hero">
              <div class="eyebrow">TraffixAI Verified Report</div>
              <h1>Incident Intelligence Report</h1>
              <p class="subtitle">A polished export containing user identity, upload location, visual evidence, detailed incident interpretation, judge findings, and final risk score.</p>
              <div class="stats">
                <div class="stat"><div class="label">Risk Score</div><div class="value">${riskScore}</div></div>
                <div class="stat"><div class="label">Violations</div><div class="value">${detail.violations ?? 0}</div></div>
                <div class="stat"><div class="label">Accidents</div><div class="value">${detail.accidents ?? 0}</div></div>
                <div class="stat"><div class="label">Confidence</div><div class="value">${formatPercent(detail.confidence)}</div></div>
              </div>
              <div class="risk-ribbon"><span>${riskLabel(riskScore)}</span><strong>${riskScore}/100</strong></div>
            </section>

            <div class="grid">
              <section class="card span-6">
                <h2 class="section-title">User Details</h2>
                <div class="meta-list">
                  <div class="meta"><strong>Name</strong>${escapeHtml(user.name || 'N/A')}</div>
                  <div class="meta"><strong>Email</strong>${escapeHtml(user.email || 'N/A')}</div>
                  <div class="meta"><strong>Phone</strong>${escapeHtml(user.phone || 'N/A')}</div>
                  <div class="meta"><strong>User ID</strong>${escapeHtml(user.firebase_uid || detail.user_id || 'N/A')}</div>
                </div>
              </section>

              <section class="card span-6">
                <h2 class="section-title">Report Metadata</h2>
                <div class="meta-list">
                  <div class="meta"><strong>Report ID</strong>${record.id}</div>
                  <div class="meta"><strong>Status</strong>${detail.status || record.status}</div>
                  <div class="meta"><strong>Incident Type</strong>${detail.incidentType || record.incidentType || record.incident_type || 'Monitoring'}</div>
                  <div class="meta"><strong>Uploaded / Analyzed</strong>${formatDate(record.created_at || record.createdAt)} / ${formatDate(detail.analyzed_at)}</div>
                </div>
              </section>

              <section class="card span-12">
                <h2 class="section-title">Uploaded Media Location</h2>
                ${mediaLocationHtml}
              </section>

              <section class="card span-12">
                <h2 class="section-title">Evidence Image / First Video Frame</h2>
                <div class="evidence-grid">${evidenceHtml}</div>
              </section>

              <section class="card span-5">
                <h2 class="section-title">Analysis Coverage</h2>
                ${analysisScopeHtml}
              </section>

              <section class="card span-7">
                <h2 class="section-title">Result: Complete Incident Explanation</h2>
                <div class="result-card">${resultHtml}</div>
              </section>

              <section class="card span-6">
                <h2 class="section-title">Detected Objects</h2>
                <table>
                  <thead><tr><th>Class</th><th>Count</th><th>Confidence</th></tr></thead>
                  <tbody>${objectsHtml}</tbody>
                </table>
              </section>

              <section class="card span-6">
                <h2 class="section-title">Violation Breakdown</h2>
                <table>
                  <thead><tr><th>Violation</th><th>Count</th></tr></thead>
                  <tbody>${violationsHtml}</tbody>
                </table>
              </section>

              <section class="card span-12">
                <h2 class="section-title">Analysis Metrics</h2>
                <div class="meta-list">
                  <div class="meta"><strong>Vehicles</strong>${detail.vehicles ?? 0}</div>
                  <div class="meta"><strong>Pedestrians</strong>${detail.pedestrians ?? 0}</div>
                  <div class="meta"><strong>Analysis FPS</strong>${detail.analysis_sample_fps ?? 0}</div>
                  <div class="meta"><strong>AI Verdict</strong>${escapeHtml(llm.verdict || 'N/A')}</div>
                  <div class="meta"><strong>Recommended Action</strong>${escapeHtml(llm.recommended_action || 'N/A')}</div>
                  <div class="meta"><strong>Accident Severity</strong>${escapeHtml(detail.judge?.accident_severity || 'N/A')}</div>
                  <div class="meta"><strong>AI Model</strong>${escapeHtml(llm.model || 'N/A')}</div>
                </div>
              </section>

              <section class="card span-6">
                <h2 class="section-title">Judge Part</h2>
                <div class="legal-grid">${legalHtml}</div>
              </section>

              <section class="card span-6">
                <h2 class="section-title">AI Judge Summary</h2>
                <div class="legal-card">
                  <h4>${llm.verdict || 'Manual Review'}</h4>
                  <p><strong>Summary:</strong> ${escapeHtml(llm.summary || 'No summary available.')}</p>
                  <p><strong>Confidence:</strong> ${formatPercent(llm.confidence)}</p>
                  <p><strong>Recommended Action:</strong> ${escapeHtml(llm.recommended_action || 'N/A')}</p>
                </div>
              </section>

              <section class="card span-12">
                <h2 class="section-title">Final Risk Score</h2>
                <div class="final-score">
                  <span>${riskLabel(riskScore)}</span>
                  <strong>${riskScore}/100</strong>
                  <p>The score is placed last for quick authority review after examining the user details, uploaded media, result explanation, and judge output.</p>
                </div>
              </section>
            </div>

            <div class="footer">Generated by TraffixAI on ${generatedAt}</div>
          </div>
        </body>
      </html>
    `;
}

async function waitForEmbeddedAssets(root: HTMLElement, doc: Document) {
    if (doc.fonts?.ready) {
        try {
            await doc.fonts.ready;
        } catch {
            // ignore font readiness errors
        }
    }

    const images = Array.from(root.querySelectorAll('img'));
    await Promise.all(
        images.map((img) => new Promise<void>((resolve) => {
            if (img.complete) {
                resolve();
                return;
            }
            img.onload = () => resolve();
            img.onerror = () => resolve();
        })),
    );
}

async function createPdfRenderFrame(html: string) {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.position = 'fixed';
    iframe.style.left = '0';
    iframe.style.top = '0';
    iframe.style.width = '794px';
    iframe.style.height = '1123px';
    iframe.style.opacity = '1';
    iframe.style.pointerEvents = 'none';
    iframe.style.border = '0';
    iframe.style.background = '#f8fafc';
    iframe.style.zIndex = '-1';
    iframe.srcdoc = html;
    document.body.appendChild(iframe);

    await new Promise<void>((resolve, reject) => {
        iframe.onload = () => resolve();
        iframe.onerror = () => reject(new Error('Could not prepare the PDF preview.'));
    });

    const frameDocument = iframe.contentDocument;
    const frameWindow = iframe.contentWindow;
    const page = frameDocument?.querySelector('.page') as HTMLElement | null;

    if (!frameDocument || !frameWindow || !page) {
        if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
        }
        throw new Error('Could not prepare the PDF layout.');
    }

    frameDocument.documentElement.style.width = '794px';
    frameDocument.body.style.width = '794px';
    frameDocument.body.style.margin = '0';
    frameWindow.scrollTo(0, 0);

    return { iframe, frameDocument, frameWindow, page };
}

export default function ReportsPage() {
    const { user, loading: authLoading } = useAuth();
    const [loading, setLoading] = useState(false);
    const [exportingId, setExportingId] = useState<string | null>(null);
    const [filter, setFilter] = useState<'all' | UploadRecord['status']>('all');
    const [records, setRecords] = useState<UploadRecord[]>([]);

    const fetchUploads = useCallback(async () => {
        if (!user?.uid) return;
        setLoading(true);
        try {
            const res = await getReports({ limit: 500 });
            setRecords((res?.reports || []) as UploadRecord[]);
        } finally {
            setLoading(false);
        }
    }, [user?.uid]);

    useEffect(() => {
        fetchUploads();
    }, [fetchUploads]);

    const filtered = useMemo(() => {
        if (filter === 'all') return records;
        return records.filter((r) => r.status === filter);
    }, [records, filter]);

    const counts = useMemo(() => ({
        all: records.length,
        pending: records.filter((r) => r.status === 'pending').length,
        approved: records.filter((r) => r.status === 'approved').length,
        rejected: records.filter((r) => r.status === 'rejected').length,
    }), [records]);

    const handleExportPdf = useCallback(async (record: UploadRecord) => {
        setExportingId(record.id);
        let iframe: HTMLIFrameElement | null = null;
        try {
            const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
                import('html2canvas'),
                import('jspdf'),
            ]);
            const detail = await getAnalysisResult(record.id) as AnalysisPayload;
            const fallbackVideoFrame = await resolveVideoFirstFrame(detail);
            const fallbackUploadedImage = detail.media_type === 'video'
                ? null
                : await loadImageCandidate([
                    ...mediaUrlCandidates(detail.uploaded_media_url),
                    ...mediaUrlCandidates(detail.processed_media_url),
                ]);
            const html = buildReportHtml(record, detail, fallbackVideoFrame, fallbackUploadedImage);
            const renderFrame = await createPdfRenderFrame(html);
            iframe = renderFrame.iframe;

            await waitForEmbeddedAssets(renderFrame.page, renderFrame.frameDocument);
            await new Promise((resolve) => window.setTimeout(resolve, 180));
            const canvas = await html2canvas(renderFrame.page, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#f8fafc',
                logging: false,
                windowWidth: 794,
                windowHeight: Math.max(renderFrame.page.scrollHeight, 1123),
                width: 794,
                height: Math.max(renderFrame.page.scrollHeight, 1123),
                foreignObjectRendering: false,
            });

            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            const margin = 8;
            const usableWidth = pdfWidth - margin * 2;
            const usableHeight = pdfHeight - margin * 2;
            const pageHeightPx = Math.floor((canvas.width * usableHeight) / usableWidth);
            const totalPages = Math.max(1, Math.ceil(canvas.height / pageHeightPx));

            for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
                if (pageIndex > 0) {
                    pdf.addPage();
                }

                const sliceHeightPx = Math.min(pageHeightPx, canvas.height - pageIndex * pageHeightPx);
                const pageCanvas = document.createElement('canvas');
                pageCanvas.width = canvas.width;
                pageCanvas.height = sliceHeightPx;

                const pageCtx = pageCanvas.getContext('2d');
                if (!pageCtx) {
                    throw new Error('Could not prepare a PDF page.');
                }

                pageCtx.fillStyle = '#f8fafc';
                pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
                pageCtx.drawImage(
                    canvas,
                    0,
                    pageIndex * pageHeightPx,
                    canvas.width,
                    sliceHeightPx,
                    0,
                    0,
                    pageCanvas.width,
                    pageCanvas.height,
                );

                const pageImage = pageCanvas.toDataURL('image/jpeg', 0.95);
                const pageHeightMm = (sliceHeightPx * usableWidth) / canvas.width;
                pdf.addImage(pageImage, 'JPEG', margin, margin, usableWidth, pageHeightMm);
            }

            const fileName = `traffixai-${safeFilePart(record.location || 'incident')}-${record.id.slice(0, 8)}.pdf`;
            pdf.save(fileName);
            toast.success('PDF report downloaded.');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Could not export PDF.';
            toast.error(message);
        } finally {
            if (iframe && document.body.contains(iframe)) {
                document.body.removeChild(iframe);
            }
            setExportingId(null);
        }
    }, []);

    if (authLoading || !user) {
        return (
            <div className="min-h-screen bg-dark-900 pt-16 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-dark-900 pt-16">
            <div className="border-b border-red-500/15 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.12),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(239,68,68,0.18),transparent_30%),linear-gradient(120deg,rgba(42,7,7,0.9),rgba(9,5,5,0.96),rgba(18,8,8,0.86))] px-6 py-8">
                <div className="container-max grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                    <div>
                        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-xs uppercase tracking-[0.32em] text-cyan-100/80">
                            <Sparkles className="h-3.5 w-3.5" />
                            Report Archive
                        </div>
                        <h1 className="mt-4 text-4xl font-display font-bold text-white">Reports</h1>
                        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                            Review every submitted incident, track approval state, and export accepted cases as downloadable PDF files containing analysis details, legal findings, and verdict summaries.
                        </p>
                    </div>
                    <div className="grid grid-cols-4 gap-3">
                        {[
                            { label: 'All', value: counts.all, tone: 'text-slate-100', icon: FileText },
                            { label: 'Pending', value: counts.pending, tone: 'text-amber-100', icon: Clock },
                            { label: 'Accepted', value: counts.approved, tone: 'text-emerald-100', icon: ShieldCheck },
                            { label: 'Rejected', value: counts.rejected, tone: 'text-rose-100', icon: XCircle },
                        ].map(({ label, value, tone, icon: Icon }) => (
                            <div key={label} className="rounded-[1.6rem] border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-4 shadow-[0_20px_50px_rgba(0,0,0,0.18)]">
                                <div className="flex items-center justify-between">
                                    <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">{label}</p>
                                    <Icon className={`h-4 w-4 ${tone}`} />
                                </div>
                                <p className={`mt-3 text-2xl font-display font-bold ${tone}`}>{value}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="container-max py-8 space-y-6">
                <div className="flex flex-wrap items-center gap-3 rounded-[1.8rem] border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-3 shadow-[0_22px_60px_rgba(0,0,0,0.16)]">
                    {(['all', 'pending', 'approved', 'rejected'] as const).map((value) => (
                        <button
                            key={value}
                            onClick={() => setFilter(value)}
                            className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium capitalize transition-all ${filter === value
                                ? 'btn-primary px-4 py-2 text-red-50 shadow-[0_18px_42px_rgba(127,29,29,0.2)]'
                                : 'btn-secondary px-4 py-2 text-slate-300 hover:text-white'
                                }`}
                        >
                            <Filter className="w-3.5 h-3.5" />
                            {value}
                        </button>
                    ))}

                    <button onClick={fetchUploads} className="btn-secondary ml-auto inline-flex items-center gap-2 py-2 px-4">
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>

                <div className="grid gap-4">
                    {filtered.map((item) => (
                        <motion.div
                            key={item.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="glass-card border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] p-5 shadow-[0_26px_70px_rgba(0,0,0,0.18)]"
                        >
                            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)]">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="font-mono text-red-200 text-xs">#{item.id.slice(0, 8).toUpperCase()}</p>
                                        <span className={`${statusStyles[item.status]} flex items-center gap-1 w-fit`}>
                                            {item.status === 'approved' ? <CheckCircle className="w-3 h-3" /> : item.status === 'rejected' ? <XCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                                            {item.status}
                                        </span>
                                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-slate-300 capitalize">
                                            {item.media_type || item.type || 'image'}
                                        </span>
                                    </div>

                                    <h3 className="mt-4 text-xl font-display font-semibold leading-snug text-white break-words">
                                        {item.location || 'Unknown location'}
                                    </h3>
                                    <p className="mt-2 text-sm text-slate-400">
                                        {item.incidentType || item.incident_type || 'Monitoring'}
                                    </p>
                                    <p className="mt-3 text-xs text-slate-500">
                                        Uploaded {formatDate(item.created_at || item.createdAt)}
                                    </p>

                                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                                        {[
                                            { label: 'Vehicles', value: item.detection?.vehicles ?? 0, tone: 'text-blue-100' },
                                            { label: 'Pedestrians', value: item.detection?.pedestrians ?? 0, tone: 'text-indigo-100' },
                                            { label: 'Violations', value: item.detection?.violations ?? 0, tone: 'text-amber-100' },
                                            { label: 'Risk', value: item.detection?.risk_score ?? 0, tone: 'text-red-100' },
                                        ].map((card) => (
                                            <div key={card.label} className="rounded-2xl border border-white/10 bg-[linear-gradient(160deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-3">
                                                <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{card.label}</p>
                                                <p className={`mt-2 text-lg font-display font-bold ${card.tone}`}>{card.value}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex flex-col gap-3 xl:justify-between">
                                    <div className="rounded-2xl border border-red-500/15 bg-[linear-gradient(145deg,rgba(127,29,29,0.18),rgba(15,23,42,0.08))] px-4 py-3 text-xs text-slate-300">
                                        <div className="flex items-center gap-2">
                                            <Eye className="w-3.5 h-3.5 text-red-200" />
                                            <span className="capitalize">{item.llm_judge?.verdict || 'manual_review'}</span>
                                        </div>
                                        {item.llm_judge?.summary && (
                                            <p className="mt-2 line-clamp-3 text-slate-400">{item.llm_judge.summary}</p>
                                        )}
                                    </div>

                                    {item.status === 'approved' ? (
                                        <button
                                            onClick={() => handleExportPdf(item)}
                                            disabled={exportingId === item.id}
                                            className="btn-primary w-full gap-2 border-cyan-300/10 bg-[linear-gradient(135deg,rgba(8,145,178,0.95),rgba(59,130,246,0.92),rgba(37,99,235,0.92))] px-5 py-3 text-sm shadow-[0_18px_50px_rgba(14,116,144,0.28)] disabled:opacity-60"
                                        >
                                            <Download className="w-4 h-4" />
                                            {exportingId === item.id ? 'Generating PDF...' : 'Download PDF Report'}
                                        </button>
                                    ) : (
                                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-slate-400">
                                            PDF export unlocks after admin acceptance.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>

                {filtered.length === 0 && (
                    <div className="glass-card py-16 text-center">
                        <FileText className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                        <p className="text-slate-400">No uploads found for this filter.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
