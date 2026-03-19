'use client';

import { usePathname } from 'next/navigation';

export default function AppBackgroundVideo() {
    const pathname = usePathname();

    if (pathname === '/login' || pathname?.startsWith('/login/')) {
        return null;
    }

    return (
        <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
            <video
                className="w-full h-full object-cover opacity-30"
                src="/videos/mainbg.mp4"
                autoPlay
                muted
                loop
                playsInline
            />
            <div className="absolute inset-0 bg-dark-900/65" />
        </div>
    );
}
