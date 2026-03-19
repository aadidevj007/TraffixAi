'use client';

import { motion } from 'framer-motion';
import { FileText } from 'lucide-react';

export default function TermsPage() {
    return (
        <div className="min-h-screen bg-dark-900 pt-20">
            <div className="container-max py-10 space-y-6">
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass-card border border-cyan-500/20 p-6 md:p-8"
                >
                    <div className="flex items-center gap-3 mb-3">
                        <FileText className="w-5 h-5 text-cyan-300" />
                        <p className="text-cyan-300 text-sm font-semibold">Terms of Service</p>
                    </div>
                    <h1 className="text-3xl md:text-4xl font-display font-bold text-white mb-3">
                        TraffixAI Terms
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
                        <h2 className="text-white font-semibold mb-2">1. Platform Use</h2>
                        <p className="text-slate-300 text-sm leading-relaxed">
                            TraffixAI is intended for traffic monitoring, analysis, and reporting. You must use the platform lawfully and avoid abusive, harmful, or unauthorized activity.
                        </p>
                    </section>
                    <section>
                        <h2 className="text-white font-semibold mb-2">2. User Accounts</h2>
                        <p className="text-slate-300 text-sm leading-relaxed">
                            You are responsible for account security and actions performed through your account. Provide accurate profile details and keep credentials private.
                        </p>
                    </section>
                    <section>
                        <h2 className="text-white font-semibold mb-2">3. Uploaded Content</h2>
                        <p className="text-slate-300 text-sm leading-relaxed">
                            You retain ownership of uploaded files. By uploading, you allow TraffixAI to process the data for detection, analytics, and report generation.
                        </p>
                    </section>
                    <section>
                        <h2 className="text-white font-semibold mb-2">4. Service Availability</h2>
                        <p className="text-slate-300 text-sm leading-relaxed">
                            We may update, pause, or limit services for maintenance, security, or product improvements without prior notice.
                        </p>
                    </section>
                    <section>
                        <h2 className="text-white font-semibold mb-2">5. Liability</h2>
                        <p className="text-slate-300 text-sm leading-relaxed">
                            AI outputs are assistive and may contain errors. Final operational decisions should involve human review and official verification.
                        </p>
                    </section>
                </motion.div>
            </div>
        </div>
    );
}
