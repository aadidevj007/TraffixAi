'use client';

import { motion } from 'framer-motion';
import { User, Mail, Shield, Phone } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export default function ProfilePage() {
    const { user, profile } = useAuth();

    return (
        <div className="min-h-screen bg-dark-900 pt-16">
            <div className="container-max py-10">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="max-w-2xl glass-card border border-white/10 p-6 md:p-8"
                >
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold">
                            {(profile?.name || user?.displayName || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <h1 className="text-2xl font-display font-bold text-white">My Profile</h1>
                            <p className="text-slate-400 text-sm">Account details and role information</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                            <p className="text-xs text-slate-400 mb-1 flex items-center gap-1"><User className="w-3.5 h-3.5" /> Name</p>
                            <p className="text-white">{profile?.name || user?.displayName || 'User'}</p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                            <p className="text-xs text-slate-400 mb-1 flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> Email</p>
                            <p className="text-white break-all">{profile?.email || user?.email || 'N/A'}</p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                            <p className="text-xs text-slate-400 mb-1 flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> Phone</p>
                            <p className="text-white">{profile?.phone || 'Not set'}</p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                            <p className="text-xs text-slate-400 mb-1 flex items-center gap-1"><Shield className="w-3.5 h-3.5" /> Role</p>
                            <p className="text-white">{profile?.role || 'User'}</p>
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
