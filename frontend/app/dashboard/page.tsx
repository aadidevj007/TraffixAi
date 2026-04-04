'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
    Activity,
    AlertTriangle,
    CheckCircle,
    Eye,
    Gauge,
    ImageIcon,
    RefreshCw,
    ShieldCheck,
    Sparkles,
    Video,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import UserDensityChart from '@/components/charts/UserDensityChart';
import { getReports } from '@/lib/api';

type UploadRecord = {
    id: string;
    media_type?: 'image' | 'video';
    type?: 'image' | 'video';
    location: string;
    incidentType?: string;
    incident_type?: string;
    status: 'pending' | 'approved' | 'rejected' | 'active';
    detection?: {
        vehicles?: number;
        pedestrians?: number;
        accidents?: number;
        violations?: number;
        risk_score?: number;
    };
    created_at?: string;
    createdAt?: string;
};

export default function DashboardPage() {
    const { user, profile, loading: authLoading } = useAuth();
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [approved, setApproved] = useState<UploadRecord[]>([]);
    const [allUploads, setAllUploads] = useState<UploadRecord[]>([]);

    const fetchData = useCallback(async () => {
        if (!user?.uid) return;
        setLoading(true);
        try {
            const [allRes, approvedRes] = await Promise.all([
                getReports({ limit: 400 }),
                getReports({ limit: 400, status: 'approved' }),
            ]);
            setAllUploads((allRes?.reports || []) as UploadRecord[]);
            setApproved((approvedRes?.reports || []) as UploadRecord[]);
        } finally {
            setLoading(false);
        }
    }, [user?.uid]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        if (!authLoading && !user) {
            router.replace('/login');
        }
    }, [authLoading, user, router]);

    const totals = useMemo(() => {
        return approved.reduce(
            (acc, item) => {
                acc.vehicles += item.detection?.vehicles ?? 0;
                acc.pedestrians += item.detection?.pedestrians ?? 0;
                acc.accidents += item.detection?.accidents ?? 0;
                acc.violations += item.detection?.violations ?? 0;
                acc.risk += item.detection?.risk_score ?? 0;
                return acc;
            },
            { vehicles: 0, pedestrians: 0, accidents: 0, violations: 0, risk: 0 },
        );
    }, [approved]);

    const grouped = useMemo(() => {
        return {
            image: allUploads.filter((u) => (u.media_type || u.type) === 'image'),
            video: allUploads.filter((u) => (u.media_type || u.type) === 'video'),
        };
    }, [allUploads]);

    const avgRisk = approved.length ? Math.round(totals.risk / approved.length) : 0;
    const highestRisk = useMemo(
        () => [...approved].sort((a, b) => (b.detection?.risk_score ?? 0) - (a.detection?.risk_score ?? 0)).slice(0, 3),
        [approved],
    );
    const recentUploads = useMemo(
        () => [...allUploads].sort((a, b) => new Date(b.created_at || b.createdAt || 0).getTime() - new Date(a.created_at || a.createdAt || 0).getTime()).slice(0, 4),
        [allUploads],
    );

    if (authLoading || !user) {
        return (
            <div className="min-h-screen bg-dark-900 pt-16 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-dark-900 pt-16">
            <div className="border-b border-red-500/15 bg-[linear-gradient(120deg,rgba(42,7,7,0.9),rgba(9,5,5,0.96),rgba(18,8,8,0.86))] px-6 py-8">
                <div className="container-max grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
                        <div className="inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-xs uppercase tracking-[0.32em] text-red-100/80">
                            <Sparkles className="h-3.5 w-3.5" />
                            Personal Traffic Intelligence
                        </div>
                        <div>
                            <h1 className="text-4xl font-display font-bold text-white">Dashboard</h1>
                            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                                Admin-approved incident intelligence for <span className="text-red-200">{profile?.name || 'User'}</span>, including density trends, verified hotspots, and risk visibility across your uploads.
                            </p>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-3">
                            {[
                                { label: 'Approved Evidence', value: approved.length, note: 'Verified by admin', icon: ShieldCheck, tone: 'text-emerald-200', box: 'border-emerald-500/20 bg-emerald-500/10' },
                                { label: 'Average Risk', value: `${avgRisk}%`, note: 'Across approved items', icon: Gauge, tone: 'text-red-100', box: 'border-red-500/20 bg-red-500/10' },
                                { label: 'Flagged Incidents', value: totals.accidents + totals.violations, note: 'Accidents + violations', icon: AlertTriangle, tone: 'text-amber-200', box: 'border-amber-500/20 bg-amber-500/10' },
                            ].map(({ label, value, note, icon: Icon, tone, box }) => (
                                <div key={label} className={`rounded-2xl border p-4 ${box}`}>
                                    <div className="flex items-center justify-between">
                                        <p className="text-[11px] uppercase tracking-[0.26em] text-slate-400">{label}</p>
                                        <Icon className={`h-4 w-4 ${tone}`} />
                                    </div>
                                    <p className={`mt-4 text-3xl font-display font-bold ${tone}`}>{value}</p>
                                    <p className="mt-1 text-xs text-slate-400">{note}</p>
                                </div>
                            ))}
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.05 }}
                        className="glass-card border border-red-500/20 p-6"
                    >
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs uppercase tracking-[0.32em] text-blue-200/70">Live Snapshot</p>
                                <h2 className="mt-2 text-xl font-display font-semibold text-white">Operational Summary</h2>
                            </div>
                            <button onClick={fetchData} className="btn-secondary flex items-center gap-2 py-2 px-4 text-sm">
                                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                                Refresh
                            </button>
                        </div>
                        <div className="mt-6 grid grid-cols-2 gap-3">
                            {[
                                { label: 'Vehicles', value: totals.vehicles, icon: Activity, tone: 'text-sky-200' },
                                { label: 'Pedestrians', value: totals.pedestrians, icon: Eye, tone: 'text-indigo-200' },
                                { label: 'Accidents', value: totals.accidents, icon: AlertTriangle, tone: 'text-red-200' },
                                { label: 'Violations', value: totals.violations, icon: CheckCircle, tone: 'text-orange-200' },
                            ].map(({ label, value, icon: Icon, tone }) => (
                                <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                                    <div className="flex items-center justify-between">
                                        <p className="text-xs uppercase tracking-[0.22em] text-slate-400">{label}</p>
                                        <Icon className={`h-4 w-4 ${tone}`} />
                                    </div>
                                    <p className={`mt-3 text-2xl font-display font-bold ${tone}`}>{value}</p>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                </div>
            </div>

            <div className="container-max py-8 space-y-8">
                <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
                    <UserDensityChart userId={user.uid} />

                    <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card border border-red-500/15 p-6">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <p className="text-xs uppercase tracking-[0.32em] text-red-200/75">Priority Reports</p>
                                <h3 className="mt-2 text-xl font-display font-semibold text-white">Highest Risk Verified Cases</h3>
                            </div>
                            <AlertTriangle className="h-5 w-5 text-red-200" />
                        </div>
                        <div className="mt-6 space-y-3">
                            {highestRisk.length === 0 ? (
                                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
                                    No approved high-risk reports yet.
                                </div>
                            ) : (
                                highestRisk.map((item) => (
                                    <div key={item.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <p className="text-xs font-mono text-red-200">#{item.id.slice(0, 8).toUpperCase()}</p>
                                                <p className="mt-1 text-sm font-semibold text-white">{item.location || 'Unknown location'}</p>
                                                <p className="mt-2 text-xs text-slate-400">{item.incidentType || item.incident_type || 'Monitoring'}</p>
                                            </div>
                                            <span className="rounded-full bg-red-500/15 px-2.5 py-1 text-[11px] text-red-100">
                                                Risk {item.detection?.risk_score ?? 0}
                                            </span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </motion.section>
                </div>

                <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card overflow-hidden">
                        <div className="p-6 border-b border-white/10">
                            <h3 className="font-display font-semibold text-white flex items-center gap-2">
                                <CheckCircle className="w-4 h-4 text-emerald-400" />
                                Approved Reports
                            </h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Type</th>
                                        <th>Location</th>
                                        <th>Incident</th>
                                        <th>Status</th>
                                        <th>Time</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {approved.map((item) => (
                                        <tr key={item.id}>
                                            <td className="font-mono text-red-200 text-xs">{item.id.slice(0, 8).toUpperCase()}</td>
                                            <td className="capitalize">{item.media_type || item.type || 'image'}</td>
                                            <td>{item.location || 'Unknown'}</td>
                                            <td>{item.incidentType || item.incident_type || 'Monitoring'}</td>
                                            <td><span className="badge-success">approved</span></td>
                                            <td className="text-slate-500 text-xs">
                                                {item.created_at || item.createdAt ? new Date(item.created_at || item.createdAt || '').toLocaleString() : 'N/A'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {approved.length === 0 && (
                            <div className="py-14 text-center text-slate-400">No approved uploads yet.</div>
                        )}
                    </motion.div>

                    <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card border border-white/10 p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs uppercase tracking-[0.32em] text-red-200/75">Recent Intake</p>
                                <h3 className="mt-2 text-xl font-display font-semibold text-white">Latest Upload Activity</h3>
                            </div>
                            <Sparkles className="h-5 w-5 text-red-200" />
                        </div>
                        <div className="mt-6 grid gap-4 md:grid-cols-2">
                            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                                <div className="flex items-center gap-2 mb-4 text-white">
                                    <ImageIcon className="h-4 w-4 text-red-200" />
                                    Image Uploads
                                </div>
                                <div className="space-y-3">
                                    {grouped.image.slice(0, 3).map((item) => (
                                        <div key={item.id} className="rounded-xl border border-white/10 bg-black/10 p-3">
                                            <p className="text-sm text-slate-200">{item.location || 'Unknown'}</p>
                                            <p className="mt-1 text-xs text-slate-500">{item.created_at ? new Date(item.created_at).toLocaleString() : 'N/A'}</p>
                                        </div>
                                    ))}
                                    {grouped.image.length === 0 && <p className="text-slate-500 text-sm">No image uploads.</p>}
                                </div>
                            </div>

                            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                                <div className="flex items-center gap-2 mb-4 text-white">
                                    <Video className="h-4 w-4 text-blue-200" />
                                    Video Uploads
                                </div>
                                <div className="space-y-3">
                                    {grouped.video.slice(0, 3).map((item) => (
                                        <div key={item.id} className="rounded-xl border border-white/10 bg-black/10 p-3">
                                            <p className="text-sm text-slate-200">{item.location || 'Unknown'}</p>
                                            <p className="mt-1 text-xs text-slate-500">{item.created_at ? new Date(item.created_at).toLocaleString() : 'N/A'}</p>
                                        </div>
                                    ))}
                                    {grouped.video.length === 0 && <p className="text-slate-500 text-sm">No video uploads.</p>}
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 rounded-2xl border border-red-500/15 bg-red-500/5 p-4">
                            <p className="text-xs uppercase tracking-[0.28em] text-red-200/75">System Note</p>
                            <p className="mt-2 text-sm text-slate-300">
                                {recentUploads.length > 0
                                    ? `Most recent upload came from ${recentUploads[0].location || 'an unknown location'} and is currently marked ${recentUploads[0].status}.`
                                    : 'Upload activity will appear here once evidence is submitted.'}
                            </p>
                        </div>
                    </motion.section>
                </div>
            </div>
        </div>
    );
}
