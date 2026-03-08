'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, Eye, ImageIcon, RefreshCw, Video } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
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
    };
    created_at?: string;
    createdAt?: string;
};

export default function DashboardPage() {
    const { user, profile, loading: authLoading } = useAuth();
    const [loading, setLoading] = useState(false);
    const [showRecent, setShowRecent] = useState(false);
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

    const totals = useMemo(() => {
        return approved.reduce(
            (acc, item) => {
                acc.vehicles += item.detection?.vehicles ?? 0;
                acc.pedestrians += item.detection?.pedestrians ?? 0;
                acc.accidents += item.detection?.accidents ?? 0;
                acc.violations += item.detection?.violations ?? 0;
                return acc;
            },
            { vehicles: 0, pedestrians: 0, accidents: 0, violations: 0 },
        );
    }, [approved]);

    const grouped = useMemo(() => {
        return {
            image: allUploads.filter((u) => (u.media_type || u.type) === 'image'),
            video: allUploads.filter((u) => (u.media_type || u.type) === 'video'),
        };
    }, [allUploads]);

    if (authLoading || !user) {
        return (
            <div className="min-h-screen bg-dark-900 pt-16 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-dark-900 pt-16">
            <div className="bg-dark-800/50 border-b border-white/10 px-6 py-6">
                <div className="container-max flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-display font-bold text-white">Dashboard</h1>
                        <p className="text-slate-400 text-sm mt-1">
                            Showing only admin-approved data for <span className="text-cyan-400">{profile?.name || 'User'}</span>
                        </p>
                    </div>
                    <button onClick={fetchData} className="btn-secondary flex items-center gap-2 py-2 px-4 text-sm">
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>
            </div>

            <div className="container-max py-8 space-y-8">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                        { label: 'Approved Uploads', value: approved.length },
                        { label: 'Vehicles', value: totals.vehicles },
                        { label: 'Accidents', value: totals.accidents },
                        { label: 'Violations', value: totals.violations },
                    ].map((card) => (
                        <div key={card.label} className="glass-card p-5">
                            <p className="text-2xl font-display font-bold text-white">{card.value}</p>
                            <p className="text-slate-400 text-sm mt-1">{card.label}</p>
                        </div>
                    ))}
                </div>

                <UserDensityChart userId={user.uid} />

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
                                        <td className="font-mono text-cyan-400 text-xs">{item.id.slice(0, 8).toUpperCase()}</td>
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

                <div className="glass-card p-6">
                    <button
                        onClick={() => setShowRecent((prev) => !prev)}
                        className="btn-secondary flex items-center gap-2 py-2 px-4 text-sm"
                    >
                        <Eye className="w-4 h-4" />
                        {showRecent ? 'Hide Recent Uploads' : 'Show Recent Uploads'}
                    </button>

                    {showRecent && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                            <div>
                                <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                                    <ImageIcon className="w-4 h-4 text-cyan-400" />
                                    Image Uploads
                                </h4>
                                <div className="space-y-2">
                                    {grouped.image.map((item) => (
                                        <div key={item.id} className="bg-white/5 rounded-lg p-3 text-sm">
                                            <p className="text-slate-300">{item.location || 'Unknown'}</p>
                                            <p className="text-slate-500 text-xs">{item.created_at ? new Date(item.created_at).toLocaleString() : 'N/A'}</p>
                                        </div>
                                    ))}
                                    {grouped.image.length === 0 && <p className="text-slate-500 text-sm">No image uploads.</p>}
                                </div>
                            </div>

                            <div>
                                <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                                    <Video className="w-4 h-4 text-purple-400" />
                                    Video Uploads
                                </h4>
                                <div className="space-y-2">
                                    {grouped.video.map((item) => (
                                        <div key={item.id} className="bg-white/5 rounded-lg p-3 text-sm">
                                            <p className="text-slate-300">{item.location || 'Unknown'}</p>
                                            <p className="text-slate-500 text-xs">{item.created_at ? new Date(item.created_at).toLocaleString() : 'N/A'}</p>
                                        </div>
                                    ))}
                                    {grouped.video.length === 0 && <p className="text-slate-500 text-sm">No video uploads.</p>}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

