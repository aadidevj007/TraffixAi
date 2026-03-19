import { useCallback, useState } from 'react';

export default function ExecutiveSummary({ stats, cumulative, violationCounts, totalViolations, accidents }) {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);

    const generateSummary = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const resp = await fetch('/api/executive-summary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    stats,
                    cumulative,
                    violationCounts,
                    totalViolations,
                    accidents,
                }),
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'Failed to generate executive summary');
            setResult(data);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [stats, cumulative, violationCounts, totalViolations, accidents]);

    if (!result && !loading) {
        return (
            <section className="exec-summary-card">
                <div className="exec-summary-head">
                    <div>
                        <h3>Executive Summary Agent</h3>
                        <p>Get a concise summary of what happened in the video and which violations occurred.</p>
                    </div>
                    <span className="exec-summary-tag">Llama Agent</span>
                </div>
                <button className="exec-summary-button" onClick={generateSummary}>
                    Generate Executive Summary
                </button>
                {error && <div className="exec-summary-error">{error}</div>}
            </section>
        );
    }

    if (loading) {
        return (
            <section className="exec-summary-card">
                <div className="exec-summary-loading">Preparing executive summary...</div>
            </section>
        );
    }

    return (
        <section className="exec-summary-card">
            <div className="exec-summary-head">
                <div>
                    <h3>Executive Summary Agent</h3>
                    <p>{result.severity?.toUpperCase() || 'SUMMARY'} severity overview</p>
                </div>
                <button className="exec-summary-button exec-summary-button-secondary" onClick={generateSummary}>
                    Refresh
                </button>
            </div>

            <div className="exec-summary-headline">{result.headline}</div>
            <p className="exec-summary-text">{result.summary}</p>

            {result.highlights?.length > 0 && (
                <div className="exec-summary-highlights">
                    <h4>Highlights</h4>
                    {result.highlights.map((item, index) => (
                        <div key={index} className="exec-summary-highlight">{item}</div>
                    ))}
                </div>
            )}
        </section>
    );
}
