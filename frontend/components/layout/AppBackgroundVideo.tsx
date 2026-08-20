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
            {/* Deep space base */}
            <div className="absolute inset-0" style={{ background: '#020408' }} />

            {/* Multi-layer nebula gradients */}
            <div className="absolute inset-0" style={{
                background: `
                    radial-gradient(ellipse 80% 50% at 20% 20%, rgba(6,182,212,0.06), transparent),
                    radial-gradient(ellipse 60% 40% at 80% 80%, rgba(139,92,246,0.05), transparent),
                    radial-gradient(ellipse 40% 60% at 50% 0%,   rgba(6,182,212,0.04), transparent),
                    radial-gradient(ellipse 50% 30% at 90% 40%,  rgba(245,158,11,0.03), transparent)
                `
            }} />

            {/* Cyber grid */}
            <div className="absolute inset-0" style={{
                backgroundImage: `
                    linear-gradient(rgba(6,182,212,0.035) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(6,182,212,0.035) 1px, transparent 1px)
                `,
                backgroundSize: '60px 60px'
            }} />

            {/* Horizontal scan lines */}
            <div className="absolute inset-0" style={{
                backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(6,182,212,0.012) 2px, rgba(6,182,212,0.012) 4px)',
            }} />

            {/* Animated ambient blobs */}
            <div className="absolute animate-float" style={{
                top: '-10%', left: '-5%',
                width: '40vw', height: '40vw',
                borderRadius: '999px',
                background: 'radial-gradient(circle, rgba(6,182,212,0.07), transparent 70%)',
                filter: 'blur(60px)',
                animationDuration: '12s',
            }} />
            <div className="absolute animate-float" style={{
                bottom: '-5%', right: '-5%',
                width: '35vw', height: '35vw',
                borderRadius: '999px',
                background: 'radial-gradient(circle, rgba(139,92,246,0.05), transparent 70%)',
                filter: 'blur(80px)',
                animationDuration: '16s',
                animationDelay: '-6s',
            }} />
            <div className="absolute animate-float" style={{
                top: '40%', right: '10%',
                width: '20vw', height: '20vw',
                borderRadius: '999px',
                background: 'radial-gradient(circle, rgba(245,158,11,0.04), transparent 70%)',
                filter: 'blur(60px)',
                animationDuration: '10s',
                animationDelay: '-3s',
            }} />

            {/* Bottom fade to dark */}
            <div className="absolute bottom-0 left-0 right-0 h-64"
                style={{ background: 'linear-gradient(to top, #020408, transparent)' }} />
        </div>
    );
}
