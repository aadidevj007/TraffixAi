'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Activity, ArrowRight, Shield } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';

export default function LoginPage() {
    const [loading, setLoading] = useState(false);
    const { user, loading: authLoading, loginWithGoogle } = useAuth();
    const router = useRouter();

    // Redirect if already logged in
    useEffect(() => {
        if (!authLoading && user) {
            router.replace('/');
        }
    }, [user, authLoading, router]);

    // Show nothing while checking auth state
    if (authLoading || user) {
        return (
            <div className="min-h-screen bg-dark-900 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    const handleGoogle = async () => {
        setLoading(true);
        try {
            await loginWithGoogle();
            toast.success('Welcome to TraffixAI!');
        } catch (err: any) {
            const msg =
                err.code === 'auth/popup-closed-by-user'
                    ? 'Sign-in popup closed'
                    : err.code === 'auth/popup-blocked'
                        ? 'Popup blocked – please allow popups for this site'
                        : err.message || 'Google sign-in failed';
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-dark-900 grid-pattern flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-gradient-radial from-cyan-500/5 via-transparent to-transparent" />

            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-md relative z-10"
            >
                {/* Logo */}
                <div className="text-center mb-10">
                    <Link href="/" className="inline-flex items-center gap-2 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-glow-cyan">
                            <Activity className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-2xl font-display font-bold gradient-text">TraffixAI</span>
                    </Link>
                    <h1 className="text-3xl font-display font-bold text-white mb-2">Welcome Back</h1>
                    <p className="text-slate-400">Sign in with your Google account to continue</p>
                </div>

                {/* Google Sign-In Card */}
                <div className="glass-card p-8 border border-white/10 space-y-6">

                    {/* Google Button */}
                    <button
                        onClick={handleGoogle}
                        disabled={loading}
                        className="w-full flex items-center justify-center gap-3 bg-white text-gray-800 font-semibold px-6 py-4 rounded-xl
                       hover:bg-gray-100 active:scale-95 transition-all duration-200 shadow-lg hover:shadow-xl"
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
                        <span className="text-slate-500 text-xs">OR</span>
                        <div className="flex-1 h-px bg-white/10" />
                    </div>

                    {/* Admin Login Link */}
                    <Link
                        href="/admin-login"
                        className="w-full flex items-center justify-center gap-2 border border-white/20 text-slate-300
                       px-6 py-3.5 rounded-xl hover:bg-white/10 hover:border-white/30 hover:text-white
                       transition-all duration-200 font-medium text-sm group"
                    >
                        <Shield className="w-4 h-4 text-cyan-400 group-hover:text-cyan-300 transition-colors" />
                        Admin Login (Email & Password)
                        <ArrowRight className="w-3.5 h-3.5 ml-auto opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                    </Link>

                    {/* Info */}
                    <p className="text-center text-xs text-slate-500 leading-relaxed">
                        By signing in you agree to our{' '}
                        <Link href="/terms" className="text-cyan-400 hover:underline">Terms of Service</Link>
                        {' '}and{' '}
                        <Link href="/privacy" className="text-cyan-400 hover:underline">Privacy Policy</Link>.
                    </p>
                </div>

                {/* Feature badges */}
                <div className="mt-6 grid grid-cols-3 gap-3">
                    {['Secure OAuth', 'Role-Based Access', 'Instant Dashboard'].map((f) => (
                        <div key={f} className="glass-card p-3 text-center border border-white/5">
                            <p className="text-xs text-slate-400">{f}</p>
                        </div>
                    ))}
                </div>
            </motion.div>
        </div>
    );
}
