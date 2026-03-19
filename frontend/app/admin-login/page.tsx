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
        <div className="min-h-screen bg-dark-900 grid-pattern flex items-center justify-center px-4">
            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="w-full max-w-md"
            >
                <Link href="/login" className="inline-flex items-center gap-2 text-slate-400 hover:text-white text-sm mb-6 transition-colors">
                    <ArrowLeft className="w-4 h-4" />
                    Back to Login
                </Link>

                <div className="text-center mb-8">
                    <BrandLogo href="/" size="md" className="mb-4" />
                    <h1 className="text-3xl font-display font-bold text-white mb-2">Admin Login</h1>
                    <p className="text-slate-400 text-sm">Sign in with local admin username and password.</p>
                </div>

                <div className="glass-card p-8 border border-red-500/20">
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
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                            >
                                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-red-600 to-orange-600 text-white font-semibold px-6 py-4 rounded-xl disabled:opacity-50 hover:from-red-500 hover:to-orange-500 transition-all"
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
