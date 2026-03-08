'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, Clock, FileText, Filter, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getReports } from '@/lib/api';

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
};

const statusStyles: Record<UploadRecord['status'], string> = {
    pending: 'badge-warning',
    approved: 'badge-success',
    rejected: 'badge-danger',
};

export default function ReportsPage() {
    const { user, loading: authLoading } = useAuth();
    const [loading, setLoading] = useState(false);
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
                        <h1 className="text-2xl font-display font-bold text-white">Reports</h1>
                        <p className="text-slate-400 text-sm mt-1">Only your uploads and their admin approval status</p>
                    </div>
                    <button onClick={fetchUploads} className="btn-secondary py-2 px-3">
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            <div className="container-max py-8">
                <div className="flex gap-2 mb-6">
                    {(['all', 'pending', 'approved', 'rejected'] as const).map((value) => (
                        <button
                            key={value}
                            onClick={() => setFilter(value)}
                            className={`px-4 py-1.5 rounded-full text-sm font-medium capitalize transition-all ${filter === value
                                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                                : 'glass-card text-slate-400 hover:text-white'
                                }`}
                        >
                            <Filter className="w-3 h-3 inline mr-1" />
                            {value}
                        </button>
                    ))}
                </div>

                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Type</th>
                                    <th>Location</th>
                                    <th>Incident</th>
                                    <th>Status</th>
                                    <th>Uploaded At</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((item) => (
                                    <tr key={item.id}>
                                        <td className="font-mono text-cyan-400 text-xs">{item.id.slice(0, 8).toUpperCase()}</td>
                                        <td className="capitalize">{item.media_type || item.type || 'image'}</td>
                                        <td>{item.location || 'Unknown'}</td>
                                        <td>{item.incidentType || item.incident_type || 'Monitoring'}</td>
                                        <td>
                                            <span className={`${statusStyles[item.status]} flex items-center gap-1 w-fit`}>
                                                {item.status === 'approved' ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                                                {item.status}
                                            </span>
                                        </td>
                                        <td className="text-slate-500 text-xs">
                                            {item.created_at || item.createdAt ? new Date(item.created_at || item.createdAt || '').toLocaleString() : 'N/A'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {filtered.length === 0 && (
                        <div className="py-16 text-center">
                            <FileText className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                            <p className="text-slate-400">No uploads found for this filter.</p>
                        </div>
                    )}
                </motion.div>
            </div>
        </div>
    );
}
