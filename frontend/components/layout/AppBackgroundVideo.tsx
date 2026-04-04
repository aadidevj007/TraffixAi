'use client';

import { usePathname } from 'next/navigation';

export default function AppBackgroundVideo() {
    const pathname = usePathname();

    if (
        pathname === '/login' ||
        pathname?.startsWith('/login/') ||
        pathname === '/admin-login' ||
        pathname?.startsWith('/admin-login/')
    ) {
        return null;
    }

    return (
        <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
            <video
                className="w-full h-full object-cover opacity-[0.28] saturate-[1.15] contrast-[1.08] scale-[1.04] blur-[1px]"
                src="/videos/mainbg.mp4"
                autoPlay
                muted
                loop
                playsInline
            />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_18%,rgba(34,211,238,0.14),transparent_24%),radial-gradient(circle_at_84%_20%,rgba(251,113,133,0.14),transparent_26%),radial-gradient(circle_at_70%_78%,rgba(239,68,68,0.16),transparent_28%),linear-gradient(125deg,rgba(6,10,20,0.76),rgba(26,5,10,0.7),rgba(8,4,4,0.92))]" />
            <div className="absolute inset-0 opacity-[0.12] [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:48px_48px]" />
            <div className="absolute inset-y-0 left-[-10%] w-[32rem] bg-[radial-gradient(circle,rgba(56,189,248,0.18),transparent_62%)] blur-3xl" />
            <div className="absolute inset-y-0 right-[-12%] w-[34rem] bg-[radial-gradient(circle,rgba(244,63,94,0.16),transparent_60%)] blur-3xl" />
        </div>
    );
}
