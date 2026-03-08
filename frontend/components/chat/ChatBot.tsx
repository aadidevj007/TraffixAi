'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import {
    MessageCircle, X, Send, Bot, ChevronRight,
    MapPin, Shield, Zap, RefreshCw, Navigation, Sparkles,
} from 'lucide-react';

const INITIAL_SUGGESTIONS = [
    'What violations can TraffixAI detect?',
    'How does YOLO detection work?',
    'What is the current risk level?',
    'Explain traffic violation types',
    'How to reduce road accidents?',
];

// System prompt that makes the assistant context-aware about TraffixAI
const SYSTEM_PROMPT = `You are TraffixAI Assistant, an expert AI assistant for the TraffixAI platform — an AI-powered traffic monitoring and violation detection system.

You help users with:
- Understanding detected traffic violations (helmet violations, wrong-way driving, speeding, lane changes, tailgating, jaywalking, red-light violations, U-turns, stopped vehicles, excess riders, accident detection)
- Interpreting AI analysis results from uploaded CCTV footage and images
- Traffic safety advice and best practices
- Route safety recommendations
- Understanding risk scores, violation types, and incident reports
- General traffic law questions

Detection capabilities: The system uses YOLOv8 computer vision with 12 violation modules. When answering, be concise, helpful, and traffic-safety focused. Use relevant emojis to make responses engaging. Format lists with bullet points.`;

interface Message {
    id: string;
    role: 'user' | 'bot';
    content: string;
    timestamp: Date;
}

export default function ChatBot({ detectionContext }: { detectionContext?: Record<string, any> }) {
    const [open, setOpen] = useState(false);
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(false);
    const [puterReady, setPuterReady] = useState(false);
    const endRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Inject Puter.js SDK from CDN
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if ((window as any).puter) { setPuterReady(true); return; }
        const script = document.createElement('script');
        script.src = 'https://js.puter.com/v2/';
        script.async = true;
        script.onload = () => setPuterReady(true);
        document.head.appendChild(script);
        return () => { try { document.head.removeChild(script); } catch { } };
    }, []);

    // Scroll to bottom on new message
    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Greet on open
    useEffect(() => {
        if (open && messages.length === 0) {
            addBotMessage("👋 Hi! I'm **TraffixAI Assistant**, powered by GPT-4o.\n\nI can help you understand traffic violations, analyse detected incidents, and provide road safety advice. What would you like to know?");
        }
    }, [open]);

    const addBotMessage = (content: string) => {
        setMessages((prev) => [
            ...prev,
            { id: Date.now().toString(), role: 'bot', content, timestamp: new Date() },
        ]);
    };

    const buildHistory = (msgs: Message[]) =>
        msgs.slice(-10).map((m) => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content,
        }));

    const sendMessage = useCallback(async (text: string) => {
        if (!text.trim() || loading) return;
        setInput('');
        setLoading(true);

        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: text,
            timestamp: new Date(),
        };
        setMessages((prev) => [...prev, userMsg]);

        try {
            const puter = (window as any).puter;
            if (!puter || !puterReady) throw new Error('Puter not ready');

            // Build context-enriched message
            let contextualText = text;
            if (detectionContext) {
                const ctx = JSON.stringify(detectionContext, null, 2);
                contextualText = `${text}\n\n[Current analysis context: ${ctx}]`;
            }

            // Use Puter.js GPT-4o (free, unlimited) 
            const history = buildHistory(messages);
            const response = await puter.ai.chat(
                [
                    { role: 'system', content: SYSTEM_PROMPT },
                    ...history,
                    { role: 'user', content: contextualText },
                ],
                { model: 'gpt-4o-mini' }
            );

            const reply = typeof response === 'string'
                ? response
                : response?.message?.content || response?.content || 'Sorry, I could not generate a response.';

            addBotMessage(reply);
        } catch (err) {
            // Fallback: smart offline responses
            const lower = text.toLowerCase();
            let fallback = '';

            if (/helmet|rider|bike|motorcycle/.test(lower)) {
                fallback = '🪖 **Helmet Violation Detection**\n\nTraffixAI detects helmet violations by identifying motorcycle riders using YOLO and analysing the head region for helmet presence using colour and shape analysis.\n\n**Threshold**: If helmet confidence score < 0.7, a violation is flagged.';
            } else if (/wrong.?way|wrong way/.test(lower)) {
                fallback = '⛔ **Wrong-Way Detection**\n\nThe system tracks vehicle movement history over 20+ frames. If a vehicle\'s direction consistently opposes the dominant traffic flow direction, a wrong-way violation is flagged.';
            } else if (/speed|fast|accelerat/.test(lower)) {
                fallback = '⚡ **Speed Violation Detection**\n\nSpeed is estimated in pixels-per-frame using tracking history. If a vehicle\'s average speed over the last 5 frames exceeds `100 px/frame`, a speeding violation is triggered.';
            } else if (/risk|score|danger/.test(lower)) {
                fallback = '📊 **Risk Score**\n\nRisk score = `min(100, violations×6 + accidents×30 + density×0.15)`\n\n- 🟢 0–34: Low risk\n- 🟡 35–69: Medium risk\n- 🔴 70–100: High risk';
            } else if (/jaywal/.test(lower)) {
                fallback = '🚶 **Jaywalking Detection**\n\nDetected when a pedestrian is found in the vehicle-dominated zone (between top 20% and bottom 20% margins) with 2+ nearby vehicles, not overlapping any vehicle bounding box.';
            } else if (/tailgat/.test(lower)) {
                fallback = '🚗 **Tailgating Detection**\n\nFlagged when the front-to-rear gap between two aligned vehicles is less than 5% of the frame height.';
            } else if (/accident/.test(lower)) {
                fallback = '🚨 **Accident Detection**\n\nDetected when two vehicles have IoU (overlap) > 50% AND at least one vehicle shows sudden deceleration (speed drops to <50% of recent average).';
            } else {
                fallback = '🤖 **TraffixAI Assistant** (Offline Mode)\n\nI\'m temporarily offline. The AI uses GPT-4o via Puter.com (no API key needed).\n\nI can help with:\n- 🪖 Helmet & safety violations\n- ⚡ Speed & wrong-way detection\n- 🚨 Accident analysis\n- 📊 Risk scores explained\n- 🗺️ Route safety tips';
            }
            addBotMessage(fallback);
        } finally {
            setLoading(false);
        }
    }, [loading, messages, detectionContext, puterReady]);

    return (
        <>
            {/* Floating Toggle Button */}
            <motion.button
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                whileHover={{ scale: 1.07 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setOpen(!open)}
                className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-glow-cyan
                   bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center
                   hover:from-cyan-400 hover:to-blue-500 transition-all"
                aria-label="Open AI Assistant"
            >
                <AnimatePresence mode="wait">
                    {open ? (
                        <motion.div key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}>
                            <X className="w-6 h-6 text-white" />
                        </motion.div>
                    ) : (
                        <motion.div key="open" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }}>
                            <Bot className="w-6 h-6 text-white" />
                        </motion.div>
                    )}
                </AnimatePresence>
                {!open && (
                    <span className="absolute inset-0 rounded-full bg-cyan-400 animate-ping opacity-20 pointer-events-none" />
                )}
            </motion.button>

            {/* Chat Panel */}
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                        className="fixed bottom-24 right-6 z-50 w-[380px] sm:w-[430px] max-h-[640px] flex flex-col
                       glass-card border border-white/10 shadow-2xl rounded-2xl overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center gap-3 p-4 border-b border-white/10 bg-gradient-to-r from-cyan-500/10 to-blue-600/10 shrink-0">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                                <Bot className="w-5 h-5 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-display font-semibold text-white text-sm">TraffixAI Assistant</p>
                                <div className="flex items-center gap-1.5">
                                    <span className={`w-1.5 h-1.5 rounded-full ${puterReady ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                                    <span className={`text-xs ${puterReady ? 'text-emerald-400' : 'text-amber-400'}`}>
                                        {puterReady ? 'GPT-4o · Online' : 'Loading AI...'}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                                <span className="text-xs text-slate-400">Puter.com</span>
                            </div>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
                            {messages.length === 0 && (
                                <div className="space-y-2 pt-2">
                                    <p className="text-xs text-slate-500 text-center mb-3">Quick questions:</p>
                                    {INITIAL_SUGGESTIONS.map((s) => (
                                        <button
                                            key={s}
                                            onClick={() => sendMessage(s)}
                                            className="w-full text-left text-xs px-3 py-2 rounded-xl
                                                bg-white/5 border border-white/10 text-slate-300
                                                hover:bg-white/10 hover:text-white hover:border-cyan-500/30 transition-all flex items-center gap-2"
                                        >
                                            <ChevronRight className="w-3 h-3 text-cyan-400 shrink-0" />
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {messages.map((msg) => (
                                <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                                    {msg.role === 'bot' && (
                                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                                            <Bot className="w-3.5 h-3.5 text-white" />
                                        </div>
                                    )}
                                    <div className={`max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col`}>
                                        <div
                                            className={`px-3.5 py-3 rounded-2xl text-sm leading-relaxed ${msg.role === 'user'
                                                ? 'bg-gradient-to-br from-cyan-500 to-blue-600 text-white rounded-tr-sm'
                                                : 'bg-white/5 border border-white/10 text-slate-200 rounded-tl-sm'
                                                }`}
                                        >
                                            <ReactMarkdown
                                                components={{
                                                    strong: ({ children }) => <strong className="text-cyan-300 font-semibold">{children}</strong>,
                                                    em: ({ children }) => <em className="text-slate-300">{children}</em>,
                                                    p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
                                                    li: ({ children }) => <li className="ml-3 list-disc mb-0.5">{children}</li>,
                                                    ul: ({ children }) => <ul className="mt-1 space-y-0.5">{children}</ul>,
                                                    code: ({ children }) => <code className="bg-white/10 rounded px-1 py-0.5 text-cyan-300 font-mono text-xs">{children}</code>,
                                                }}
                                            >
                                                {msg.content}
                                            </ReactMarkdown>
                                        </div>
                                        <span className="text-xs text-slate-600 mt-1 px-1">
                                            {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                </div>
                            ))}

                            {/* Loading indicator */}
                            {loading && (
                                <div className="flex gap-2">
                                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shrink-0">
                                        <Bot className="w-3.5 h-3.5 text-white" />
                                    </div>
                                    <div className="bg-white/5 border border-white/10 rounded-2xl rounded-tl-sm px-4 py-3">
                                        <div className="flex gap-1 items-center">
                                            {[0, 1, 2].map((i) => (
                                                <span key={i} className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                                            ))}
                                            <span className="text-xs text-slate-500 ml-2">GPT-4o thinking...</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div ref={endRef} />
                        </div>

                        {/* Input Bar */}
                        <div className="p-3 border-t border-white/10 shrink-0">
                            <form
                                onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
                                className="flex items-center gap-2"
                            >
                                <input
                                    ref={inputRef}
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    placeholder="Ask about traffic, violations, routes…"
                                    disabled={loading}
                                    className="flex-1 text-sm bg-white/5 border border-white/10 rounded-xl px-4 py-2.5
                                     text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50
                                     disabled:opacity-50 transition-colors"
                                />
                                <button
                                    type="submit"
                                    disabled={loading || !input.trim()}
                                    className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center
                                     hover:from-cyan-400 hover:to-blue-500 transition-all disabled:opacity-40
                                     hover:shadow-glow-cyan active:scale-95 shrink-0"
                                >
                                    {loading ? (
                                        <RefreshCw className="w-4 h-4 text-white animate-spin" />
                                    ) : (
                                        <Send className="w-4 h-4 text-white" />
                                    )}
                                </button>
                            </form>
                            <p className="text-center text-xs text-slate-600 mt-2">
                                Powered by GPT-4o via <span className="text-cyan-700">Puter.com</span> · Free & unlimited
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
