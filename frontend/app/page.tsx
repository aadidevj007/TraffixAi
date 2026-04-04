'use client';

import { useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import {
  Camera, Zap, Shield, Brain, ArrowRight,
  ChevronDown, Activity, AlertTriangle, Eye
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import BrandLogo from '@/components/layout/BrandLogo';

const ThreeBackground = dynamic(() => import('@/components/three/ThreeBackground'), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-dark-900" />,
});

const features = [
  {
    icon: Camera,
    title: 'Real-Time Surveillance',
    description: 'Monitor traffic 24/7 with intelligent CCTV integration and live video stream analysis powered by YOLOv8.',
    shortExplanation: 'Live camera frames are analyzed with YOLO, objects are tracked, and risky events are flagged in near real time.',
    color: 'from-red-600 to-orange-500',
    glow: 'shadow-glow-red',
  },
  {
    icon: Eye,
    title: 'Upload Evidence',
    description: 'Upload CCTV footage or images for immediate AI analysis, accident detection, and violation reporting.',
    shortExplanation: 'Uploaded image/video is processed on the backend, annotated, scored, and saved as a report for user and admin review.',
    color: 'from-rose-600 to-red-500',
    glow: 'shadow-glow-red',
  },
  {
    icon: Brain,
    title: 'Risk Prediction',
    description: 'Advanced ML models compute real-time risk scores based on vehicle density, violations, and accident patterns.',
    shortExplanation: 'The platform combines violations, accidents, and traffic density into a risk score to prioritize high-risk incidents.',
    color: 'from-red-700 to-pink-600',
    glow: 'shadow-glow-red',
  },
  {
    icon: Shield,
    title: 'Admin Dashboard',
    description: 'Comprehensive control panel for authorities to manage reports, configure alerts, and oversee operations.',
    shortExplanation: 'Admins can review requests, approve or reject reports, track trends, and trigger alerts from one control panel.',
    color: 'from-orange-500 to-red-700',
    glow: 'shadow-glow-red',
  },
];

const stats = [
  { label: 'Accuracy Rate', value: '91.8%', icon: Zap },
  { label: 'Detection Speed', value: '<20s', icon: Activity },
  { label: 'Alerts Sent', value: '50K+', icon: AlertTriangle },
  { label: 'Roads Monitored', value: '1,200+', icon: Eye },
];

export default function HomePage() {
  const { user } = useAuth();
  const [flippedCards, setFlippedCards] = useState<boolean[]>(features.map(() => false));

  const toggleCard = (index: number) => {
    setFlippedCards((prev) => prev.map((item, i) => (i === index ? !item : item)));
  };

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
        <div className="relative z-10 text-center px-4 max-w-5xl mx-auto pt-40 md:pt-60">
          {/* Main Title */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="text-6xl md:text-8xl font-brand font-bold tracking-[0.06em] mb-6 leading-none"
          >
            <span className="bg-gradient-to-r from-white via-red-100 to-rose-300 bg-clip-text text-transparent">
              TRAFFIX     
            </span>
            <span className="bg-gradient-to-r from-red-400 via-rose-400 to-orange-300 bg-clip-text text-transparent">
                 AI
            </span>
          </motion.h1>

          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 glass-card px-4 py-2 mb-8 border border-red-500/25"
          >
            <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
            <span className="text-sm text-red-200 font-medium">AI Powered Traffic Intelligence Platform</span>
          </motion.div>

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
                <Icon className="w-5 h-5 text-red-300 mx-auto mb-2" />
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

      <section className="relative py-10 md:py-14">
        <div className="container-max">
          <div className="relative overflow-hidden rounded-[2rem] border border-cyan-400/15 bg-[linear-gradient(140deg,rgba(12,18,34,0.72),rgba(44,8,20,0.52),rgba(17,5,5,0.68))] shadow-[0_35px_120px_rgba(7,12,28,0.55)]">
            <video
              className="w-full h-[280px] md:h-[420px] object-cover scale-[1.02] saturate-[1.18] contrast-[1.08]"
              src="/videos/mainbg.mp4"
              autoPlay
              muted
              loop
              playsInline
            />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_22%,rgba(34,211,238,0.26),transparent_24%),radial-gradient(circle_at_82%_18%,rgba(251,113,133,0.22),transparent_26%),linear-gradient(115deg,rgba(2,6,23,0.46),rgba(15,23,42,0.18),rgba(12,4,4,0.8))]" />
            <div className="absolute inset-0 opacity-[0.16] [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:42px_42px]" />
            <div className="absolute inset-y-0 left-0 w-[36%] bg-gradient-to-r from-[#040915]/90 via-[#081224]/66 to-transparent" />
            <div className="absolute inset-y-0 right-0 w-[28%] bg-gradient-to-l from-[#180708]/75 via-transparent to-transparent" />

            <div className="absolute inset-0 flex items-end justify-between gap-6 p-6 md:p-10">
              <div className="max-w-xl rounded-[1.75rem] border border-white/10 bg-[linear-gradient(145deg,rgba(8,15,28,0.74),rgba(18,7,12,0.56))] p-5 md:p-7 backdrop-blur-xl">
                <p className="text-[11px] uppercase tracking-[0.36em] text-cyan-200/80">Neural Road Vision</p>
                <h3 className="mt-3 text-2xl md:text-4xl font-display font-bold text-white">
                  Futuristic traffic intelligence with a cinematic live-feed surface.
                </h3>
                <p className="mt-3 text-sm md:text-base leading-7 text-slate-300">
                  Layered video, sensor-grade overlays, and a sharper visual identity for the platform entry point.
                </p>
              </div>

              <div className="hidden lg:flex flex-col gap-3 min-w-[14rem]">
                {[
                  ['Live Vision', 'YOLO-driven stream analysis'],
                  ['Incident Mapping', 'Risk zones highlighted in real time'],
                  ['Operational UI', 'Built for report triage and response'],
                ].map(([label, copy]) => (
                  <div
                    key={label}
                    className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 backdrop-blur-xl"
                  >
                    <p className="text-xs uppercase tracking-[0.24em] text-cyan-200/70">{label}</p>
                    <p className="mt-1 text-sm text-slate-200">{copy}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
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
            <p className="text-red-300 font-medium text-sm uppercase tracking-widest mb-4">Platform Features</p>
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
                className="feature-flip-card"
              >
                <button
                  type="button"
                  onClick={() => toggleCard(i)}
                  className={`feature-flip-inner ${flippedCards[i] ? 'is-flipped' : ''}`}
                  aria-label={`Flip ${feature.title} card`}
                >
                  <div className="feature-face glass-card-hover p-8 group text-left">
                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}>
                      <feature.icon className="w-7 h-7 text-white" />
                    </div>
                    <h3 className="text-xl font-display font-semibold text-white mb-3">{feature.title}</h3>
                    <p className="text-slate-400 leading-relaxed">{feature.description}</p>
                  </div>

                  <div className="feature-face feature-face-back glass-card p-8 text-left border border-red-500/30">
                    <h3 className="text-xl font-display font-semibold text-white mb-3">{feature.title}</h3>
                    <p className="text-slate-300 leading-relaxed">{feature.shortExplanation}</p>
                  </div>
                </button>
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
            <p className="text-red-300 font-medium text-sm uppercase tracking-widest mb-4">Workflow</p>
            <h2 className="text-4xl md:text-5xl font-display font-bold bg-gradient-to-r from-red-300 to-orange-300 bg-clip-text text-transparent mb-4">
              How TraffixAI Works
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { step: '01', title: 'Capture & Upload', desc: 'CCTV cameras capture traffic footage or users upload video/image evidence directly to the platform.', color: 'text-red-300', border: 'border-red-500/25' },
              { step: '02', title: 'AI Detection', desc: 'YOLOv8 neural network analyzes footage in real-time, detecting vehicles, pedestrians, accidents, and violations.', color: 'text-rose-300', border: 'border-rose-500/25' },
              { step: '03', title: 'Alert & Report', desc: 'System generates detailed reports, calculates risk scores, and sends instant alerts to authorities.', color: 'text-orange-300', border: 'border-orange-500/25' },
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
          <BrandLogo href="/" size="sm" />
          <p className="text-slate-500 text-sm">
            © 2026 TraffixAI: AI-Based Smart Traffic Surveillance System.
          </p>
          <div className="flex gap-6 text-slate-500 text-sm">
            <Link href="/about" className="hover:text-red-300 transition-colors">About The Website</Link>
            <Link href="/contact" className="hover:text-red-300 transition-colors">Contact Us</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
