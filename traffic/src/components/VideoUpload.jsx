import { useState, useRef } from 'react';

export default function VideoUpload({ onUploaded }) {
    const [isDragging, setIsDragging] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState(null);
    const [fileName, setFileName] = useState(null);
    const fileRef = useRef(null);

    const handleFile = async (file) => {
        if (!file) return;
        const validTypes = ['video/mp4', 'video/avi', 'video/webm', 'video/quicktime', 'video/x-msvideo'];
        if (!validTypes.includes(file.type) && !file.name.match(/\.(mp4|avi|webm|mov|mkv)$/i)) {
            setError('Please upload a valid video file (.mp4, .avi, .webm, .mov)');
            return;
        }

        setError(null);
        setUploading(true);
        setFileName(file.name);

        try {
            const formData = new FormData();
            formData.append('file', file);
            const res = await fetch('/api/upload', { method: 'POST', body: formData });
            if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`);
            const data = await res.json();
            onUploaded(data.video_id);
        } catch (err) {
            setError(err.message);
            setUploading(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        handleFile(file);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => setIsDragging(false);

    return (
        <div className="upload-wrapper">
            <div className="upload-hero">
                <h2>Traffic Anomaly Detection</h2>
                <p className="upload-subtitle">
                    Upload a traffic video to detect violations in real-time using AI-powered analysis
                </p>
            </div>

            <div
                className={`dropzone ${isDragging ? 'dropzone-active' : ''} ${uploading ? 'dropzone-uploading' : ''}`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => !uploading && fileRef.current?.click()}
            >
                <input
                    ref={fileRef}
                    type="file"
                    accept="video/*"
                    style={{ display: 'none' }}
                    onChange={(e) => handleFile(e.target.files[0])}
                />

                {uploading ? (
                    <div className="upload-progress">
                        <div className="spinner"></div>
                        <p className="upload-filename">{fileName}</p>
                        <p className="upload-status">Uploading & initializing model...</p>
                    </div>
                ) : (
                    <>
                        <div className="dropzone-icon">
                            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="17 8 12 3 7 8" />
                                <line x1="12" y1="3" x2="12" y2="15" />
                            </svg>
                        </div>
                        <p className="dropzone-text">
                            Drag & drop your traffic video here
                        </p>
                        <p className="dropzone-hint">or click to browse files</p>
                        <div className="dropzone-formats">
                            <span>MP4</span><span>AVI</span><span>WebM</span><span>MOV</span>
                        </div>
                    </>
                )}
            </div>

            {error && <div className="upload-error">{error}</div>}

            <div className="features-grid">
                <div className="feature-card">
                    <div className="feature-icon feature-icon-1">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="5" width="22" height="14" rx="2" /><path d="M7 15V9l4 3-4 3z" /></svg>
                    </div>
                    <h3>Real-time Analysis</h3>
                    <p>Frame-by-frame YOLOv8 detection with annotated video stream</p>
                </div>
                <div className="feature-card">
                    <div className="feature-icon feature-icon-2">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                    </div>
                    <h3>12 Violation Types</h3>
                    <p>Helmets, speeding, jaywalking, accidents, wrong-way & more</p>
                </div>
                <div className="feature-card">
                    <div className="feature-icon feature-icon-3">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12V7H5a2 2 0 010-4h14v4" /><path d="M3 5v14a2 2 0 002 2h16v-5" /><path d="M18 12a2 2 0 000 4h4v-4h-4z" /></svg>
                    </div>
                    <h3>Live Dashboard</h3>
                    <p>Real-time statistics and violation event log with severity tags</p>
                </div>
            </div>
        </div>
    );
}
