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

    const data = useMemo(() => ({
        labels: rows.map((r) => r.day),
        datasets: [
            {
                label: 'Avg Traffic Density',
                data: rows.map((r) => r.avgDensity),
                borderColor: '#22d3ee',
                backgroundColor: 'rgba(34, 211, 238, 0.2)',
                fill: true,
                tension: 0.35,
                pointRadius: 3,
            },
        ],
    }), [rows]);

    if (loading) {
        return <div className="glass-card p-6 text-slate-300">Loading traffic density chart...</div>;
    }

    return (
        <div className="glass-card p-6">
            <h3 className="text-white font-semibold mb-4">Daily Average Traffic Density</h3>
            {rows.length === 0 ? (
                <p className="text-slate-400 text-sm">No uploads data found.</p>
            ) : (
                <div className="h-[320px]">
                    <Line
                        data={data}
                        options={{
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: { labels: { color: '#cbd5e1' } },
                            },
                            scales: {
                                x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.2)' } },
                                y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.2)' } },
                            },
                        }}
                    />
                </div>
            )}
        </div>
    );
}
