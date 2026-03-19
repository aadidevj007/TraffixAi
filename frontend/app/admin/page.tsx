'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
    CheckCircle2,
    Clock3,
    Eye,
    RefreshCw,
    XCircle,
    MapPin,
    Scale,
    BookOpen,
    DollarSign,
    Siren,
    MessageCircle,
    Loader,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import AdminTrafficCharts from '@/components/charts/AdminTrafficCharts';
import { getAdminRequests, updateAdminRequestStatus, sendAdminEmergency } from '@/lib/api';

type ViolationJudge = {
    label?: string;
    count?: number;
    fine?: string;
    law?: string;
    ipc?: string;
    jail?: string;
    consequence?: string;
};

type LLMJudge = {
    verdict?: string;
    confidence?: number;
    summary?: string;
    recommended_action?: string;
    model?: string;
};

type JudgeData = {
    accident_severity?: string;
    violation_judgment?: ViolationJudge[];
    admin_forwarded?: boolean;
    emergency_whatsapp?: { sent?: boolean; sid?: string; reason?: string } | null;
};

type UploadRecord = {
    id: string;
    user_id?: string;
    media_type?: 'image' | 'video';
    location?: string;
    description?: string;
    incidentType?: string;
    status: 'pending' | 'approved' | 'rejected';
    video_path?: string;
    processed_video?: string;
    detection?: {
        vehicles?: number;
        pedestrians?: number;
        accidents?: number;
        violations?: number;
        risk_score?: number;
        confidence?: number;
        frames_analyzed?: number;
        total_frames?: number;
        duration_seconds?: number;
        analysis_sample_fps?: number;
        violation_types?: Array<{ label?: string; count?: number }>;
        events?: Array<Record<string, unknown>>;
        detection_boxes?: Array<Record<string, unknown>>;
        objects?: Array<{ class?: string; count?: number; confidence?: number }>;
    };
    judge?: JudgeData;
    llm_judge?: LLMJudge;
    created_at?: string;
};

type AdminTab = 'dashboard' | 'pending' | 'accepted' | 'all';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';

function formatEventLabel(value: unknown): string {
    return String(value || 'unknown')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatEventSummary(event: Record<string, unknown>): string {
    const summaryParts: string[] = [];
    if (typeof event.vehicle === 'string' && event.vehicle) {
        summaryParts.push(event.vehicle);
    }
    if (Array.isArray(event.vehicles) && event.vehicles.length > 0) {
        summaryParts.push(String(event.vehicles.join(', ')));
    }
    if (typeof event.speed === 'number') {
        summaryParts.push(`${event.speed} px/f`);
    }
    if (typeof event.duration === 'number') {
        summaryParts.push(`${event.duration}s`);
    }
    if (typeof event.count === 'number') {
        summaryParts.push(`count ${event.count}`);
    }
    if (typeof event.confidence === 'number') {
        summaryParts.push(`${Math.round(event.confidence * 100)}% confidence`);
    }
    if (typeof event.source === 'string' && event.source) {
        summaryParts.push(`source: ${formatEventLabel(event.source)}`);
    }
    return summaryParts.join(' | ');
}

function toDateLabel(createdAt: string | undefined): string {
    if (!createdAt) return 'N/A';
    const parsed = new Date(createdAt);
    if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleString();
    return 'N/A';
}

function toMediaUrl(path?: string): string | null {
    if (!path) return null;
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
        return path;
    }
    const normalized = path.replace(/\\/g, '/');
    const fileName = normalized.split('/').pop();
    if (!fileName) return null;
    if (normalized.includes('/processed/') || normalized.includes('processed_')) {
        return `${API_BASE}/processed/${encodeURIComponent(fileName)}`;
    }
    return `${API_BASE}/uploads/${encodeURIComponent(fileName)}`;
}

const SEVERITY_COLORS: Record<string, string> = {
    high: 'text-red-400 border-red-500/40 bg-red-500/10',
    medium: 'text-orange-400 border-orange-500/40 bg-orange-500/10',
    low: 'text-yellow-400 border-yellow-500/40 bg-yellow-500/10',
    none: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
};

export default function AdminPage() {
    const { user, isAdmin, loading: authLoading } = useAuth();
    const [loading, setLoading] = useState(false);
    const [requests, setRequests] = useState<UploadRecord[]>([]);
    const [localAdmin, setLocalAdmin] = useState(false);
    const [hydrated, setHydrated] = useState(false);
    const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
    const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
    const [emergencySendingFor, setEmergencySendingFor] = useState<string | null>(null);
    const [emergencySentFor, setEmergencySentFor] = useState<Set<string>>(new Set());
    const router = useRouter();
    const searchParams = useSearchParams();

    useEffect(() => {
        if (typeof window !== 'undefined') {
            setLocalAdmin(sessionStorage.getItem('localAdmin') === 'true');
        }
        setHydrated(true);
    }, []);

    const allowed = localAdmin || (!!user && isAdmin());

    useEffect(() => {
        if (!authLoading && !allowed) {
            router.replace('/admin-login');
        }
    }, [authLoading, allowed, router]);

    const fetchRequests = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getAdminRequests({ limit: 500 });
            setRequests((res?.requests || []) as UploadRecord[]);
        } catch (err) {
            console.error('Failed to fetch requests:', err);
            toast.error('Failed to load admin requests');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (allowed) void fetchRequests();
    }, [allowed, fetchRequests]);

    useEffect(() => {
        const tab = (searchParams.get('tab') || 'dashboard') as AdminTab;
        if (tab === 'dashboard' || tab === 'pending' || tab === 'accepted' || tab === 'all') {
            setActiveTab(tab);
        }
    }, [searchParams]);

    useEffect(() => {
        setSelectedRequestId(null);
    }, [activeTab]);

    const pendingRequests = useMemo(
        () => requests.filter((r) => r.status === 'pending'),
        [requests],
    );
    const acceptedRequests = useMemo(
        () => requests.filter((r) => r.status === 'approved'),
        [requests],
    );

    const summary = useMemo(() => {
        return requests.reduce(
            (acc, r) => {
                acc.total += 1;
                if (r.status === 'pending') acc.pending += 1;
                if (r.status === 'approved') acc.approved += 1;
                if (r.status === 'rejected') acc.rejected += 1;
                acc.vehicles += r.detection?.vehicles ?? 0;
                acc.pedestrians += r.detection?.pedestrians ?? 0;
                acc.violations += r.detection?.violations ?? 0;
                acc.accidents += r.detection?.accidents ?? 0;
                return acc;
            },
            { total: 0, pending: 0, approved: 0, rejected: 0, vehicles: 0, pedestrians: 0, violations: 0, accidents: 0 },
        );
    }, [requests]);

    const visibleRequests =
        activeTab === 'pending'
            ? pendingRequests
            : activeTab === 'accepted'
                ? acceptedRequests
                : requests;
    const selectedRequest = useMemo(
        () => visibleRequests.find((r) => r.id === selectedRequestId) ?? null,
        [visibleRequests, selectedRequestId],
    );

    const updateStatus = async (id: string, status: UploadRecord['status']) => {
        try {
            await updateAdminRequestStatus(id, status, user?.uid || 'manual-admin');
            setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
            toast.success(`Request ${status}`);
        } catch (err) {
            console.error('Failed to update status:', err);
            toast.error('Could not update request status');
        }
    };

    const handleSendEmergencyWhatsApp = async (request: UploadRecord) => {
        if (emergencySentFor.has(request.id)) return;
        try {
            setEmergencySendingFor(request.id);
            const severity = (request.judge?.accident_severity || 'high');
            const res = await sendAdminEmergency({
                location: request.location || 'Unknown',
                severity,
                reportId: request.id,
            });
            if (res?.ok) {
                setEmergencySentFor((prev) => new Set(Array.from(prev).concat(request.id)));
                toast.success('Emergency WhatsApp sent to +916374411016!');
            } else {
                toast.error(`WhatsApp failed: ${res?.whatsapp?.reason || 'Unknown error'}`);
            }
        } catch (err) {
            console.error('Emergency WhatsApp failed:', err);
            toast.error('Failed to send emergency WhatsApp');
        } finally {
            setEmergencySendingFor(null);
        }
    };

    if (!hydrated || (authLoading && !localAdmin) || !allowed) {
        return (
            <div className="min-h-screen bg-dark-900 pt-16 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-dark-900 pt-16">
            <div className="bg-gradient-to-r from-cyan-900/35 via-blue-900/25 to-emerald-900/25 border-b border-cyan-500/20 px-6 py-6">
                <div className="container-max flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-display font-bold text-white">Admin Control Center</h1>
                        <p className="text-slate-300 text-sm mt-1">Dashboard insights, pending approvals, and full request history.</p>
                    </div>
                    <button onClick={fetchRequests} className="btn-secondary py-2 px-3">
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Tab Bar */}
            <div className="border-b border-white/10 bg-dark-800/50">
                <div className="container-max flex gap-1 py-2 px-4">
                    {(['dashboard', 'pending', 'accepted', 'all'] as AdminTab[]).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${activeTab === tab ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                        >
                            {tab}
                            {tab === 'pending' && pendingRequests.length > 0 && (
                                <span className="ml-2 px-1.5 py-0.5 text-xs bg-amber-500/30 text-amber-300 rounded-full">{pendingRequests.length}</span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            <div className="container-max py-8 space-y-6">
                {activeTab === 'dashboard' && (
                    <>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="glass-card p-4 border border-cyan-500/30 bg-cyan-500/10">
                                <p className="text-cyan-300 text-xs">Vehicles</p>
                                <p className="text-2xl text-white font-bold">{summary.vehicles}</p>
                            </div>
                            <div className="glass-card p-4 border border-blue-500/30 bg-blue-500/10">
                                <p className="text-blue-300 text-xs">Pedestrians</p>
                                <p className="text-2xl text-white font-bold">{summary.pedestrians}</p>
                            </div>
                            <div className="glass-card p-4 border border-amber-500/30 bg-amber-500/10">
                                <p className="text-amber-300 text-xs">Violations</p>
                                <p className="text-2xl text-white font-bold">{summary.violations}</p>
                            </div>
                            <div className="glass-card p-4 border border-rose-500/30 bg-rose-500/10">
                                <p className="text-rose-300 text-xs">Accidents</p>
                                <p className="text-2xl text-white font-bold">{summary.accidents}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="glass-card p-4 border border-amber-500/30 bg-amber-500/10">
                                <p className="text-amber-300 text-xs">Pending</p>
                                <p className="text-2xl text-white font-bold">{summary.pending}</p>
                            </div>
                            <div className="glass-card p-4 border border-emerald-500/30 bg-emerald-500/10">
                                <p className="text-emerald-300 text-xs">Accepted</p>
                                <p className="text-2xl text-white font-bold">{summary.approved}</p>
                            </div>
                            <div className="glass-card p-4 border border-rose-500/30 bg-rose-500/10">
                                <p className="text-rose-300 text-xs">Rejected</p>
                                <p className="text-2xl text-white font-bold">{summary.rejected}</p>
                            </div>
                            <div className="glass-card p-4 border border-cyan-500/30 bg-cyan-500/10">
                                <p className="text-cyan-300 text-xs">Total Requests</p>
                                <p className="text-2xl text-white font-bold">{summary.total}</p>
                            </div>
                        </div>

                        <AdminTrafficCharts />
                    </>
                )}

                {(activeTab === 'pending' || activeTab === 'accepted' || activeTab === 'all') && (
                    <div className={`grid gap-5 ${selectedRequest ? 'lg:grid-cols-[360px_1fr]' : 'lg:grid-cols-1'}`}>
                        {/* Left list */}
                        <div className="glass-card border border-white/10 rounded-2xl p-4">
                            <h2 className="text-xl font-display font-semibold text-white mb-3">
                                {activeTab === 'pending' ? 'Pending Requests' : activeTab === 'accepted' ? 'Accepted Requests' : 'All Requests'}
                            </h2>
                            {visibleRequests.length === 0 ? (
                                <p className="text-slate-400 text-sm">No requests found.</p>
                            ) : (
                                <div className="space-y-2 max-h-[70vh] overflow-auto pr-1">
                                    {visibleRequests.map((req) => {
                                        const active = req.id === selectedRequestId;
                                        const hasAccident = (req.detection?.accidents ?? 0) > 0;
                                        return (
                                            <button
                                                key={req.id}
                                                onClick={() => setSelectedRequestId(req.id)}
                                                className={`w-full text-left rounded-xl border p-3 transition-all ${active
                                                    ? 'border-cyan-400/50 bg-cyan-500/10'
                                                    : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <p className="text-sm font-mono text-cyan-200">#{req.id.slice(0, 8).toUpperCase()}</p>
                                                    <div className="flex items-center gap-2">
                                                        {hasAccident && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-300">ACCIDENT</span>}
                                                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${req.status === 'approved'
                                                            ? 'bg-emerald-500/20 text-emerald-300'
                                                            : req.status === 'rejected'
                                                                ? 'bg-rose-500/20 text-rose-300'
                                                                : 'bg-amber-500/20 text-amber-300'}`}>
                                                            {req.status}
                                                        </span>
                                                    </div>
                                                </div>
                                                <p className="text-xs text-slate-300 mt-1">
                                                    {(req.media_type || 'image').toUpperCase()} — {req.location || 'Unknown'}
                                                </p>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Right detail panel */}
                        {selectedRequest && (
                            <motion.div
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="glass-card border border-white/10 rounded-2xl p-4 space-y-4 overflow-auto max-h-[90vh]"
                            >
                                {/* Header */}
                                <div className="flex items-center justify-between gap-2">
                                    <h3 className="text-xl text-white font-display font-semibold flex items-center gap-2">
                                        <Eye className="w-5 h-5 text-cyan-300" />
                                        Request Details
                                    </h3>
                                    <p className="text-xs text-slate-400">{toDateLabel(selectedRequest.created_at)}</p>
                                </div>

                                {/* Location */}
                                {selectedRequest.location && (
                                    <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-cyan-500/5 border border-cyan-500/20">
                                        <MapPin className="w-4 h-4 text-cyan-400 shrink-0" />
                                        <span className="text-sm text-cyan-200 font-medium">{selectedRequest.location}</span>
                                    </div>
                                )}

                                {/* Meta grid */}
                                <div className="grid sm:grid-cols-2 gap-3">
                                    <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                                        <p className="text-xs text-slate-400">User</p>
                                        <p className="text-sm text-white font-semibold">{selectedRequest.user_id || 'Unknown'}</p>
                                    </div>
                                    <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                                        <p className="text-xs text-slate-400">Type</p>
                                        <p className="text-sm text-white font-semibold">{(selectedRequest.media_type || 'image').toUpperCase()}</p>
                                    </div>
                                </div>

                                {/* Severity badge */}
                                {selectedRequest.judge?.accident_severity && (
                                    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${SEVERITY_COLORS[selectedRequest.judge.accident_severity] || SEVERITY_COLORS['none']}`}>
                                        <Siren className="w-5 h-5 shrink-0" />
                                        <div>
                                            <p className="text-xs opacity-70 uppercase tracking-wider">Accident Severity</p>
                                            <p className="font-bold capitalize">{selectedRequest.judge.accident_severity}</p>
                                        </div>
                                    </div>
                                )}

                                {/* Source media */}
                                <div className="rounded-xl bg-white/5 border border-white/10 p-3 space-y-2">
                                    <p className="text-xs text-slate-400">Source File</p>
                                    {selectedRequest.media_type === 'video' ? (
                                        (() => {
                                            const src = toMediaUrl(selectedRequest.video_path);
                                            if (!src) return <p className="text-slate-400 text-xs">No source video found.</p>;
                                            return <video controls className="w-full rounded-lg border border-white/10 bg-black/40" src={src} />;
                                        })()
                                    ) : (
                                        (() => {
                                            const src = toMediaUrl(selectedRequest.video_path);
                                            if (!src) return <p className="text-slate-400 text-xs">No source image found.</p>;
                                            return <img src={src} alt="Source" className="w-full rounded-lg border border-white/10" />;
                                        })()
                                    )}
                                </div>

                                {/* Processed / annotated output — LIVE ANNOTATED VIDEO */}
                                <div className="rounded-xl bg-white/5 border border-white/10 p-3 space-y-2">
                                    <div className="flex items-center gap-2">
                                        <p className="text-xs text-slate-400">Annotated Detection Output</p>
                                        <span className="text-[10px] px-1.5 py-0.5 bg-cyan-500/20 text-cyan-300 rounded-full border border-cyan-500/20">LIVE BOXES</span>
                                    </div>
                                    {selectedRequest.media_type === 'video' ? (
                                        (() => {
                                            const src = toMediaUrl(selectedRequest.processed_video);
                                            if (!src) return <p className="text-slate-400 text-xs">No processed video found.</p>;
                                            return (
                                                <video
                                                    controls
                                                    autoPlay
                                                    loop
                                                    muted
                                                    playsInline
                                                    className="w-full rounded-lg border border-white/10 bg-black/40"
                                                    src={src}
                                                />
                                            );
                                        })()
                                    ) : (
                                        (() => {
                                            const src = toMediaUrl(selectedRequest.processed_video);
                                            if (!src) return <p className="text-slate-400 text-xs">No processed image found.</p>;
                                            return <img src={src} alt="Detection Output" className="w-full rounded-lg border border-white/10" />;
                                        })()
                                    )}
                                    <div className="flex flex-wrap gap-2 text-xs mt-1">
                                        {[
                                            { label: 'Vehicle', color: '#2dd4a0' },
                                            { label: 'Violation', color: '#e87830' },
                                            { label: 'Accident', color: '#ef4444' },
                                        ].map((l) => (
                                            <span key={l.label} className="flex items-center gap-1">
                                                <span className="w-2.5 h-2.5 rounded-sm border" style={{ borderColor: l.color, background: l.color + '30' }} />
                                                <span className="text-slate-400">{l.label}</span>
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                {/* Detection stats */}
                                {selectedRequest.detection && (
                                    <>
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                            {[
                                                ['Vehicles', selectedRequest.detection.vehicles ?? 0],
                                                ['Pedestrians', selectedRequest.detection.pedestrians ?? 0],
                                                ['Violations', selectedRequest.detection.violations ?? 0],
                                                ['Accidents', selectedRequest.detection.accidents ?? 0],
                                                ['Risk Score', selectedRequest.detection.risk_score ?? 0],
                                                ['Confidence', `${Math.round((selectedRequest.detection.confidence ?? 0) * 100)}%`],
                                                ['Frames Analyzed', selectedRequest.detection.frames_analyzed ?? 0],
                                                ['Total Frames', selectedRequest.detection.total_frames ?? 0],
                                                ['Analysis FPS', selectedRequest.detection.analysis_sample_fps ?? 0],
                                                ['Duration', `${selectedRequest.detection.duration_seconds ?? 0}s`],
                                            ].map(([label, value]) => (
                                                <div key={label} className="rounded-xl bg-white/5 border border-white/10 p-2 text-center">
                                                    <p className="text-[11px] text-slate-400">{label}</p>
                                                    <p className="text-sm text-white font-semibold">{value}</p>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Violation fines (from judge) */}
                                        {(selectedRequest.judge?.violation_judgment || selectedRequest.detection.violation_types || []).length > 0 && (
                                            <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-3">
                                                <div className="flex items-center gap-2 mb-3">
                                                    <Scale className="w-4 h-4 text-amber-400" />
                                                    <p className="text-sm font-semibold text-white">Violations & Legal Penalties</p>
                                                </div>
                                                <div className="space-y-2">
                                                    {(selectedRequest.judge?.violation_judgment || (selectedRequest.detection.violation_types || []).map(v => ({ label: v.label, count: v.count }))).map((v: ViolationJudge, idx: number) => (
                                                        <div key={`${v.label}-${idx}`} className="rounded-lg bg-white/5 border border-white/10 p-3">
                                                            <div className="flex items-center justify-between mb-1">
                                                                <p className="text-sm font-medium text-amber-200">{(v.label || 'Unknown').replace(/_/g, ' ')}</p>
                                                                <span className="text-xs text-amber-300 font-bold">×{v.count ?? 0}</span>
                                                            </div>
                                                            {v.fine && (
                                                                <div className="flex items-center gap-1.5 mb-1">
                                                                    <DollarSign className="w-3 h-3 text-emerald-400" />
                                                                    <span className="text-xs text-emerald-300">{v.fine}</span>
                                                                </div>
                                                            )}
                                                            {v.law && <p className="text-xs text-slate-400">{v.law}</p>}
                                                            {v.ipc && <p className="text-xs text-blue-300 mt-1">{v.ipc}</p>}
                                                            {v.jail && (
                                                                <p className="text-xs text-red-300 mt-1 flex items-center gap-1">
                                                                    <Clock3 className="w-3 h-3" /> {v.jail}
                                                                </p>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Model output details for admin review */}
                                        <div className="grid gap-3 lg:grid-cols-2">
                                            <div className="rounded-xl bg-rose-500/5 border border-rose-500/20 p-3">
                                                <div className="flex items-center gap-2 mb-3">
                                                    <Siren className="w-4 h-4 text-rose-400" />
                                                    <p className="text-sm font-semibold text-white">Accident Findings</p>
                                                </div>
                                                {(selectedRequest.detection.events || []).filter((event) => String(event.type || '').toLowerCase() === 'accident').length > 0 ? (
                                                    <div className="space-y-2">
                                                        {(selectedRequest.detection.events || [])
                                                            .filter((event) => String(event.type || '').toLowerCase() === 'accident')
                                                            .map((event, idx) => (
                                                                <div key={`accident-${idx}`} className="rounded-lg bg-white/5 border border-white/10 p-3">
                                                                    <p className="text-sm font-medium text-rose-200">Accident Occurred</p>
                                                                    <p className="text-xs text-slate-300 mt-1">{formatEventSummary(event)}</p>
                                                                </div>
                                                            ))}
                                                    </div>
                                                ) : (
                                                    <p className="text-sm text-emerald-300">No accident detected in the analyzed evidence.</p>
                                                )}
                                            </div>

                                            <div className="rounded-xl bg-cyan-500/5 border border-cyan-500/20 p-3">
                                                <div className="flex items-center gap-2 mb-3">
                                                    <Eye className="w-4 h-4 text-cyan-400" />
                                                    <p className="text-sm font-semibold text-white">Model Output Events</p>
                                                </div>
                                                {(selectedRequest.detection.events || []).filter((event) => String(event.type || '').toLowerCase() !== 'accident').length > 0 ? (
                                                    <div className="space-y-2 max-h-80 overflow-auto pr-1">
                                                        {(selectedRequest.detection.events || [])
                                                            .filter((event) => String(event.type || '').toLowerCase() !== 'accident')
                                                            .map((event, idx) => (
                                                                <div key={`event-${idx}`} className="rounded-lg bg-white/5 border border-white/10 p-3">
                                                                    <div className="flex items-center justify-between gap-3">
                                                                        <p className="text-sm font-medium text-cyan-200">{formatEventLabel(event.type)}</p>
                                                                        {'count' in event && typeof event.count === 'number' ? (
                                                                            <span className="text-xs text-cyan-300 font-semibold">x{event.count}</span>
                                                                        ) : null}
                                                                    </div>
                                                                    <p className="text-xs text-slate-300 mt-1">{formatEventSummary(event)}</p>
                                                                </div>
                                                            ))}
                                                    </div>
                                                ) : (
                                                    <p className="text-sm text-slate-300">No violation events were recorded in the analyzed evidence.</p>
                                                )}
                                            </div>
                                        </div>
                                    </>
                                )}

                                {/* LLM Judge Verdict */}
                                {selectedRequest.llm_judge && (
                                    <div className="rounded-xl bg-indigo-500/5 border border-indigo-500/20 p-3">
                                        <div className="flex items-center gap-2 mb-2">
                                            <BookOpen className="w-4 h-4 text-indigo-400" />
                                            <p className="text-sm font-semibold text-white">AI Judge Verdict</p>
                                            {selectedRequest.llm_judge.model && (
                                                <span className="ml-auto text-xs text-slate-500">{selectedRequest.llm_judge.model}</span>
                                            )}
                                        </div>
                                        <div className="flex gap-4 mb-2">
                                            <span className="text-sm text-indigo-200 font-medium capitalize">{selectedRequest.llm_judge.verdict || 'N/A'}</span>
                                            {typeof selectedRequest.llm_judge.confidence === 'number' && (
                                                <span className="text-sm text-slate-400">{Math.round(selectedRequest.llm_judge.confidence * 100)}% confidence</span>
                                            )}
                                        </div>
                                        {selectedRequest.llm_judge.summary && (
                                            <p className="text-xs text-slate-300 leading-relaxed">{selectedRequest.llm_judge.summary}</p>
                                        )}
                                    </div>
                                )}

                                {/* Description */}
                                {selectedRequest.description && (
                                    <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                                        <p className="text-xs text-slate-400 mb-1">Description</p>
                                        <p className="text-sm text-slate-200">{selectedRequest.description}</p>
                                    </div>
                                )}

                                {/* Actions */}
                                <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10">
                                    {selectedRequest.status === 'pending' && (
                                        <>
                                            <button
                                                onClick={() => updateStatus(selectedRequest.id, 'approved')}
                                                className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 text-white font-semibold text-sm flex items-center gap-2"
                                            >
                                                <CheckCircle2 className="w-4 h-4" /> Approve
                                            </button>
                                            <button
                                                onClick={() => updateStatus(selectedRequest.id, 'rejected')}
                                                className="px-4 py-2 rounded-xl bg-gradient-to-r from-rose-500 to-red-500 text-white font-semibold text-sm flex items-center gap-2"
                                            >
                                                <XCircle className="w-4 h-4" /> Reject
                                            </button>
                                        </>
                                    )}

                                    {/* Send Emergency WhatsApp (admin decision for accidents) */}
                                    {(selectedRequest.detection?.accidents ?? 0) > 0 && (
                                        <button
                                            onClick={() => handleSendEmergencyWhatsApp(selectedRequest)}
                                            disabled={emergencySendingFor === selectedRequest.id || emergencySentFor.has(selectedRequest.id)}
                                            className={`px-4 py-2 rounded-xl font-semibold text-sm flex items-center gap-2 transition-all disabled:opacity-60 ${emergencySentFor.has(selectedRequest.id)
                                                ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400'
                                                : 'bg-gradient-to-r from-red-600 to-rose-500 text-white hover:from-red-500 hover:to-rose-400'}`}
                                        >
                                            {emergencySendingFor === selectedRequest.id ? (
                                                <><Loader className="w-4 h-4 animate-spin" /> Sending...</>
                                            ) : emergencySentFor.has(selectedRequest.id) ? (
                                                <><CheckCircle2 className="w-4 h-4" /> WhatsApp Sent!</>
                                            ) : (
                                                <><MessageCircle className="w-4 h-4" /> Send Emergency WhatsApp</>
                                            )}
                                        </button>
                                    )}

                                    <div className="px-3 py-2 rounded-xl bg-white/5 text-slate-400 text-xs flex items-center gap-2">
                                        <Clock3 className="w-3 h-3" />
                                        Syncs to user reports/dashboard
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
