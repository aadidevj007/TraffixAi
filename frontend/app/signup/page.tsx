'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Mail, Lock, Activity, Eye, EyeOff, User, Phone, ArrowRight, Shield } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';

type SignupRole = 'User' | 'Admin' | 'Authority';

export default function SignupPage() {
    const [form, setForm] = useState<{ name: string; email: string; phone: string; password: string; confirmPassword: string; role: SignupRole }>({
        name: '',
        email: '',
        phone: '',
        password: '',
        confirmPassword: '',
        role: 'User',
    });
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const { signup } = useAuth();
    const router = useRouter();

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setForm((prev) => ({ ...prev, [e.target.name]: e.target.value } as typeof prev));
    };

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.name || !form.email || !form.phone || !form.password) return toast.error('Please fill all fields');
        if (form.password !== form.confirmPassword) return toast.error('Passwords do not match');
        if (form.password.length < 6) return toast.error('Password must be at least 6 characters');
        setLoading(true);
        try {
            await signup(form.name, form.email, form.phone, form.password, form.role);
            toast.success('Account created successfully!');
            router.push('/dashboard');
        } catch (err: any) {
            const msg = err.code === 'auth/email-already-in-use' ? 'Email already in use' : err.message || 'Signup failed';
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-dark-900 grid-pattern flex items-center justify-center px-4 py-20">
            <div className="absolute inset-0 bg-gradient-radial from-purple-500/5 via-transparent to-transparent" />
            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-md relative z-10"
            >
                <div className="text-center mb-8">
                    <Link href="/" className="inline-flex items-center gap-2 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-glow-cyan">
                            <Activity className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-2xl font-display font-bold gradient-text">TraffixAI</span>
                    </Link>
                    <h1 className="text-3xl font-display font-bold text-white mb-2">Create Account</h1>
                    <p className="text-slate-400">Join the intelligent traffic management platform</p>
                </div>

                <div className="glass-card p-8 border border-white/10">
                    <form onSubmit={handleSignup} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Full Name</label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input type="text" name="name" value={form.name} onChange={handleChange} placeholder="John Doe" className="input-field pl-10" required />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Email Address</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input type="email" name="email" value={form.email} onChange={handleChange} placeholder="you@email.com" className="input-field pl-10" required />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Phone Number</label>
                            <div className="relative">
                                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input type="tel" name="phone" value={form.phone} onChange={handleChange} placeholder="+91 1234567890" className="input-field pl-10" required />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Role</label>
                            <div className="relative">
                                <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <select name="role" value={form.role} onChange={handleChange} className="input-field pl-10 appearance-none cursor-pointer">
                                    <option value="User">User</option>
                                    <option value="Authority">Authority</option>
                                    <option value="Admin">Admin</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input type={showPassword ? 'text' : 'password'} name="password" value={form.password} onChange={handleChange} placeholder="Min 6 characters" className="input-field pl-10 pr-10" required />
                                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Confirm Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input type="password" name="confirmPassword" value={form.confirmPassword} onChange={handleChange} placeholder="Repeat password" className="input-field pl-10" required />
                            </div>
                        </div>

                        <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 py-4 mt-2">
                            {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><ArrowRight className="w-4 h-4" /> Create Account</>}
                        </button>
                    </form>

                    <div className="mt-6 text-center">
                        <p className="text-slate-400 text-sm">
                            Already have an account?{' '}
                            <Link href="/login" className="text-cyan-400 hover:text-cyan-300 font-medium transition-colors">Sign In</Link>
                        </p>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
