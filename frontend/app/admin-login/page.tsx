'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Activity, ArrowLeft, ShieldAlert, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';

// Local hardcoded admin credentials (bypass Firebase for quick access)
const LOCAL_ADMIN_USER = 'admin';
const LOCAL_ADMIN_PASS = 'admin@1234';

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
            // ── Local admin bypass ──────────────────────────────────────
            if (username === LOCAL_ADMIN_USER && password === LOCAL_ADMIN_PASS) {
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
            toast.error('Invalid admin credentials. Use admin / admin@1234');
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
                    <Link href="/" className="inline-flex items-center gap-2 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center">
                            <Activity className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-2xl font-display font-bold gradient-text">TraffixAI</span>
                    </Link>
                    <h1 className="text-3xl font-display font-bold text-white mb-2">Admin Login</h1>
                    <p className="text-slate-400 text-sm">Username: <code className="text-cyan-400">admin</code> · Password: <code className="text-cyan-400">admin@1234</code></p>
                </div>

                <div className="glass-card p-8 border border-red-500/20">
                    <form onSubmit={handleLogin} className="space-y-4">
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="Username or Email"
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
