import { useState, useRef } from 'react';
import AIDashboard from './AIDashboard';

export default function ImageAnalysis() {
    const [file, setFile] = useState(null);
    const [preview, setPreview] = useState(null);
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const inputRef = useRef(null);

    const handleFile = (f) => {
        if (!f || !f.type.startsWith('image/')) {
            setError('Please select an image file (JPEG, PNG, etc.)');
            return;
        }
        setFile(f);
        setPreview(URL.createObjectURL(f));
        setResult(null);
        setError(null);
    };

    const analyze = async () => {
        if (!file) return;
        setLoading(true);
        setError(null);
        try {
            const form = new FormData();
            form.append('file', file);
            const res = await fetch('/api/analyze-image', { method: 'POST', body: form });
            if (!res.ok) throw new Error(`Server error ${res.status}`);
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            setResult(data);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const reset = () => {
        setFile(null);
        setPreview(null);
        setResult(null);
        setError(null);
    };

    const totalViols = (result?.violations?.length || 0) + (result?.accidents?.length || 0);

    return (
        <div className="image-analysis">
            {!result ? (
                <div className="image-upload-area">
                    <h2>Upload Traffic Image</h2>
                    <p className="image-subtitle">Drag & drop or click to select an image for instant analysis</p>

                    <div
                        className={`image-dropzone ${file ? 'has-file' : ''}`}
                        onClick={() => !file && inputRef.current?.click()}
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
                    >
                        <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => handleFile(e.target.files[0])} />
                        {preview ? (
                            <img src={preview} alt="Preview" className="image-preview" />
                        ) : (
                            <div className="image-placeholder">
                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                                <span>JPG, PNG, WEBP supported</span>
                            </div>
                        )}
                    </div>

                    {error && <div className="image-error">{error}</div>}

                    <div className="image-actions">
                        {file && (
                            <>
                                <button className="btn-analyze" onClick={analyze} disabled={loading}>
                                    {loading ? (
                                        <><span className="spinner-sm"></span> Analyzing...</>
                                    ) : (
                                        '🔍 Analyze Image'
                                    )}
                                </button>
                                <button className="btn-clear" onClick={reset}>Clear</button>
                            </>
                        )}
                    </div>
                </div>
            ) : (
                <div className="image-results">
                    <div className="image-results-grid">
                        {/* Annotated image */}
                        <div className="result-image-container">
                            <img src={`data:image/jpeg;base64,${result.image}`} alt="Annotated" className="result-image" />
                        </div>

                        {/* Stats sidebar */}
                        <div className="result-sidebar">
                            <h3 className="result-section-title">Detection Results</h3>

                            <div className="result-stats">
                                <div className="result-stat" style={{ '--rc': '#00dc82' }}>
                                    <span className="result-stat-value">{result.stats.total_vehicles}</span>
                                    <span className="result-stat-label">Vehicles</span>
                                </div>
                                <div className="result-stat" style={{ '--rc': '#f59e0b' }}>
                                    <span className="result-stat-value">{result.stats.total_persons}</span>
                                    <span className="result-stat-label">Persons</span>
                                </div>
                                <div className="result-stat" style={{ '--rc': '#818cf8' }}>
                                    <span className="result-stat-value">{result.stats.total_bikes}</span>
                                    <span className="result-stat-label">Bikes</span>
                                </div>
                                <div className="result-stat" style={{ '--rc': '#ef4444' }}>
                                    <span className="result-stat-value">{totalViols}</span>
                                    <span className="result-stat-label">Violations</span>
                                </div>
                            </div>

                            {result.violations?.length > 0 && (
                                <div className="result-violations">
                                    <h4>Violations Found</h4>
                                    {result.violations.map((v, i) => (
                                        <div key={i} className="result-viol-item">
                                            <span className="result-viol-type">{v.type.replace(/_/g, ' ')}</span>
                                            {v.vehicle && <span className="result-viol-detail">{v.vehicle}</span>}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {result.accidents?.length > 0 && (
                                <div className="result-violations result-accidents">
                                    <h4>⚠️ Accidents Detected</h4>
                                    {result.accidents.map((a, i) => (
                                        <div key={i} className="result-viol-item accident">
                                            <span className="result-viol-type">Collision</span>
                                            <span className="result-viol-detail">{a.vehicles?.join(' & ')}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <button className="btn-analyze" onClick={reset} style={{ marginTop: '16px' }}>
                                ↻ Analyze Another
                            </button>
                        </div>
                    </div>
                    {result.stats && (
                        <AIDashboard
                            stats={result.stats}
                            cumulative={{
                                total_vehicles: result.stats.total_vehicles || 0,
                                total_persons: result.stats.total_persons || 0,
                                total_bikes: result.stats.total_bikes || 0,
                                by_class: {},
                            }}
                            violationCounts={
                                (result.violations || []).reduce((acc, v) => {
                                    acc[v.type] = (acc[v.type] || 0) + 1;
                                    return acc;
                                }, {})
                            }
                            totalViolations={totalViols}
                        />
                    )}
                </div>
            )}
        </div>
    );
}
