'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import {
    LayoutDashboard, Upload, FileText, CheckCircle2, Clock3, ListChecks,
    LogIn, LogOut, Menu, X, ChevronDown, User, Sparkles
} from 'lucide-react';
import toast from 'react-hot-toast';
import BrandLogo from '@/components/layout/BrandLogo';

const guestNavLinks: Array<{ href: string; label: string; icon: typeof LayoutDashboard }> = [];

const userNavLinks = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/ai-recommendation', label: 'AI Recommendation', icon: Sparkles },
    { href: '/upload', label: 'Upload', icon: Upload },
    { href: '/reports', label: 'Reports', icon: FileText },
];

const adminNavLinks = [
    { href: '/admin?tab=dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/admin?tab=pending', label: 'Pending Requests', icon: Clock3 },
    { href: '/admin?tab=accepted', label: 'Accepted Requests', icon: CheckCircle2 },
    { href: '/admin?tab=all', label: 'All Requests', icon: ListChecks },
];


export default function Navbar() {
    const [isOpen, setIsOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const [userMenuOpen, setUserMenuOpen] = useState(false);
    const [localAdminSession, setLocalAdminSession] = useState(false);
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const router = useRouter();
    const { user, profile, logout, isAdmin } = useAuth();
    const adminSession = localAdminSession || (!!user && isAdmin());
    const authenticated = !!user || localAdminSession;
    const visibleLinks = adminSession
        ? adminNavLinks
        : (authenticated ? userNavLinks : guestNavLinks);
    const currentAdminTab = searchParams.get('tab') || 'dashboard';

    const isActiveLink = (href: string) => {
        if (href.startsWith('/admin?tab=')) {
            const tab = href.split('tab=')[1] || 'dashboard';
            return pathname === '/admin' && currentAdminTab === tab;
        }
        return pathname === href;
    };

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const syncLocalAdmin = () => setLocalAdminSession(sessionStorage.getItem('localAdmin') === 'true');
        syncLocalAdmin();
        window.addEventListener('storage', syncLocalAdmin);
        return () => window.removeEventListener('storage', syncLocalAdmin);
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        setLocalAdminSession(sessionStorage.getItem('localAdmin') === 'true');
    }, [pathname]);

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
                ? 'bg-[#070202]/90 backdrop-blur-2xl border-b border-red-500/15 shadow-[0_18px_60px_rgba(0,0,0,0.5)]'
                : 'bg-transparent'
                }`}
        >
            <div className="container-max">
                <div className="flex items-center justify-between h-16">
                    {/* Logo */}
                    <BrandLogo href={adminSession ? '/admin' : '/'} size="sm" />

                    {/* Desktop Links */}
                    <div className="hidden md:flex items-center gap-1">
                        {visibleLinks.map(({ href, label, icon: Icon }) => (
                            <Link
                                key={href}
                                href={href}
                                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${isActiveLink(href)
                                    ? 'bg-red-500/15 text-red-200 border border-red-500/30 shadow-[0_0_28px_rgba(239,68,68,0.15)]'
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
                        {authenticated ? (
                            <div className="relative">
                                <button
                                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                                    className="flex items-center gap-2 glass-card px-3 py-1.5 hover:border-red-500/30 transition-all"
                                >
                                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-red-500 to-rose-700 flex items-center justify-center text-xs font-bold">
                                        {(profile?.name?.[0] || user?.email?.[0] || 'A').toUpperCase()}
                                    </div>
                                    <div className="text-left">
                                        <p className="text-xs font-medium text-white leading-none">{profile?.name || (localAdminSession ? 'Administrator' : 'User')}</p>
                                        <p className="text-xs text-slate-400">{profile?.role || (localAdminSession ? 'Admin' : 'User')}</p>
                                    </div>
                                    <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
                                </button>

                                <AnimatePresence>
                                    {userMenuOpen && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: 10 }}
                                            className="absolute right-0 top-full mt-2 w-48 glass-card border border-red-500/15 rounded-xl overflow-hidden"
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
                        className="md:hidden bg-[#090303]/95 backdrop-blur-xl border-b border-red-500/15"
                    >
                        <div className="container-max py-4 space-y-1">
                            {visibleLinks.map(({ href, label, icon: Icon }) => (
                                <Link
                                    key={href}
                                    href={href}
                                    onClick={() => setIsOpen(false)}
                                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${isActiveLink(href)
                                        ? 'bg-red-500/15 text-red-200'
                                        : 'text-slate-300 hover:bg-white/10 hover:text-white'
                                        }`}
                                >
                                    <Icon className="w-4 h-4" />
                                    {label}
                                </Link>
                            ))}
                            {authenticated ? (
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
                                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-red-200 hover:bg-red-500/10 transition-all"
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
