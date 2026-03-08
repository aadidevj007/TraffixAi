export default function Dashboard({ stats, cumulative, violationCounts, totalViolations }) {
    const liveCards = [
        { label: 'Vehicles', value: stats.total_vehicles, icon: '🚗', color: '#00dc82' },
        { label: 'Persons', value: stats.total_persons, icon: '🚶', color: '#f59e0b' },
        { label: 'Bikes', value: stats.total_bikes, icon: '🏍️', color: '#818cf8' },
        { label: 'Signals', value: stats.traffic_lights, icon: '🚦', color: '#ef4444' },
    ];

    const cumulativeCards = [
        { label: 'Total Vehicles', value: cumulative.total_vehicles, color: '#00dc82' },
        { label: 'Total Persons', value: cumulative.total_persons, color: '#f59e0b' },
        { label: 'Total Bikes', value: cumulative.total_bikes, color: '#818cf8' },
        { label: 'Violations', value: totalViolations, color: '#ef4444' },
    ];

    const violationTypes = {
        lane_change: { label: 'Lane Change', color: '#ffa500' },
        wrong_way: { label: 'Wrong Way', color: '#ff00ff' },
        speeding: { label: 'Speeding', color: '#ff5050' },
        stopped_vehicle: { label: 'Stopped', color: '#8080ff' },
        no_helmet: { label: 'No Helmet', color: '#ff3333' },
        excess_riders: { label: 'Excess Riders', color: '#ff3333' },
        jaywalking: { label: 'Jaywalking', color: '#00c8ff' },
        tailgating: { label: 'Tailgating', color: '#ff6400' },
        red_light: { label: 'Red Light', color: '#ff3232' },
        uturn: { label: 'U-Turn', color: '#c800c8' },
        accident: { label: 'Accident', color: '#ff0000' },
    };

    return (
        <div className="dashboard">
            {/* Cumulative Counts — big hero numbers */}
            <div className="dashboard-section">
                <h3 className="section-title">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                    Cumulative Count
                </h3>
                <div className="cumulative-grid">
                    {cumulativeCards.map((c) => (
                        <div key={c.label} className="cumulative-card" style={{ '--card-color': c.color }}>
                            <div className="cumulative-value">{c.value}</div>
                            <div className="cumulative-label">{c.label}</div>
                        </div>
                    ))}
                </div>

                {/* Vehicle breakdown by class */}
                {Object.keys(cumulative.by_class || {}).length > 0 && (
                    <div className="class-breakdown">
                        {Object.entries(cumulative.by_class).map(([cls, count]) => (
                            <div key={cls} className="class-pill">
                                <span className="class-name">{cls}</span>
                                <span className="class-count">{count}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Live per-frame stats */}
            <div className="dashboard-section">
                <h3 className="section-title">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" /></svg>
                    In Frame Now
                </h3>
                <div className="stat-grid">
                    {liveCards.map((s) => (
                        <div key={s.label} className="stat-card" style={{ '--accent': s.color }}>
                            <span className="stat-icon">{s.icon}</span>
                            <div className="stat-info">
                                <span className="stat-value">{s.value}</span>
                                <span className="stat-label">{s.label}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Violation summary */}
            <div className="dashboard-section">
                <h3 className="section-title">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                    Violations
                    {totalViolations > 0 && <span className="violation-total">{totalViolations}</span>}
                </h3>
                <div className="violation-tags">
                    {Object.entries(violationCounts).length === 0 ? (
                        <p className="no-violations">No violations detected yet</p>
                    ) : (
                        Object.entries(violationCounts)
                            .sort(([, a], [, b]) => b - a)
                            .map(([type, count]) => {
                                const info = violationTypes[type] || { label: type, color: '#888' };
                                return (
                                    <div key={type} className="violation-tag" style={{ '--tag-color': info.color }}>
                                        <span className="tag-dot" style={{ background: info.color }}></span>
                                        <span className="tag-label">{info.label}</span>
                                        <span className="tag-count">{count}</span>
                                    </div>
                                );
                            })
                    )}
                </div>
            </div>
        </div>
    );
}
