import Link from 'next/link';

type BrandLogoProps = {
    href?: string;
    size?: 'sm' | 'md' | 'lg';
    className?: string;
    showText?: boolean;
};

const sizeMap = {
    sm: 'h-9',
    md: 'h-11',
    lg: 'h-16',
};

export default function BrandLogo({
    href = '/',
    size = 'md',
    className = '',
    showText = true,
}: BrandLogoProps) {
    return (
        <Link href={href} className={`inline-flex items-center gap-3 group ${className}`}>
            <div className={`${sizeMap[size]} aspect-square relative flex-shrink-0`} aria-hidden="true">
                <svg viewBox="0 0 120 120" className="h-full w-full" style={{ filter: 'drop-shadow(0 0 20px rgba(6,182,212,0.45))' }}>
                    <defs>
                        {/* Outer shield gradient: cyan to violet */}
                        <linearGradient id="shieldOuter" x1="16" y1="14" x2="101" y2="105" gradientUnits="userSpaceOnUse">
                            <stop stopColor="#22d3ee" />
                            <stop offset="0.5" stopColor="#06b6d4" />
                            <stop offset="1" stopColor="#8b5cf6" />
                        </linearGradient>

                        {/* Inner deep space fill */}
                        <linearGradient id="shieldInner" x1="28" y1="24" x2="94" y2="94" gradientUnits="userSpaceOnUse">
                            <stop stopColor="#030d1f" />
                            <stop offset="1" stopColor="#020408" />
                        </linearGradient>

                        {/* Road streak: cyan */}
                        <linearGradient id="roadCyan" x1="28" y1="90" x2="63" y2="53" gradientUnits="userSpaceOnUse">
                            <stop stopColor="#67e8f9" />
                            <stop offset="1" stopColor="#06b6d4" />
                        </linearGradient>

                        {/* Road streak: amber */}
                        <linearGradient id="roadAmber" x1="56" y1="95" x2="80" y2="57" gradientUnits="userSpaceOnUse">
                            <stop stopColor="#fcd34d" />
                            <stop offset="1" stopColor="#f59e0b" />
                        </linearGradient>

                        {/* Lens ring */}
                        <linearGradient id="lensRing" x1="75" y1="24" x2="110" y2="56" gradientUnits="userSpaceOnUse">
                            <stop stopColor="#a5f3fc" />
                            <stop offset="0.4" stopColor="#06b6d4" />
                            <stop offset="0.75" stopColor="#0c1a30" />
                            <stop offset="1" stopColor="#020408" />
                        </linearGradient>

                        {/* Lens core */}
                        <radialGradient id="lensCore" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse"
                            gradientTransform="translate(90 42) rotate(90) scale(13)">
                            <stop stopColor="#67e8f9" />
                            <stop offset="0.4" stopColor="#06b6d4" />
                            <stop offset="1" stopColor="#050a18" />
                        </radialGradient>

                        {/* Bar glow filter */}
                        <filter id="barGlow">
                            <feGaussianBlur stdDeviation="2" result="blur" />
                            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                        </filter>

                        {/* Neon glow filter */}
                        <filter id="neonGlow">
                            <feGaussianBlur stdDeviation="3" result="blur" />
                            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                        </filter>
                    </defs>

                    {/* Shield outer */}
                    <path d="M60 10C47 18 34 20 22 21v34c0 21 14 39 38 53 24-14 38-32 38-53V21C86 20 73 18 60 10Z"
                        fill="url(#shieldOuter)" />

                    {/* Shield inner dark */}
                    <path d="M60 18C49 25 38 27 29 28v27c0 17 11 32 31 45 20-13 31-28 31-45V28c-9-1-20-3-31-10Z"
                        fill="url(#shieldInner)" />

                    {/* AI metric bars */}
                    <rect x="47" y="44" width="4" height="18" rx="1.5" fill="#22d3ee" filter="url(#barGlow)" opacity="0.95" />
                    <rect x="54" y="35" width="5" height="27" rx="1.5" fill="#06b6d4" filter="url(#barGlow)" opacity="0.95" />
                    <rect x="62" y="40" width="4" height="22" rx="1.5" fill="#0891b2" filter="url(#barGlow)" opacity="0.9" />
                    <rect x="70" y="48" width="3.5" height="14" rx="1.5" fill="#22d3ee" filter="url(#barGlow)" opacity="0.85" />

                    {/* Road streaks */}
                    <path d="M24 88c14-4 25-17 38-20"
                        stroke="url(#roadCyan)" strokeWidth="6.5" strokeLinecap="round" filter="url(#neonGlow)" />
                    <path d="M59 70c8 2 16 11 23 24"
                        stroke="url(#roadAmber)" strokeWidth="5.5" strokeLinecap="round" filter="url(#neonGlow)" />
                    <path d="M46 86c5-11 10-18 18-23"
                        stroke="#a5f3fc" strokeWidth="3.5" strokeLinecap="round" opacity="0.8" />
                    <path d="M48 79 51 75M55 71 58 67M62 63 65 59"
                        stroke="#e0f7fa" strokeWidth="1.8" strokeLinecap="round" opacity="0.9" />

                    {/* Data node squares */}
                    <rect x="10" y="46" width="5" height="5" rx="1" fill="#22d3ee" opacity="0.9" />
                    <rect x="18" y="54" width="4" height="4" rx="1" fill="#06b6d4" opacity="0.9" />
                    <rect x="12" y="62" width="5" height="5" rx="1" fill="#67e8f9" opacity="0.9" />
                    <rect x="22" y="61" width="3.5" height="3.5" rx="1" fill="#a5f3fc" opacity="0.9" />
                    <rect x="17" y="70" width="4.5" height="4.5" rx="1" fill="#06b6d4" opacity="0.85" />

                    {/* CCTV Lens */}
                    <g transform="translate(67 18)">
                        <ellipse cx="25" cy="22" rx="24" ry="20" fill="url(#lensRing)" />
                        <ellipse cx="25" cy="22" rx="18" ry="15" fill="#060d1f" />
                        <circle cx="25" cy="22" r="11" fill="url(#lensCore)" />
                        <circle cx="25" cy="22" r="5.5" fill="#020408" />
                        <circle cx="25" cy="22" r="2.5" fill="#67e8f9" />
                        {/* Lens highlight */}
                        <circle cx="16" cy="17" r="2" fill="#e0f7fa" opacity="0.9" />
                        {/* Alert dot: amber */}
                        <circle cx="9" cy="26" r="1.7" fill="#f59e0b" opacity="0.95" />
                        <path d="M8 13c2-5 10-9 21-9" stroke="#0c1a30" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
                    </g>
                </svg>
            </div>

            {showText && (
                <span className="flex flex-col leading-none">
                    <span className="font-brand font-bold tracking-[0.1em] text-white group-hover:opacity-95 transition-opacity"
                        style={{ fontSize: size === 'sm' ? '1rem' : size === 'lg' ? '1.4rem' : '1.1rem' }}>
                        <span style={{
                            background: 'linear-gradient(135deg, #e0f7fa, #a5f3fc, #06b6d4)',
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text'
                        }}>
                            TRAFFIX
                        </span>
                        <span style={{
                            background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text'
                        }}>
                            AI
                        </span>
                    </span>
                    <span className="mt-0.5 font-mono tracking-[0.4em] text-cyan-500/60"
                        style={{ fontSize: size === 'lg' ? '0.6rem' : '0.5rem' }}>
                        SMART TRAFFIC
                    </span>
                </span>
            )}
        </Link>
    );
}
