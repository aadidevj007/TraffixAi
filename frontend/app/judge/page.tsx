'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    AlertTriangle, Car, CheckCircle2, ShieldAlert, User, MapPin, Gavel,
    Scale, DollarSign, BookOpen, Clock, ArrowLeft, LayoutDashboard,
    Siren, Phone, FileText, ShieldX, Gauge, UserX, Crosshair, BadgeAlert,
    Info, Send, Wifi, WifiOff,
} from 'lucide-react';
import { clearUploadSession, readUploadSession, type MediaType } from '@/lib/uploadGate';
import { getAnalysisResult } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────
type ViolationJudge = {
    label: string;
    count: number;
    fine: string;
    law: string;
    ipc?: string;
    jail?: string;
    consequence?: string;
};

type JudgePayload = {
    accident_severity?: 'none' | 'low' | 'medium' | 'high';
    violation_judgment?: ViolationJudge[];
    admin_forwarded?: boolean;
    emergency_whatsapp?: { sent?: boolean; sid?: string; reason?: string; to?: string } | null;
};

type ResultPayload = {
    id?: string;
    media_type?: MediaType;
    vehicles?: number;
    pedestrians?: number;
    violations?: number;
    accidents?: number;
    risk_score?: number;
    location?: string;
    annotated_image?: string;
    processed_media_url?: string;
    analyzed_at?: string;
    llm_judge?: {
        verdict?: string;
        confidence?: number;
        summary?: string;
        recommended_action?: string;
        model?: string;
    };
    judge?: JudgePayload;
    violation_types?: Array<{ label: string; count: number }>;
    frames_analyzed?: number;
    duration_seconds?: number;
};

// ── Violation icon map ─────────────────────────────────────────────────────────
const VIOLATION_ICON: Record<string, React.ElementType> = {
    'No Helmet': ShieldX,
    'Speeding': Gauge,
    'Wrong Way': Car,
    'Signal Jump': AlertTriangle,
    'No Seatbelt': UserX,
    'Excess Riders': UserX,
    'Lane Change': Car,
    'Jaywalking': UserX,
    'Tailgating': Car,
    'Red Light': AlertTriangle,
    'Illegal U-Turn': Car,
    'Stopped Vehicle': Car,
    'Accident': Siren,
    'default': Crosshair,
};

// ── Severity config ─────────────────────────────────────────────────────────────
const SEVERITY_CONFIG = {
    none: { label: 'No Accident', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', pulse: false, desc: 'No accident detected. Report forwarded to admin for monitoring.' },
    low: { label: 'Low Severity', color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', pulse: false, desc: 'Minor incident detected. Report has been automatically sent to admin for review.' },
    medium: { label: 'Medium Severity', color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30', pulse: false, desc: 'Moderate accident risk. Report forwarded to admin — admin will decide if authorities need to be notified.' },
    high: { label: '🚨 HIGH SEVERITY', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/40', pulse: true, desc: 'High-risk accident detected! Emergency WhatsApp alert has been automatically sent to emergency services.' },
};

// ── Risk bar ────────────────────────────────────────────────────────────────────
function RiskMeter({ score }: { score: number }) {
    const color = score >= 70 ? 'from-red-600 to-red-400' : score >= 40 ? 'from-orange-600 to-amber-400' : 'from-emerald-600 to-emerald-400';
    const textColor = score >= 70 ? 'text-red-400' : score >= 40 ? 'text-amber-400' : 'text-emerald-400';
    return (
        <div className="space-y-2">
            <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">Overall Risk Score</span>
                <span className={`text-xl font-display font-bold ${textColor}`}>{score}<span className="text-sm font-normal text-slate-500">/100</span></span>
            </div>
            <div className="h-3 bg-white/5 rounded-full overflow-hidden border border-white/10">
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${score}%` }}
                    transition={{ duration: 1.2, ease: 'easeOut' }}
                    className={`h-full bg-gradient-to-r ${color} rounded-full`}
                />
            </div>
        </div>
    );
}

// ── Stat card ───────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color, border }: {
    icon: React.ElementType; label: string; value: number | string;
    color: string; border: string;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className={`glass-card p-4 border ${border} flex flex-col gap-1`}
        >
            <Icon className={`w-5 h-5 ${color} mb-1`} />
            <p className={`text-2xl font-display font-bold ${color}`}>{value}</p>
            <p className="text-xs text-slate-400">{label}</p>
        </motion.div>
    );
}

// ── Violation Card ──────────────────────────────────────────────────────────────
function ViolationCard({ v, index }: { v: ViolationJudge; index: number }) {
    const [expanded, setExpanded] = useState(false);
    const Icon = VIOLATION_ICON[v.label] ?? VIOLATION_ICON['default'];

    return (
        <motion.div
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.07 }}
            className="border border-amber-500/20 rounded-2xl overflow-hidden bg-amber-500/5"
        >
            {/* Header Row */}
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center gap-4 p-4 hover:bg-white/5 transition-colors text-left"
            >
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold">{v.label}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{v.law}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 text-sm font-bold">×{v.count}</span>
                    <span className="text-xs text-slate-400">{expanded ? '▲' : '▼'}</span>
                </div>
            </button>

            {/* Fine badge always visible */}
            <div className="px-4 pb-3 flex items-center gap-2">
                <DollarSign className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="text-sm text-emerald-300 font-medium">{v.fine}</span>
            </div>

            {/* Expanded legal details */}
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                    >
                        <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
                            {/* IPC Section */}
                            {v.ipc && (
                                <div className="flex gap-3">
                                    <Scale className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-xs text-slate-500 uppercase tracking-wider mb-0.5">IPC Section</p>
                                        <p className="text-sm text-blue-200">{v.ipc}</p>
                                    </div>
                                </div>
                            )}
                            {/* Jail Time */}
                            {v.jail && (
                                <div className="flex gap-3">
                                    <Clock className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-xs text-slate-500 uppercase tracking-wider mb-0.5">Imprisonment</p>
                                        <p className="text-sm text-red-200">{v.jail}</p>
                                    </div>
                                </div>
                            )}
                            {/* Consequence */}
                            {v.consequence && (
                                <div className="flex gap-3">
                                    <Info className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-xs text-slate-500 uppercase tracking-wider mb-0.5">Consequence</p>
                                        <p className="text-sm text-slate-300">{v.consequence}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

// ── Main Page ───────────────────────────────────────────────────────────────────
export default function VerdictCenterPage() {
    const router = useRouter();
    const params = useSearchParams();
    const token = params.get('token') || '';
    const reportId = params.get('reportId') || '';
    const [mediaType, setMediaType] = useState<MediaType>('image');
    const [fileName, setFileName] = useState('');
    const [result, setResult] = useState<ResultPayload | null>(null);

    useEffect(() => {
        let alive = true;
        const load = async () => {
            const session = readUploadSession(token);
            if (session) {
                if (!alive) return;
                setMediaType(session.mediaType);
                setFileName(session.fileName);
                setResult(session.result as ResultPayload);
                return;
            }

            if (reportId) {
                try {
                    const backendResult = await getAnalysisResult(reportId);
                    if (!alive) return;
                    const media = (backendResult?.media_type || 'image') as MediaType;
                    setMediaType(media);
                    setFileName(`${media}-analysis`);
                    setResult(backendResult as ResultPayload);
                    return;
                } catch {
                    // fall through to redirect
                }
            }

            if (alive) router.replace('/upload');
        };
        load();
        return () => {
            alive = false;
        };
    }, [router, token, reportId]);

    const severity = (result?.judge?.accident_severity || 'none') as keyof typeof SEVERITY_CONFIG;
    const sevCfg = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.none;
    const violations = result?.judge?.violation_judgment || [];
    const whatsapp = result?.judge?.emergency_whatsapp;
    const llm = result?.llm_judge;
    const riskScore = typeof result?.risk_score === 'number' ? result.risk_score : 0;

    if (!result) {
        return (
            <div className="min-h-screen bg-dark-900 pt-24 flex items-center justify-center">
                <div className="text-center space-y-4">
                    <div className="w-10 h-10 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="text-slate-400">Loading verdict...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-dark-900 pt-16 pb-16">
            {/* ── Header ── */}
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950/60 to-slate-900 border-b border-indigo-500/20 px-6 py-6">
                <div className="container-max">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <Gavel className="w-6 h-6 text-indigo-400" />
                                <p className="text-xs text-indigo-300 uppercase tracking-[0.2em] font-medium">Verdict Center</p>
                            </div>
                            <h1 className="text-2xl md:text-3xl font-display font-bold text-white">
                                TraffixAI Verdict
                            </h1>
                            <div className="flex items-center gap-4 mt-2 flex-wrap">
                                <span className="text-sm text-slate-400 flex items-center gap-1.5">
                                    <FileText className="w-3.5 h-3.5" />{fileName}
                                </span>
                                <span className="text-sm text-slate-400 capitalize">{mediaType}</span>
                                {result.location && (
                                    <span className="text-sm text-slate-300 flex items-center gap-1.5">
                                        <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                                        {result.location}
                                    </span>
                                )}
                                {result.analyzed_at && (
                                    <span className="text-xs text-slate-500">
                                        {new Date(result.analyzed_at).toLocaleString()}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                            <button onClick={() => router.push('/upload')} className="btn-secondary py-2 px-3 flex items-center gap-2 text-sm">
                                <ArrowLeft className="w-4 h-4" /> New Upload
                            </button>
                            <button onClick={() => { clearUploadSession(); router.push('/dashboard'); }} className="btn-primary py-2 px-3 flex items-center gap-2 text-sm">
                                <LayoutDashboard className="w-4 h-4" /> Dashboard
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="container-max py-8 space-y-6">

                {/* ── Stats Row ── */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <StatCard icon={Car} label="Vehicles" value={result.vehicles ?? 0} color="text-cyan-400" border="border-cyan-500/20" />
                    <StatCard icon={User} label="Pedestrians" value={result.pedestrians ?? 0} color="text-blue-400" border="border-blue-500/20" />
                    <StatCard icon={ShieldAlert} label="Violations" value={result.violations ?? 0} color="text-amber-400" border="border-amber-500/30" />
                    <StatCard icon={AlertTriangle} label="Accident Status" value={(result.accidents ?? 0) > 0 ? 'Occurred' : 'No Accident'}
                        color={result.accidents ? 'text-red-400' : 'text-emerald-400'}
                        border={result.accidents ? 'border-red-500/30' : 'border-emerald-500/20'} />
                </div>

                {/* ── Violation Judgment ── */}
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-6 space-y-4">
                    <div className="flex items-center gap-3 mb-1">
                        <Scale className="w-5 h-5 text-amber-400" />
                        <h2 className="font-semibold text-white">Violation Judgments & Legal Consequences</h2>
                        {violations.length > 0 && (
                            <span className="ml-auto px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 text-xs font-medium border border-amber-500/20">
                                {violations.length} violation{violations.length > 1 ? 's' : ''}
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-slate-500 mb-3">Click a violation card to see IPC sections, imprisonment terms & legal consequences.</p>
                    {violations.length > 0 ? (
                        <div className="space-y-3">
                            {violations.map((v, i) => (
                                <ViolationCard key={`${v.label}-${i}`} v={v} index={i} />
                            ))}
                        </div>
                    ) : (
                        <div className="flex items-center gap-3 py-6 justify-center">
                            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                            <p className="text-slate-400 text-sm">No violations detected in this footage.</p>
                        </div>
                    )}
                </motion.div>

                {/* ── Accident Severity & Action Taken ── */}
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                    className={`glass-card p-6 border ${sevCfg.border} ${sevCfg.bg}`}
                >
                    <div className="flex items-start gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${sevCfg.border} ${sevCfg.bg} shrink-0 ${sevCfg.pulse ? 'animate-pulse' : ''}`}>
                            <Siren className={`w-6 h-6 ${sevCfg.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Accident Severity</p>
                            <p className={`text-2xl font-display font-bold ${sevCfg.color}`}>{sevCfg.label}</p>
                            <p className="text-sm text-slate-300 mt-2">{sevCfg.desc}</p>

                            <div className="flex flex-wrap gap-3 mt-4">
                                {/* Admin forwarded badge */}
                                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border ${result.judge?.admin_forwarded
                                    ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                                    : 'bg-white/5 border-white/10 text-slate-400'}`}>
                                    <Send className="w-3.5 h-3.5" />
                                    {result.judge?.admin_forwarded ? 'Forwarded to Admin ✓' : 'Not forwarded to Admin'}
                                </div>
                                {/* WhatsApp status badge */}
                                {whatsapp && (
                                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border ${whatsapp.sent
                                        ? 'bg-green-500/10 border-green-500/30 text-green-300'
                                        : 'bg-slate-500/10 border-slate-500/30 text-slate-400'}`}>
                                        {whatsapp.sent ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                                        {whatsapp.sent
                                            ? `Emergency WhatsApp Sent to ${whatsapp.to?.replace('whatsapp:', '') || '+916374411016'}`
                                            : `WhatsApp not sent${whatsapp.reason ? ` (${whatsapp.reason})` : ''}`}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* ── Risk Score ── */}
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <BadgeAlert className="w-5 h-5 text-slate-400" />
                        <h2 className="font-semibold text-white">Risk Assessment</h2>
                    </div>
                    <RiskMeter score={riskScore} />
                </motion.div>

                {/* ── LLM Judge Reply ── */}
                {llm && (
                    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="glass-card p-6 border border-indigo-500/20 bg-indigo-500/5">
                        <div className="flex items-center gap-3 mb-4">
                            <BookOpen className="w-5 h-5 text-indigo-400" />
                            <h2 className="font-semibold text-white">AI Judge Verdict</h2>
                            {llm.model && <span className="ml-auto text-xs text-slate-500 font-mono">{llm.model}</span>}
                        </div>
                        <div className="grid md:grid-cols-2 gap-4 mb-4">
                            <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                                <p className="text-xs text-slate-500 mb-1">Verdict</p>
                                <p className="text-indigo-200 font-semibold capitalize">{llm.verdict || 'N/A'}</p>
                            </div>
                            <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                                <p className="text-xs text-slate-500 mb-1">Confidence</p>
                                <p className="text-indigo-200 font-semibold">
                                    {typeof llm.confidence === 'number' ? `${Math.round(llm.confidence * 100)}%` : 'N/A'}
                                </p>
                            </div>
                        </div>
                        {llm.summary && (
                            <div className="rounded-xl bg-indigo-500/5 border border-indigo-500/15 p-4">
                                <p className="text-sm text-slate-300 leading-relaxed">{llm.summary}</p>
                            </div>
                        )}
                        {llm.recommended_action && (
                            <p className="text-xs text-slate-500 mt-3">
                                Recommended action: <span className="text-indigo-300 capitalize">{llm.recommended_action.replace(/_/g, ' ')}</span>
                            </p>
                        )}
                    </motion.div>
                )}

                {/* ── Location Info ── */}
                {result.location && (
                    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-card p-4 flex items-center gap-4">
                        <MapPin className="w-5 h-5 text-cyan-400 shrink-0" />
                        <div>
                            <p className="text-xs text-slate-500">Incident Location</p>
                            <p className="text-white font-medium">{result.location}</p>
                        </div>
                        {severity === 'high' && (
                            <div className="ml-auto flex items-center gap-2 text-sm text-red-300">
                                <Phone className="w-4 h-4" />
                                Emergency alerted at this location
                            </div>
                        )}
                    </motion.div>
                )}

                {/* ── Actions ── */}
                <div className="flex flex-wrap gap-3">
                    <button
                        onClick={() => router.push('/upload')}
                        className="btn-primary flex items-center gap-2"
                    >
                        <ArrowLeft className="w-4 h-4" /> New Analysis
                    </button>
                    <button
                        onClick={() => { clearUploadSession(); router.push('/dashboard'); }}
                        className="btn-secondary flex items-center gap-2"
                    >
                        <LayoutDashboard className="w-4 h-4" /> Go to Dashboard
                    </button>
                </div>
            </div>
        </div>
    );
}
