'use client';

import { motion } from 'framer-motion';
import { Github, UserRound } from 'lucide-react';

const teamMembers = [
    {
        name: 'Aadidev J',
        regNo: '99230041022',
        department: 'B.Tech - CSE',
        github1: 'https://github.com/aadidevj007'
    }
];

export default function ContactPage() {
    return (
        <div className="min-h-screen bg-dark-900 pt-20">
            <div className="container-max py-10 space-y-8">
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass-card border border-cyan-500/20 p-6 md:p-8"
                >
                    <p className="text-cyan-300 text-sm font-semibold mb-2">Contact Us</p>
                    <h1 className="text-3xl md:text-4xl font-display font-bold text-white mb-3">
                        Team Details
                    </h1>
                    <p className="text-slate-400">
                        For project communication and support, contact the team members below.
                    </p>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {teamMembers.map((member, idx) => (
                        <motion.div
                            key={member.regNo}
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.06 }}
                            className="glass-card p-5 border border-white/10"
                        >
                            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center mb-4">
                                <UserRound className="w-5 h-5 text-white" />
                            </div>
                            <h2 className="text-lg font-semibold text-white">{member.name}</h2>
                            <p className="text-sm text-slate-400 mt-2">Reg No: {member.regNo}</p>
                            <p className="text-sm text-slate-400">Department: {member.department}</p>
                            <a
                                href={member.github1}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-slate-300 mt-2 inline-flex items-center gap-2 hover:text-cyan-300 transition-colors"
                            >
                                <Github className="w-4 h-4 text-cyan-300" />
                                {member.github1}
                            </a>
                        </motion.div>
                    ))}
                </div>

                <div className="glass-card border border-cyan-500/20 p-5 text-center">
                    <p className="text-slate-200 font-medium">
                        Work done by student of Kalasalingam Academy of Research and Education.
                    </p>
                </div>
            </div>
        </div>
    );
}
