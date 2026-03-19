'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { User, Mail, Shield, Phone, Pencil, X, Save, Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import { auth, db } from '@/lib/firebase';
import { updateProfile } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';

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

export default function ProfilePage() {
    const { user, profile } = useAuth();
    const [localAdmin, setLocalAdmin] = useState(false);
    const [showEdit, setShowEdit] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [saving, setSaving] = useState(false);
    const [username, setUsername] = useState('');
    const [nameInput, setNameInput] = useState('');
    const [phoneInput, setPhoneInput] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [displayPhone, setDisplayPhone] = useState('');
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const isLocal = sessionStorage.getItem('localAdmin') === 'true';
        setLocalAdmin(isLocal);
        if (isLocal) {
            const creds = getLocalAdminCredentials();
            setUsername(creds.username);
        }
    }, []);

    useEffect(() => {
        const currentName = profile?.name || user?.displayName || 'User';
        const currentPhone = profile?.phone || '';
        setNameInput(currentName);
        setPhoneInput(currentPhone);
        setDisplayName(currentName);
        setDisplayPhone(currentPhone);
    }, [profile?.name, profile?.phone, user?.displayName]);

    const saveLocalAdminCredentials = () => {
        const current = getLocalAdminCredentials();
        if (!username.trim()) {
            toast.error('Username is required');
            return;
        }
        if (!oldPassword || !newPassword || !confirmPassword) {
            toast.error('Fill all password fields');
            return;
        }
        if (oldPassword !== current.password) {
            toast.error('Wrong old password, try again');
            return;
        }
        if (newPassword !== confirmPassword) {
            toast.error('New passwords do not match');
            return;
        }
        if (newPassword.length < 6) {
            toast.error('New password must be at least 6 characters');
            return;
        }

        const next = { username: username.trim(), password: newPassword };
        localStorage.setItem(LOCAL_ADMIN_CRED_KEY, JSON.stringify(next));
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setShowEdit(false);
        toast.success('Password accepted. Profile updated.');
    };

    const saveUserProfile = async () => {
        if (!user || !db) {
            toast.error('Please login again to update profile');
            return;
        }
        const trimmedName = nameInput.trim();
        const trimmedPhone = phoneInput.trim();
        if (!trimmedName) {
            toast.error('Name is required');
            return;
        }
        setSaving(true);
        try {
            await setDoc(
                doc(db, 'users', user.uid),
                {
                    name: trimmedName,
                    phone: trimmedPhone,
                    updatedAt: serverTimestamp(),
                },
                { merge: true },
            );

            if (auth?.currentUser) {
                await updateProfile(auth.currentUser, { displayName: trimmedName });
            }

            setDisplayName(trimmedName);
            setDisplayPhone(trimmedPhone);
            setEditMode(false);
            toast.success('Profile updated successfully');
        } catch (error) {
            console.error('Profile update failed:', error);
            toast.error('Failed to update profile');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="min-h-screen bg-dark-900 pt-16 px-4">
            <div className="container-max min-h-[calc(100vh-4rem)] flex items-center justify-center py-10">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full max-w-3xl rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-slate-900/95 via-slate-900/90 to-cyan-950/45 shadow-[0_20px_80px_rgba(6,182,212,0.12)] p-6 md:p-8"
                >
                    <div className="flex items-center gap-4 mb-7">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-cyan-500/30">
                            {(displayName || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <h1 className="text-2xl md:text-3xl font-display font-bold text-white">My Profile</h1>
                            <p className="text-slate-300 text-sm flex items-center gap-2">
                                <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
                                Manage your account details
                            </p>
                        </div>
                        {!localAdmin && (
                            <button
                                onClick={() => setEditMode((prev) => !prev)}
                                className="ml-auto inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-cyan-500/35 text-cyan-200 hover:bg-cyan-500/10 transition-all text-sm"
                            >
                                <Pencil className="w-4 h-4" />
                                {editMode ? 'Cancel' : 'Edit Profile'}
                            </button>
                        )}
                        {localAdmin && (
                            <button
                                onClick={() => setShowEdit(true)}
                                className="ml-auto inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-cyan-500/35 text-cyan-200 hover:bg-cyan-500/10 transition-all text-sm"
                            >
                                <Pencil className="w-4 h-4" />
                                Edit Profile
                            </button>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="rounded-2xl border border-white/12 bg-white/5 p-4">
                            <p className="text-xs text-slate-400 mb-2 flex items-center gap-1"><User className="w-3.5 h-3.5" /> Name</p>
                            {editMode && !localAdmin ? (
                                <input
                                    type="text"
                                    value={nameInput}
                                    onChange={(e) => setNameInput(e.target.value)}
                                    className="input-field"
                                    placeholder="Enter your full name"
                                />
                            ) : (
                                <p className="text-white text-base">{displayName || 'User'}</p>
                            )}
                        </div>
                        <div className="rounded-2xl border border-white/12 bg-white/5 p-4">
                            <p className="text-xs text-slate-400 mb-2 flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> Email</p>
                            <p className="text-white break-all text-base">{profile?.email || user?.email || 'N/A'}</p>
                        </div>
                        <div className="rounded-2xl border border-white/12 bg-white/5 p-4">
                            <p className="text-xs text-slate-400 mb-2 flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> Phone</p>
                            {editMode && !localAdmin ? (
                                <input
                                    type="tel"
                                    value={phoneInput}
                                    onChange={(e) => setPhoneInput(e.target.value)}
                                    className="input-field"
                                    placeholder="Enter phone number"
                                />
                            ) : (
                                <p className="text-white text-base">{displayPhone || 'Not set'}</p>
                            )}
                        </div>
                        <div className="rounded-2xl border border-white/12 bg-white/5 p-4">
                            <p className="text-xs text-slate-400 mb-2 flex items-center gap-1"><Shield className="w-3.5 h-3.5" /> Role</p>
                            <p className="text-white">{profile?.role || 'User'}</p>
                        </div>
                    </div>

                    {!localAdmin && editMode && (
                        <div className="mt-5 flex justify-end">
                            <button
                                onClick={saveUserProfile}
                                disabled={saving}
                                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold disabled:opacity-60 hover:from-cyan-400 hover:to-blue-400 transition-all"
                            >
                                <Save className="w-4 h-4" />
                                {saving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    )}

                    {localAdmin && (
                        <p className="text-xs text-slate-500 mt-4">
                            Local admin profile can update username and password. New credentials are used for next admin login.
                        </p>
                    )}
                </motion.div>
            </div>

            {localAdmin && showEdit && (
                <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0, y: 14, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        className="w-full max-w-lg glass-card border border-cyan-500/30 rounded-2xl p-6"
                    >
                        <div className="flex items-center justify-between mb-5">
                            <h2 className="text-xl font-display font-bold text-white">Edit Admin Profile</h2>
                            <button
                                onClick={() => setShowEdit(false)}
                                className="p-2 rounded-lg hover:bg-white/10 text-slate-300"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="space-y-3">
                            <input
                                type="text"
                                className="input-field"
                                placeholder="Username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                            />
                            <input
                                type="password"
                                className="input-field"
                                placeholder="Enter old password"
                                value={oldPassword}
                                onChange={(e) => setOldPassword(e.target.value)}
                            />
                            <input
                                type="password"
                                className="input-field"
                                placeholder="Enter new password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                            />
                            <input
                                type="password"
                                className="input-field"
                                placeholder="Re-enter new password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                            />
                        </div>

                        <button
                            onClick={saveLocalAdminCredentials}
                            className="mt-5 w-full px-4 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold hover:from-cyan-400 hover:to-blue-400 transition-all"
                        >
                            Save Profile
                        </button>
                    </motion.div>
                </div>
            )}
        </div>
    );
}
