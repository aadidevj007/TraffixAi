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
import { toAbsoluteMediaUrl, toDisplayImageSrc, toProcessedPlayableUrl } from '@/lib/media';

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
    processed_media_url?: string;
    processed_playable_url?: string;
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

function groupEventsBySummary(events: Array<Record<string, unknown>>) {
    return events.reduce<Array<{ label: string; summary: string; count: number; event: Record<string, unknown> }>>((groups, event) => {
        const label = formatEventLabel(event.type);
        const summary = formatEventSummary(event) || 'Detected in analyzed evidence';
        const existing = groups.find((group) => group.label === label && group.summary === summary);
        if (existing) {
            existing.count += 1;
            return groups;
        }
        groups.push({ label, summary, count: 1, event });
        return groups;
    }, []);
}

function toDateLabel(createdAt: string | undefined): string {
    if (!createdAt) return 'N/A';
    const parsed = new Date(createdAt);
    if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleString();
    return 'N/A';
}

const TAB_COPY: Record<AdminTab, { eyebrow: string; title: string; description: string }> = {
    dashboard: {
        eyebrow: 'Command Surface',
        title: 'Admin Dashboard',
        description: 'Monitor the live queue, review evidence, approve incidents, and coordinate emergency escalation from a single operational dashboard.',
    },
    pending: {
        eyebrow: 'Review Queue',
        title: 'Pending Requests',
        description: 'Inspect newly forwarded incidents, review processed evidence, and approve or reject submissions awaiting action.',
    },
    accepted: {
        eyebrow: 'Archive Queue',
        title: 'Accepted Requests',
        description: 'Audit approved reports, inspect processed outputs, and validate the final evidence trail for accepted incidents.',
    },
    all: {
        eyebrow: 'Incident Ledger',
        title: 'All Requests',
        description: 'Browse the full admin history across pending, accepted, and rejected requests with their complete analyzed output.',
    },
};

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
        setSelectedRequestId(null);
    }, [searchParams]);

    const activeTab: AdminTab = (() => {
        const tab = (searchParams.get('tab') || 'dashboard') as AdminTab;
        return tab === 'pending' || tab === 'accepted' || tab === 'all' ? tab : 'dashboard';
    })();

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
    useEffect(() => {
        if (visibleRequests.length === 0) {
            setSelectedRequestId(null);
            return;
        }
        if (!selectedRequestId || !visibleRequests.some((r) => r.id === selectedRequestId)) {
            setSelectedRequestId(visibleRequests[0].id);
        }
    }, [visibleRequests, selectedRequestId]);

    const selectedRequest = useMemo(
        () => visibleRequests.find((r) => r.id === selectedRequestId) ?? null,
        [visibleRequests, selectedRequestId],
    );
    const selectedProcessedMedia = useMemo(
        () => {
            const processedUrl =
                toAbsoluteMediaUrl(selectedRequest?.processed_playable_url)
                || toProcessedPlayableUrl(selectedRequest?.processed_media_url)
                || toProcessedPlayableUrl(selectedRequest?.processed_video)
                || toAbsoluteMediaUrl(selectedRequest?.processed_media_url)
                || toAbsoluteMediaUrl(selectedRequest?.processed_video);

            if (processedUrl) return processedUrl;

            return selectedRequest?.media_type === 'image'
                ? toDisplayImageSrc(selectedRequest?.detection?.annotated_image)
                : toDisplayImageSrc(selectedRequest?.detection?.annotated_frames?.[0] || selectedRequest?.detection?.annotated_image);
        },
        [selectedRequest],
    );
    const selectedSourceMedia = useMemo(
        () => toAbsoluteMediaUrl(selectedRequest?.video_path),
        [selectedRequest],
    );
    const accidentEventGroups = useMemo(
        () => groupEventsBySummary(
            (selectedRequest?.detection?.events || []).filter((event) => String(event.type || '').toLowerCase() === 'accident'),
        ),
        [selectedRequest],
    );
    const modelEventGroups = useMemo(
        () => groupEventsBySummary(
            (selectedRequest?.detection?.events || []).filter((event) => String(event.type || '').toLowerCase() !== 'accident'),
        ),
        [selectedRequest],
    );
    const pageCopy = TAB_COPY[activeTab];

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
                        <p className="text-[11px] uppercase tracking-[0.34em] text-red-200/75">{pageCopy.eyebrow}</p>
                        <h1 className="mt-2 text-3xl font-display font-bold text-white">{pageCopy.title}</h1>
                        <p className="text-slate-300 text-sm mt-2 max-w-2xl">{pageCopy.description}</p>
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
                                {activeTab === 'dashboard' ? 'Live Review Queue' : pageCopy.title}
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
                                    <p className="text-xs text-slate-400">Original Submission</p>
                                    {selectedRequest.media_type === 'video' ? (
                                        (() => {
                                            const src = selectedSourceMedia;
                                            if (!src) return <p className="text-slate-400 text-xs">No source video found.</p>;
                                            return (
                                                <video controls playsInline preload="metadata" className="w-full rounded-lg border border-white/10 bg-black/40">
                                                    <source src={src} />
                                                </video>
                                            );
                                        })()
                                    ) : (
                                        (() => {
                                            const src = selectedSourceMedia;
                                            if (!src) return <p className="text-slate-400 text-xs">No source image found.</p>;
                                            return <img src={src} alt="Source" className="w-full rounded-lg border border-white/10" />;
                                        })()
                                    )}
                                </div>

                                {/* Processed media from /processed */}
                                <div className="rounded-xl bg-white/5 border border-white/10 p-3 space-y-2">
                                    <div className="flex items-center gap-2">
                                        <p className="text-xs text-slate-400">Processed Evidence</p>
                                        <span className="text-[10px] px-1.5 py-0.5 bg-red-500/15 text-red-100 rounded-full border border-red-500/20">
                                            {selectedProcessedMedia?.includes('/processed-playable/') ? '/processed-playable' : '/processed'}
                                        </span>
                                    </div>
                                    {selectedProcessedMedia ? (
                                        selectedRequest.media_type === 'video' ? (
                                            selectedProcessedMedia.startsWith('data:image/') ? (
                                                <img src={selectedProcessedMedia} alt="Processed evidence preview" className="w-full rounded-lg border border-white/10 bg-black/40" />
                                            ) : (
                                                <video controls playsInline preload="metadata" className="w-full rounded-lg border border-white/10 bg-black/40">
                                                    <source src={selectedProcessedMedia} />
                                                </video>
                                            )
                                        ) : (
                                            <img src={selectedProcessedMedia} alt="Processed evidence" className="w-full rounded-lg border border-white/10 bg-black/40" />
                                        )
                                    ) : (
                                        <p className="text-slate-400 text-xs">No processed media was found for this request.</p>
                                    )}
                                    <p className="text-xs text-slate-400">
                                        This preview uses the processed asset saved by the backend and serves a browser-playable copy when needed.
                                        {selectedProcessedMedia && !selectedProcessedMedia.startsWith('data:') && (
                                            <>
                                                {' '}
                                                <a className="text-red-200 underline underline-offset-2" href={selectedProcessedMedia} target="_blank" rel="noreferrer">
                                                    Open media
                                                </a>
                                            </>
                                        )}
                                    </p>
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
                                        <div className="grid items-start gap-3 lg:grid-cols-2">
                                            <div className="rounded-xl bg-rose-500/5 border border-rose-500/20 p-3">
                                                <div className="flex items-center gap-2 mb-3">
                                                    <Siren className="w-4 h-4 text-rose-400 shrink-0" />
                                                    <p className="text-sm font-semibold text-white">Accident Findings</p>
                                                    {accidentEventGroups.length > 0 && (
                                                        <span className="ml-auto rounded-full border border-rose-400/25 bg-rose-500/10 px-2 py-0.5 text-[11px] font-semibold text-rose-100">
                                                            {accidentEventGroups.reduce((sum, group) => sum + group.count, 0)} events
                                                        </span>
                                                    )}
                                                </div>
                                                {accidentEventGroups.length > 0 ? (
                                                    <div className="max-h-72 space-y-2 overflow-auto pr-1">
                                                        {accidentEventGroups.map((group, idx) => (
                                                            <div key={`accident-${idx}`} className="rounded-lg bg-white/5 border border-white/10 p-3">
                                                                <div className="flex items-start justify-between gap-3">
                                                                    <p className="text-sm font-medium text-rose-200">Accident Occurred</p>
                                                                    {group.count > 1 && (
                                                                        <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-semibold text-rose-100">
                                                                            x{group.count}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <p className="mt-1 text-xs leading-5 text-slate-300">{group.summary}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="text-sm text-emerald-300">No accident detected in the analyzed evidence.</p>
                                                )}
                                            </div>

                                            <div className="rounded-xl bg-red-500/5 border border-red-500/20 p-3">
                                                <div className="flex items-center gap-2 mb-3">
                                                    <Eye className="w-4 h-4 text-red-300 shrink-0" />
                                                    <p className="text-sm font-semibold text-white">Model Output Events</p>
                                                    {modelEventGroups.length > 0 && (
                                                        <span className="ml-auto rounded-full border border-red-400/25 bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold text-red-100">
                                                            {modelEventGroups.reduce((sum, group) => sum + group.count, 0)} events
                                                        </span>
                                                    )}
                                                </div>
                                                {modelEventGroups.length > 0 ? (
                                                    <div className="max-h-72 space-y-2 overflow-auto pr-1">
                                                        {modelEventGroups.map((group, idx) => (
                                                            <div key={`event-${idx}`} className="rounded-lg bg-white/5 border border-white/10 p-3">
                                                                <div className="flex items-start justify-between gap-3">
                                                                    <p className="text-sm font-medium text-red-100">{group.label}</p>
                                                                    <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-100">
                                                                        x{group.count}
                                                                    </span>
                                                                </div>
                                                                <p className="mt-1 text-xs leading-5 text-slate-300">{group.summary}</p>
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
                                                className="btn-primary from-emerald-600 via-emerald-500 to-green-500 px-4 py-2 text-sm flex items-center gap-2"
                                            >
                                                <CheckCircle2 className="w-4 h-4" /> Approve
                                            </button>
                                            <button
                                                onClick={() => updateStatus(selectedRequest.id, 'rejected')}
                                                className="btn-danger px-4 py-2 text-sm flex items-center gap-2"
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
                                                ? 'btn-secondary border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:border-emerald-400/60 hover:bg-emerald-500/20'
                                                : 'btn-primary from-red-700 via-red-600 to-rose-500'}`}
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
