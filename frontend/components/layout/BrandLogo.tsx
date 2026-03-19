import Link from 'next/link';

type BrandLogoProps = {
    href?: string;
    size?: 'sm' | 'md' | 'lg';
    className?: string;
    showText?: boolean;
};

const sizeMap = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
};

export default function BrandLogo({
    href = '/',
    size = 'md',
    className = '',
    showText = true,
}: BrandLogoProps) {
    return (
        <Link href={href} className={`inline-flex items-center gap-3 group ${className}`}>
            <div
                className={`${sizeMap[size]} rounded-xl bg-gradient-to-br from-cyan-500 via-blue-500 to-indigo-600 shadow-glow-cyan flex items-center justify-center border border-cyan-300/20`}
                aria-hidden="true"
            >
                <svg viewBox="0 0 24 24" className="w-[68%] h-[68%]">
                    <path d="M4 17c2.5-3 5-4.6 8-4.6S17.5 14 20 17" fill="none" stroke="white" strokeWidth="1.7" strokeLinecap="round" />
                    <path d="M8.1 11.1l1.2-2.5h5.4l1.2 2.5" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    <rect x="7.2" y="11.1" width="9.6" height="3.6" rx="1.5" fill="none" stroke="white" strokeWidth="1.6" />
                    <circle cx="9.1" cy="15.8" r="1.15" fill="#7ef9ff" />
                    <circle cx="14.9" cy="15.8" r="1.15" fill="#7ef9ff" />
                    <path d="M3.2 6.4h3.2M17.6 6.4h3.2M6.4 4.6v3.6M17.6 4.6v3.6" fill="none" stroke="#d8f9ff" strokeWidth="1.2" strokeLinecap="round" />
                    <circle cx="6.4" cy="4.2" r="0.9" fill="#d8f9ff" />
                    <circle cx="17.6" cy="4.2" r="0.9" fill="#d8f9ff" />
                </svg>
            </div>
            {showText && (
                <span className="text-xl font-brand font-bold tracking-[0.06em] gradient-text group-hover:opacity-90 transition-opacity">
                    TraffixAI
                </span>
            )}
        </Link>
    );
}
