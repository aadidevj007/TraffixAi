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
import { toAbsoluteMediaUrl } from '@/lib/media';

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
    processed_media_url?: string;
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

        video.onloadeddata = () => {
            try {
                video.currentTime = Math.min(1, Math.max(0, video.duration || 0));
            } catch {
                // ignore and try current frame
            }
        };

        video.onseeked = () => {
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

        video.onerror = () => {
            cleanup();
            resolve(null);
        };

        video.src = videoUrl;
    });
}

function toPreviewImageSrc(value?: string | null) {
    if (!value) return null;
    if (value.startsWith('data:') || value.startsWith('http://') || value.startsWith('https://')) return value;
    return `data:image/jpeg;base64,${value}`;
}

async function resolveEmbeddedMediaPreview(detail: AnalysisPayload): Promise<string | null> {
    const annotatedFrame = toPreviewImageSrc(detail.annotated_frames?.[0]);
    if (annotatedFrame) return annotatedFrame;

    const annotatedImage = toPreviewImageSrc(detail.annotated_image);
    if (annotatedImage) return annotatedImage;

    const processedMedia = toAbsoluteMediaUrl(detail.processed_media_url);
    if (detail.media_type === 'video' && processedMedia) {
        return captureVideoFrame(processedMedia);
    }
    return processedMedia || null;
}

function buildReportHtml(record: UploadRecord, detail: AnalysisPayload, embeddedMediaPreview?: string | null) {
    const processedMedia = toAbsoluteMediaUrl(detail.processed_media_url);
    const objects = detail.objects || [];
    const violationTypes = detail.violation_types || [];
    const events = detail.events || [];
    const legalRows = detail.judge?.violation_judgment || [];
    const llm = detail.llm_judge || {};
    const generatedAt = new Date().toLocaleString();

    const objectsHtml = objects.length
        ? objects.map((obj) => `
            <tr>
              <td>${obj.class || 'Unknown'}</td>
              <td>${obj.count ?? 0}</td>
              <td>${typeof obj.confidence === 'number' ? `${Math.round(obj.confidence * 100)}%` : 'N/A'}</td>
            </tr>
          `).join('')
        : '<tr><td colspan="3">No object summary available.</td></tr>';

    const violationsHtml = violationTypes.length
        ? violationTypes.map((item) => `
            <tr>
              <td>${item.label || 'Unknown'}</td>
              <td>${item.count ?? 0}</td>
            </tr>
          `).join('')
        : '<tr><td colspan="2">No violation types recorded.</td></tr>';

    const legalHtml = legalRows.length
        ? legalRows.map((item) => `
            <div class="legal-card">
              <h4>${item.label || 'Violation'}${item.count ? ` x${item.count}` : ''}</h4>
              <p><strong>Fine:</strong> ${item.fine || 'N/A'}</p>
              <p><strong>Law:</strong> ${item.law || 'N/A'}</p>
              <p><strong>IPC:</strong> ${item.ipc || 'N/A'}</p>
              <p><strong>Jail:</strong> ${item.jail || 'N/A'}</p>
              <p><strong>Consequence:</strong> ${item.consequence || 'N/A'}</p>
            </div>
          `).join('')
        : '<div class="legal-card"><h4>Legal Notes</h4><p>No detailed legal judgment available.</p></div>';

    const eventsHtml = events.length
        ? events.map((event, index) => `
            <div class="event-card">
              <span class="event-index">Event ${index + 1}</span>
              <pre>${JSON.stringify(event, null, 2)}</pre>
            </div>
          `).join('')
        : '<div class="event-card"><span class="event-index">Events</span><pre>No event timeline available.</pre></div>';

    const mediaHtml = (embeddedMediaPreview || processedMedia)
        ? (detail.media_type === 'image'
            ? `<div class="media-wrap"><img src="${embeddedMediaPreview || processedMedia}" alt="Analyzed output" class="hero-image" /><p class="media-note">Annotated image evidence prepared for archive export.</p></div>`
            : embeddedMediaPreview
                ? `<div class="media-wrap"><img src="${embeddedMediaPreview}" alt="Processed video preview" class="hero-image" /><p class="media-note">Annotated preview frame extracted from the analyzed video.</p><p class="media-link">Video source: <a href="${processedMedia || '#'}" target="_blank">${processedMedia || 'Unavailable'}</a></p></div>`
                : `<div class="video-box"><div class="video-pill">Processed video output</div><p>The analyzed video can be opened from:</p><a href="${processedMedia}" target="_blank">${processedMedia}</a></div>`)
        : '<div class="video-box"><p>No processed media attached.</p></div>';

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
              font-family: "Segoe UI", Arial, sans-serif;
              color: #f8fafc;
              background:
                radial-gradient(circle at top left, rgba(239,68,68,0.18), transparent 24%),
                radial-gradient(circle at bottom right, rgba(59,130,246,0.16), transparent 20%),
                linear-gradient(180deg, #07090f, #0d1119 36%, #090b11);
            }
            .page {
              padding: 28px;
            }
            .hero, .card {
              background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));
              border: 1px solid rgba(255,255,255,0.1);
              border-radius: 24px;
              box-shadow: 0 20px 80px rgba(0,0,0,0.35);
            }
            .hero {
              padding: 28px;
              margin-bottom: 20px;
            }
            .eyebrow {
              letter-spacing: 0.35em;
              text-transform: uppercase;
              font-size: 11px;
              color: #fda4af;
            }
            h1 {
              margin: 10px 0 8px;
              font-size: 34px;
            }
            .subtitle {
              color: #cbd5e1;
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
              border-radius: 18px;
              border: 1px solid rgba(255,255,255,0.08);
              background: rgba(255,255,255,0.03);
            }
            .stat .label {
              color: #94a3b8;
              font-size: 11px;
              letter-spacing: 0.22em;
              text-transform: uppercase;
            }
            .stat .value {
              margin-top: 8px;
              font-size: 28px;
              font-weight: 700;
            }
            .section-title {
              margin: 0 0 14px;
              font-size: 18px;
              color: #fff;
            }
            .meta-list {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 12px;
            }
            .meta {
              padding: 14px;
              border-radius: 18px;
              background: rgba(255,255,255,0.03);
              border: 1px solid rgba(255,255,255,0.06);
            }
            .meta strong {
              display: block;
              color: #94a3b8;
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
              border-bottom: 1px solid rgba(255,255,255,0.08);
              font-size: 13px;
            }
            th { color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: 0.22em; }
            .hero-image {
              width: 100%;
              border-radius: 18px;
              border: 1px solid rgba(255,255,255,0.08);
              display: block;
            }
            .media-wrap {
              display: grid;
              gap: 10px;
            }
            .media-note {
              margin: 0;
              color: #cbd5e1;
              font-size: 12px;
            }
            .media-link {
              margin: 0;
              color: #cbd5e1;
              font-size: 12px;
              line-height: 1.6;
            }
            .video-box {
              border-radius: 18px;
              padding: 20px;
              background: rgba(255,255,255,0.03);
              border: 1px solid rgba(255,255,255,0.08);
              line-height: 1.6;
            }
            .video-pill {
              display: inline-block;
              margin-bottom: 10px;
              padding: 6px 10px;
              border-radius: 999px;
              background: rgba(59,130,246,0.18);
              color: #bfdbfe;
              font-size: 11px;
              letter-spacing: 0.18em;
              text-transform: uppercase;
            }
            a { color: #93c5fd; word-break: break-all; }
            .legal-grid, .events-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 12px;
            }
            .legal-card, .event-card {
              border-radius: 18px;
              padding: 14px;
              background: rgba(255,255,255,0.03);
              border: 1px solid rgba(255,255,255,0.08);
            }
            .legal-card h4 {
              margin: 0 0 8px;
              color: #fda4af;
            }
            .legal-card p { margin: 6px 0; font-size: 13px; color: #e2e8f0; }
            .event-index {
              display: inline-block;
              color: #bfdbfe;
              margin-bottom: 8px;
              font-size: 11px;
              letter-spacing: 0.18em;
              text-transform: uppercase;
            }
            pre {
              margin: 0;
              white-space: pre-wrap;
              word-break: break-word;
              color: #dbeafe;
              font-size: 12px;
              line-height: 1.5;
            }
            .footer {
              margin-top: 18px;
              color: #94a3b8;
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
                background: #090b11 !important;
              }
              .page {
                padding: 0;
              }
              .hero, .card {
                box-shadow: none;
                background: #1a1015 !important;
                border-color: rgba(255,255,255,0.12) !important;
                break-inside: avoid;
                page-break-inside: avoid;
              }
              .stat, .meta, .video-box, .legal-card, .event-card {
                background: rgba(255,255,255,0.035) !important;
                border-color: rgba(255,255,255,0.1) !important;
                break-inside: avoid;
                page-break-inside: avoid;
              }
              a {
                color: #93c5fd !important;
                text-decoration: underline;
              }
              .hero-image {
                max-height: 230mm;
                object-fit: contain;
              }
            }
          </style>
        </head>
        <body>
          <div class="page">
            <section class="hero">
              <div class="eyebrow">TraffixAI Verified Report</div>
              <h1>Accepted Incident Report</h1>
              <p class="subtitle">This document summarizes the submitted traffic evidence, the AI analysis output, the admin-approved report metadata, and the resulting judgment layers for archival or export.</p>
              <div class="stats">
                <div class="stat"><div class="label">Risk Score</div><div class="value">${detail.risk_score ?? 0}</div></div>
                <div class="stat"><div class="label">Violations</div><div class="value">${detail.violations ?? 0}</div></div>
                <div class="stat"><div class="label">Accidents</div><div class="value">${detail.accidents ?? 0}</div></div>
                <div class="stat"><div class="label">Confidence</div><div class="value">${typeof detail.confidence === 'number' ? `${Math.round(detail.confidence * 100)}%` : 'N/A'}</div></div>
              </div>
            </section>

            <div class="grid">
              <section class="card span-7">
                <h2 class="section-title">Input Data Summary</h2>
                <div class="meta-list">
                  <div class="meta"><strong>Report ID</strong>${record.id}</div>
                  <div class="meta"><strong>Status</strong>${record.status}</div>
                  <div class="meta"><strong>Media Type</strong>${record.media_type || record.type || 'image'}</div>
                  <div class="meta"><strong>Location</strong>${detail.location || record.location || 'Unknown'}</div>
                  <div class="meta"><strong>Incident Type</strong>${record.incidentType || record.incident_type || 'Monitoring'}</div>
                  <div class="meta"><strong>Uploaded / Analyzed</strong>${formatDate(record.created_at || record.createdAt)} / ${formatDate(detail.analyzed_at)}</div>
                </div>
              </section>

              <section class="card span-5">
                <h2 class="section-title">Processed Output</h2>
                ${mediaHtml}
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
                  <div class="meta"><strong>Frames Analyzed</strong>${detail.frames_analyzed ?? 0}</div>
                  <div class="meta"><strong>Total Frames</strong>${detail.total_frames ?? 0}</div>
                  <div class="meta"><strong>Duration</strong>${detail.duration_seconds ?? 0}s</div>
                  <div class="meta"><strong>Analysis FPS</strong>${detail.analysis_sample_fps ?? 0}</div>
                  <div class="meta"><strong>LLM Verdict</strong>${llm.verdict || 'N/A'}</div>
                  <div class="meta"><strong>Recommended Action</strong>${llm.recommended_action || 'N/A'}</div>
                  <div class="meta"><strong>Accident Severity</strong>${detail.judge?.accident_severity || 'N/A'}</div>
                  <div class="meta"><strong>LLM Model</strong>${llm.model || 'N/A'}</div>
                </div>
              </section>

              <section class="card span-6">
                <h2 class="section-title">Legal / Judgment Output</h2>
                <div class="legal-grid">${legalHtml}</div>
              </section>

              <section class="card span-6">
                <h2 class="section-title">AI Summary</h2>
                <div class="legal-card">
                  <h4>${llm.verdict || 'Manual Review'}</h4>
                  <p><strong>Summary:</strong> ${llm.summary || 'No summary available.'}</p>
                  <p><strong>Confidence:</strong> ${typeof llm.confidence === 'number' ? `${Math.round(llm.confidence * 100)}%` : 'N/A'}</p>
                  <p><strong>Recommended Action:</strong> ${llm.recommended_action || 'N/A'}</p>
                </div>
              </section>

              <section class="card span-12">
                <h2 class="section-title">Event Timeline / Output Details</h2>
                <div class="events-grid">${eventsHtml}</div>
              </section>
            </div>

            <div class="footer">Generated by TraffixAI on ${generatedAt}</div>
          </div>
        </body>
      </html>
    `;
}

async function waitForEmbeddedAssets(root: HTMLElement) {
    if (document.fonts?.ready) {
        try {
            await document.fonts.ready;
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
        let host: HTMLDivElement | null = null;
        try {
            const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
                import('html2canvas'),
                import('jspdf'),
            ]);
            const detail = await getAnalysisResult(record.id) as AnalysisPayload;
            const embeddedMediaPreview = await resolveEmbeddedMediaPreview(detail);
            const html = buildReportHtml(record, detail, embeddedMediaPreview);
            host = document.createElement('div');
            host.style.position = 'fixed';
            host.style.left = '-100000px';
            host.style.top = '0';
            host.style.width = '794px';
            host.style.zIndex = '-1';
            host.style.pointerEvents = 'none';
            host.innerHTML = html;
            document.body.appendChild(host);

            const page = host.querySelector('.page') as HTMLElement | null;
            if (!page) {
                throw new Error('Could not prepare the PDF layout.');
            }

            await waitForEmbeddedAssets(page);
            await new Promise((resolve) => window.setTimeout(resolve, 120));
            const canvas = await html2canvas(page, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#090b11',
                logging: false,
                windowWidth: 794,
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

                pageCtx.fillStyle = '#090b11';
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
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Could not export PDF.';
            window.alert(message);
        } finally {
            if (host && document.body.contains(host)) {
                document.body.removeChild(host);
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
                            Review every submitted incident, track approval state, and export accepted cases as downloadable PDF files with evidence snapshots, AI findings, and legal summaries.
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
                                ? 'border border-red-500/30 bg-red-500/15 text-red-100 shadow-[0_14px_38px_rgba(127,29,29,0.18)]'
                                : 'glass-card text-slate-300 hover:text-white'
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
                                            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-cyan-400/25 bg-[linear-gradient(135deg,rgba(8,145,178,0.95),rgba(59,130,246,0.92),rgba(37,99,235,0.92))] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_50px_rgba(14,116,144,0.28)] transition-all hover:brightness-110 disabled:opacity-60"
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
