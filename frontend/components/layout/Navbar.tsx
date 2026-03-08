'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import {
    Home, LayoutDashboard, Upload, FileText, Shield,
    LogIn, LogOut, Menu, X, ChevronDown, User, Activity, Sparkles
} from 'lucide-react';
import toast from 'react-hot-toast';

const guestNavLinks = [
    { href: '/', label: 'Home', icon: Home },
];

const userNavLinks = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/ai-recommendation', label: 'AI Recommendation', icon: Sparkles },
    { href: '/upload', label: 'Upload', icon: Upload },
    { href: '/reports', label: 'Reports', icon: FileText },
];

const adminLink = { href: '/admin', label: 'Admin', icon: Shield };


export default function Navbar() {
    const [isOpen, setIsOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const [userMenuOpen, setUserMenuOpen] = useState(false);
    const pathname = usePathname();
    const router = useRouter();
    const { user, profile, logout, isAdmin } = useAuth();
    const visibleLinks = user
        ? (isAdmin() ? [...userNavLinks, adminLink] : userNavLinks)
        : guestNavLinks;

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const handleLogout = async () => {
        try {
            await logout();
            toast.success('Logged out successfully');
            router.push('/');
        } catch {
            toast.error('Logout failed');
        }
    };

    return (
        <motion.nav
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5 }}
            className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled
                ? 'bg-dark-900/95 backdrop-blur-xl border-b border-white/10 shadow-lg'
                : 'bg-transparent'
                }`}
        >
            <div className="container-max">
                <div className="flex items-center justify-between h-16">
                    {/* Logo */}
                    <Link href="/" className="flex items-center gap-2 group">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-glow-cyan">
                            <Activity className="w-4 h-4 text-white" />
                        </div>
                        <span className="text-xl font-display font-bold gradient-text group-hover:opacity-90 transition-opacity">
                            TraffixAI
                        </span>
                    </Link>

                    {/* Desktop Links */}
                    <div className="hidden md:flex items-center gap-1">
                        {visibleLinks.map(({ href, label, icon: Icon }) => (
                            <Link
                                key={href}
                                href={href}
                                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${href === '/admin'
                                    ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10'
                                    : pathname === href
                                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                                        : 'text-slate-300 hover:text-white hover:bg-white/10'
                                    }`}
                            >
                                <Icon className="w-4 h-4" />
                                {label}
                            </Link>
                        ))}
                    </div>

                    {/* Right side */}
                    <div className="hidden md:flex items-center gap-3">
                        {user ? (
                            <div className="relative">
                                <button
                                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                                    className="flex items-center gap-2 glass-card px-3 py-1.5 hover:border-cyan-500/30 transition-all"
                                >
                                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center text-xs font-bold">
                                        {profile?.name?.[0] || user.email?.[0]?.toUpperCase()}
                                    </div>
                                    <div className="text-left">
                                        <p className="text-xs font-medium text-white leading-none">{profile?.name || 'User'}</p>
                                        <p className="text-xs text-slate-400">{profile?.role}</p>
                                    </div>
                                    <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
                                </button>

                                <AnimatePresence>
                                    {userMenuOpen && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: 10 }}
                                            className="absolute right-0 top-full mt-2 w-48 glass-card border border-white/10 rounded-xl overflow-hidden"
                                        >
                                            <Link href="/profile" className="flex items-center gap-2 px-4 py-3 text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-colors">
                                                <User className="w-4 h-4" />
                                                My Profile
                                            </Link>
                                            <button
                                                onClick={handleLogout}
                                                className="w-full flex items-center gap-2 px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                                            >
                                                <LogOut className="w-4 h-4" />
                                                Logout
                                            </button>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        ) : (
                            <Link href="/login" className="btn-primary flex items-center gap-2 py-2 px-4 text-sm">
                                <LogIn className="w-4 h-4" />
                                Login
                            </Link>
                        )}
                    </div>

                    {/* Mobile toggle */}
                    <button
                        onClick={() => setIsOpen(!isOpen)}
                        className="md:hidden p-2 rounded-lg hover:bg-white/10 transition-colors"
                    >
                        {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                    </button>
                </div>
            </div>

            {/* Mobile Menu */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="md:hidden bg-dark-800/95 backdrop-blur-xl border-b border-white/10"
                    >
                        <div className="container-max py-4 space-y-1">
                            {visibleLinks.map(({ href, label, icon: Icon }) => (
                                <Link
                                    key={href}
                                    href={href}
                                    onClick={() => setIsOpen(false)}
                                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${href === '/admin'
                                        ? 'text-amber-400 hover:bg-amber-500/10'
                                        : pathname === href
                                            ? 'bg-cyan-500/20 text-cyan-400'
                                            : 'text-slate-300 hover:bg-white/10 hover:text-white'
                                        }`}
                                >
                                    <Icon className="w-4 h-4" />
                                    {label}
                                </Link>
                            ))}
                            {user ? (
                                <button
                                    onClick={handleLogout}
                                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-red-400 hover:bg-red-500/10 transition-all"
                                >
                                    <LogOut className="w-4 h-4" />
                                    Logout
                                </button>
                            ) : (
                                <Link
                                    href="/login"
                                    onClick={() => setIsOpen(false)}
                                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-cyan-400 hover:bg-cyan-500/10 transition-all"
                                >
                                    <LogIn className="w-4 h-4" />
                                    Login
                                </Link>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.nav>
    );
}
