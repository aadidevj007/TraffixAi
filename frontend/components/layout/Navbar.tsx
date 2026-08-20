'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import {
    LayoutDashboard, Upload, FileText, CheckCircle2, Clock3, ListChecks,
    LogIn, LogOut, Menu, X, ChevronDown, User, Sparkles, Cpu
} from 'lucide-react';
import toast from 'react-hot-toast';
import BrandLogo from '@/components/layout/BrandLogo';

const guestNavLinks: Array<{ href: string; label: string; icon: typeof LayoutDashboard }> = [];

const userNavLinks = [
    { href: '/dashboard',         label: 'Dashboard',        icon: LayoutDashboard },
    { href: '/ai-recommendation', label: 'AI Insights',      icon: Sparkles },
    { href: '/upload',            label: 'Upload',           icon: Upload },
    { href: '/reports',           label: 'Reports',          icon: FileText },
];

const adminNavLinks = [
    { href: '/admin?tab=dashboard', label: 'Dashboard',      icon: LayoutDashboard },
    { href: '/admin?tab=pending',   label: 'Pending',        icon: Clock3 },
    { href: '/admin?tab=accepted',  label: 'Accepted',       icon: CheckCircle2 },
    { href: '/admin?tab=all',       label: 'All Requests',   icon: ListChecks },
];

export default function Navbar() {
    const [isOpen, setIsOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const [userMenuOpen, setUserMenuOpen] = useState(false);
    const [localAdminSession, setLocalAdminSession] = useState(false);
    const [activeIndicator, setActiveIndicator] = useState({ left: 0, width: 0 });
    const navRef = useRef<HTMLDivElement>(null);
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

    // Update active pill indicator position
    useEffect(() => {
        if (!navRef.current) return;
        const active = navRef.current.querySelector('[data-active="true"]') as HTMLElement;
        if (active) {
            const navRect = navRef.current.getBoundingClientRect();
            const rect = active.getBoundingClientRect();
            setActiveIndicator({ left: rect.left - navRect.left, width: rect.width });
        }
    }, [pathname, searchParams, visibleLinks]);

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
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
                scrolled
                    ? 'py-0'
                    : 'py-2'
            }`}
        >
            {/* Glassmorphism backdrop */}
            <div className={`absolute inset-0 transition-all duration-500 ${
                scrolled
                    ? 'bg-space-900/90 backdrop-blur-2xl border-b border-cyan-500/10'
                    : 'bg-transparent'
            }`}
                style={scrolled ? {
                    boxShadow: '0 1px 0 rgba(6,182,212,0.06), 0 20px 60px rgba(0,0,0,0.5)',
                } : {}}
            />

            {/* Neon top line (when scrolled) */}
            {scrolled && (
                <div className="absolute top-0 left-0 right-0 h-px"
                    style={{ background: 'linear-gradient(90deg, transparent, rgba(6,182,212,0.5), rgba(139,92,246,0.3), transparent)' }} />
            )}

            <div className="container-max relative z-10">
                <div className="flex items-center justify-between h-16">

                    {/* Logo */}
                    <BrandLogo href={adminSession ? '/admin' : '/'} size="sm" />

                    {/* Desktop Nav Links */}
                    <div ref={navRef} className="hidden md:flex items-center gap-1 relative">
                        {/* Animated active pill */}
                        {activeIndicator.width > 0 && (
                            <motion.div
                                layoutId="nav-pill"
                                className="absolute bottom-0 rounded-lg pointer-events-none"
                                style={{
                                    left: activeIndicator.left,
                                    width: activeIndicator.width,
                                    height: '100%',
                                    background: 'rgba(6,182,212,0.08)',
                                    border: '1px solid rgba(6,182,212,0.2)',
                                }}
                                transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                            />
                        )}

                        {visibleLinks.map(({ href, label, icon: Icon }) => (
                            <Link
                                key={href}
                                href={href}
                                data-active={isActiveLink(href)}
                                className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                                    isActiveLink(href)
                                        ? 'text-cyan-300'
                                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                                }`}
                            >
                                <Icon className="w-3.5 h-3.5" />
                                {label}
                                {isActiveLink(href) && (
                                    <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 h-0.5 w-3 rounded-full bg-cyan-400" />
                                )}
                            </Link>
                        ))}
                    </div>

                    {/* Right side */}
                    <div className="hidden md:flex items-center gap-3">
                        {authenticated ? (
                            <div className="relative">
                                <button
                                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                                    className="flex items-center gap-2.5 rounded-xl border border-cyan-500/15 bg-space-800/60 px-3 py-2 backdrop-blur-xl
                                               transition-all duration-200 hover:border-cyan-500/30 hover:bg-space-700/60"
                                    style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}
                                >
                                    {/* Avatar */}
                                    <div className="relative flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-space-900"
                                        style={{ background: 'linear-gradient(135deg, #06b6d4, #8b5cf6)' }}>
                                        {(profile?.name?.[0] || user?.email?.[0] || 'A').toUpperCase()}
                                        {/* Online ring */}
                                        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-space-900 bg-emerald-400" />
                                    </div>
                                    <div className="text-left">
                                        <p className="text-xs font-medium text-white leading-none">
                                            {profile?.name || (localAdminSession ? 'Administrator' : 'User')}
                                        </p>
                                        <p className="text-[10px] text-slate-500 mt-0.5">
                                            {profile?.role || (localAdminSession ? 'Admin' : 'User')}
                                        </p>
                                    </div>
                                    <ChevronDown className={`w-3 h-3 text-slate-500 transition-transform duration-200 ${userMenuOpen ? 'rotate-180' : ''}`} />
                                </button>

                                <AnimatePresence>
                                    {userMenuOpen && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 8, scale: 0.95 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: 8, scale: 0.95 }}
                                            transition={{ duration: 0.15 }}
                                            className="absolute right-0 top-full mt-2 w-52 overflow-hidden rounded-2xl border border-cyan-500/15 bg-space-900/95 backdrop-blur-2xl"
                                            style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(6,182,212,0.06)' }}
                                        >
                                            {/* Menu header */}
                                            <div className="px-4 py-3 border-b border-white/5">
                                                <p className="text-xs text-slate-500 font-mono">SIGNED IN AS</p>
                                                <p className="text-sm text-white font-medium truncate mt-0.5">
                                                    {user?.email || (localAdminSession ? 'admin@traffixai' : 'user')}
                                                </p>
                                            </div>

                                            <Link href="/profile"
                                                className="flex items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:bg-white/5 hover:text-white transition-colors">
                                                <User className="w-4 h-4 text-cyan-400" />
                                                My Profile
                                            </Link>
                                            <button
                                                onClick={handleLogout}
                                                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-rose-400 transition-colors hover:bg-rose-500/8 border-t border-white/5"
                                            >
                                                <LogOut className="w-4 h-4" />
                                                Logout
                                            </button>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        ) : (
                            <Link href="/login"
                                className="btn-primary flex items-center gap-2 px-5 py-2.5 text-sm">
                                <Cpu className="w-3.5 h-3.5" />
                                Login
                            </Link>
                        )}
                    </div>

                    {/* Mobile toggle */}
                    <button
                        onClick={() => setIsOpen(!isOpen)}
                        className="rounded-xl border border-white/8 p-2 transition-all hover:bg-white/8 hover:border-cyan-500/20 md:hidden"
                    >
                        <AnimatePresence mode="wait" initial={false}>
                            <motion.div
                                key={isOpen ? 'close' : 'open'}
                                initial={{ rotate: -90, opacity: 0 }}
                                animate={{ rotate: 0, opacity: 1 }}
                                exit={{ rotate: 90, opacity: 0 }}
                                transition={{ duration: 0.15 }}
                            >
                                {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                            </motion.div>
                        </AnimatePresence>
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
                        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                        className="border-b border-cyan-500/10 bg-space-900/95 backdrop-blur-2xl md:hidden overflow-hidden"
                    >
                        <div className="container-max py-4 space-y-1">
                            {visibleLinks.map(({ href, label, icon: Icon }, i) => (
                                <motion.div
                                    key={href}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: i * 0.05 }}
                                >
                                    <Link
                                        href={href}
                                        onClick={() => setIsOpen(false)}
                                        className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                                            isActiveLink(href)
                                                ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20'
                                                : 'text-slate-400 hover:bg-white/5 hover:text-white'
                                        }`}
                                    >
                                        <Icon className="w-4 h-4" />
                                        {label}
                                    </Link>
                                </motion.div>
                            ))}

                            <div className="pt-2 border-t border-white/5">
                                {authenticated ? (
                                    <button
                                        onClick={handleLogout}
                                        className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-rose-400 transition-all hover:bg-rose-500/8"
                                    >
                                        <LogOut className="w-4 h-4" />
                                        Logout
                                    </button>
                                ) : (
                                    <Link
                                        href="/login"
                                        onClick={() => setIsOpen(false)}
                                        className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-cyan-300 transition-all hover:bg-cyan-500/8"
                                    >
                                        <LogIn className="w-4 h-4" />
                                        Login
                                    </Link>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.nav>
    );
}
