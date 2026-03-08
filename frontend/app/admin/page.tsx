'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, Clock, RefreshCw, Shield, XCircle, AlertTriangle, Activity } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import AdminTrafficCharts from '@/components/charts/AdminTrafficCharts';
import { getAdminRequests, updateAdminRequestStatus } from '@/lib/api';

type UploadRecord = {
    id: string;
    user_id?: string;
    media_type?: 'image' | 'video';
    location?: string;
    description?: string;
    incidentType?: string;
    status: 'pending' | 'approved' | 'rejected';
    fileUrl?: string;
    detection?: {
        vehicles?: number;
        pedestrians?: number;
        accidents?: number;
        violations?: number;
        risk_score?: number;
    };
    created_at?: string;
};

function toDateLabel(createdAt: string | undefined): string {
    if (!createdAt) return 'N/A';
    const parsed = new Date(createdAt);
    if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleString();
    return 'N/A';
}

export default function AdminPage() {
    const { user, isAdmin, loading: authLoading } = useAuth();
    const [loading, setLoading] = useState(false);
    const [requests, setRequests] = useState<UploadRecord[]>([]);
    const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
    const router = useRouter();

    // Allow local admin (username=admin / password=admin@1234) OR Firebase Admin users
    const localAdmin = typeof window !== 'undefined' && sessionStorage.getItem('localAdmin') === 'true';
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
        if (allowed) fetchRequests();
    }, [allowed, fetchRequests]);

    const filtered = useMemo(() => {
        if (filter === 'all') return requests;
        return requests.filter((r) => r.status === filter);
    }, [filter, requests]);

    const counts = useMemo(() => ({
        all: requests.length,
        pending: requests.filter((r) => r.status === 'pending').length,
        approved: requests.filter((r) => r.status === 'approved').length,
        rejected: requests.filter((r) => r.status === 'rejected').length,
    }), [requests]);

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

    if ((authLoading && !localAdmin) || !allowed) {
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
                        <h1 className="text-2xl font-display font-bold text-white">Admin Review Panel</h1>
                        <p className="text-slate-300 text-sm mt-1">Approve or deny user requests. Approved reports appear on user dashboard.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={fetchRequests} className="btn-secondary py-2 px-3">
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>
            </div>

            <div className="container-max py-8 space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="glass-card p-4 border border-cyan-500/30 bg-cyan-500/10">
                        <p className="text-cyan-300 text-xs">Total Requests</p>
                        <p className="text-2xl text-white font-bold">{counts.all}</p>
                    </div>
                    <div className="glass-card p-4 border border-amber-500/30 bg-amber-500/10">
                        <p className="text-amber-300 text-xs">Pending</p>
                        <p className="text-2xl text-white font-bold">{counts.pending}</p>
                    </div>
                    <div className="glass-card p-4 border border-emerald-500/30 bg-emerald-500/10">
                        <p className="text-emerald-300 text-xs">Approved</p>
                        <p className="text-2xl text-white font-bold">{counts.approved}</p>
                    </div>
                    <div className="glass-card p-4 border border-rose-500/30 bg-rose-500/10">
                        <p className="text-rose-300 text-xs">Rejected</p>
                        <p className="text-2xl text-white font-bold">{counts.rejected}</p>
                    </div>
                </div>

                <AdminTrafficCharts />

                <div className="flex flex-wrap gap-2">
                    {(['all', 'pending', 'approved', 'rejected'] as const).map((value) => (
                        <button
                            key={value}
                            onClick={() => setFilter(value)}
                            className={`px-4 py-2 rounded-xl text-sm font-semibold capitalize transition-all ${filter === value
                                ? 'bg-cyan-500/25 border border-cyan-400/40 text-cyan-200'
                                : 'glass-card text-slate-300 hover:text-white'
                                }`}
                        >
                            {value}
                        </button>
                    ))}
                </div>

                {filtered.length === 0 && (
                    <div className="glass-card p-12 text-center text-slate-400">No requests for this filter.</div>
                )}

                {filtered.map((request) => {
                    const statusColor = request.status === 'approved'
                        ? 'border-emerald-500/35 bg-emerald-500/5'
                        : request.status === 'rejected'
                            ? 'border-rose-500/35 bg-rose-500/5'
                            : 'border-amber-500/35 bg-amber-500/5';

                    return (
                        <motion.div
                            key={request.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`glass-card p-5 border ${statusColor}`}
                        >
                            <div className="flex flex-col lg:flex-row gap-5 justify-between">
                                <div className="space-y-3 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <Shield className="w-4 h-4 text-cyan-300" />
                                        <p className="text-sm text-slate-300 font-mono">ID: {request.id.slice(0, 8).toUpperCase()}</p>
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${request.status === 'approved'
                                            ? 'bg-emerald-500/20 text-emerald-300'
                                            : request.status === 'rejected'
                                                ? 'bg-rose-500/20 text-rose-300'
                                                : 'bg-amber-500/20 text-amber-300'
                                            }`}>
                                            {request.status}
                                        </span>
                                    </div>
                                    <p className="text-white text-sm">User ID: {request.user_id || 'Unknown'}</p>
                                    <p className="text-slate-300 text-sm">
                                        Type: {(request.media_type || 'image').toUpperCase()} | Location: {request.location || 'Unknown'}
                                    </p>
                                    <p className="text-slate-500 text-xs">Uploaded: {toDateLabel(request.created_at)}</p>

                                    {request.description && (
                                        <p className="text-slate-300 text-sm bg-white/5 rounded-lg p-3">{request.description}</p>
                                    )}

                                    {request.detection && (
                                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                                            <div className="rounded-lg bg-cyan-500/10 border border-cyan-500/20 p-2 text-center">
                                                <p className="text-cyan-300 font-bold">{request.detection.vehicles ?? 0}</p>
                                                <p className="text-xs text-slate-400">Vehicles</p>
                                            </div>
                                            <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-2 text-center">
                                                <p className="text-blue-300 font-bold">{request.detection.pedestrians ?? 0}</p>
                                                <p className="text-xs text-slate-400">Pedestrians</p>
                                            </div>
                                            <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-2 text-center">
                                                <p className="text-red-300 font-bold">{(request.detection.accidents ?? 0) > 0 ? 'Detected' : 'None'}</p>
                                                <p className="text-xs text-slate-400">Accident</p>
                                            </div>
                                            <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-2 text-center">
                                                <p className="text-amber-300 font-bold">{request.detection.violations ?? 0}</p>
                                                <p className="text-xs text-slate-400">Violations</p>
                                            </div>
                                            <div className="rounded-lg bg-fuchsia-500/10 border border-fuchsia-500/20 p-2 text-center">
                                                <p className="text-fuchsia-300 font-bold">{request.detection.risk_score ?? 0}/100</p>
                                                <p className="text-xs text-slate-400">Risk</p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-row lg:flex-col gap-2 shrink-0">
                                    {request.status === 'pending' ? (
                                        <>
                                            <button
                                                onClick={() => updateStatus(request.id, 'approved')}
                                                className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 text-white font-semibold flex items-center gap-2 hover:from-emerald-400 hover:to-green-400"
                                            >
                                                <CheckCircle className="w-4 h-4" />
                                                Approve
                                            </button>
                                            <button
                                                onClick={() => updateStatus(request.id, 'rejected')}
                                                className="px-4 py-2 rounded-xl bg-gradient-to-r from-rose-500 to-red-500 text-white font-semibold flex items-center gap-2 hover:from-rose-400 hover:to-red-400"
                                            >
                                                <XCircle className="w-4 h-4" />
                                                Deny
                                            </button>
                                        </>
                                    ) : (
                                        <div className="px-4 py-2 rounded-xl bg-white/5 text-slate-300 text-sm flex items-center gap-2">
                                            {request.status === 'approved' ? <Activity className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-rose-400" />}
                                            Reviewed
                                        </div>
                                    )}
                                    <div className="px-4 py-2 rounded-xl bg-white/5 text-slate-400 text-xs flex items-center gap-2">
                                        <Clock className="w-3 h-3" />
                                        Syncs to user reports/dashboard
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
