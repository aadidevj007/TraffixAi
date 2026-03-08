const typeInfo = {
    lane_change: { label: 'Lane Change', color: '#ffa500', severity: 'medium' },
    wrong_way: { label: 'Wrong Way', color: '#ff00ff', severity: 'high' },
    speeding: { label: 'Speeding', color: '#ff5050', severity: 'high' },
    stopped_vehicle: { label: 'Stopped', color: '#8080ff', severity: 'low' },
    no_helmet: { label: 'No Helmet', color: '#ff3333', severity: 'high' },
    excess_riders: { label: 'Excess Riders', color: '#ff3333', severity: 'high' },
    jaywalking: { label: 'Jaywalking', color: '#00c8ff', severity: 'medium' },
    tailgating: { label: 'Tailgating', color: '#ff6400', severity: 'medium' },
    red_light: { label: 'Red Light', color: '#ff3232', severity: 'high' },
    uturn: { label: 'U-Turn', color: '#c800c8', severity: 'medium' },
    accident: { label: 'Accident', color: '#ff0000', severity: 'critical' },
};

function getDetail(v) {
    if (v.type === 'speeding') return `${v.speed || '?'} px/f`;
    if (v.type === 'tailgating') return `gap: ${v.gap_px || '?'}px`;
    if (v.type === 'stopped_vehicle') return `${v.duration || '?'}s`;
    if (v.type === 'excess_riders') return `${v.count || '?'} riders`;
    if (v.type === 'no_helmet') return `conf: ${Math.round((v.helmet_confidence || 0) * 100)}%`;
    if (v.type === 'accident') return `${v.vehicles?.join(' & ') || 'collision'}`;
    if (v.vehicle) return v.vehicle;
    return '';
}

export default function ViolationLog({ violations, accidents }) {
    const allEvents = [...violations, ...accidents];

    return (
        <div className="violation-log">
            <h3 className="section-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                Event Log
                {allEvents.length > 0 && <span className="event-count">{allEvents.length}</span>}
            </h3>

            <div className="log-container">
                {allEvents.length === 0 ? (
                    <div className="log-empty">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" /></svg>
                        <span>Events will appear here as violations are detected</span>
                    </div>
                ) : (
                    allEvents.map((v) => {
                        const info = typeInfo[v.type] || { label: v.type, color: '#888', severity: 'low' };
                        const detail = getDetail(v);
                        return (
                            <div key={v.id} className="log-entry" style={{ '--entry-color': info.color }}>
                                <div className="log-entry-header">
                                    <span className="log-badge" style={{ background: info.color }}>{info.label}</span>
                                    <span className="log-time">{v.timestamp}</span>
                                </div>
                                {detail && <span className="log-detail">{detail}</span>}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
