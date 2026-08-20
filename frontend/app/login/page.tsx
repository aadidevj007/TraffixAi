'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowRight, Shield } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import BrandLogo from '@/components/layout/BrandLogo';

export default function LoginPage() {
    const [loading, setLoading] = useState(false);
    const { user, loading: authLoading, loginWithGoogle, isAdmin } = useAuth();
    const router = useRouter();

    // Redirect if already logged in
    useEffect(() => {
        if (!authLoading && user) {
            router.replace(isAdmin() ? '/admin' : '/dashboard');
        }
    }, [user, authLoading, isAdmin, router]);

    // Show nothing while checking auth state
    if (authLoading || user) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    const handleGoogle = async () => {
        setLoading(true);
        try {
            await loginWithGoogle();
            toast.success('Welcome to TraffixAI!');
        } catch (err: unknown) {
            const e = err as { code?: string; message?: string };
            const msg =
                e.code === 'auth/popup-closed-by-user'
                    ? 'Sign-in popup closed'
                    : e.code === 'auth/popup-blocked'
                        ? 'Popup blocked – please allow popups for this site'
                        : e.message || 'Google sign-in failed';
            toast.error(msg);
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-4 overflow-hidden relative">
            {/* Matte black base + diagonal red gradient */}
            <div className="absolute inset-0 bg-[#0a0a0a]" />
            <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(10,10,10,1)_0%,rgba(40,8,8,0.8)_30%,rgba(120,15,15,0.3)_55%,rgba(180,20,20,0.15)_70%,rgba(10,10,10,1)_100%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(220,38,38,0.12),transparent_50%)]" />
            <div className="absolute inset-0 admin-noise opacity-40" />

            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, ease: 'easeOut' }}
                className="w-full max-w-md relative z-10"
            >
                {/* Logo */}
                <div className="text-center mb-10">
                    <BrandLogo href="/" size="md" className="mb-6" />
                    <h1 className="text-3xl font-display font-bold text-white mb-2">Welcome</h1>
                    <p className="text-red-100/70">Sign in to continue</p>
                </div>

                {/* Google Sign-In Card */}
                <div className="glass-card p-8 border border-red-600/20 space-y-6 shadow-[0_20px_80px_rgba(0,0,0,0.6)]">
                    <div className="rounded-2xl border border-red-600/20 bg-[linear-gradient(135deg,rgba(120,15,15,0.3),rgba(15,15,15,0.2))] p-4">
                        <p className="text-xs uppercase tracking-[0.35em] text-red-200/80">Citywide Access</p>
                        <p className="mt-2 text-sm text-red-50/80">Enter the traffic intelligence network, review incidents, and manage safety workflows in one place.</p>
                    </div>

                    {/* Google Button */}
                    <button
                        onClick={handleGoogle}
                        disabled={loading}
                        className="btn-secondary w-full justify-center gap-3 border-white/20 bg-white/10 text-white hover:border-white/40 hover:bg-white/15 hover:text-white"
                    >
                        {loading ? (
                            <div className="w-5 h-5 border-2 border-gray-400 border-t-gray-800 rounded-full animate-spin" />
                        ) : (
                            <>
                                {/* Google SVG icon */}
                                <svg className="w-5 h-5" viewBox="0 0 24 24">
                                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                </svg>
                                Continue with Google
                            </>
                        )}
                    </button>

                    {/* Divider */}
                    <div className="flex items-center gap-3">
                        <div className="flex-1 h-px bg-white/10" />
                        <span className="text-neutral-500 text-xs">OR</span>
                        <div className="flex-1 h-px bg-white/10" />
                    </div>

                    {/* Admin Login Link */}
                    <Link
                        href="/admin-login"
                        className="btn-secondary w-full justify-center gap-2 text-sm group"
                    >
                        <Shield className="w-4 h-4 text-red-300 group-hover:text-red-200 transition-colors" />
                        Admin Login (Username & Password)
                        <ArrowRight className="w-3.5 h-3.5 ml-auto opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                    </Link>

                    {/* Info */}
                    <p className="text-center text-xs text-neutral-500 leading-relaxed">
                        By signing in you agree to our{' '}
                        <Link href="/terms" className="text-red-300 hover:underline">Terms of Service</Link>
                        {' '}and{' '}
                        <Link href="/privacy" className="text-red-300 hover:underline">Privacy Policy</Link>.
                    </p>
                </div>

                {/* Feature badges */}
                <div className="mt-6 grid grid-cols-3 gap-3">
                    {['Secure OAuth', 'Role-Based Access', 'Instant Dashboard'].map((f) => (
                        <div key={f} className="glass-card p-3 text-center border border-red-600/10">
                            <p className="text-xs text-neutral-400">{f}</p>
                        </div>
                    ))}
                </div>
            </motion.div>
        </div>
    );
}
