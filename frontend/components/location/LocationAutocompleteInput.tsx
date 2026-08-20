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
    const suppressNextLookup = useRef(false);

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
            if (suppressNextLookup.current) {
                suppressNextLookup.current = false;
                setSuggestions([]);
                setOpen(false);
                return;
            }
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
        suppressNextLookup.current = true;
        onChange(name);
        setQuery(name);
        setSuggestions([]);
        setOpen(false);
        setActiveIndex(-1);
    };

    return (
        <div className="relative">
            <div className="pointer-events-none absolute left-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-2xl border border-red-500/18 bg-red-500/8">
                <MapPin className="h-4 w-4 text-red-200" />
            </div>
            {loading && <Loader className="absolute right-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 animate-spin text-red-300" />}
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
                className={`input-field min-h-[72px] rounded-[1.4rem] pl-16 pr-12 text-[1.05rem] font-medium text-slate-50 ${inputClassName}`}
                autoComplete="off"
            />

            {open && suggestions.length > 0 && (
                <div className="absolute z-30 mt-3 w-full overflow-hidden rounded-[1.4rem] border border-red-500/16 bg-[linear-gradient(180deg,rgba(20,7,7,0.98),rgba(24,9,12,0.94))] shadow-[0_24px_70px_rgba(2,8,23,0.45)] backdrop-blur-2xl">
                    {suggestions.map((suggestion, index) => (
                        <button
                            key={suggestion.place_id}
                            type="button"
                            onMouseDown={() => select(suggestion.display_name)}
                            className={`w-full border-b border-white/6 px-4 py-3 text-left text-sm transition-colors last:border-b-0 ${index === activeIndex
                                    ? 'bg-red-500/16 text-red-100'
                                    : 'text-slate-300 hover:bg-white/6'
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
