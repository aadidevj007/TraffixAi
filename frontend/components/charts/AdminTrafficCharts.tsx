'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bar, Line, Pie } from 'react-chartjs-2';
import {
    ArcElement,
    BarElement,
    CategoryScale,
    Chart as ChartJS,
    Filler,
    Legend,
    LineElement,
    LinearScale,
    PointElement,
    Tooltip,
} from 'chart.js';
import { getAdminOverviewAnalytics } from '@/lib/api';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler);

type Overview = {
    uploads_per_day: Array<{ day: string; count: number }>;
    accidents_per_day: Array<{ day: string; count: number }>;
    violation_distribution: Array<{ label: string; count: number }>;
    density_trends: Array<{ day: string; avgDensity: number }>;
};

export default function AdminTrafficCharts() {
    const [loading, setLoading] = useState(true);
    const [overview, setOverview] = useState<Overview>({
        uploads_per_day: [],
        accidents_per_day: [],
        violation_distribution: [],
        density_trends: [],
    });

    useEffect(() => {
        const run = async () => {
            setLoading(true);
            try {
                const res = await getAdminOverviewAnalytics();
                setOverview(res as Overview);
            } finally {
                setLoading(false);
            }
        };
        run();
    }, []);

    const labels = useMemo(() => overview.uploads_per_day.map((r) => r.day), [overview.uploads_per_day]);
    const uploadsData = useMemo(() => ({
        labels,
        datasets: [{
            label: 'Daily Uploads',
            data: overview.uploads_per_day.map((r) => r.count),
            borderColor: '#38bdf8',
            backgroundColor: 'rgba(56, 189, 248, 0.2)',
            fill: true,
            tension: 0.32,
        }],
    }), [labels, overview.uploads_per_day]);

    const accidentsData = useMemo(() => ({
        labels: overview.accidents_per_day.map((r) => r.day),
        datasets: [{
            label: 'Accidents/Day',
            data: overview.accidents_per_day.map((r) => r.count),
            backgroundColor: 'rgba(239, 68, 68, 0.75)',
            borderColor: '#ef4444',
            borderWidth: 1,
        }],
    }), [overview.accidents_per_day]);

    const densityData = useMemo(() => ({
        labels: overview.density_trends.map((r) => r.day),
        datasets: [{
            label: 'Traffic Density',
            data: overview.density_trends.map((r) => r.avgDensity),
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.2)',
            fill: true,
            tension: 0.28,
        }],
    }), [overview.density_trends]);

    const violationPie = useMemo(() => ({
        labels: overview.violation_distribution.map((r) => r.label),
        datasets: [{
            data: overview.violation_distribution.map((r) => r.count),
            backgroundColor: ['#f59e0b', '#ef4444', '#22d3ee', '#a78bfa', '#10b981', '#f97316'],
            borderWidth: 1,
            borderColor: '#0f172a',
        }],
    }), [overview.violation_distribution]);

    if (loading) {
        return <div className="glass-card p-6 text-slate-300">Loading admin analytics...</div>;
    }

    return (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="glass-card p-6">
                <h3 className="text-white font-semibold mb-4">Uploads Per Day</h3>
                {overview.uploads_per_day.length === 0 ? (
                    <p className="text-slate-400 text-sm">No upload records found.</p>
                ) : (
                    <div className="h-[300px]">
                        <Line
                            data={uploadsData}
                            options={{
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: { legend: { labels: { color: '#cbd5e1' } } },
                                scales: {
                                    x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.2)' } },
                                    y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.2)' } },
                                },
                            }}
                        />
                    </div>
                )}
            </div>

            <div className="glass-card p-6">
                <h3 className="text-white font-semibold mb-4">Accidents Per Day</h3>
                {overview.accidents_per_day.length === 0 ? (
                    <p className="text-slate-400 text-sm">No accident records found.</p>
                ) : (
                    <div className="h-[300px]">
                        <Bar
                            data={accidentsData}
                            options={{
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: { legend: { labels: { color: '#cbd5e1' } } },
                                scales: {
                                    x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.2)' } },
                                    y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.2)' } },
                                },
                            }}
                        />
                    </div>
                )}
            </div>

            <div className="glass-card p-6">
                <h3 className="text-white font-semibold mb-4">Violation Distribution</h3>
                {overview.violation_distribution.length === 0 ? (
                    <p className="text-slate-400 text-sm">No violations found.</p>
                ) : (
                    <div className="h-[300px]">
                        <Pie
                            data={violationPie}
                            options={{
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: { legend: { labels: { color: '#cbd5e1' } } },
                            }}
                        />
                    </div>
                )}
            </div>

            <div className="glass-card p-6">
                <h3 className="text-white font-semibold mb-4">Traffic Density Trends</h3>
                {overview.density_trends.length === 0 ? (
                    <p className="text-slate-400 text-sm">No density records found.</p>
                ) : (
                    <div className="h-[300px]">
                        <Line
                            data={densityData}
                            options={{
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: { legend: { labels: { color: '#cbd5e1' } } },
                                scales: {
                                    x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.2)' } },
                                    y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.2)' } },
                                },
                            }}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}

