'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Upload, Image as ImageIcon, Video, Calendar, Clock, FileText,
    CheckCircle, X, AlertCircle, Loader, Camera, AlertTriangle, ShieldX,
    Car, UserX, Gauge, Eye, Crosshair, Send, ChevronLeft, ChevronRight,
    Play, Shield
} from 'lucide-react';
import api, { uploadImage, uploadVideo } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import LocationAutocompleteInput from '@/components/location/LocationAutocompleteInput';
import toast from 'react-hot-toast';

type Tab = 'image' | 'video';

export interface ViolationType {
    id: string;
    label: string;
    count: number;
    severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface DetectionBox {
    x1: number; y1: number; x2: number; y2: number;
    label: string;
    confidence: number;
    risk_score: number;
    color: string;
    category: 'vehicle' | 'pedestrian' | 'violation' | 'accident' | 'object';
}

export type DetectionResult = {
    id?: string;
    vehicles: number;
    pedestrians: number;
    accidents: number;
    violations: number;
    violation_types?: ViolationType[];
    detection_boxes?: DetectionBox[];
    annotated_image?: string;     // base64 JPEG from backend
    annotated_frames?: string[];  // multiple frames for video
    risk_score?: number;
    confidence?: number;
    objects?: Array<{ class: string; confidence: number; count: number }>;
    frames_analyzed?: number;
    total_frames?: number;
    raw_violations?: any[];
    raw_accidents?: any[];
};

function ensureRiskScore(result: DetectionResult): DetectionResult {
    const hasIncidents = (result.accidents || 0) > 0 || (result.violations || 0) > 0;
    const current = typeof result.risk_score === 'number' ? result.risk_score : undefined;
    if (current !== undefined && current > 0) return result;
    if (!hasIncidents) return { ...result, risk_score: 0 };
    const derived = Math.min(100, Math.max(5, Math.round((result.accidents * 25) + (result.violations * 3) + (result.vehicles * 0.05))));
    return { ...result, risk_score: derived };
}

async function withTimeout<T>(promise: Promise<T>, ms = 10000): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), ms);
    });
    try {
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

/* ═══════════════════════════════════════════════════════════════════════
   Draw bounding boxes on a canvas over an image src
═══════════════════════════════════════════════════════════════════════ */
function drawBoxes(ctx: CanvasRenderingContext2D, boxes: DetectionBox[], scaleX: number, scaleY: number) {
    const iou = (a: DetectionBox, b: DetectionBox) => {
        const x1 = Math.max(a.x1, b.x1);
        const y1 = Math.max(a.y1, b.y1);
        const x2 = Math.min(a.x2, b.x2);
        const y2 = Math.min(a.y2, b.y2);
        const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
        const areaA = Math.max(0, a.x2 - a.x1) * Math.max(0, a.y2 - a.y1);
        const areaB = Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
        const union = areaA + areaB - inter;
        return union > 0 ? inter / union : 0;
    };

    // Keep critical detections and suppress heavily overlapping duplicates.
    const sorted = [...boxes].sort((a, b) => {
        const categoryWeight = (c: DetectionBox['category']) => (c === 'accident' ? 3 : c === 'violation' ? 2 : 1);
        return categoryWeight(b.category) - categoryWeight(a.category) || b.confidence - a.confidence;
    });
    const deduped: DetectionBox[] = [];
    for (const candidate of sorted) {
        const overlap = deduped.some((kept) => kept.label === candidate.label && iou(kept, candidate) > 0.55);
        if (!overlap) deduped.push(candidate);
    }
    const finalBoxes = deduped.slice(0, 14);

    for (const box of finalBoxes) {
        const x1 = box.x1 * scaleX, y1 = box.y1 * scaleY;
        const w = (box.x2 - box.x1) * scaleX, h = (box.y2 - box.y1) * scaleY;

        const lineW = box.category === 'accident' ? 3.5 : box.category === 'violation' ? 3 : 2;
        ctx.strokeStyle = box.color;
        ctx.lineWidth = lineW;
        ctx.strokeRect(x1, y1, w, h);
        ctx.fillStyle = box.color + '22';
        ctx.fillRect(x1, y1, w, h);

        if (box.category === 'accident' || box.category === 'violation') {
            const cLen = Math.min(14, w * 0.2, h * 0.2);
            ctx.lineWidth = 3; ctx.strokeStyle = box.color;
            ctx.beginPath(); ctx.moveTo(x1, y1 + cLen); ctx.lineTo(x1, y1); ctx.lineTo(x1 + cLen, y1); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(x1 + w - cLen, y1); ctx.lineTo(x1 + w, y1); ctx.lineTo(x1 + w, y1 + cLen); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(x1, y1 + h - cLen); ctx.lineTo(x1, y1 + h); ctx.lineTo(x1 + cLen, y1 + h); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(x1 + w - cLen, y1 + h); ctx.lineTo(x1 + w, y1 + h); ctx.lineTo(x1 + w, y1 + h - cLen); ctx.stroke();
        }

        const label = `${box.label}  ${(box.confidence * 100).toFixed(0)}%`;
        ctx.font = `bold ${Math.max(11, 12)}px Inter, sans-serif`;
        const tw = ctx.measureText(label).width;
        const th = 16;
        const labelY = Math.max(0, y1 - th - 3);
        ctx.fillStyle = box.color;
        ctx.fillRect(x1, labelY, tw + 8, th + 3);
        ctx.fillStyle = '#fff';
        ctx.fillText(label, x1 + 4, labelY + th - 2);

        if (box.risk_score > 0.5) {
            const br = 10;
            ctx.beginPath();
            ctx.arc(x1 + w - br - 2, y1 + br + 2, br, 0, Math.PI * 2);
            ctx.fillStyle = box.color + 'cc'; ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = `bold 8px Inter, sans-serif`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(`${Math.round(box.risk_score * 100)}`, x1 + w - br - 2, y1 + br + 2);
            ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
        }
    }
}

/* ── Annotated image from backend base64 or local preview + boxes ── */
function AnnotatedFrame({
    src, boxes, title, badge
}: { src: string; boxes: DetectionBox[]; title?: string; badge?: string }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!src || !canvasRef.current) return;
        const img = new window.Image();
        img.onload = () => {
            const canvas = canvasRef.current!;
            const cw = containerRef.current?.clientWidth || 700;
            const scale = cw / img.width;
            canvas.width = Math.floor(img.width * scale);
            canvas.height = Math.floor(img.height * scale);
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            if (boxes.length > 0) {
                drawBoxes(ctx, boxes, scale, scale);
            }
        };
        img.src = src;
    }, [src, boxes]);

    return (
        <div ref={containerRef} className="w-full space-y-2">
            {title && (
                <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-cyan-400" />
                    <h4 className="text-sm font-semibold text-white">{title}</h4>
                    {badge && <span className="ml-auto text-xs text-slate-400">{badge}</span>}
                </div>
            )}
            <canvas ref={canvasRef} className="w-full rounded-xl border border-white/10 bg-dark-800" />
            <div className="flex flex-wrap gap-3 text-xs">
                {[
                    { label: 'Vehicle', color: '#2dd4a0' },
                    { label: 'Pedestrian', color: '#10b981' },
                    { label: 'Violation', color: '#e87830' },
                    { label: 'Accident', color: '#ef4444' },
                ].map((l) => (
                    <span key={l.label} className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-sm border-2" style={{ borderColor: l.color, background: l.color + '30' }} />
                        <span className="text-slate-400">{l.label}</span>
                    </span>
                ))}
                <span className="ml-auto text-slate-500 italic">Green = safe · Red = high risk</span>
            </div>
        </div>
    );
}

/* ── Violation severity styling ─────────────────────────────────────── */
const SEVERITY_STYLE: Record<string, { bg: string; border: string; text: string; dot: string }> = {
    critical: { bg: 'bg-red-500/10', border: 'border-red-500/40', text: 'text-red-400', dot: 'bg-red-400' },
    high: { bg: 'bg-orange-500/10', border: 'border-orange-500/40', text: 'text-orange-400', dot: 'bg-orange-400' },
    medium: { bg: 'bg-amber-500/10', border: 'border-amber-500/40', text: 'text-amber-400', dot: 'bg-amber-400' },
    low: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/40', text: 'text-yellow-400', dot: 'bg-yellow-400' },
};

const VIOLATION_ICON: Record<string, React.ElementType> = {
    'No Helmet': ShieldX, 'Speeding': Gauge, 'Wrong Way': Car, 'Signal Jump': AlertTriangle,
    'No Seatbelt': UserX, 'Excess Riders': UserX, 'Lane Change': Car, 'Jaywalking': UserX,
    'Tailgating': Car, 'Red Light': AlertTriangle, 'Illegal U-Turn': Car, 'Stopped Vehicle': Car,
    'Uturn': Car, 'U-Turn': Car, 'Wrong Way Driving': Car, 'Excess Riders': UserX,
    'Accident': AlertTriangle,
    'default': Crosshair,
};

/** Infer a severity level from the violation label when the backend omits it. */
function inferSeverity(v: ViolationType): ViolationType['severity'] {
    if (v.severity && SEVERITY_STYLE[v.severity]) return v.severity;
    const label = (v.label || '').toLowerCase();
    if (/accident|wrong.?way|no.?helmet|red.?light/.test(label)) return 'critical';
    if (/speed|excess.?rider|signal/.test(label)) return 'high';
    if (/jaywal|tailgat|lane/.test(label)) return 'medium';
    return 'low';
}

function ViolationBoxes({ types }: { types: ViolationType[] }) {
    if (!types || types.length === 0) return null;
    return (
        <div className="border-t border-white/10 pt-4">
            <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <h4 className="text-sm font-semibold text-white">Violation Breakdown</h4>
            </div>
            <div className="grid grid-cols-2 gap-2">
                {types.map((v) => {
                    const severity = inferSeverity(v);
                    const s = SEVERITY_STYLE[severity];
                    const Icon = VIOLATION_ICON[v.label] ?? VIOLATION_ICON['default'];
                    return (
                        <motion.div key={v.id ?? v.label} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                            className={`flex items-start gap-2.5 p-3 rounded-xl border ${s.bg} ${s.border}`}>
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${s.bg} border ${s.border}`}>
                                <Icon className={`w-4 h-4 ${s.text}`} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className={`text-xs font-semibold ${s.text} leading-tight`}>{v.label}</p>
                                <div className="flex items-center gap-1.5 mt-1">
                                    <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                                    <span className="text-xs text-slate-500 capitalize">{severity}</span>
                                </div>
                            </div>
                            <span className={`text-lg font-bold font-display shrink-0 ${s.text}`}>{v.count}</span>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}

/* ── Send Report to Admin button ─────────────────────────────────────── */
function SendReportButton({ result, user, uploadDocId }:
    { result: DetectionResult; user: any; uploadDocId?: string }) {
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);

    const send = async () => {
        if (sent) return;
        if (!uploadDocId) {
            toast.error('No backend report id found for this upload.');
            return;
        }
        setSending(true);
        try {
            const response = await withTimeout(api.post('/reports/forward', {
                sourceReportId: uploadDocId,
                sentToAdmin: true,
            }), 15000);
            if (response?.data?.ok) {
                setSent(true);
                toast.success('Report sent to admin successfully!');
            } else {
                toast.error('Failed to send report. Please try again.');
            }
        } catch (err) {
            console.error('Send report error:', err);
            toast.error('Failed to send report. Please try again.');
        } finally {
            setSending(false);
        }
    };

    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="glass-card p-6 border border-amber-500/20 bg-amber-500/5">
            <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                    <Shield className="w-6 h-6 text-amber-400" />
                </div>
                <div className="flex-1">
                    <h3 className="font-semibold text-white mb-1">Send Report to Admin</h3>
                    <p className="text-sm text-slate-400 mb-4">
                        Forward this analysis — {result.accidents > 0 ? 'Accident Detected' : 'No Accident Detected'} with {result.violations} violation{result.violations !== 1 ? 's' : ''} — to the admin for review and action.
                    </p>
                    <button
                        onClick={send}
                        disabled={sending || sent}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm transition-all ${sent
                            ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 cursor-default'
                            : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white disabled:opacity-50 disabled:cursor-not-allowed'
                            }`}
                    >
                        {sending ? (
                            <><Loader className="w-4 h-4 animate-spin" /> Sending...</>
                        ) : sent ? (
                            <><CheckCircle className="w-4 h-4" /> Report Sent!</>
                        ) : (
                            <><Send className="w-4 h-4" /> Send to Admin</>
                        )}
                    </button>
                    {!user && (<p className="text-xs text-slate-500 mt-2">No user session found.</p>)}
                </div>
            </div>
        </motion.div>
    );
}

/* ═══════════════════════════════════════════════════════════════════════
   Page root
═══════════════════════════════════════════════════════════════════════ */
export default function UploadPage() {
    const [tab, setTab] = useState<Tab>('image');
    const { user } = useAuth();

    return (
        <div className="min-h-screen bg-dark-900 pt-16">
            <div className="bg-dark-800/50 border-b border-white/10 px-6 py-6">
                <div className="container-max">
                    <h1 className="text-2xl font-display font-bold text-white">Evidence Upload</h1>
                    <p className="text-slate-400 text-sm mt-1">Upload CCTV footage or images for AI-powered analysis</p>
                </div>
            </div>

            <div className="container-max py-8">
                <div className="flex gap-2 mb-8">
                    <button onClick={() => setTab('image')}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${tab === 'image' ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white' : 'glass-card text-slate-300 hover:text-white hover:bg-white/10'}`}>
                        <ImageIcon className="w-4 h-4" /> Image Upload
                    </button>
                    <button onClick={() => setTab('video')}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${tab === 'video' ? 'bg-gradient-to-r from-purple-500 to-pink-600 text-white' : 'glass-card text-slate-300 hover:text-white hover:bg-white/10'}`}>
                        <Video className="w-4 h-4" /> Video Analysis
                    </button>
                </div>

                <AnimatePresence mode="wait">
                    {tab === 'image' ? (
                        <motion.div key="image" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
                            <ImageUploadSection user={user} />
                        </motion.div>
                    ) : (
                        <motion.div key="video" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
                            <VideoUploadSection user={user} />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════════
   Stats cards reusable component
═══════════════════════════════════════════════════════════════════════ */
function StatCards({ result }: { result: DetectionResult }) {
    const accidentDetected = (result.accidents || 0) > 0;
    return (
        <div className="grid grid-cols-2 gap-3 mb-5">
            {[
                { label: 'Vehicles', value: result.vehicles, color: 'text-cyan-400', bg: 'from-cyan-500/10', border: 'border-cyan-500/20' },
                { label: 'Pedestrians', value: result.pedestrians, color: 'text-blue-400', bg: 'from-blue-500/10', border: 'border-blue-500/20' },
                { label: 'Violations', value: result.violations, color: 'text-amber-400', bg: 'from-amber-500/10', border: 'border-amber-500/30' },
            ].map((s) => (
                <div key={s.label} className={`bg-gradient-to-br ${s.bg} to-transparent border ${s.border} rounded-xl p-4`}>
                    <p className={`text-2xl font-bold font-display ${s.color}`}>{s.value}</p>
                    <p className="text-xs text-slate-400 mt-1">{s.label}</p>
                </div>
            ))}
            <div className={`bg-gradient-to-br ${accidentDetected ? 'from-red-500/15' : 'from-emerald-500/10'} to-transparent border ${accidentDetected ? 'border-red-500/35' : 'border-emerald-500/30'} rounded-xl p-4`}>
                <p className={`text-base font-bold font-display ${accidentDetected ? 'text-red-400' : 'text-emerald-400'}`}>
                    {accidentDetected ? 'Accident Detected' : 'No Accident Detected'}
                </p>
                <p className="text-xs text-slate-400 mt-1">Accident Status</p>
            </div>
        </div>
    );
}

function RiskBar({ score }: { score: number }) {
    return (
        <div className="border-t border-white/10 pt-4 mt-4">
            <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-400">Overall Risk Score</span>
                <span className={`font-bold text-lg ${score >= 70 ? 'text-red-400' : score >= 40 ? 'text-amber-400' : 'text-emerald-400'}`}>{score}/100</span>
            </div>
            <div className="progress-bar">
                <div className={`progress-fill ${score >= 70 ? 'bg-gradient-to-r from-red-600 to-red-400' : score >= 40 ? 'bg-gradient-to-r from-amber-600 to-amber-400' : 'bg-gradient-to-r from-emerald-600 to-emerald-400'}`}
                    style={{ width: `${score}%` }} />
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════════
   Image Section
═══════════════════════════════════════════════════════════════════════ */
function ImageUploadSection({ user }: { user: any }) {
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [metadata, setMetadata] = useState({ location: '', date: '', time: '', description: '' });
    const [result, setResult] = useState<DetectionResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [uploadDocId, setUploadDocId] = useState<string | undefined>();
    const dropRef = useRef<HTMLDivElement>(null);

    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        const f = e.dataTransfer.files[0];
        if (f && f.type.startsWith('image/')) { setFile(f); setPreview(URL.createObjectURL(f)); }
    }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (f) { setFile(f); setPreview(URL.createObjectURL(f)); setResult(null); }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file) return toast.error('Please select an image');
        if (!metadata.location) return toast.error('Please enter location');
        setLoading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('location', metadata.location);
            formData.append('date', metadata.date);
            formData.append('time', metadata.time);
            formData.append('description', metadata.description);
            formData.append('user_id', user?.uid || 'anonymous');

            const data = ensureRiskScore(await uploadImage(formData));
            setResult(data);
            setUploadDocId(data?.id);
            toast.success('Analysis complete!');
        } catch {
            setResult(null);
            setUploadDocId(undefined);
            toast.error('Analysis failed. Please try again.');
        } finally { setLoading(false); }
    };

    // Use annotated_image from backend if available, else fall back to local preview
    // Backend returns full data URI already; fall back gracefully for old plain-base64 format
    const displaySrc = result?.annotated_image
        ? (result.annotated_image.startsWith('data:') ? result.annotated_image : `data:image/jpeg;base64,${result.annotated_image}`)
        : preview || '';

    return (
        <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Upload Form */}
                <div className="space-y-6">
                    <div ref={dropRef} onDrop={onDrop} onDragOver={(e) => e.preventDefault()}
                        className="relative border-2 border-dashed border-white/20 rounded-2xl p-8 text-center hover:border-cyan-500/50 transition-colors cursor-pointer"
                        onClick={() => document.getElementById('image-input')?.click()}>
                        <input id="image-input" type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                        {preview ? (
                            <div className="relative">
                                <img src={preview} alt="Preview" className="max-h-48 mx-auto rounded-xl object-contain" />
                                <button onClick={(e) => { e.stopPropagation(); setFile(null); setPreview(null); setResult(null); }}
                                    className="absolute top-2 right-2 w-7 h-7 bg-red-500 rounded-full flex items-center justify-center">
                                    <X className="w-4 h-4 text-white" />
                                </button>
                            </div>
                        ) : (
                            <div>
                                <Camera className="w-10 h-10 text-slate-500 mx-auto mb-3" />
                                <p className="text-slate-300 font-medium">Drop image here or click to browse</p>
                                <p className="text-slate-500 text-sm mt-1">PNG, JPG, JPEG up to 10MB</p>
                            </div>
                        )}
                    </div>

                    <form onSubmit={handleSubmit} className="glass-card p-6 space-y-4">
                        <h3 className="font-semibold text-white flex items-center gap-2">
                            <FileText className="w-4 h-4 text-cyan-400" /> Incident Details
                        </h3>
                        <LocationAutocompleteInput
                            value={metadata.location}
                            onChange={(nextLocation) => setMetadata({ ...metadata, location: nextLocation })}
                            placeholder="Location (e.g., MG Road, Signal No. 4)"
                        />
                        <div className="grid grid-cols-2 gap-3">
                            <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input type="date" value={metadata.date} onChange={(e) => setMetadata({ ...metadata, date: e.target.value })} className="input-field pl-10" />
                            </div>
                            <div className="relative">
                                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input type="time" value={metadata.time} onChange={(e) => setMetadata({ ...metadata, time: e.target.value })} className="input-field pl-10" />
                            </div>
                        </div>
                        <textarea placeholder="Description of incident..." value={metadata.description}
                            onChange={(e) => setMetadata({ ...metadata, description: e.target.value })} className="input-field resize-none h-20" />
                        <button type="submit" disabled={loading || !file} className="btn-primary w-full flex items-center justify-center gap-2 py-3">
                            {loading ? <><Loader className="w-4 h-4 animate-spin" /> Analyzing...</> : <><Upload className="w-4 h-4" />Analyze Image</>}
                        </button>
                    </form>
                </div>

                {/* Results panel */}
                <div>
                    {result ? (
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4">
                            <div className="glass-card p-6">
                                <div className="flex items-center gap-2 mb-6">
                                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                                    <h3 className="font-display font-semibold text-white">Detection Results</h3>
                                    {result.confidence && (
                                        <span className="badge-success ml-auto">Confidence: {(result.confidence * 100).toFixed(0)}%</span>
                                    )}
                                </div>
                                <StatCards result={result} />
                                {result.violation_types && <ViolationBoxes types={result.violation_types} />}
                                {result.risk_score !== undefined && <RiskBar score={result.risk_score} />}
                            </div>

                            {result.objects && result.objects.length > 0 && (
                                <div className="glass-card p-6">
                                    <h4 className="font-semibold text-white mb-4">Detected Objects</h4>
                                    <div className="space-y-2">
                                        {result.objects.map((obj) => (
                                            <div key={obj.class} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                                                <span className="text-slate-300 capitalize">{obj.class}</span>
                                                <div className="flex items-center gap-3">
                                                    <span className="badge-info">×{obj.count}</span>
                                                    <span className="text-xs text-slate-400">{(obj.confidence * 100).toFixed(0)}%</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    ) : (
                        <div className="glass-card p-12 text-center h-full flex flex-col items-center justify-center min-h-64">
                            <AlertCircle className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                            <p className="text-slate-400">Upload an image to see AI analysis results</p>
                            <p className="text-slate-500 text-sm mt-2">YOLOv8 detects vehicles, pedestrians, accidents, and violations</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Annotated frame — full width */}
            {result && displaySrc && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6">
                    <AnnotatedFrame
                        src={displaySrc}
                        boxes={result.detection_boxes || []}
                        title="Detection Overlay"
                        badge={`${result.detection_boxes?.length || 0} objects identified`}
                    />
                </motion.div>
            )}

            {result && (
                <SendReportButton
                    result={result}
                    user={user}
                    uploadDocId={uploadDocId}
                />
            )}

        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════════
   Video Section
═══════════════════════════════════════════════════════════════════════ */
function VideoUploadSection({ user }: { user: any }) {
    const [file, setFile] = useState<File | null>(null);
    const [videoPreview, setVideoPreview] = useState<string | null>(null);
    const [progress, setProgress] = useState(0);
    const [result, setResult] = useState<DetectionResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [location, setLocation] = useState('');
    const [frameIndex, setFrameIndex] = useState(0);
    const [uploadDocId, setUploadDocId] = useState<string | undefined>();

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (f) { setFile(f); setVideoPreview(URL.createObjectURL(f)); setResult(null); }
    };

    const handleAnalyze = async () => {
        if (!file) return toast.error('Please select a video file');
        setLoading(true); setProgress(0);

        // Simulate progress ticks while backend processes
        const progressInterval = setInterval(() => {
            setProgress((p) => Math.min(p + 3, 90));
        }, 600);

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('location', location);
            formData.append('user_id', user?.uid || 'anonymous');
            const data = ensureRiskScore(await uploadVideo(formData, setProgress));
            clearInterval(progressInterval);
            setProgress(100);
            setResult(data);
            setFrameIndex(0);
            setUploadDocId(data?.id);
            toast.success(`Video analysis complete! ${data.frames_analyzed || '?'} frames analyzed.`);
        } catch {
            clearInterval(progressInterval);
            setResult(null);
            setUploadDocId(undefined);
            toast.error('Analysis failed. Please try again.');
        } finally { setLoading(false); }
    };

    // For video: if backend returns annotated_image (last analyzed frame), show it
    // Also show video thumbnail from first frame using canvas capture
    const annotatedSrc = result?.annotated_image
        ? (result.annotated_image.startsWith('data:') ? result.annotated_image : `data:image/jpeg;base64,${result.annotated_image}`)
        : null;

    // Multiple frames carousel (if annotated_frames provided)
    const frames = (result?.annotated_frames || [])
        .filter((f) => typeof f === 'string' && f.length > 24)
        .map((f) => (f.startsWith('data:') ? f : `data:image/jpeg;base64,${f}`));
    const resolvedFrames = frames.length > 0 ? frames : (annotatedSrc ? [annotatedSrc] : []);
    const currentFrame = resolvedFrames[frameIndex];

    return (
        <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Upload form */}
                <div className="space-y-6">
                    <div className="border-2 border-dashed border-white/20 rounded-2xl p-10 text-center hover:border-purple-500/50 transition-colors cursor-pointer"
                        onClick={() => document.getElementById('video-input')?.click()}>
                        <input id="video-input" type="file" accept="video/*" onChange={handleFileChange} className="hidden" />
                        <Video className="w-12 h-12 text-slate-500 mx-auto mb-3" />
                        {file ? (
                            <div>
                                <p className="text-purple-400 font-medium">{file.name}</p>
                                <p className="text-slate-500 text-sm">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                                {videoPreview && (
                                    <video src={videoPreview} className="mt-3 max-h-32 mx-auto rounded-lg" muted playsInline />
                                )}
                            </div>
                        ) : (
                            <div>
                                <p className="text-slate-300 font-medium">Drop CCTV video here or click to browse</p>
                                <p className="text-slate-500 text-sm mt-1">MP4, AVI, MOV up to 500MB</p>
                            </div>
                        )}
                    </div>

                    <div className="glass-card p-6 space-y-4">
                        <LocationAutocompleteInput
                            value={location}
                            onChange={setLocation}
                            placeholder="Camera location"
                        />
                        {(loading || progress > 0) && (
                            <div>
                                <div className="flex justify-between text-xs text-slate-400 mb-2">
                                    <span>Uploading &amp; Analyzing frames...</span><span>{progress}%</span>
                                </div>
                                <div className="progress-bar">
                                    <div className="progress-fill bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300" style={{ width: `${progress}%` }} />
                                </div>
                            </div>
                        )}
                        <button onClick={handleAnalyze} disabled={loading || !file}
                            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-500 to-pink-600 text-white font-semibold px-6 py-3 rounded-xl hover:from-purple-400 hover:to-pink-500 transition-all disabled:opacity-50">
                            {loading ? <><Loader className="w-4 h-4 animate-spin" /> Processing Frames...</> : <><Video className="w-4 h-4" />Analyze Video</>}
                        </button>
                    </div>
                </div>

                {/* Results */}
                <div>
                    {result ? (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                            <div className="glass-card p-6">
                                <h3 className="font-display font-semibold text-white mb-6 flex items-center gap-2">
                                    <CheckCircle className="w-5 h-5 text-emerald-400" /> Video Analysis Results
                                    {result.confidence && (
                                        <span className="badge-success ml-auto">Confidence: {(result.confidence * 100).toFixed(0)}%</span>
                                    )}
                                </h3>

                                {result.frames_analyzed !== undefined && (
                                    <div className="flex items-center gap-2 mb-4 text-xs text-slate-400 bg-white/5 rounded-lg px-3 py-2">
                                        <Play className="w-3 h-3 text-purple-400" />
                                        <span>{result.frames_analyzed} frames analyzed of {result.total_frames} total</span>
                                    </div>
                                )}

                                <StatCards result={result} />
                                {result.violation_types && <ViolationBoxes types={result.violation_types} />}
                                {result.risk_score !== undefined && <RiskBar score={result.risk_score} />}
                            </div>

                            {result.objects && result.objects.length > 0 && (
                                <div className="glass-card p-6">
                                    <h4 className="font-semibold text-white mb-4">Detected Objects (cumulative)</h4>
                                    <div className="space-y-2">
                                        {result.objects.map((obj) => (
                                            <div key={obj.class} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                                                <span className="text-slate-300 capitalize">{obj.class}</span>
                                                <div className="flex items-center gap-3">
                                                    <span className="badge-info">×{obj.count}</span>
                                                    <span className="text-xs text-slate-400">{(obj.confidence * 100).toFixed(0)}%</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    ) : (
                        <div className="glass-card p-12 text-center h-full flex flex-col items-center justify-center min-h-64">
                            <Video className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                            <p className="text-slate-400">Upload a CCTV video for frame-by-frame AI analysis</p>
                            <p className="text-slate-500 text-sm mt-2">Each frame is analyzed for violations, accidents, and tracking</p>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Frame viewer — annotated image from backend ── */}
            {result && (resolvedFrames.length > 0 || videoPreview) && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <Eye className="w-5 h-5 text-purple-400" />
                        <h3 className="font-display font-semibold text-white">
                            {resolvedFrames.length > 1 ? 'Frame-by-Frame Detection' : 'Last Analyzed Frame'}
                        </h3>
                        {resolvedFrames.length > 1 && (
                            <div className="ml-auto flex items-center gap-2">
                                <button onClick={() => setFrameIndex(Math.max(0, frameIndex - 1))}
                                    disabled={frameIndex === 0}
                                    className="p-1 rounded hover:bg-white/10 disabled:opacity-30">
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <span className="text-xs text-slate-400">{frameIndex + 1} / {resolvedFrames.length}</span>
                                <button onClick={() => setFrameIndex(Math.min(resolvedFrames.length - 1, frameIndex + 1))}
                                    disabled={frameIndex === resolvedFrames.length - 1}
                                    className="p-1 rounded hover:bg-white/10 disabled:opacity-30">
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                    </div>

                    {currentFrame ? (
                        /* Annotated frame from backend (already has bboxes drawn by OpenCV) */
                        <div className="space-y-2">
                            <img src={currentFrame} alt="Analyzed frame" className="w-full rounded-xl border border-white/10" />
                            <p className="text-xs text-slate-500 text-center">
                                Annotated by TrafficMonitor — detections for analyzed second {Math.min(frameIndex + 1, resolvedFrames.length)} of {resolvedFrames.length}
                            </p>
                        </div>
                    ) : videoPreview ? (
                        /* Fallback: capture video frame + draw boxes client-side */
                        <VideoFirstFrameOverlay videoSrc={videoPreview} boxes={result.detection_boxes || []} />
                    ) : null}

                    {resolvedFrames.length > 1 && (
                        <div className="mt-6">
                            <h4 className="text-sm text-slate-300 mb-2">All analyzed frames</h4>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                {resolvedFrames.map((frame, idx) => (
                                    <img key={idx} src={frame} alt={`Frame ${idx + 1}`} className="rounded-lg border border-white/10" />
                                ))}
                            </div>
                        </div>
                    )}
                </motion.div>
            )}

            {result && (
                <SendReportButton
                    result={result}
                    user={user}
                    uploadDocId={uploadDocId}
                />
            )}
        </div>
    );
}

/* ── Video first-frame fallback (client side) ───────────────────────── */
function VideoFirstFrameOverlay({ videoSrc, boxes }: { videoSrc: string; boxes: DetectionBox[] }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!videoSrc) return;
        const video = document.createElement('video');
        video.crossOrigin = 'anonymous';
        video.muted = true;
        video.preload = 'auto';
        video.onloadeddata = () => { video.currentTime = Math.min(1, video.duration / 2); };
        video.onseeked = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const cw = containerRef.current?.clientWidth || 640;
            const scale = cw / video.videoWidth;
            canvas.width = Math.floor(video.videoWidth * scale);
            canvas.height = Math.floor(video.videoHeight * scale);
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            if (boxes.length > 0) drawBoxes(ctx, boxes, scale, scale);
        };
        video.src = videoSrc;
    }, [videoSrc, boxes]);

    return (
        <div ref={containerRef} className="w-full space-y-2">
            <canvas ref={canvasRef} className="w-full rounded-xl border border-white/10" />
            <p className="text-xs text-slate-500 text-center">Showing detection boxes on video thumbnail frame</p>
        </div>
    );
}
