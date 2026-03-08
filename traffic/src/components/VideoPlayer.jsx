import { useRef, useState, useEffect } from 'react';

export default function VideoPlayer({ frameUrl, isStreaming, isDone }) {
    const [fps, setFps] = useState(0);
    const lastTime = useRef(Date.now());
    const frameCount = useRef(0);

    useEffect(() => {
        if (!frameUrl) return;
        frameCount.current++;
        const now = Date.now();
        const elapsed = now - lastTime.current;
        if (elapsed >= 1000) {
            setFps(Math.round((frameCount.current * 1000) / elapsed));
            frameCount.current = 0;
            lastTime.current = now;
        }
    }, [frameUrl]);

    return (
        <div className="video-player">
            <div className="video-player-inner">
                {frameUrl ? (
                    <img src={frameUrl} alt="Traffic feed" className="video-frame" />
                ) : (
                    <div className="video-placeholder">
                        <div className="placeholder-spinner"></div>
                        <span>Waiting for video stream...</span>
                    </div>
                )}

                <div className="video-overlays">
                    {frameUrl && <div className="overlay-fps">{fps} FPS</div>}
                    {isDone && (
                        <div className="overlay-done">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                            Complete
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
