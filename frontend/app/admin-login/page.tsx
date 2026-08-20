'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, ShieldAlert, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import BrandLogo from '@/components/layout/BrandLogo';

const LOCAL_ADMIN_CRED_KEY = 'traffixai_local_admin_credentials';
const DEFAULT_LOCAL_ADMIN = { username: 'admin', password: 'admin@1234' };

function getLocalAdminCredentials() {
    if (typeof window === 'undefined') return DEFAULT_LOCAL_ADMIN;
    try {
        const raw = localStorage.getItem(LOCAL_ADMIN_CRED_KEY);
        if (!raw) return DEFAULT_LOCAL_ADMIN;
        const parsed = JSON.parse(raw) as { username?: string; password?: string };
        const username = (parsed.username || '').trim() || DEFAULT_LOCAL_ADMIN.username;
        const password = (parsed.password || '').trim() || DEFAULT_LOCAL_ADMIN.password;
        return { username, password };
    } catch {
        return DEFAULT_LOCAL_ADMIN;
    }
}

export default function AdminLoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [loading, setLoading] = useState(false);
    const { adminLogin } = useAuth();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const creds = getLocalAdminCredentials();
            // ── Local admin bypass ──────────────────────────────────────
            if (username === creds.username && password === creds.password) {
                // Store a local session flag so the app treats this user as Admin
                sessionStorage.setItem('localAdmin', 'true');
                toast.success('Admin access granted');
                window.location.href = '/admin';
                return;
            }
            // ── Firebase email/password fallback ────────────────────────
            // username may be an email for Firebase accounts
            await adminLogin(username, password);
            toast.success('Admin access granted');
        } catch {
            toast.error('Invalid admin credentials');
        } finally {
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
                transition={{ duration: 0.4 }}
                className="w-full max-w-md relative z-10"
            >
                <Link href="/login" className="inline-flex items-center gap-2 text-neutral-300 hover:text-white text-sm mb-6 transition-colors">
                    <ArrowLeft className="w-4 h-4" />
                    Back to Login
                </Link>

                <div className="text-center mb-8">
                    <BrandLogo href="/" size="md" className="mb-4" />
                    <h1 className="text-3xl font-display font-bold text-white mb-2">Admin Login</h1>
                    <p className="text-red-100/70 text-sm">Sign in with local admin username and password.</p>
                </div>

                <div className="glass-card p-8 border border-red-600/20 shadow-[0_24px_80px_rgba(0,0,0,0.6)]">
                    <div className="mb-5 rounded-2xl border border-red-600/20 bg-[linear-gradient(135deg,rgba(120,15,15,0.3),rgba(15,15,15,0.2))] p-4">
                        <p className="text-xs uppercase tracking-[0.35em] text-red-200/80">Restricted Access</p>
                        <p className="mt-2 text-sm text-red-50/80">Emergency workflows, decision review, and enforcement escalation are available only to authorized operators.</p>
                    </div>
                    <form onSubmit={handleLogin} className="space-y-4">
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="Username"
                            className="input-field"
                            autoComplete="username"
                            required
                        />
                        <div className="relative">
                            <input
                                type={showPass ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Password"
                                className="input-field pr-12"
                                autoComplete="current-password"
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowPass(!showPass)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-red-100 transition-colors"
                            >
                                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-red-700 via-red-600 to-red-500 text-white font-semibold px-6 py-4 rounded-xl disabled:opacity-50 hover:from-red-600 hover:to-red-400 transition-all shadow-[0_10px_40px_rgba(220,38,38,0.3)]"
                        >
                            <ShieldAlert className="w-4 h-4" />
                            {loading ? 'Checking...' : 'Access Admin Panel'}
                        </button>
                    </form>
                </div>
            </motion.div>
        </div>
    );
}
