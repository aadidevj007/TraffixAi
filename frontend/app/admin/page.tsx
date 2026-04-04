'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
    Activity,
    CheckCircle2,
    Clock3,
    Eye,
    Gauge,
    ListChecks,
    RefreshCw,
    XCircle,
    MapPin,
    Scale,
    BookOpen,
    DollarSign,
    Siren,
    MessageCircle,
    Loader,
    Orbit,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import AdminTrafficCharts from '@/components/charts/AdminTrafficCharts';
import { getAdminRequests, updateAdminRequestStatus, sendAdminEmergency } from '@/lib/api';
import { toAbsoluteMediaUrl, toDisplayImageSrc } from '@/lib/media';

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
        annotated_image?: string;
        annotated_frames?: string[];
    };
    judge?: JudgeData;
    llm_judge?: LLMJudge;
    created_at?: string;
};

type AdminTab = 'dashboard' | 'pending' | 'accepted' | 'all';

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
    const [selectedFrameIndex, setSelectedFrameIndex] = useState(0);
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

    useEffect(() => {
        setSelectedFrameIndex(0);
    }, [selectedRequestId]);

    const pendingRequests = useMemo(
        () => requests.filter((r) => r.status === 'pending'),
        [requests],
    );
    const acceptedRequests = useMemo(
        () => requests.filter((r) => r.status === 'approved'),
        [requests],
    );
    const rejectedRequests = useMemo(
        () => requests.filter((r) => r.status === 'rejected'),
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
                acc.risk += r.detection?.risk_score ?? 0;
                return acc;
            },
            { total: 0, pending: 0, approved: 0, rejected: 0, vehicles: 0, pedestrians: 0, violations: 0, accidents: 0, risk: 0 },
        );
    }, [requests]);

    const averageRisk = requests.length ? Math.round(summary.risk / requests.length) : 0;
    const emergencyCandidates = useMemo(
        () => requests.filter((r) => (r.detection?.accidents ?? 0) > 0 || (r.detection?.risk_score ?? 0) >= 75).slice(0, 4),
        [requests],
    );
    const latestApprovedLocation = acceptedRequests[0]?.location || 'No approved hotspots yet';

    const visibleRequests =
        activeTab === 'dashboard' || activeTab === 'pending'
            ? pendingRequests
            : activeTab === 'accepted'
                ? acceptedRequests
                : requests;
    const selectedRequest = useMemo(
        () => visibleRequests.find((r) => r.id === selectedRequestId) ?? null,
        [visibleRequests, selectedRequestId],
    );
    const selectedFrames = useMemo(
        () => (selectedRequest?.detection?.annotated_frames || [])
            .map((frame) => toDisplayImageSrc(frame))
            .filter((frame): frame is string => Boolean(frame)),
        [selectedRequest],
    );
    const selectedPrimaryFrame = selectedFrames[selectedFrameIndex]
        || toDisplayImageSrc(selectedRequest?.detection?.annotated_image)
        || null;

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
                toast.success('Emergency WhatsApp sent to +917593014047!');
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
                <div className="w-8 h-8 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-dark-900 pt-16">
            <div className="border-b border-red-500/15 bg-[linear-gradient(120deg,rgba(48,9,9,0.84),rgba(14,6,6,0.94),rgba(39,7,7,0.78))] px-6 py-6">
                <div className="container-max flex items-center justify-between">
                    <div>
                        <p className="text-[11px] uppercase tracking-[0.34em] text-red-200/75">Command Surface</p>
                        <h1 className="mt-2 text-3xl font-display font-bold text-white">Admin Dashboard</h1>
                        <p className="text-slate-300 text-sm mt-2 max-w-2xl">Monitor the live queue, review evidence, approve incidents, and coordinate emergency escalation from a single operational dashboard.</p>
                    </div>
                    <button onClick={fetchRequests} className="btn-secondary py-2 px-3">
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            <div className="container-max py-8 space-y-6">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {[
                        { label: 'Open Queue', value: summary.pending, note: 'Needs review now', icon: Clock3, accent: 'text-amber-200', box: 'border-amber-500/20 bg-[linear-gradient(155deg,rgba(245,158,11,0.12),rgba(15,23,42,0.08))]' },
                        { label: 'Accepted Reports', value: summary.approved, note: 'Ready for archive', icon: CheckCircle2, accent: 'text-emerald-200', box: 'border-emerald-500/20 bg-[linear-gradient(155deg,rgba(16,185,129,0.1),rgba(15,23,42,0.08))]' },
                        { label: 'Total Incidents', value: summary.total, note: 'All tracked requests', icon: ListChecks, accent: 'text-rose-100', box: 'border-red-500/20 bg-[linear-gradient(155deg,rgba(239,68,68,0.12),rgba(30,6,12,0.08))]' },
                        { label: 'Average Risk', value: `${averageRisk}%`, note: 'AI severity average', icon: Gauge, accent: 'text-cyan-200', box: 'border-cyan-500/20 bg-[linear-gradient(155deg,rgba(34,211,238,0.1),rgba(15,23,42,0.08))]' },
                    ].map(({ label, value, note, icon: Icon, accent, box }) => (
                        <div key={label} className={`rounded-[1.6rem] border p-5 shadow-[0_22px_60px_rgba(0,0,0,0.22)] ${box}`}>
                            <div className="flex items-center justify-between">
                                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">{label}</p>
                                <Icon className={`h-4 w-4 ${accent}`} />
                            </div>
                            <p className={`mt-4 text-3xl font-display font-bold ${accent}`}>{value}</p>
                            <p className="mt-1 text-xs text-slate-400">{note}</p>
                        </div>
                    ))}
                </div>

                {activeTab === 'dashboard' && (
                    <div className="space-y-6">
                        <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
                            <motion.section
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="glass-card overflow-hidden border border-red-500/20 shadow-[0_28px_80px_rgba(0,0,0,0.28)]"
                            >
                                <div className="relative p-6">
                                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(239,68,68,0.18),transparent_34%),linear-gradient(140deg,rgba(7,12,24,0.44),rgba(27,7,16,0.18))]" />
                                    <div className="relative z-10">
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <p className="text-xs uppercase tracking-[0.34em] text-cyan-200/75">Live Command Layer</p>
                                                <h2 className="mt-3 text-3xl font-display font-bold text-white">Citywide Traffic Oversight</h2>
                                                <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">
                                                    Monitor approvals, scan high-risk incidents, and keep emergency-ready reports in one operational surface.
                                                </p>
                                            </div>
                                            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 text-right">
                                                <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-200/70">Hotspot</p>
                                                <p className="mt-2 max-w-[12rem] text-sm font-semibold text-cyan-100">{latestApprovedLocation}</p>
                                            </div>
                                        </div>

                                        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                            {[
                                                { label: 'Open Queue', value: summary.pending, note: 'Awaiting review', icon: Clock3, tone: 'text-amber-200', box: 'border-amber-500/20 bg-amber-500/10' },
                                                { label: 'Average Risk', value: `${averageRisk}%`, note: 'Across all reports', icon: Gauge, tone: 'text-rose-100', box: 'border-red-500/20 bg-red-500/10' },
                                                { label: 'Accident Flags', value: summary.accidents, note: 'Emergency candidates', icon: Siren, tone: 'text-red-200', box: 'border-rose-500/20 bg-rose-500/10' },
                                                { label: 'Accepted Today', value: summary.approved, note: `${rejectedRequests.length} rejected`, icon: CheckCircle2, tone: 'text-emerald-200', box: 'border-emerald-500/20 bg-emerald-500/10' },
                                            ].map(({ label, value, note, icon: Icon, tone, box }) => (
                                                <div key={label} className={`rounded-2xl border p-4 ${box}`}>
                                                    <div className="flex items-center justify-between">
                                                        <p className="text-xs uppercase tracking-[0.26em] text-slate-400">{label}</p>
                                                        <Icon className={`h-4 w-4 ${tone}`} />
                                                    </div>
                                                    <p className={`mt-4 text-3xl font-display font-bold ${tone}`}>{value}</p>
                                                    <p className="mt-1 text-xs text-slate-400">{note}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </motion.section>

                            <motion.section
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.05 }}
                                className="glass-card border border-red-500/20 p-6"
                            >
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs uppercase tracking-[0.32em] text-red-200/75">Priority Feed</p>
                                        <h3 className="mt-2 text-xl font-display font-semibold text-white">Immediate Attention</h3>
                                    </div>
                                    <Orbit className="h-5 w-5 text-red-200" />
                                </div>
                                <div className="mt-6 space-y-3">
                                    {emergencyCandidates.length === 0 ? (
                                        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                                            No high-risk incidents are currently waiting in the queue.
                                        </div>
                                    ) : (
                                        emergencyCandidates.map((req) => (
                                            <button
                                                key={req.id}
                                                onClick={() => {
                                                    setActiveTab(req.status === 'approved' ? 'accepted' : req.status === 'pending' ? 'pending' : 'all');
                                                    setSelectedRequestId(req.id);
                                                }}
                                                className="w-full rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition-all hover:border-red-500/30 hover:bg-red-500/10"
                                            >
                                                <div className="flex items-center justify-between gap-3">
                                                    <div>
                                                        <p className="text-xs font-mono text-red-200">#{req.id.slice(0, 8).toUpperCase()}</p>
                                                        <p className="mt-1 text-sm font-semibold text-white">{req.location || 'Unknown location'}</p>
                                                    </div>
                                                    <span className="rounded-full bg-red-500/15 px-2.5 py-1 text-[11px] text-red-100">
                                                        Risk {req.detection?.risk_score ?? 0}
                                                    </span>
                                                </div>
                                                <p className="mt-2 text-xs text-slate-400">
                                                    {(req.media_type || 'image').toUpperCase()} · {(req.detection?.accidents ?? 0)} accidents · {(req.detection?.violations ?? 0)} violations
                                                </p>
                                            </button>
                                        ))
                                    )}
                                </div>
                            </motion.section>
                        </div>

                        <div className="grid gap-4 md:grid-cols-4">
                            {[
                                { label: 'Vehicles Tracked', value: summary.vehicles, accent: 'text-sky-200', icon: Activity },
                                { label: 'Pedestrians Seen', value: summary.pedestrians, accent: 'text-indigo-200', icon: Eye },
                                { label: 'Violations Logged', value: summary.violations, accent: 'text-orange-200', icon: Scale },
                                { label: 'Total Requests', value: summary.total, accent: 'text-red-100', icon: ListChecks },
                            ].map(({ label, value, accent, icon: Icon }) => (
                                <div key={label} className="glass-card border border-white/10 p-5">
                                    <div className="flex items-center justify-between">
                                        <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{label}</p>
                                        <Icon className={`h-4 w-4 ${accent}`} />
                                    </div>
                                    <p className={`mt-4 text-2xl font-display font-bold ${accent}`}>{value}</p>
                                </div>
                            ))}
                        </div>

                        <AdminTrafficCharts />
                    </div>
                )}

                <div className={`grid gap-5 ${selectedRequest ? 'lg:grid-cols-[360px_1fr]' : 'lg:grid-cols-1'}`}>
                        {/* Left list */}
                        <div className="glass-card border border-white/10 rounded-2xl p-4">
                            <h2 className="text-xl font-display font-semibold text-white mb-3">
                                {activeTab === 'dashboard'
                                    ? 'Live Review Queue'
                                    : activeTab === 'pending'
                                        ? 'Pending Requests'
                                        : activeTab === 'accepted'
                                            ? 'Accepted Requests'
                                            : 'All Requests'}
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
                                                    ? 'border-red-400/40 bg-red-500/10 shadow-[0_0_24px_rgba(239,68,68,0.16)]'
                                                    : 'border-white/10 bg-white/5 hover:border-red-500/20 hover:bg-white/10'}`}
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <p className="text-sm font-mono text-red-100">#{req.id.slice(0, 8).toUpperCase()}</p>
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
                                        <Eye className="w-5 h-5 text-red-200" />
                                        Request Details
                                    </h3>
                                    <p className="text-xs text-slate-400">{toDateLabel(selectedRequest.created_at)}</p>
                                </div>

                                {/* Location */}
                                {selectedRequest.location && (
                                    <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-red-500/5 border border-red-500/20">
                                        <MapPin className="w-4 h-4 text-red-300 shrink-0" />
                                        <span className="text-sm text-red-100 font-medium">{selectedRequest.location}</span>
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
                                            const src = toAbsoluteMediaUrl(selectedRequest.video_path);
                                            if (!src) return <p className="text-slate-400 text-xs">No source video found.</p>;
                                            return <video controls className="w-full rounded-lg border border-white/10 bg-black/40" src={src} />;
                                        })()
                                    ) : (
                                        (() => {
                                            const src = toAbsoluteMediaUrl(selectedRequest.video_path);
                                            if (!src) return <p className="text-slate-400 text-xs">No source image found.</p>;
                                            return <img src={src} alt="Source" className="w-full rounded-lg border border-white/10" />;
                                        })()
                                    )}
                                </div>

                                {/* Annotated evidence */}
                                <div className="rounded-xl bg-white/5 border border-white/10 p-3 space-y-2">
                                    <div className="flex items-center gap-2">
                                        <p className="text-xs text-slate-400">Annotated Detection Frames</p>
                                        <span className="text-[10px] px-1.5 py-0.5 bg-red-500/15 text-red-100 rounded-full border border-red-500/20">BOXED EVIDENCE</span>
                                    </div>
                                    {selectedPrimaryFrame ? (
                                        <img src={selectedPrimaryFrame} alt="Annotated evidence frame" className="w-full rounded-lg border border-white/10 bg-black/40" />
                                    ) : (
                                        <p className="text-slate-400 text-xs">No annotated evidence frames found.</p>
                                    )}
                                    {selectedFrames.length > 1 && (
                                        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                                            {selectedFrames.map((frame, index) => (
                                                <button
                                                    key={`admin-frame-${index}`}
                                                    onClick={() => setSelectedFrameIndex(index)}
                                                    className={`overflow-hidden rounded-lg border transition-all ${index === selectedFrameIndex ? 'border-cyan-400/60 ring-1 ring-cyan-400/40' : 'border-white/10 hover:border-red-400/30'}`}
                                                >
                                                    <img src={frame} alt={`Frame ${index + 1}`} className="h-24 w-full object-cover bg-black/40" />
                                                    <div className="border-t border-white/10 bg-black/30 px-2 py-1 text-[10px] text-slate-300">Frame {index + 1}</div>
                                                </button>
                                            ))}
                                        </div>
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

                                            <div className="rounded-xl bg-red-500/5 border border-red-500/20 p-3">
                                                <div className="flex items-center gap-2 mb-3">
                                                    <Eye className="w-4 h-4 text-red-300" />
                                                    <p className="text-sm font-semibold text-white">Model Output Events</p>
                                                </div>
                                                {(selectedRequest.detection.events || []).filter((event) => String(event.type || '').toLowerCase() !== 'accident').length > 0 ? (
                                                    <div className="space-y-2 max-h-80 overflow-auto pr-1">
                                                        {(selectedRequest.detection.events || [])
                                                            .filter((event) => String(event.type || '').toLowerCase() !== 'accident')
                                                            .map((event, idx) => (
                                                                <div key={`event-${idx}`} className="rounded-lg bg-white/5 border border-white/10 p-3">
                                                                    <div className="flex items-center justify-between gap-3">
                                                                        <p className="text-sm font-medium text-red-100">{formatEventLabel(event.type)}</p>
                                                                        {'count' in event && typeof event.count === 'number' ? (
                                                                            <span className="text-xs text-red-200 font-semibold">x{event.count}</span>
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
            </div>
        </div>
    );
}
