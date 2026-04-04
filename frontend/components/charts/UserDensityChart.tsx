'use client';

import { useEffect, useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import {
    CategoryScale,
    Chart as ChartJS,
    Filler,
    Legend,
    LineElement,
    LinearScale,
    PointElement,
    Tooltip,
} from 'chart.js';
import { ActivitySquare } from 'lucide-react';
import { getUserDensityAnalytics } from '@/lib/api';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

type Props = {
    userId: string;
};

type UploadDoc = {
    day: string;
    avgDensity: number;
};

export default function UserDensityChart({ userId }: Props) {
    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState<{ day: string; avgDensity: number }[]>([]);

    useEffect(() => {
        const run = async () => {
            setLoading(true);
            try {
                if (!userId) return;
                const res = await getUserDensityAnalytics();
                setRows((res?.rows || []) as UploadDoc[]);
            } finally {
                setLoading(false);
            }
        };
        run();
    }, [userId]);

    const averageDensity = rows.length ? Math.round(rows.reduce((sum, row) => sum + row.avgDensity, 0) / rows.length) : 0;
    const peakDensity = rows.length ? Math.max(...rows.map((row) => row.avgDensity)) : 0;

    const data = useMemo(() => ({
        labels: rows.map((r) => r.day),
        datasets: [
            {
                label: 'Avg Traffic Density',
                data: rows.map((r) => r.avgDensity),
                borderColor: '#38bdf8',
                backgroundColor: 'rgba(56, 189, 248, 0.16)',
                fill: true,
                tension: 0.36,
                pointRadius: 3,
                pointHoverRadius: 5,
            },
        ],
    }), [rows]);

    if (loading) {
        return <div className="glass-card p-6 text-slate-300">Loading traffic density chart...</div>;
    }

    return (
        <div className="glass-card border border-red-500/15 p-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-xs uppercase tracking-[0.32em] text-blue-200/75">Density Intelligence</p>
                    <h3 className="mt-2 text-xl font-display font-semibold text-white">Daily Average Traffic Density</h3>
                    <p className="mt-2 text-sm text-slate-400">Trend visibility from your approved upload history.</p>
                </div>
                <div className="rounded-2xl border border-blue-400/20 bg-blue-500/10 p-3">
                    <ActivitySquare className="h-5 w-5 text-blue-200" />
                </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Average Density</p>
                    <p className="mt-3 text-2xl font-display font-bold text-blue-100">{averageDensity}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Peak Density</p>
                    <p className="mt-3 text-2xl font-display font-bold text-red-100">{peakDensity}</p>
                </div>
            </div>

            {rows.length === 0 ? (
                <p className="mt-6 text-slate-400 text-sm">No uploads data found.</p>
            ) : (
                <div className="mt-6 h-[320px]">
                    <Line
                        data={data}
                        options={{
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: { labels: { color: '#cbd5e1' } },
                            },
                            scales: {
                                x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.12)' } },
                                y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.12)' } },
                            },
                        }}
                    />
                </div>
            )}
        </div>
    );
}
