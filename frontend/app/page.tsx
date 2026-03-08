'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import {
  Camera, Zap, Shield, Brain, ArrowRight,
  ChevronDown, Activity, AlertTriangle, Eye, TrendingUp
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const ThreeBackground = dynamic(() => import('@/components/three/ThreeBackground'), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-dark-900" />,
});

const features = [
  {
    icon: Camera,
    title: 'Real-Time Surveillance',
    description: 'Monitor traffic 24/7 with intelligent CCTV integration and live video stream analysis powered by YOLOv8.',
    color: 'from-cyan-500 to-blue-600',
    glow: 'shadow-glow-cyan',
  },
  {
    icon: Eye,
    title: 'Upload Evidence',
    description: 'Upload CCTV footage or images for immediate AI analysis, accident detection, and violation reporting.',
    color: 'from-blue-500 to-indigo-600',
    glow: 'shadow-glow-purple',
  },
  {
    icon: Brain,
    title: 'Risk Prediction',
    description: 'Advanced ML models compute real-time risk scores based on vehicle density, violations, and accident patterns.',
    color: 'from-purple-500 to-pink-600',
    glow: 'shadow-glow-purple',
  },
  {
    icon: Shield,
    title: 'Admin Dashboard',
    description: 'Comprehensive control panel for authorities to manage reports, configure alerts, and oversee operations.',
    color: 'from-emerald-500 to-teal-600',
    glow: 'shadow-glow-cyan',
  },
];

const stats = [
  { label: 'Accuracy Rate', value: '95.7%', icon: Zap },
  { label: 'Detection Speed', value: '<0.1s', icon: Activity },
  { label: 'Alerts Sent', value: '50K+', icon: AlertTriangle },
  { label: 'Roads Monitored', value: '1,200+', icon: Eye },
];

export default function HomePage() {
  const { user } = useAuth();
  return (
    <div className="min-h-screen bg-dark-900 overflow-x-hidden">
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* 3D Background */}
        <ThreeBackground />

        {/* Grid overlay */}
        <div className="absolute inset-0 grid-pattern opacity-30" />

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-dark-900/40 via-transparent to-dark-900" />

        {/* Hero Content */}
        <div className="relative z-10 text-center px-4 max-w-5xl mx-auto">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 glass-card px-4 py-2 mb-8 border border-cyan-500/30"
          >
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-sm text-cyan-400 font-medium">AI-Powered Traffic Intelligence Platform</span>
          </motion.div>

          {/* Main Title */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="text-6xl md:text-8xl font-display font-bold mb-6 leading-none"
          >
            <span className="bg-gradient-to-r from-white via-cyan-200 to-cyan-400 bg-clip-text text-transparent">
              TRAFFIX
            </span>
            <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
              AI
            </span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="text-xl md:text-2xl text-slate-300 mb-4 font-light"
          >
            AI Powered Traffic Surveillance
          </motion.p>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="text-lg md:text-xl text-slate-400 mb-12"
          >
            and Accident Detection System
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            <Link href={user ? '/dashboard' : '/login'} className="btn-primary flex items-center justify-center gap-2 px-8 py-4 text-lg">
              {user ? 'Dashboard' : 'Get Started'}
              <ArrowRight className="w-5 h-5" />
            </Link>
            {/*{!user && (
              <Link href="/login" className="btn-secondary flex items-center justify-center gap-2 px-8 py-4 text-lg">
                Login
              </Link>
            )}*/}
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.6 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-16"
          >
            {stats.map(({ label, value, icon: Icon }) => (
              <div key={label} className="glass-card p-4 border border-white/10">
                <Icon className="w-5 h-5 text-cyan-400 mx-auto mb-2" />
                <p className="text-2xl font-bold font-display gradient-text">{value}</p>
                <p className="text-xs text-slate-400 mt-1">{label}</p>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 text-slate-400"
        >
          <ChevronDown className="w-6 h-6" />
        </motion.div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 relative">
        <div className="container-max">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <p className="text-cyan-400 font-medium text-sm uppercase tracking-widest mb-4">Platform Features</p>
            <h2 className="section-title mb-4">Intelligent Traffic Management</h2>
            <p className="section-subtitle">
              A comprehensive AI platform combining real-time surveillance, accident detection, and predictive analytics
              to make roads safer and smarter.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                viewport={{ once: true }}
                className="glass-card-hover p-8 group"
              >
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}>
                  <feature.icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-xl font-display font-semibold text-white mb-3">{feature.title}</h3>
                <p className="text-slate-400 leading-relaxed">{feature.description}</p>
                <div className="mt-6 flex items-center gap-2 text-cyan-400 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                  Learn more <ArrowRight className="w-4 h-4" />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-24 bg-dark-800/50 relative overflow-hidden">
        <div className="absolute inset-0 grid-pattern opacity-20" />
        <div className="container-max relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <p className="text-purple-400 font-medium text-sm uppercase tracking-widest mb-4">Workflow</p>
            <h2 className="text-4xl md:text-5xl font-display font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent mb-4">
              How TraffixAI Works
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { step: '01', title: 'Capture & Upload', desc: 'CCTV cameras capture traffic footage or users upload video/image evidence directly to the platform.', color: 'text-cyan-400', border: 'border-cyan-500/30' },
              { step: '02', title: 'AI Detection', desc: 'YOLOv8 neural network analyzes footage in real-time, detecting vehicles, pedestrians, accidents, and violations.', color: 'text-purple-400', border: 'border-purple-500/30' },
              { step: '03', title: 'Alert & Report', desc: 'System generates detailed reports, calculates risk scores, and sends instant alerts to authorities.', color: 'text-emerald-400', border: 'border-emerald-500/30' },
            ].map((item, i) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.15 }}
                viewport={{ once: true }}
                className={`glass-card p-8 border ${item.border} relative`}
              >
                <p className={`text-6xl font-display font-bold ${item.color} opacity-20 absolute top-4 right-6`}>{item.step}</p>
                <p className={`text-sm font-mono ${item.color} mb-3`}>STEP {item.step}</p>
                <h3 className="text-xl font-semibold text-white mb-3">{item.title}</h3>
                <p className="text-slate-400 leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-white/10">
        <div className="container-max flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-cyan-400" />
            <span className="font-display font-bold gradient-text">TraffixAI</span>
          </div>
          <p className="text-slate-500 text-sm">
            © 2026 TraffixAI: AI-Based Smart Traffic Surveillance System.
          </p>
          <div className="flex gap-6 text-slate-500 text-sm">
            <Link href="/privacy" className="hover:text-cyan-400 transition-colors">About</Link>
            <Link href="/terms" className="hover:text-cyan-400 transition-colors">Contact Us</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
