import { useState, useRef, useEffect, useCallback } from 'react';

/* ═══════════════════════════════════════════════
   CHART COMPONENTS — Canvas-rendered
   ═══════════════════════════════════════════════ */

// ── Donut Chart ──────────────────────────────────
function DonutChart({ data, title, width = 260, height = 300 }) {
    const canvasRef = useRef(null);
    const COLORS = [
        '#4f8ef7', '#34d399', '#f59e42', '#ef4444', '#a78bfa',
        '#f472b6', '#06b6d4', '#eab308', '#14b8a6', '#f43f5e',
    ];

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !data || Object.keys(data).length === 0) return;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, width, height);

        const cx = width / 2, cy = 110, r = 80;
        const total = Object.values(data).reduce((a, b) => a + b, 0);
        if (total === 0) return;

        const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
        let angle = -Math.PI / 2;

        // Draw slices
        entries.forEach(([, value], i) => {
            const sliceAngle = (value / total) * 2 * Math.PI;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, r, angle, angle + sliceAngle);
            ctx.closePath();
            ctx.fillStyle = COLORS[i % COLORS.length];
            ctx.fill();
            ctx.strokeStyle = '#0f1520';
            ctx.lineWidth = 2;
            ctx.stroke();
            angle += sliceAngle;
        });

        // Inner hole
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.58, 0, Math.PI * 2);
        ctx.fillStyle = '#151d2e';
        ctx.fill();

        // Center label
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 20px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(total.toLocaleString(), cx, cy - 4);
        ctx.font = '9px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('TOTAL', cx, cy + 14);

        // Legend
        let ly = 205;
        entries.slice(0, 8).forEach(([label, value], i) => {
            const row = Math.floor(i / 2);
            const col = i % 2;
            const lx = 8 + col * (width / 2);
            const yy = ly + row * 18;
            const pct = ((value / total) * 100).toFixed(1);

            ctx.fillStyle = COLORS[i % COLORS.length];
            ctx.beginPath();
            ctx.arc(lx + 5, yy, 4, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#cbd5e1';
            ctx.font = '10px Inter, system-ui, sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            const displayLabel = label.replace(/_/g, ' ');
            ctx.fillText(`${displayLabel}  ${value} (${pct}%)`, lx + 14, yy);
        });
    }, [data, width, height]);

    return (
        <div className="dash-chart-card">
            <h4 className="dash-chart-title">{title}</h4>
            <canvas ref={canvasRef} style={{ width, height }} />
        </div>
    );
}

// ── Horizontal Bar Chart ─────────────────────────
function HBarChart({ data, title, width = 260, height = 220 }) {
    const canvasRef = useRef(null);
    const COLORS = ['#4f8ef7', '#34d399', '#f59e42', '#a78bfa', '#ef4444', '#06b6d4'];

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !data || Object.keys(data).length === 0) return;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, width, height);

        const entries = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 6);
        const maxVal = Math.max(...entries.map(e => e[1]), 1);
        const barH = 22;
        const gap = 10;
        const labelW = 80;
        const chartW = width - labelW - 40;

        entries.forEach(([label, value], i) => {
            const y = 10 + i * (barH + gap);
            const bw = (value / maxVal) * chartW;

            // Label
            ctx.fillStyle = '#cbd5e1';
            ctx.font = '11px Inter, system-ui, sans-serif';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(label.charAt(0).toUpperCase() + label.slice(1), labelW - 8, y + barH / 2);

            // Bar background
            ctx.fillStyle = 'rgba(255,255,255,0.03)';
            ctx.beginPath();
            ctx.roundRect(labelW, y, chartW, barH, 4);
            ctx.fill();

            // Bar fill
            const grad = ctx.createLinearGradient(labelW, y, labelW + bw, y);
            grad.addColorStop(0, COLORS[i % COLORS.length]);
            grad.addColorStop(1, COLORS[i % COLORS.length] + '88');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.roundRect(labelW, y, Math.max(bw, 6), barH, 4);
            ctx.fill();

            // Value
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 11px Inter, system-ui, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(value.toLocaleString(), labelW + bw + 6, y + barH / 2);
        });
    }, [data, width, height]);

    return (
        <div className="dash-chart-card">
            <h4 className="dash-chart-title">{title}</h4>
            <canvas ref={canvasRef} style={{ width, height }} />
        </div>
    );
}

// ── Area/Line Chart ──────────────────────────────
function AreaChart({ violationCounts, title, width = 540, height = 200 }) {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !violationCounts || Object.keys(violationCounts).length === 0) return;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, width, height);

        const entries = Object.entries(violationCounts).sort((a, b) => b[1] - a[1]);
        const padL = 10, padR = 10, padT = 20, padB = 40;
        const chartW = width - padL - padR;
        const chartH = height - padT - padB;

        if (entries.length === 0) return;

        const maxVal = Math.max(...entries.map(e => e[1]), 1);
        const step = chartW / Math.max(entries.length - 1, 1);

        // Grid lines
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const gy = padT + (chartH / 4) * i;
            ctx.beginPath();
            ctx.moveTo(padL, gy);
            ctx.lineTo(width - padR, gy);
            ctx.stroke();

            // Y labels
            const val = Math.round(maxVal - (maxVal / 4) * i);
            ctx.fillStyle = '#64748b';
            ctx.font = '9px Inter, system-ui, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(val, padL, gy - 4);
        }

        // Points
        const points = entries.map(([, val], i) => ({
            x: padL + i * step,
            y: padT + chartH - (val / maxVal) * chartH,
        }));

        // Area fill
        ctx.beginPath();
        ctx.moveTo(points[0].x, padT + chartH);
        points.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.lineTo(points[points.length - 1].x, padT + chartH);
        ctx.closePath();
        const areaGrad = ctx.createLinearGradient(0, padT, 0, padT + chartH);
        areaGrad.addColorStop(0, 'rgba(79, 142, 247, 0.25)');
        areaGrad.addColorStop(1, 'rgba(79, 142, 247, 0.01)');
        ctx.fillStyle = areaGrad;
        ctx.fill();

        // Line
        ctx.beginPath();
        points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.strokeStyle = '#4f8ef7';
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        ctx.stroke();

        // Dots + labels
        points.forEach((p, i) => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#4f8ef7';
            ctx.fill();
            ctx.strokeStyle = '#0f1520';
            ctx.lineWidth = 2;
            ctx.stroke();

            // X labels
            ctx.fillStyle = '#94a3b8';
            ctx.font = '8px Inter, system-ui, sans-serif';
            ctx.textAlign = 'center';
            const label = entries[i][0].replace(/_/g, ' ');
            const short = label.length > 9 ? label.slice(0, 8) + '…' : label;
            ctx.save();
            ctx.translate(p.x, padT + chartH + 14);
            ctx.rotate(entries.length > 5 ? -0.4 : 0);
            ctx.fillText(short, 0, 0);
            ctx.restore();
        });
    }, [violationCounts, width, height]);

    return (
        <div className="dash-chart-card dash-chart-wide">
            <h4 className="dash-chart-title">{title}</h4>
            <canvas ref={canvasRef} style={{ width: '100%', height }} />
        </div>
    );
}

/* ═══════════════════════════════════════════════
   MAIN DASHBOARD COMPONENT
   ═══════════════════════════════════════════════ */
export default function AIDashboard({ stats, cumulative, violationCounts, totalViolations }) {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);

    const generateDashboard = useCallback(async () => {
        setLoading(true);
        setError(null);
        setResult(null);
        try {
            const resp = await fetch('/api/generate-dashboard', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stats, cumulative, violationCounts, totalViolations }),
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'Generation failed');
            setResult(data);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [stats, cumulative, violationCounts, totalViolations]);

    // ── CTA ────────────────────────────────────────
    if (!result && !loading) {
        return (
            <div className="ai-dashboard">
                <div className="ai-dashboard-cta">
                    <div className="ai-cta-icon">📊</div>
                    <h3 className="ai-cta-title">AI Traffic Dashboard</h3>
                    <p className="ai-cta-desc">
                        Generate a comprehensive analytics dashboard with AI-powered insights,
                        risk assessment, and interactive data visualizations.
                    </p>
                    <div className="ai-cta-stats">
                        <span>🚗 {cumulative?.total_vehicles || 0} vehicles</span>
                        <span>🚶 {cumulative?.total_persons || 0} pedestrians</span>
                        <span>⚠️ {totalViolations} violations</span>
                    </div>
                    <button className="ai-generate-btn" onClick={generateDashboard}>
                        <span className="ai-sparkle">✨</span>
                        Generate AI Dashboard
                    </button>
                    {error && (
                        <div className="ai-dashboard-error">
                            <span>❌ {error}</span>
                            <button onClick={generateDashboard}>Retry</button>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ── Loading ────────────────────────────────────
    if (loading) {
        return (
            <div className="ai-dashboard">
                <div className="ai-dashboard-loading">
                    <div className="ai-loading-orb">
                        <div className="ai-orb-ring" />
                        <div className="ai-orb-ring ai-orb-ring-2" />
                        <span className="ai-orb-icon">📊</span>
                    </div>
                    <p className="ai-loading-text">Generating AI Dashboard...</p>
                    <p className="ai-loading-sub">Analyzing data · Building charts · Creating insights</p>
                </div>
            </div>
        );
    }

    // ── Dashboard Result ───────────────────────────
    const analysis = result.analysis || {};
    const totals = result.totals || {};
    const riskConfig = {
        low: { color: '#34d399', bg: 'rgba(52,211,153,0.1)', label: 'LOW', icon: '🟢' },
        medium: { color: '#eab308', bg: 'rgba(234,179,8,0.1)', label: 'MEDIUM', icon: '🟡' },
        high: { color: '#f97316', bg: 'rgba(249,115,22,0.1)', label: 'HIGH', icon: '🟠' },
        critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', label: 'CRITICAL', icon: '🔴' },
    };
    const risk = riskConfig[analysis.risk_level] || riskConfig.medium;

    return (
        <div className="ai-dashboard dash-result">
            {/* ── Header ──────────────────────────── */}
            <div className="dash-header">
                <div>
                    <h2 className="dash-title">TRAFFIC ANALYSIS DASHBOARD</h2>
                    <p className="dash-subtitle">AI-Powered Analytics & Risk Assessment</p>
                </div>
                <button className="dash-regen-btn" onClick={generateDashboard}>
                    🔄 Regenerate
                </button>
            </div>

            {/* ── KPI Cards ───────────────────────── */}
            <div className="dash-kpi-row">
                <div className="dash-kpi" style={{ '--kpi-accent': '#4f8ef7' }}>
                    <span className="dash-kpi-icon">🚗</span>
                    <div className="dash-kpi-data">
                        <span className="dash-kpi-value">{totals.vehicles?.toLocaleString() || 0}</span>
                        <span className="dash-kpi-label">Total Vehicles</span>
                    </div>
                </div>
                <div className="dash-kpi" style={{ '--kpi-accent': '#34d399' }}>
                    <span className="dash-kpi-icon">🚶</span>
                    <div className="dash-kpi-data">
                        <span className="dash-kpi-value">{totals.persons?.toLocaleString() || 0}</span>
                        <span className="dash-kpi-label">Pedestrians</span>
                    </div>
                </div>
                <div className="dash-kpi" style={{ '--kpi-accent': '#a78bfa' }}>
                    <span className="dash-kpi-icon">🏍️</span>
                    <div className="dash-kpi-data">
                        <span className="dash-kpi-value">{totals.bikes?.toLocaleString() || 0}</span>
                        <span className="dash-kpi-label">Bikes</span>
                    </div>
                </div>
                <div className="dash-kpi" style={{ '--kpi-accent': '#ef4444' }}>
                    <span className="dash-kpi-icon">⚠️</span>
                    <div className="dash-kpi-data">
                        <span className="dash-kpi-value">{totals.violations?.toLocaleString() || 0}</span>
                        <span className="dash-kpi-label">Violations</span>
                    </div>
                </div>
                <div className="dash-kpi dash-kpi-risk" style={{
                    '--kpi-accent': risk.color,
                    background: risk.bg,
                    borderColor: risk.color + '33',
                }}>
                    <span className="dash-kpi-icon">{risk.icon}</span>
                    <div className="dash-kpi-data">
                        <span className="dash-kpi-value" style={{ color: risk.color }}>
                            {analysis.risk_score ?? 0}
                        </span>
                        <span className="dash-kpi-label">Risk Score</span>
                    </div>
                </div>
            </div>

            {/* ── Charts Row 1: Area chart ────────── */}
            <div className="dash-section">
                <AreaChart
                    violationCounts={result.violation_data || violationCounts}
                    title="📈 Violations by Type"
                />
            </div>

            {/* ── Charts Row 2: Donut + Bars ──────── */}
            <div className="dash-charts-grid">
                <DonutChart
                    data={result.violation_data || violationCounts}
                    title="🥧 Violation Distribution"
                />
                <HBarChart
                    data={result.vehicle_data || {}}
                    title="🚗 By Vehicle Type"
                />
            </div>

            {/* ── AI Summary Section ──────────────── */}
            <div className="dash-ai-section">
                <div className="dash-ai-header">
                    <span>🤖</span>
                    <h4>AI Analysis Summary</h4>
                    <span className="dash-ai-badge" style={{ background: risk.color + '22', color: risk.color }}>
                        {risk.label} RISK
                    </span>
                </div>
                <p className="dash-ai-summary">{analysis.summary || 'No summary available.'}</p>

                {analysis.insight && (
                    <div className="dash-insight">
                        <span>💡</span>
                        <span>{analysis.insight}</span>
                    </div>
                )}

                <div className="dash-two-col">
                    {analysis.top_concerns?.length > 0 && (
                        <div className="dash-col-card">
                            <h5>⚠️ Top Concerns</h5>
                            <ul>
                                {analysis.top_concerns.map((c, i) => <li key={i}>{c}</li>)}
                            </ul>
                        </div>
                    )}
                    {analysis.recommendations?.length > 0 && (
                        <div className="dash-col-card">
                            <h5>💡 Recommendations</h5>
                            <ul>
                                {analysis.recommendations.map((r, i) => <li key={i}>{r}</li>)}
                            </ul>
                        </div>
                    )}
                </div>
            </div>

            {/* ── AI Generated Image ──────────────── */}
            {result.image && (
                <div className="dash-image-section">
                    <h4>🎨 AI Visualization</h4>
                    <img
                        src={`data:image/png;base64,${result.image}`}
                        alt="AI Generated Dashboard"
                        className="dash-gen-image"
                    />
                    <a
                        href={`data:image/png;base64,${result.image}`}
                        download="ai-traffic-dashboard.png"
                        className="dash-download-btn"
                    >
                        ⬇️ Download Image
                    </a>
                </div>
            )}
            {!result.image && analysis.image_error && (
                <div className="dash-image-section">
                    <h4>🎨 AI Visualization</h4>
                    <div className="ai-dashboard-error" style={{ margin: 0 }}>
                        <span>⚠️ Image generation failed: {analysis.image_error}</span>
                    </div>
                </div>
            )}
        </div>
    );
}
