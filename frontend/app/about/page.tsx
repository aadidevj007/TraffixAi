'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Brain, Camera, FileText, ShieldCheck, Sparkles } from 'lucide-react';

const sections = [
    {
        icon: Camera,
        title: 'AI Traffic Monitoring',
        desc: 'TraffixAI analyzes uploaded road images and videos to detect vehicles, pedestrians, violations, and accident indicators using AI-based computer vision.',
    },
    {
        icon: Brain,
        title: 'Smart Risk Insights',
        desc: 'The platform generates useful safety insights like risk score, confidence, and object-wise detection summary to support faster decisions.',
    },
    {
        icon: ShieldCheck,
        title: 'Admin Review Workflow',
        desc: 'User-submitted requests can be forwarded to admin, reviewed as pending/accepted/rejected, and inspected with source and processed evidence files.',
    },
    {
        icon: FileText,
        title: 'Reports and Analytics',
        desc: 'Users and admins can view report history, traffic metrics, and trend charts that help monitor city traffic behavior over time.',
    },
    {
        icon: Sparkles,
        title: 'AI Recommendations',
        desc: 'Direction requests are checked against accident-related records and the system provides route guidance with transport-specific precautions.',
    },
];

export default function AboutPage() {
    return (
        <div className="min-h-screen bg-dark-900 pt-20">
            <div className="container-max py-10 space-y-8">
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass-card border border-cyan-500/20 p-6 md:p-8"
                >
                    <p className="text-cyan-300 text-sm font-semibold mb-2">About TraffixAI</p>
                    <h1 className="text-3xl md:text-4xl font-display font-bold text-white mb-4">
                        AI-Based Smart Traffic Surveillance Platform
                    </h1>
                    <p className="text-slate-300 leading-relaxed">
                        TraffixAI is a web platform built to improve road safety through AI-powered traffic analysis.
                        It helps users and administrators detect incidents from image/video evidence, monitor violations,
                        review accident-related alerts, and take quicker data-driven action.
                    </p>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {sections.map((item, idx) => (
                        <motion.div
                            key={item.title}
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.06 }}
                            className="glass-card p-5 border border-white/10"
                        >
                            <item.icon className="w-5 h-5 text-cyan-300 mb-3" />
                            <h2 className="text-lg font-semibold text-white mb-2">{item.title}</h2>
                            <p className="text-slate-400 text-sm leading-relaxed">{item.desc}</p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </div>
    );
}

