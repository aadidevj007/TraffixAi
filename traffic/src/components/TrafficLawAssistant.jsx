import { useEffect, useMemo, useState } from 'react';

function simplifyViolations(violations = []) {
    return violations.slice(0, 12).map((v) => v.type || v.vehicle || 'violation');
}

export default function TrafficLawAssistant({ stats = null, violations = [], accidents = [], autoAnalyze = true }) {
    const [question, setQuestion] = useState('');
    const [answer, setAnswer] = useState('');
    const [analysisSummary, setAnalysisSummary] = useState('');
    const [detectedTypes, setDetectedTypes] = useState([]);
    const [structuredLaws, setStructuredLaws] = useState([]);
    const [sources, setSources] = useState([]);
    const [loading, setLoading] = useState(false);
    const [analysisLoading, setAnalysisLoading] = useState(false);
    const [error, setError] = useState('');

    const simplifiedViolations = useMemo(() => simplifyViolations(violations), [violations]);
    const hasAnalysis = simplifiedViolations.length > 0 || accidents.length > 0;
    const analysisSignature = useMemo(
        () => JSON.stringify({
            stats,
            violations: simplifiedViolations,
            accidents: accidents.slice(0, 5).map((a) => a.vehicles?.join(' & ') || 'accident'),
        }),
        [stats, simplifiedViolations, accidents]
    );

    useEffect(() => {
        let cancelled = false;
        let timerId = null;

        async function fetchAnalysisLaws() {
            if (!autoAnalyze || !hasAnalysis) {
                setAnalysisSummary('');
                setDetectedTypes([]);
                setStructuredLaws([]);
                return;
            }

            setAnalysisLoading(true);
            try {
                const res = await fetch('/api/traffic-law-from-analysis', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        stats,
                        violations,
                        accidents,
                    }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
                if (!cancelled) {
                    setAnalysisSummary(data.summary || '');
                    setDetectedTypes(data.detected_types || []);
                    setStructuredLaws(data.structured_laws || []);
                    setSources((prev) => (prev.length > 0 ? prev : (data.sources || [])));
                }
            } catch {
                if (!cancelled) {
                    setAnalysisSummary('');
                    setStructuredLaws([]);
                }
            } finally {
                if (!cancelled) {
                    setAnalysisLoading(false);
                }
            }
        }

        timerId = window.setTimeout(fetchAnalysisLaws, 1200);
        return () => {
            cancelled = true;
            if (timerId) window.clearTimeout(timerId);
        };
    }, [autoAnalyze, hasAnalysis, analysisSignature, stats, violations, accidents]);

    async function askLawQuestion() {
        const trimmed = question.trim();
        if (!trimmed) return;

        setLoading(true);
        setError('');

        try {
            const res = await fetch('/api/traffic-law-query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question: trimmed,
                    incident_context: {
                        stats,
                        violations: simplifyViolations(violations),
                        accidents: accidents.slice(0, 5).map((a) => a.vehicles?.join(' & ') || 'accident'),
                    },
                }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);

            setAnswer(data.answer || '');
            setSources(data.sources || []);
        } catch (err) {
            setError(err.message || 'Unable to get legal guidance right now.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <section className="law-assistant-card">
            <div className="law-assistant-head">
                <div>
                    <h3>Traffic Law Assistant</h3>
                    <p>Ask about challans, sections, penalties, or the detected incident.</p>
                </div>
                <span className="law-assistant-tag">Llama RAG</span>
            </div>

            <div className="law-assistant-inputs">
                <textarea
                    className="law-assistant-textarea"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Example: What is the penalty for wrong-way driving and red-light jumping?"
                    rows={4}
                />
                <button className="law-assistant-button" onClick={askLawQuestion} disabled={loading}>
                    {loading ? 'Checking laws...' : 'Ask'}
                </button>
            </div>

            {error && <div className="law-assistant-error">{error}</div>}

            {(analysisLoading || analysisSummary) && (
                <div className="law-assistant-answer">
                    <h4>Applicable Laws From Analysis</h4>
                    {detectedTypes.length > 0 && (
                        <p className="law-detected-types">
                            Detected: {detectedTypes.map((item) => String(item).replace(/_/g, ' ')).join(', ')}
                        </p>
                    )}
                    <p>{analysisLoading ? 'Matching detected violations to traffic laws...' : analysisSummary}</p>
                </div>
            )}

            {structuredLaws.length > 0 && (
                <div className="law-assistant-sources">
                    <h4>Violation Law Map</h4>
                    {structuredLaws.map((item) => (
                        <div key={item.violation_type} className="law-structured-group">
                            <div className="law-structured-title">
                                {String(item.violation_type).replace(/_/g, ' ')}
                            </div>
                            {item.laws.map((law) => (
                                <div key={law.id} className="law-structured-card">
                                    <div className="law-structured-head">
                                        <strong>{law.section || law.id}</strong>
                                        <span>{law.title}</span>
                                    </div>
                                    <div className="law-structured-penalty">{law.penalty}</div>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            )}

            {answer && (
                <div className="law-assistant-answer">
                    <h4>Answer</h4>
                    <p>{answer}</p>
                </div>
            )}

            {sources.length > 0 && (
                <div className="law-assistant-sources">
                    <h4>Sources</h4>
                    {sources.map((source) => (
                        <div key={source.id} className="law-source-item">
                            <strong>{source.section || source.id}</strong>
                            <span>{source.title}</span>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
