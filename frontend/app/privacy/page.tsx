'use client';

import { motion } from 'framer-motion';
import { ShieldCheck } from 'lucide-react';

export default function PrivacyPage() {
    return (
        <div className="min-h-screen bg-dark-900 pt-20">
            <div className="container-max py-10 space-y-6">
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass-card border border-cyan-500/20 p-6 md:p-8"
                >
                    <div className="flex items-center gap-3 mb-3">
                        <ShieldCheck className="w-5 h-5 text-cyan-300" />
                        <p className="text-cyan-300 text-sm font-semibold">Privacy Policy</p>
                    </div>
                    <h1 className="text-3xl md:text-4xl font-display font-bold text-white mb-3">
                        How TraffixAI Handles Data
                    </h1>
                    <p className="text-slate-400 text-sm">Effective date: March 11, 2026</p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 }}
                    className="glass-card border border-white/10 p-6 space-y-5"
                >
                    <section>
                        <h2 className="text-white font-semibold mb-2">1. Data We Collect</h2>
                        <p className="text-slate-300 text-sm leading-relaxed">
                            We collect account details, uploaded media, analysis outputs, and report metadata needed to provide platform functionality.
                        </p>
                    </section>
                    <section>
                        <h2 className="text-white font-semibold mb-2">2. Why We Use Data</h2>
                        <p className="text-slate-300 text-sm leading-relaxed">
                            Data is used for authentication, traffic analysis, report workflows, service monitoring, and improving model performance.
                        </p>
                    </section>
                    <section>
                        <h2 className="text-white font-semibold mb-2">3. Data Sharing</h2>
                        <p className="text-slate-300 text-sm leading-relaxed">
                            We do not sell personal data. Information may be shared with authorized admins and trusted infrastructure providers required to run the service.
                        </p>
                    </section>
                    <section>
                        <h2 className="text-white font-semibold mb-2">4. Data Retention</h2>
                        <p className="text-slate-300 text-sm leading-relaxed">
                            Uploaded files and reports are retained based on operational needs and may be removed when no longer required.
                        </p>
                    </section>
                    <section>
                        <h2 className="text-white font-semibold mb-2">5. Security</h2>
                        <p className="text-slate-300 text-sm leading-relaxed">
                            We apply reasonable safeguards, but no online system is fully risk-free. Use strong account credentials and report suspected misuse promptly.
                        </p>
                    </section>
                </motion.div>
            </div>
        </div>
    );
}
