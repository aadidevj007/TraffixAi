'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { motion, useInView, useMotionValue, useSpring, AnimatePresence } from 'framer-motion';
import {
  Camera, Zap, Shield, Brain, ArrowRight,
  ChevronDown, Activity, AlertTriangle, Eye,
  Cpu, Radio, Target, TrendingUp, Wifi, Lock
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import BrandLogo from '@/components/layout/BrandLogo';

const ThreeBackground = dynamic(() => import('@/components/three/ThreeBackground'), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-space-950" />,
});

/* ── Data ──────────────────────────────────────────────────────────────── */

const features = [
  {
    icon: Camera,
    title: 'Real-Time Surveillance',
    description: 'Monitor traffic 24/7 with intelligent CCTV integration and live video stream analysis powered by YOLOv8 neural networks.',
    shortExplanation: 'Live camera frames are analyzed with YOLO, objects are tracked across frames, and risky events are flagged in near real-time with sub-20s latency.',
    accentColor: '#06b6d4',
    glowColor: 'rgba(6,182,212,0.3)',
    badge: 'LIVE',
    gradient: 'from-cyan-500 to-blue-600',
  },
  {
    icon: Eye,
    title: 'Upload Evidence',
    description: 'Upload CCTV footage or images for immediate AI analysis, accident detection, violation scoring, and verdict-ready reporting.',
    shortExplanation: 'Uploaded image/video is processed on the backend, annotated with bounding boxes, risk-scored, and saved as a structured report for review.',
    accentColor: '#8b5cf6',
    glowColor: 'rgba(139,92,246,0.3)',
    badge: 'AI',
    gradient: 'from-violet-500 to-purple-600',
  },
  {
    icon: Brain,
    title: 'Risk Prediction',
    description: 'Advanced ML models compute real-time risk scores from vehicle density, violation patterns, and historical accident data.',
    shortExplanation: 'The platform combines violations, accidents, and traffic density into a weighted risk score to prioritize high-risk incidents for rapid response.',
    accentColor: '#f59e0b',
    glowColor: 'rgba(245,158,11,0.3)',
    badge: 'ML',
    gradient: 'from-amber-500 to-orange-600',
  },
  {
    icon: Shield,
    title: 'Admin Dashboard',
    description: 'Comprehensive control panel for authorities to manage reports, configure alerts, review verdicts, and oversee all operations.',
    shortExplanation: 'Admins can review pending requests, approve or reject reports with judge verdicts, track live trends, and dispatch alerts from one command center.',
    accentColor: '#10b981',
    glowColor: 'rgba(16,185,129,0.3)',
    badge: 'CMD',
    gradient: 'from-emerald-500 to-teal-600',
  },
];

const stats = [
  { label: 'Accuracy Rate',      value: '91.8%', icon: Target,       color: '#06b6d4' },
  { label: 'Detection Speed',    value: '<20s',  icon: Zap,          color: '#f59e0b' },
  { label: 'Alerts Dispatched',  value: '50K+',  icon: AlertTriangle,color: '#8b5cf6' },
  { label: 'Roads Monitored',    value: '1,200+',icon: Activity,     color: '#10b981' },
];

const hudItems = [
  { label: 'VEHICLES DETECTED', value: '47', color: '#06b6d4', live: true },
  { label: 'RISK SCORE',        value: '6.2',color: '#f59e0b', live: false },
  { label: 'ALERTS ACTIVE',     value: '3',  color: '#ef4444', live: true },
];

/* ── Animated Counter ─────────────────────────────────────────────────── */
function AnimatedCounter({ value, className }: { value: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  // Start with the real value so server HTML matches the initial client render;
  // the animation runs from 0 → value entirely inside useEffect (client only).
  const [displayed, setDisplayed] = useState(value);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!inView || !mounted) return;
    const suffix = value.replace(/[0-9.]/g, '');
    const num = parseFloat(value.replace(/[^0-9.]/g, ''));
    let start = 0;
    const duration = 1800;
    const step = (timestamp: number) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = eased * num;
      setDisplayed(
        (current % 1 === 0 || suffix.includes('%')
          ? current.toFixed(current < 10 ? 1 : 0)
          : current.toFixed(1)) + suffix
      );
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [inView, mounted, value]);

  return <span ref={ref} className={className}>{displayed}</span>;
}

/* ── HUD Overlay ─────────────────────────────────────────────────────── */
function HudOverlay() {
  const [tick, setTick] = useState(0);
  // Initialize with deterministic values — only randomize client-side
  const [liveValues, setLiveValues] = useState(['47', '7.4', '3']);

  useEffect(() => {
    // First update immediately on mount so client matches a stable initial render
    const update = () => setLiveValues([
      Math.floor(40 + Math.random() * 20).toString(),
      (5 + Math.random() * 4).toFixed(1),
      Math.floor(1 + Math.random() * 6).toString(),
    ]);
    // Delay first randomization until after hydration is complete
    const init = setTimeout(update, 100);
    const id = setInterval(() => {
      setTick(t => t + 1);
      update();
    }, 1800);
    return () => { clearTimeout(init); clearInterval(id); };
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none z-20 flex flex-col justify-between p-6 md:p-10">
      {/* Top-left: Live feed badge */}
      <div className="flex items-start gap-3">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 1.5, duration: 0.5 }}
          className="flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-space-900/80 backdrop-blur-xl px-3 py-2"
        >
          <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
          <span className="font-mono text-xs text-cyan-300 tracking-widest">LIVE FEED</span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 1.7, duration: 0.5 }}
          className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-space-900/80 backdrop-blur-xl px-3 py-2"
        >
          <Wifi className="h-3 w-3 text-amber-400" />
          <span className="font-mono text-xs text-amber-300 tracking-widest">YOLOv8 ACTIVE</span>
        </motion.div>
      </div>

      {/* Bottom: HUD metrics */}
      <div className="hidden md:flex gap-3">
        {hudItems.map((item, i) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 2 + i * 0.15 }}
            className="rounded-xl border border-white/10 bg-space-900/85 backdrop-blur-xl px-4 py-3 min-w-[120px]"
          >
            <div className="flex items-center gap-1.5 mb-1">
              {item.live && <div className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />}
              <p className="font-mono text-[9px] tracking-[0.2em] text-slate-500">{item.label}</p>
            </div>
            <AnimatePresence mode="wait">
              <motion.p
                key={tick}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="font-mono text-xl font-bold"
                style={{ color: item.color }}
              >
                {item.live ? liveValues[i] : item.value}
              </motion.p>
            </AnimatePresence>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ── Feature Card ────────────────────────────────────────────────────── */
function FeatureCard({
  feature, index, flipped, onFlip
}: {
  feature: typeof features[0]; index: number; flipped: boolean; onFlip: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useMotionValue(0), { stiffness: 200, damping: 25 });
  const rotateY = useSpring(useMotionValue(0), { stiffness: 200, damping: 25 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current || flipped) return;
    const rect = ref.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    rotateX.set(((e.clientY - cy) / rect.height) * -12);
    rotateY.set(((e.clientX - cx) / rect.width) * 12);
  };

  const handleMouseLeave = () => {
    rotateX.set(0);
    rotateY.set(0);
  };

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: index * 0.12 }}
      viewport={{ once: true }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ perspective: 1200, rotateX, rotateY }}
      className="feature-flip-card"
    >
      <button
        type="button"
        onClick={onFlip}
        className={`feature-flip-inner ${flipped ? 'is-flipped' : ''}`}
        aria-label={`Flip ${feature.title} card`}
      >
        {/* Front */}
        <div className="feature-face cyber-card p-8 group text-left holo-shimmer">
          {/* Badge */}
          <div className="absolute top-4 right-4">
            <span className="font-mono text-[10px] tracking-widest px-2 py-0.5 rounded border"
              style={{ color: feature.accentColor, borderColor: `${feature.accentColor}40`, background: `${feature.accentColor}10` }}>
              {feature.badge}
            </span>
          </div>

          {/* Icon */}
          <div
            className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-6
                        shadow-lg transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3`}
            style={{ boxShadow: `0 8px 32px ${feature.glowColor}` }}
          >
            <feature.icon className="w-7 h-7 text-white" />
          </div>

          <h3 className="text-xl font-display font-semibold text-white mb-3">{feature.title}</h3>
          <p className="text-slate-400 leading-relaxed text-sm">{feature.description}</p>

          <div className="mt-6 flex items-center gap-2" style={{ color: feature.accentColor }}>
            <span className="text-xs font-mono tracking-wider">CLICK TO REVEAL</span>
            <ArrowRight className="w-3 h-3" />
          </div>

          {/* Bottom accent line */}
          <div className="absolute bottom-0 left-0 right-0 h-px rounded-b-2xl"
            style={{ background: `linear-gradient(90deg, transparent, ${feature.accentColor}60, transparent)` }} />
        </div>

        {/* Back */}
        <div className="feature-face cyber-card p-8 text-left"
          style={{ borderColor: `${feature.accentColor}30`, background: `linear-gradient(145deg, ${feature.accentColor}08, rgba(5,13,26,0.95))` }}>
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center`}>
              <feature.icon className="w-4 h-4 text-white" />
            </div>
            <h3 className="text-lg font-display font-semibold text-white">{feature.title}</h3>
          </div>
          <div className="mb-4 h-px" style={{ background: `linear-gradient(90deg, ${feature.accentColor}50, transparent)` }} />
          <p className="text-slate-300 leading-relaxed">{feature.shortExplanation}</p>
          <div className="mt-4 flex items-center gap-2 text-slate-500 text-xs font-mono">
            <span>↩ CLICK TO FLIP BACK</span>
          </div>

          <div className="absolute bottom-0 left-0 right-0 h-px rounded-b-2xl"
            style={{ background: `linear-gradient(90deg, transparent, ${feature.accentColor}60, transparent)` }} />
        </div>
      </button>
    </motion.div>
  );
}

/* ── Main Page ────────────────────────────────────────────────────────── */
export default function HomePage() {
  const { user } = useAuth();
  const [flippedCards, setFlippedCards] = useState<boolean[]>(features.map(() => false));

  const toggleCard = (index: number) => {
    setFlippedCards(prev => prev.map((item, i) => (i === index ? !item : item)));
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-space-950">

      {/* ── Hero Section ─────────────────────────────────────────────── */}
      <section className="relative flex min-h-screen items-center justify-center overflow-hidden">

        {/* 3D Traffic Surveillance Scene */}
        <ThreeBackground />

        {/* Layered overlays */}
        <div className="absolute inset-0 bg-gradient-to-b from-space-950/40 via-transparent to-space-950" />
        <div className="absolute inset-0 bg-gradient-to-r from-space-950/60 via-transparent to-space-950/30" />
        <div className="absolute inset-0 grid-pattern opacity-20" />

        {/* HUD overlay on top of the 3D scene */}
        <HudOverlay />

        {/* Hero Content */}
        <div className="relative z-30 mx-auto max-w-5xl px-4 pt-20 text-center">

          {/* Status badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8 inline-flex items-center gap-2.5 rounded-full border border-cyan-500/20 bg-space-900/70 px-5 py-2.5 backdrop-blur-xl shadow-lg"
            style={{ boxShadow: '0 0 30px rgba(6,182,212,0.08), 0 4px 20px rgba(0,0,0,0.4)' }}
          >
            <div className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500" />
            </div>
            <span className="font-mono text-xs tracking-[0.25em] text-cyan-300">
              AI-POWERED TRAFFIC INTELLIGENCE PLATFORM
            </span>
          </motion.div>

          {/* Title */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="hero-title mb-4 text-7xl md:text-[7.5rem]"
          >
            <span style={{
              background: 'linear-gradient(135deg, #ffffff 0%, #a5f3fc 40%, #06b6d4 70%, #0891b2 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              TRAFFIX
            </span>
            <span style={{
              background: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 50%, #f97316 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              AI
            </span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="mb-3 text-xl font-light text-slate-200 md:text-2xl"
          >
            Real-time incident detection for modern road operations
          </motion.p>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="text-balance mb-12 text-base text-slate-500 md:text-lg max-w-2xl mx-auto"
          >
            Upload evidence, analyze live CCTV footage, generate verdict-ready reports —
            built for A-grade smart city deployment.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="flex flex-col justify-center gap-4 sm:flex-row"
          >
            <Link href={user ? '/dashboard' : '/login'}
              className="btn-primary flex items-center justify-center gap-2.5 px-8 py-4 text-base font-semibold">
              <Cpu className="w-4 h-4" />
              {user ? 'Go to Dashboard' : 'Get Started Free'}
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="/contact"
              className="btn-secondary flex items-center justify-center gap-2.5 px-8 py-4 text-base">
              <Radio className="w-4 h-4 text-cyan-400" />
              Contact Us
            </Link>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.6 }}
            className="mt-16 grid grid-cols-2 gap-4 md:grid-cols-4"
          >
            {stats.map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="glass-card p-5 group hover:border-cyan-500/20 transition-all duration-300">
                <Icon className="mx-auto mb-3 h-5 w-5" style={{ color }} />
                <p className="text-2xl font-bold font-mono" style={{ color }}>
                  <AnimatedCounter value={value} />
                </p>
                <p className="text-xs text-slate-500 mt-1 font-mono tracking-wider uppercase">{label}</p>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 text-slate-500"
        >
          <ChevronDown className="w-5 h-5" />
        </motion.div>
      </section>

      {/* ── Neural Road Vision Banner ───────────────────────────────────── */}
      <section className="relative py-12 md:py-16">
        <div className="container-max">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            viewport={{ once: true }}
            className="relative overflow-hidden rounded-3xl border border-cyan-500/15 bg-space-900/80 backdrop-blur-xl
                       shadow-[0_40px_120px_rgba(0,0,0,0.6)] scan-line"
          >
            {/* Background gradient */}
            <div className="absolute inset-0"
              style={{ background: 'radial-gradient(ellipse at 20% 50%, rgba(6,182,212,0.08), transparent 60%), radial-gradient(ellipse at 80% 50%, rgba(139,92,246,0.05), transparent 60%)' }} />

            {/* Grid */}
            <div className="absolute inset-0 grid-pattern opacity-30" />

            {/* Top accent line */}
            <div className="absolute top-0 left-0 right-0 h-px"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(6,182,212,0.5), rgba(139,92,246,0.3), transparent)' }} />

            <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-8 p-8 md:p-12">
              <div className="max-w-2xl">
                <p className="font-mono text-[10px] tracking-[0.35em] text-cyan-400/80 mb-3">
                  NEURAL ROAD VISION — TRAFFIXAI v2.0
                </p>
                <h3 className="text-3xl md:text-4xl font-display font-bold text-white leading-tight mb-4">
                  Cinematic surveillance UI with{' '}
                  <span className="gradient-text">precision-grade</span> AI overlays.
                </h3>
                <p className="text-slate-400 leading-relaxed">
                  Live-feed energy, sensor-grade bounding boxes, and a clean hierarchy that makes every
                  road decision smarter and faster.
                </p>
              </div>

              <div className="flex flex-col gap-3 min-w-[16rem]">
                {[
                  { label: 'Live Vision', copy: 'YOLO-driven stream analysis', icon: Camera, color: '#06b6d4' },
                  { label: 'Incident Mapping', copy: 'Risk zones highlighted in real time', icon: Target, color: '#f59e0b' },
                  { label: 'Operational UI', copy: 'Built for report triage and response', icon: Shield, color: '#8b5cf6' },
                ].map(({ label, copy, icon: Icon, color }) => (
                  <div key={label}
                    className="flex items-center gap-3 rounded-2xl border border-white/8 bg-space-800/60 px-4 py-3 backdrop-blur-xl">
                    <Icon className="w-4 h-4 flex-shrink-0" style={{ color }} />
                    <div>
                      <p className="text-xs font-mono tracking-[0.2em] mb-0.5" style={{ color }}>{label}</p>
                      <p className="text-xs text-slate-400">{copy}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom accent */}
            <div className="absolute bottom-0 left-0 right-0 h-px"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(245,158,11,0.3), transparent)' }} />
          </motion.div>
        </div>
      </section>

      {/* ── Features Section ───────────────────────────────────────────── */}
      <section id="features" className="relative py-28">
        <div className="container-max">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <p className="mb-4 font-mono text-xs tracking-[0.3em] text-cyan-400/80 uppercase">
              Platform Features
            </p>
            <h2 className="section-title mb-6">Intelligent Traffic Management</h2>
            <p className="section-subtitle">
              A comprehensive AI platform combining real-time surveillance, accident detection,
              and predictive analytics to make roads safer and smarter.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {features.map((feature, i) => (
              <FeatureCard
                key={feature.title}
                feature={feature}
                index={i}
                flipped={flippedCards[i]}
                onFlip={() => toggleCard(i)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ───────────────────────────────────────────────── */}
      <section className="relative overflow-hidden py-28">
        <div className="absolute inset-0 grid-pattern opacity-15" />
        <div className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(6,182,212,0.06), transparent 60%)' }} />

        <div className="container-max relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <p className="mb-4 font-mono text-xs tracking-[0.3em] text-cyan-400/80 uppercase">
              Workflow
            </p>
            <h2 className="mb-4 font-display font-bold text-4xl md:text-5xl"
              style={{ background: 'linear-gradient(135deg, #fff, #a5f3fc, #06b6d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              How TraffixAI Works
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
            {/* Connector line */}
            <div className="hidden md:block absolute top-12 left-[20%] right-[20%] h-px"
              style={{ background: 'linear-gradient(90deg, rgba(6,182,212,0.3), rgba(139,92,246,0.3), rgba(245,158,11,0.3))' }} />

            {[
              {
                step: '01', title: 'Capture & Upload',
                desc: 'CCTV cameras capture traffic footage or users upload video/image evidence directly to the AI platform.',
                icon: Camera, color: '#06b6d4', glow: 'rgba(6,182,212,0.3)',
              },
              {
                step: '02', title: 'AI Detection',
                desc: 'YOLOv8 neural network analyzes footage in real-time, detecting vehicles, pedestrians, accidents, and violations.',
                icon: Brain, color: '#8b5cf6', glow: 'rgba(139,92,246,0.3)',
              },
              {
                step: '03', title: 'Alert & Report',
                desc: 'System generates detailed reports, calculates risk scores, and sends instant alerts to relevant authorities.',
                icon: AlertTriangle, color: '#f59e0b', glow: 'rgba(245,158,11,0.3)',
              },
            ].map((item, i) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: i * 0.15 }}
                viewport={{ once: true }}
                className="cyber-card p-8 relative group"
                style={{ borderColor: `${item.color}20` }}
              >
                {/* Step number watermark */}
                <p className="absolute top-4 right-6 font-display font-bold text-6xl select-none"
                  style={{ color: `${item.color}15` }}>
                  {item.step}
                </p>

                {/* Icon */}
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-6 transition-transform duration-300 group-hover:scale-110"
                  style={{ background: `linear-gradient(135deg, ${item.color}20, ${item.color}10)`, border: `1px solid ${item.color}30`, boxShadow: `0 8px 24px ${item.glow}` }}>
                  <item.icon className="w-5 h-5" style={{ color: item.color }} />
                </div>

                <p className="font-mono text-xs tracking-widest mb-3" style={{ color: item.color }}>
                  STEP {item.step}
                </p>
                <h3 className="text-xl font-display font-semibold text-white mb-3">{item.title}</h3>
                <p className="text-slate-400 leading-relaxed text-sm">{item.desc}</p>

                {/* Bottom line */}
                <div className="absolute bottom-0 left-0 right-0 h-px rounded-b-2xl"
                  style={{ background: `linear-gradient(90deg, transparent, ${item.color}40, transparent)` }} />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Tech Stack Section ─────────────────────────────────────────── */}
      <section className="relative py-20">
        <div className="container-max">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <p className="font-mono text-xs tracking-[0.3em] text-cyan-400/60 uppercase">
              Powered By
            </p>
          </motion.div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { name: 'YOLOv8', desc: 'Real-time object detection', color: '#06b6d4', icon: Eye },
              { name: 'Firebase', desc: 'Auth & cloud database', color: '#f59e0b', icon: Lock },
              { name: 'FastAPI', desc: 'High-performance backend', color: '#8b5cf6', icon: Zap },
              { name: 'Next.js 14', desc: 'Full-stack React framework', color: '#10b981', icon: TrendingUp },
            ].map((tech, i) => (
              <motion.div
                key={tech.name}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                viewport={{ once: true }}
                className="glass-card p-6 text-center group hover:border-cyan-500/20 transition-all duration-300"
              >
                <div className="w-10 h-10 rounded-xl mx-auto mb-3 flex items-center justify-center"
                  style={{ background: `${tech.color}15`, border: `1px solid ${tech.color}30` }}>
                  <tech.icon className="w-5 h-5" style={{ color: tech.color }} />
                </div>
                <p className="font-display font-semibold text-white text-sm">{tech.name}</p>
                <p className="text-slate-500 text-xs mt-1">{tech.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className="py-10 border-t border-white/5">
        <div className="container-max flex flex-col md:flex-row items-center justify-between gap-6">
          <BrandLogo href="/" size="sm" />
          <p className="text-slate-600 text-sm font-mono">
            © 2026 TraffixAI — AI-Based Smart Traffic Surveillance System
          </p>
          <div className="flex gap-6 text-slate-500 text-sm">
            <Link href="/about" className="hover:text-cyan-400 transition-colors duration-200">About</Link>
            <Link href="/contact" className="hover:text-cyan-400 transition-colors duration-200">Contact</Link>
            <Link href="/privacy" className="hover:text-cyan-400 transition-colors duration-200">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
