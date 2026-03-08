'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import {
    User,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signInWithPopup,
    GoogleAuthProvider,
    signOut,
    onAuthStateChanged,
    updateProfile,
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { syncUserToBackend } from '@/lib/api';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

export interface UserProfile {
    uid: string;
    name: string;
    email: string;
    phone: string;
    role: 'User' | 'Admin' | 'Authority';
    photoURL?: string;
    createdAt: any;
}

interface AuthContextType {
    user: User | null;
    profile: UserProfile | null;
    loading: boolean;
    signup: (name: string, email: string, phone: string, password: string, role?: UserProfile['role']) => Promise<void>;
    loginWithGoogle: () => Promise<void>;
    adminLogin: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    isAdmin: () => boolean;
    isAuthority: () => boolean;
    updateUserRole: (uid: string, role: UserProfile['role']) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);
const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');

// ── Local admin session (set by admin-login page for username=admin) ──────────
const LOCAL_ADMIN_PROFILE: UserProfile = {
    uid: 'local-admin',
    name: 'Administrator',
    email: 'admin@traffixai.local',
    phone: '',
    role: 'Admin',
    createdAt: null,
};

function isLocalAdmin(): boolean {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem('localAdmin') === 'true';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(() => {
        // Hydrate local admin immediately on mount (SSR-safe)
        if (typeof window !== 'undefined' && sessionStorage.getItem('localAdmin') === 'true') {
            return LOCAL_ADMIN_PROFILE;
        }
        return null;
    });
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const inactivityTimer = useRef<NodeJS.Timeout | null>(null);

    // ── Fetch or create Firestore profile ───────────────────────────────
    const fetchOrCreateProfile = async (firebaseUser: User, role: UserProfile['role'] = 'User') => {
        const docRef = doc(db, 'users', firebaseUser.uid);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
            const data = snap.data() as UserProfile;
            setProfile(data);
            return data;
        }
        const newProfile: UserProfile = {
            uid: firebaseUser.uid,
            name: firebaseUser.displayName || 'User',
            email: firebaseUser.email || '',
            phone: '',
            role,
            photoURL: firebaseUser.photoURL || '',
            createdAt: serverTimestamp(),
        };
        await setDoc(docRef, newProfile);
        setProfile(newProfile);
        return newProfile;
    };

    // ── Auto-logout after 15 min inactivity ─────────────────────────────
    const resetInactivityTimer = useCallback(() => {
        if (inactivityTimer.current) clearTimeout(inactivityTimer.current);

        // Only set timer if user is logged in (Firebase or local admin)
        if (!auth.currentUser && !isLocalAdmin()) return;

        inactivityTimer.current = setTimeout(async () => {
            try {
                // Clear local admin session if present
                if (isLocalAdmin()) {
                    sessionStorage.removeItem('localAdmin');
                    setProfile(null);
                    toast('Session expired due to inactivity', { icon: '⏰' });
                    router.push('/login');
                    return;
                }
                await signOut(auth);
                setProfile(null);
                toast('Session expired due to inactivity', { icon: '⏰' });
                router.push('/login');
            } catch (err) {
                console.error('Auto-logout error:', err);
            }
        }, INACTIVITY_TIMEOUT_MS);
    }, [router]);

    // Listen for user activity events
    useEffect(() => {
        const isActive = !!user || isLocalAdmin();
        if (!isActive) return;

        const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
        const handler = () => resetInactivityTimer();

        // Start the timer immediately
        resetInactivityTimer();

        events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
        return () => {
            events.forEach((e) => window.removeEventListener(e, handler));
            if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
        };
    }, [user, resetInactivityTimer]);

    // ── Auth state listener ─────────────────────────────────────────────
    useEffect(() => {
        // If local admin is set, skip Firebase listener
        if (isLocalAdmin()) {
            setProfile(LOCAL_ADMIN_PROFILE);
            setLoading(false);
            return;
        }

        const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
            setUser(firebaseUser);
            if (firebaseUser) {
                try {
                    const profileData = await fetchOrCreateProfile(firebaseUser);
                    await syncUserToBackend({
                        name: profileData.name || firebaseUser.displayName || 'User',
                        email: profileData.email || firebaseUser.email || undefined,
                        role: profileData.role,
                    });
                } catch (err) {
                    console.error('Profile fetch error:', err);
                }
            } else {
                setProfile(null);
            }
            setLoading(false);
        });
        return unsub;
    }, []);

    // ── Auth methods ────────────────────────────────────────────────────
    const signup = async (
        name: string,
        email: string,
        phone: string,
        password: string,
        role: UserProfile['role'] = 'User',
    ) => {
        const safeRole: UserProfile['role'] = role === 'Admin' || role === 'Authority' ? 'User' : role;
        const result = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(result.user, { displayName: name });
        const newProfile: UserProfile = {
            uid: result.user.uid,
            name,
            email,
            phone,
            role: safeRole,
            photoURL: result.user.photoURL || '',
            createdAt: serverTimestamp(),
        };
        await setDoc(doc(db, 'users', result.user.uid), newProfile, { merge: true });
        setProfile(newProfile);
        await syncUserToBackend({ name, email, role: safeRole });
        resetInactivityTimer();
    };

    /** Regular users sign in with Google → redirect to dashboard */
    const loginWithGoogle = async () => {
        const result = await signInWithPopup(auth, googleProvider);
        await fetchOrCreateProfile(result.user, 'User');
        resetInactivityTimer();
        router.push('/');
    };

    /** Admin-only: email + password login → redirect to admin */
    const adminLogin = async (email: string, password: string) => {
        await signInWithEmailAndPassword(auth, email, password);
        resetInactivityTimer();
        router.push('/admin');
    };

    const logout = async () => {
        if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
        // Clear local admin session
        if (isLocalAdmin()) {
            sessionStorage.removeItem('localAdmin');
            setProfile(null);
            router.push('/login');
            return;
        }
        await signOut(auth);
        setProfile(null);
        router.push('/login');
    };

    const updateUserRole = async (uid: string, role: UserProfile['role']) => {
        await setDoc(doc(db, 'users', uid), { role }, { merge: true });
        if (uid === user?.uid) setProfile((p) => p ? { ...p, role } : p);
    };

    // Local admin is always Admin; for Firebase users check profile role
    const isAdmin = () => isLocalAdmin() || profile?.role === 'Admin';
    const isAuthority = () => isLocalAdmin() || profile?.role === 'Authority' || profile?.role === 'Admin';

    return (
        <AuthContext.Provider
            value={{ user, profile, loading, signup, loginWithGoogle, adminLogin, logout, isAdmin, isAuthority, updateUserRole }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
