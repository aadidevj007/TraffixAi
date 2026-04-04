import Link from 'next/link';

type BrandLogoProps = {
    href?: string;
    size?: 'sm' | 'md' | 'lg';
    className?: string;
    showText?: boolean;
};

const sizeMap = {
    sm: 'h-10',
    md: 'h-12',
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
            <div className={`${sizeMap[size]} aspect-[1.02/1] relative`} aria-hidden="true">
                <svg viewBox="0 0 120 120" className="h-full w-full drop-shadow-[0_0_24px_rgba(59,130,246,0.28)]">
                    <defs>
                        <linearGradient id="shieldOuter" x1="16" y1="14" x2="101" y2="105" gradientUnits="userSpaceOnUse">
                            <stop stopColor="#5EE7FF" />
                            <stop offset="0.55" stopColor="#1D9BFF" />
                            <stop offset="1" stopColor="#E5E7EB" />
                        </linearGradient>
                        <linearGradient id="shieldInner" x1="28" y1="24" x2="94" y2="94" gradientUnits="userSpaceOnUse">
                            <stop stopColor="#0B1936" />
                            <stop offset="1" stopColor="#050814" />
                        </linearGradient>
                        <linearGradient id="roadBlue" x1="28" y1="90" x2="63" y2="53" gradientUnits="userSpaceOnUse">
                            <stop stopColor="#6FE7FF" />
                            <stop offset="1" stopColor="#1A7BFF" />
                        </linearGradient>
                        <linearGradient id="roadRed" x1="56" y1="95" x2="80" y2="57" gradientUnits="userSpaceOnUse">
                            <stop stopColor="#FF7A59" />
                            <stop offset="1" stopColor="#FF334F" />
                        </linearGradient>
                        <linearGradient id="lensRing" x1="75" y1="24" x2="110" y2="56" gradientUnits="userSpaceOnUse">
                            <stop stopColor="#F8FAFC" />
                            <stop offset="0.38" stopColor="#A5B4FC" />
                            <stop offset="0.72" stopColor="#0F172A" />
                            <stop offset="1" stopColor="#020617" />
                        </linearGradient>
                        <radialGradient id="lensCore" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(90 42) rotate(90) scale(13)">
                            <stop stopColor="#8BE8FF" />
                            <stop offset="0.4" stopColor="#1D9BFF" />
                            <stop offset="1" stopColor="#050B1A" />
                        </radialGradient>
                        <filter id="softGlow">
                            <feGaussianBlur stdDeviation="3.5" result="blur" />
                            <feMerge>
                                <feMergeNode in="blur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                    </defs>

                    <path d="M60 10C47 18 34 20 22 21v34c0 21 14 39 38 53 24-14 38-32 38-53V21C86 20 73 18 60 10Z" fill="url(#shieldOuter)" />
                    <path d="M60 18C49 25 38 27 29 28v27c0 17 11 32 31 45 20-13 31-28 31-45V28c-9-1-20-3-31-10Z" fill="url(#shieldInner)" />
                    <rect x="47" y="42" width="4" height="20" rx="1" fill="#0EA5FF" />
                    <rect x="54" y="33" width="6" height="29" rx="1" fill="#38BDF8" />
                    <rect x="63" y="39" width="4" height="23" rx="1" fill="#2563EB" />
                    <rect x="70" y="46" width="3" height="16" rx="1" fill="#38BDF8" />
                    <path d="M24 88c14-4 25-17 38-20" stroke="url(#roadBlue)" strokeWidth="7" strokeLinecap="round" filter="url(#softGlow)" />
                    <path d="M59 70c8 2 16 11 23 24" stroke="url(#roadRed)" strokeWidth="6" strokeLinecap="round" filter="url(#softGlow)" />
                    <path d="M46 86c5-11 10-18 18-23" stroke="#E2E8F0" strokeWidth="4" strokeLinecap="round" opacity="0.85" />
                    <path d="M48 79 51 75M55 71 58 67M62 63 65 59" stroke="#F8FAFC" strokeWidth="1.8" strokeLinecap="round" opacity="0.95" />
                    <rect x="10" y="46" width="5" height="5" fill="#33D7FF" opacity="0.9" />
                    <rect x="18" y="53" width="4" height="4" fill="#0EA5FF" opacity="0.9" />
                    <rect x="13" y="61" width="5" height="5" fill="#38BDF8" opacity="0.9" />
                    <rect x="23" y="60" width="3.5" height="3.5" fill="#5EE7FF" opacity="0.9" />
                    <rect x="18" y="69" width="4.5" height="4.5" fill="#1D9BFF" opacity="0.9" />
                    <g transform="translate(67 18)">
                        <ellipse cx="25" cy="22" rx="24" ry="20" fill="url(#lensRing)" />
                        <ellipse cx="25" cy="22" rx="18" ry="15" fill="#071121" />
                        <circle cx="25" cy="22" r="11" fill="url(#lensCore)" />
                        <circle cx="25" cy="22" r="5.5" fill="#020617" />
                        <circle cx="25" cy="22" r="2.5" fill="#7DD3FC" />
                        <circle cx="16" cy="17" r="2" fill="#F8FAFC" opacity="0.95" />
                        <circle cx="9" cy="26" r="1.7" fill="#FF3353" opacity="0.95" />
                        <path d="M8 13c2-5 10-9 21-9" stroke="#0F172A" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
                    </g>
                </svg>
            </div>
            {showText && (
                <span className="flex flex-col leading-none">
                    <span className="text-[1.1rem] font-brand font-bold tracking-[0.12em] text-white group-hover:opacity-95 transition-opacity">
                        <span className="bg-gradient-to-b from-slate-50 to-slate-300 bg-clip-text text-transparent">TRAFFI</span>
                        <span className="bg-gradient-to-b from-slate-100 to-slate-400 bg-clip-text text-transparent">X</span>
                        <span className="ml-0.5 bg-gradient-to-b from-sky-300 via-sky-400 to-blue-500 bg-clip-text text-transparent">AI</span>
                    </span>
                    <span className="mt-1 text-[0.52rem] tracking-[0.42em] text-slate-400">SMART TRAFFIC</span>
                </span>
            )}
        </Link>
    );
}
