'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader, MapPin } from 'lucide-react';

type LocationSuggestion = {
    place_id: number;
    display_name: string;
};

type NominatimItem = {
    place_id: number;
    display_name: string;
};

type Props = {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    inputClassName?: string;
};

export default function LocationAutocompleteInput({
    value,
    onChange,
    placeholder = 'Enter location',
    inputClassName = '',
}: Props) {
    const [query, setQuery] = useState(value);
    const [loading, setLoading] = useState(false);
    const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        setQuery(value);
    }, [value]);

    useEffect(() => {
        return () => {
            if (closeTimer.current) clearTimeout(closeTimer.current);
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
        };
    }, []);

    useEffect(() => {
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        const controller = new AbortController();
        debounceTimer.current = setTimeout(async () => {
            const q = query.trim();
            if (!q) {
                setSuggestions([]);
                setOpen(false);
                return;
            }

            setLoading(true);
            try {
                const params = new URLSearchParams({
                    format: 'jsonv2',
                    addressdetails: '1',
                    limit: '6',
                    countrycodes: 'in',
                    q,
                });
                const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
                    signal: controller.signal,
                    headers: { 'Accept-Language': 'en' },
                });
                if (!res.ok) throw new Error('Location lookup failed');
                const data: unknown = await res.json();
                const next = Array.isArray(data)
                    ? (data as NominatimItem[]).map((item) => ({ place_id: item.place_id, display_name: item.display_name }))
                    : [];
                setSuggestions(next);
                setOpen(next.length > 0);
                setActiveIndex(-1);
            } catch {
                setSuggestions([]);
                setOpen(false);
            } finally {
                setLoading(false);
            }

        }, 250);

        return () => {
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
            controller.abort();
        };
    }, [query]);

    const select = (name: string) => {
        onChange(name);
        setQuery(name);
        setOpen(false);
        setActiveIndex(-1);
    };

    return (
        <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            {loading && <Loader className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 animate-spin" />}
            <input
                type="text"
                value={query}
                placeholder={placeholder}
                onFocus={() => {
                    if (closeTimer.current) clearTimeout(closeTimer.current);
                    setOpen(suggestions.length > 0);
                }}
                onBlur={() => {
                    closeTimer.current = setTimeout(() => setOpen(false), 120);
                }}
                onChange={(e) => {
                    const nextValue = e.target.value;
                    setQuery(nextValue);
                    onChange(nextValue);
                }}
                onKeyDown={(e) => {
                    if (!open || suggestions.length === 0) return;
                    if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setActiveIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
                    } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setActiveIndex((prev) => Math.max(prev - 1, 0));
                    } else if (e.key === 'Enter' && activeIndex >= 0) {
                        e.preventDefault();
                        select(suggestions[activeIndex].display_name);
                    } else if (e.key === 'Escape') {
                        setOpen(false);
                    }
                }}
                className={`input-field pl-10 pr-10 ${inputClassName}`}
                autoComplete="off"
            />

            {open && suggestions.length > 0 && (
                <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-white/10 bg-dark-900/95 backdrop-blur-xl shadow-xl">
                    {suggestions.map((suggestion, index) => (
                        <button
                            key={suggestion.place_id}
                            type="button"
                            onMouseDown={() => select(suggestion.display_name)}
                            className={`w-full px-3 py-2.5 text-left text-sm transition-colors ${index === activeIndex
                                    ? 'bg-cyan-500/20 text-cyan-300'
                                    : 'text-slate-300 hover:bg-white/10'
                                }`}
                        >
                            {suggestion.display_name}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
