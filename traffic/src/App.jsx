import { useState, useRef, useCallback } from 'react';
import VideoUpload from './components/VideoUpload';
import VideoPlayer from './components/VideoPlayer';
import Dashboard from './components/Dashboard';
import ViolationLog from './components/ViolationLog';
import ImageAnalysis from './components/ImageAnalysis';
import AIDashboard from './components/AIDashboard';
import './App.css';

function App() {
  const [mode, setMode] = useState(null); // null | 'video' | 'image'
  const [videoId, setVideoId] = useState(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [stats, setStats] = useState({ total_vehicles: 0, total_persons: 0, total_bikes: 0, traffic_lights: 0 });
  const [cumulative, setCumulative] = useState({ total_vehicles: 0, total_persons: 0, total_bikes: 0, by_class: {} });
  const [progress, setProgress] = useState({ frame: 0, total: 0, percent: 0 });
  const [violations, setViolations] = useState([]);
  const [accidents, setAccidents] = useState([]);
  const [frameUrl, setFrameUrl] = useState(null);
  const [isDone, setIsDone] = useState(false);
  const [violationCounts, setViolationCounts] = useState({});
  const wsRef = useRef(null);

  const startStreaming = useCallback((id) => {
    setMode('video');
    setVideoId(id);
    setIsStreaming(true);
    setIsDone(false);
    setViolations([]);
    setAccidents([]);
    setViolationCounts({});
    setCumulative({ total_vehicles: 0, total_persons: 0, total_bikes: 0, by_class: {} });
    setProgress({ frame: 0, total: 0, percent: 0 });

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/monitor/${id}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      if (event.data instanceof Blob) {
        const url = URL.createObjectURL(event.data);
        setFrameUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      } else {
        try {
          const data = JSON.parse(event.data);
          if (data.done) { setIsDone(true); setIsStreaming(false); return; }
          if (data.error) { console.error('Server:', data.error); return; }
          if (data.stats) setStats(data.stats);
          if (data.cumulative) setCumulative(data.cumulative);
          if (data.progress) setProgress(data.progress);
          if (data.violations?.length > 0) {
            const ts = new Date().toLocaleTimeString();
            const newV = data.violations.map((v, i) => ({ ...v, id: Date.now() + i, timestamp: ts }));
            setViolations((prev) => [...newV, ...prev].slice(0, 200));
            setViolationCounts((prev) => {
              const u = { ...prev };
              data.violations.forEach((v) => { u[v.type] = (u[v.type] || 0) + 1; });
              return u;
            });
          }
          if (data.accidents?.length > 0) {
            const ts = new Date().toLocaleTimeString();
            const newA = data.accidents.map((a, i) => ({ ...a, id: Date.now() + i, timestamp: ts, type: 'accident' }));
            setAccidents((prev) => [...newA, ...prev].slice(0, 50));
            setViolationCounts((prev) => ({ ...prev, accident: (prev.accident || 0) + data.accidents.length }));
          }
        } catch (e) { console.error('Parse:', e); }
      }
    };
    ws.onclose = () => setIsStreaming(false);
    ws.onerror = () => setIsStreaming(false);
  }, []);

  const resetApp = useCallback(() => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    setMode(null);
    setVideoId(null);
    setIsStreaming(false);
    setFrameUrl(null);
    setIsDone(false);
    setStats({ total_vehicles: 0, total_persons: 0, total_bikes: 0, traffic_lights: 0 });
    setCumulative({ total_vehicles: 0, total_persons: 0, total_bikes: 0, by_class: {} });
    setProgress({ frame: 0, total: 0, percent: 0 });
    setViolations([]);
    setAccidents([]);
    setViolationCounts({});
  }, []);

  const totalViolations = Object.values(violationCounts).reduce((a, b) => a + b, 0);

  // ── Landing page (no mode selected) ──
  if (!mode) {
    return (
      <div className="app">
        <header className="app-header">
          <div className="header-left">
            <div className="logo-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
            </div>
            <h1>TrafficAI</h1>
          </div>
        </header>

        <div className="landing">
          <div className="landing-hero">
            <h2>AI-Powered Traffic Analysis</h2>
            <p>Detect violations, count vehicles, and monitor anomalies in real-time</p>
          </div>

          <div className="mode-selector">
            <button className="mode-card" onClick={() => setMode('video-upload')}>
              <div className="mode-icon mode-icon-video">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
              </div>
              <h3>Video Analysis</h3>
              <p>Upload a traffic video for real-time violation detection and vehicle counting</p>
              <span className="mode-tag">Streaming</span>
            </button>

            <button className="mode-card" onClick={() => setMode('image')}>
              <div className="mode-icon mode-icon-image">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
              </div>
              <h3>Image Analysis</h3>
              <p>Upload a single traffic image for instant object detection and violation checks</p>
              <span className="mode-tag">Instant</span>
            </button>
          </div>

          <div className="landing-features">
            <div className="feature-pill">🚗 Vehicle Counting</div>
            <div className="feature-pill">🏍️ Helmet Detection</div>
            <div className="feature-pill">🚦 Red Light Violations</div>
            <div className="feature-pill">⚡ Speeding Detection</div>
            <div className="feature-pill">🚶 Jaywalking</div>
            <div className="feature-pill">💥 Accident Detection</div>
          </div>
        </div>
      </div>
    );
  }

  // ── Image mode ──
  if (mode === 'image') {
    return (
      <div className="app">
        <header className="app-header">
          <div className="header-left">
            <div className="logo-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
            </div>
            <h1>TrafficAI</h1>
          </div>
          <div className="header-right">
            <button className="btn-reset" onClick={resetApp}>← Back</button>
          </div>
        </header>
        <ImageAnalysis />
      </div>
    );
  }

  // ── Video upload mode ──
  if (mode === 'video-upload') {
    return (
      <div className="app">
        <header className="app-header">
          <div className="header-left">
            <div className="logo-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
            </div>
            <h1>TrafficAI</h1>
          </div>
          <div className="header-right">
            <button className="btn-reset" onClick={resetApp}>← Back</button>
          </div>
        </header>
        <div className="upload-container">
          <VideoUpload onUploaded={startStreaming} />
        </div>
      </div>
    );
  }

  // ── Video streaming mode ──
  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <div className="logo-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
          </div>
          <h1>TrafficAI</h1>
        </div>
        <div className="header-center">
          {progress.total > 0 && (
            <div className="progress-bar-wrapper">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress.percent}%` }}></div>
              </div>
              <span className="progress-text">{progress.percent}%</span>
            </div>
          )}
        </div>
        <div className="header-right">
          {isStreaming && <div className="live-badge"><span className="live-dot"></span>LIVE</div>}
          {isDone && <div className="done-badge">✓ DONE</div>}
          <button className="btn-reset" onClick={resetApp}>↻ New</button>
        </div>
      </header>

      <main className="main-layout">
        <div className="video-section">
          <VideoPlayer frameUrl={frameUrl} isStreaming={isStreaming} isDone={isDone} />
          {(isDone || totalViolations > 0) && (
            <AIDashboard
              stats={stats}
              cumulative={cumulative}
              violationCounts={violationCounts}
              totalViolations={totalViolations}
            />
          )}
        </div>
        <aside className="sidebar">
          <Dashboard stats={stats} cumulative={cumulative} violationCounts={violationCounts} totalViolations={totalViolations} />
          <ViolationLog violations={violations} accidents={accidents} />
        </aside>
      </main>
    </div>
  );
}

export default App;
