'use client';

import { useState, type ElementType } from 'react';
import { motion } from 'framer-motion';
import {
    Route,
    MapPin,
    Navigation,
    AlertTriangle,
    Shield,
    Bike,
    Car,
    Bus,
    PersonStanding,
    ExternalLink,
} from 'lucide-react';
import toast from 'react-hot-toast';
import LocationAutocompleteInput from '@/components/location/LocationAutocompleteInput';
import ThreeBackground from '@/components/three/ThreeBackground';
import { getRouteSafetyRecommendation } from '@/lib/api';

type Mode = 'driving' | 'walking' | 'bicycling' | 'transit' | 'two_wheeler';

type RouteSafetyResponse = {
    origin: string;
    destination: string;
    mode: Mode;
    mode_label: string;
    maps_link: string;
    route_summary: string;
    speed_advice: string;
    precautions: string[];
    accident_check: {
        has_accidents: boolean;
        matched_count: number;
        matched_locations: Array<{
            location: string;
            match_terms: string[];
            created_at?: string;
            accidents: number;
        }>;
    };
};

const modeOptions: Array<{ value: Mode; label: string; icon: ElementType }> = [
    { value: 'driving', label: 'Car / Taxi', icon: Car },
    { value: 'two_wheeler', label: 'Two-Wheeler', icon: Bike },
    { value: 'walking', label: 'Walking', icon: PersonStanding },
    { value: 'bicycling', label: 'Cycle', icon: Bike },
    { value: 'transit', label: 'Public Transit', icon: Bus },
];

export default function AiRecommendationPage() {
    const [origin, setOrigin] = useState('');
    const [destination, setDestination] = useState('');
    const [mode, setMode] = useState<Mode>('driving');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<RouteSafetyResponse | null>(null);

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!origin.trim() || !destination.trim()) {
            toast.error('Please enter both origin and destination.');
            return;
        }
        setLoading(true);
        try {
            const res = await getRouteSafetyRecommendation({
                origin: origin.trim(),
                destination: destination.trim(),
                mode,
            });
            setResult(res as RouteSafetyResponse);
        } catch (error: unknown) {
            console.error(error);
            const detail =
                typeof error === 'object' &&
                error !== null &&
                'response' in error &&
                typeof (error as { response?: { data?: { detail?: string } } }).response?.data?.detail === 'string'
                    ? (error as { response?: { data?: { detail?: string } } }).response?.data?.detail
                    : null;
            toast.error(detail || 'Could not fetch route recommendation.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative min-h-screen overflow-hidden bg-dark-900 pt-16">
            <div className="absolute inset-0 opacity-35">
                <ThreeBackground />
            </div>
            <div className="pointer-events-none absolute -top-48 -left-48 h-[38rem] w-[38rem] rounded-full bg-cyan-500/15 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-44 -right-44 h-[34rem] w-[34rem] rounded-full bg-blue-500/15 blur-3xl" />

            <div className="container-max relative z-10 py-10 space-y-6">
                <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6 border border-cyan-500/25">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-400/35 flex items-center justify-center">
                            <Route className="w-5 h-5 text-cyan-300" />
                        </div>
                        <h1 className="text-2xl font-display font-bold text-white">AI Recommendation</h1>
                    </div>
                    <p className="text-slate-300 text-sm">
                        Enter direction and mode of transport. The system checks approved accident reports from the admin-reviewed dataset for matching areas, then gives route guidance and precautions.
                    </p>
                </motion.div>

                <motion.form
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    onSubmit={onSubmit}
                    className="glass-card p-6 border border-white/10 space-y-4"
                >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <LocationAutocompleteInput value={origin} onChange={setOrigin} placeholder="Origin" />
                        <LocationAutocompleteInput value={destination} onChange={setDestination} placeholder="Destination" />
                    </div>

                    <div>
                        <p className="text-sm text-slate-300 mb-2">Choose mode of transport</p>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                            {modeOptions.map(({ value, label, icon: Icon }) => (
                                <button
                                    type="button"
                                    key={value}
                                    onClick={() => setMode(value)}
                                    className={`rounded-xl border px-3 py-2 text-sm transition-all flex items-center justify-center gap-2 ${
                                        mode === value
                                            ? 'border-cyan-400/45 bg-cyan-500/20 text-cyan-200'
                                            : 'border-white/10 bg-white/5 text-slate-300 hover:text-white'
                                    }`}
                                >
                                    <Icon className="w-4 h-4" />
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="btn-primary py-2.5 px-5 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Analyzing...' : 'Analyze Route Safety'}
                    </button>
                </motion.form>

                {result && (
                    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        <div className={`glass-card p-5 border ${result.accident_check.has_accidents ? 'border-red-500/35 bg-red-500/5' : 'border-emerald-500/30 bg-emerald-500/5'} lg:col-span-2`}>
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                    {result.accident_check.has_accidents ? (
                                        <AlertTriangle className="w-5 h-5 text-red-400" />
                                    ) : (
                                        <Shield className="w-5 h-5 text-emerald-400" />
                                    )}
                                    <h2 className="text-lg font-semibold text-white">Direction Analysis</h2>
                                </div>
                                <span className="text-xs text-slate-400">{result.mode_label}</span>
                            </div>
                            <p className="text-sm text-slate-300 mt-3">{result.route_summary}</p>
                            <div className="mt-4 rounded-xl border border-white/10 bg-dark-900/60 p-3 text-sm text-slate-300 space-y-2">
                                <p className="flex items-start gap-2"><MapPin className="w-4 h-4 mt-0.5 text-cyan-400" /> <span><b>From:</b> {result.origin}</span></p>
                                <p className="flex items-start gap-2"><Navigation className="w-4 h-4 mt-0.5 text-cyan-400" /> <span><b>To:</b> {result.destination}</span></p>
                                <p><b>Speed guidance:</b> {result.speed_advice}</p>
                            </div>
                            <a
                                href={result.maps_link}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-4 inline-flex items-center gap-2 rounded-xl border border-cyan-400/35 bg-cyan-500/20 px-4 py-2 text-sm text-cyan-200 hover:text-white transition-colors"
                            >
                                Open Google Maps Route
                                <ExternalLink className="w-4 h-4" />
                            </a>
                        </div>

                        <div className="glass-card p-5 border border-white/10">
                            <h3 className="text-white font-semibold mb-3">Precautions</h3>
                            <ul className="space-y-2 text-sm text-slate-300">
                                {result.precautions.map((item) => (
                                    <li key={item} className="flex items-start gap-2">
                                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-cyan-400" />
                                        <span>{item}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {result.accident_check.matched_locations.length > 0 && (
                            <div className="glass-card p-5 border border-amber-500/35 bg-amber-500/5 lg:col-span-3">
                                <h3 className="text-amber-300 font-semibold mb-2">Matched Accident Areas (Admin Approved)</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {result.accident_check.matched_locations.map((item, idx) => (
                                        <div key={`${item.location}-${idx}`} className="rounded-lg border border-white/10 bg-dark-900/60 p-3 text-sm">
                                            <p className="text-white">{item.location}</p>
                                            <p className="text-slate-400 text-xs mt-1">Matched: {item.match_terms.join(', ') || 'N/A'}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}
            </div>
        </div>
    );
}
