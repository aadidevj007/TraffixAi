'use client';

import { useState, type ElementType } from 'react';
import { motion } from 'framer-motion';
import {
    AlertTriangle,
    Bike,
    Bus,
    Car,
    ExternalLink,
    MapPin,
    Navigation,
    PersonStanding,
    Route,
    Shield,
    Sparkles,
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
    degraded?: boolean;
};

const modeOptions: Array<{ value: Mode; label: string; icon: ElementType; accent: string }> = [
    { value: 'driving', label: 'Car / Taxi', icon: Car, accent: 'from-red-500/20 to-orange-500/10' },
    { value: 'two_wheeler', label: 'Two-Wheeler', icon: Bike, accent: 'from-orange-500/20 to-amber-500/10' },
    { value: 'walking', label: 'Walking', icon: PersonStanding, accent: 'from-emerald-500/20 to-lime-500/10' },
    { value: 'bicycling', label: 'Cycle', icon: Bike, accent: 'from-sky-500/20 to-blue-500/10' },
    { value: 'transit', label: 'Public Transit', icon: Bus, accent: 'from-indigo-500/20 to-violet-500/10' },
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
            const message = error instanceof Error ? error.message : null;
            toast.error(detail || message || 'Could not fetch route recommendation.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative min-h-screen overflow-hidden bg-dark-900 pt-16">
            <div className="absolute inset-0 opacity-30">
                <ThreeBackground />
            </div>
            <div className="pointer-events-none absolute -top-52 right-[-10rem] h-[34rem] w-[34rem] rounded-full bg-red-500/10 blur-3xl" />
            <div className="pointer-events-none absolute bottom-[-12rem] left-[-8rem] h-[30rem] w-[30rem] rounded-full bg-blue-500/10 blur-3xl" />

            <div className="container-max relative z-10 py-10 space-y-6">
                <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="glass-card overflow-hidden border border-red-500/20">
                    <div className="relative p-6">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(239,68,68,0.16),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.16),transparent_30%)]" />
                        <div className="relative z-10 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
                            <div>
                                <div className="inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-xs uppercase tracking-[0.32em] text-red-100/80">
                                    <Sparkles className="h-3.5 w-3.5" />
                                    Route Intelligence
                                </div>
                                <h1 className="mt-4 text-4xl font-display font-bold text-white">AI Recommendation</h1>
                                <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
                                    Generate an intelligent route safety brief using reviewed accident zones, mode-aware travel context, and practical safety guidance before you move.
                                </p>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                {[
                                    { label: 'Contextual Routing', value: 'Live', tone: 'text-blue-100' },
                                    { label: 'Safety Checks', value: 'Approved', tone: 'text-emerald-100' },
                                    { label: 'Travel Modes', value: modeOptions.length, tone: 'text-red-100' },
                                ].map((item) => (
                                    <div key={item.label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                                        <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">{item.label}</p>
                                        <p className={`mt-3 text-2xl font-display font-bold ${item.tone}`}>{item.value}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </motion.section>

                <motion.form
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    onSubmit={onSubmit}
                    className="glass-card border border-white/10 p-6"
                >
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr_auto]">
                        <LocationAutocompleteInput value={origin} onChange={setOrigin} placeholder="Origin" />
                        <LocationAutocompleteInput value={destination} onChange={setDestination} placeholder="Destination" />
                        <button
                            type="submit"
                            disabled={loading}
                            className="btn-primary h-full min-h-[54px] px-6 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Analyzing...' : 'Analyze Route'}
                        </button>
                    </div>

                    <div className="mt-5">
                        <p className="text-sm text-slate-300 mb-3">Choose mode of transport</p>
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                            {modeOptions.map(({ value, label, icon: Icon, accent }) => (
                                <button
                                    type="button"
                                    key={value}
                                    onClick={() => setMode(value)}
                                    className={`rounded-2xl border px-4 py-4 text-sm transition-all ${
                                        mode === value
                                            ? 'border-red-400/40 bg-[linear-gradient(135deg,rgba(127,29,29,0.28),rgba(30,41,59,0.18))] text-white shadow-[0_14px_38px_rgba(127,29,29,0.24)]'
                                            : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-red-500/25 hover:bg-white/[0.06]'
                                    }`}
                                >
                                    <div className={`mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br ${accent}`}>
                                        <Icon className="h-4 w-4" />
                                    </div>
                                    <div className="font-medium">{label}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                </motion.form>

                {result && (
                    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                        <div className={`glass-card p-6 border ${result.accident_check.has_accidents ? 'border-red-500/30 bg-red-500/5' : 'border-emerald-500/25 bg-emerald-500/5'}`}>
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                    {result.accident_check.has_accidents ? (
                                        <AlertTriangle className="w-5 h-5 text-red-400" />
                                    ) : (
                                        <Shield className="w-5 h-5 text-emerald-400" />
                                    )}
                                    <h2 className="text-xl font-semibold text-white">Direction Analysis</h2>
                                </div>
                                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300">{result.mode_label}</span>
                            </div>

                            <div className="mt-5 grid gap-4 sm:grid-cols-3">
                                {[
                                    { label: 'Matched Hotspots', value: result.accident_check.matched_count, tone: result.accident_check.has_accidents ? 'text-red-100' : 'text-emerald-100' },
                                    { label: 'Route State', value: result.accident_check.has_accidents ? 'Caution' : 'Clear', tone: result.accident_check.has_accidents ? 'text-amber-100' : 'text-emerald-100' },
                                    { label: 'Mode', value: result.mode_label, tone: 'text-blue-100' },
                                ].map((card) => (
                                    <div key={card.label} className="rounded-2xl border border-white/10 bg-black/10 p-4">
                                        <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">{card.label}</p>
                                        <p className={`mt-3 text-2xl font-display font-bold ${card.tone}`}>{card.value}</p>
                                    </div>
                                ))}
                            </div>

                            <p className="mt-5 text-sm leading-6 text-slate-300">{result.route_summary}</p>

                            <div className="mt-5 rounded-2xl border border-white/10 bg-dark-900/60 p-4 text-sm text-slate-300 space-y-3">
                                <p className="flex items-start gap-2"><MapPin className="w-4 h-4 mt-0.5 text-red-300" /> <span><b>From:</b> {result.origin}</span></p>
                                <p className="flex items-start gap-2"><Navigation className="w-4 h-4 mt-0.5 text-blue-300" /> <span><b>To:</b> {result.destination}</span></p>
                                <p className="flex items-start gap-2"><Route className="w-4 h-4 mt-0.5 text-emerald-300" /> <span><b>Speed guidance:</b> {result.speed_advice}</span></p>
                            </div>

                            <a
                                href={result.maps_link}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-5 inline-flex items-center gap-2 rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-2.5 text-sm text-red-100 hover:text-white transition-colors"
                            >
                                Open Google Maps Route
                                <ExternalLink className="w-4 h-4" />
                            </a>

                            {result.degraded && (
                                <p className="mt-4 text-xs text-amber-200">Live route risk analysis is temporarily degraded. Safety guidance is using the fallback path.</p>
                            )}
                        </div>

                        <div className="space-y-4">
                            <div className="glass-card border border-white/10 p-5">
                                <h3 className="text-white font-semibold mb-3">Safety Precautions</h3>
                                <ul className="space-y-3 text-sm text-slate-300">
                                    {result.precautions.map((item) => (
                                        <li key={item} className="flex items-start gap-2">
                                            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-300" />
                                            <span>{item}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div className="glass-card border border-blue-500/15 p-5">
                                <p className="text-xs uppercase tracking-[0.28em] text-blue-200/75">AI Reading</p>
                                <h3 className="mt-2 text-lg font-semibold text-white">Travel Confidence</h3>
                                <p className="mt-3 text-sm leading-6 text-slate-300">
                                    {result.accident_check.has_accidents
                                        ? 'The selected route overlaps with previously approved accident areas. Prefer slower travel, more distance, and alternate corridors where practical.'
                                        : 'No direct overlap with approved accident hotspots was found for this path. Standard caution still applies, especially in low-visibility or high-density zones.'}
                                </p>
                            </div>
                        </div>

                        {result.accident_check.matched_locations.length > 0 && (
                            <div className="glass-card p-5 border border-amber-500/25 bg-amber-500/5 xl:col-span-2">
                                <h3 className="text-amber-200 font-semibold mb-3">Matched Accident Areas</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {result.accident_check.matched_locations.map((item, idx) => (
                                        <div key={`${item.location}-${idx}`} className="rounded-2xl border border-white/10 bg-black/10 p-4 text-sm">
                                            <p className="text-white">{item.location}</p>
                                            <p className="mt-2 text-slate-400 text-xs">Matched: {item.match_terms.join(', ') || 'N/A'}</p>
                                            <p className="mt-1 text-amber-200 text-xs">Accidents logged: {item.accidents}</p>
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
