export type MediaType = 'image' | 'video';

export type AnalysisSessionPayload = {
    token: string;
    createdAt: number;
    mediaType: MediaType;
    fileName: string;
    result: Record<string, unknown>;
};

const STORAGE_KEY = 'traffixai_hidden_upload_session';
const SESSION_TTL_MS = 15 * 60 * 1000;
const WINDOW_KEY = '__traffixai_upload_session__';

type UploadWindow = Window & {
    [WINDOW_KEY]?: AnalysisSessionPayload;
};

export function createSessionToken(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function saveUploadSession(payload: AnalysisSessionPayload): boolean {
    if (typeof window === 'undefined') return false;

    const w = window as UploadWindow;
    w[WINDOW_KEY] = payload;

    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        return true;
    } catch {
        return false;
    }
}

export function readUploadSession(expectedToken?: string): AnalysisSessionPayload | null {
    if (typeof window === 'undefined') return null;

    let parsed: AnalysisSessionPayload | null = null;
    const w = window as UploadWindow;

    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (raw) parsed = JSON.parse(raw) as AnalysisSessionPayload;
    } catch {
        parsed = null;
    }

    if (!parsed && w[WINDOW_KEY]) {
        parsed = w[WINDOW_KEY] as AnalysisSessionPayload;
    }
    if (!parsed) return null;

    try {
        const expired = Date.now() - Number(parsed.createdAt || 0) > SESSION_TTL_MS;
        const tokenMismatch = !!expectedToken && parsed.token !== expectedToken;
        if (expired || tokenMismatch) {
            clearUploadSession();
            return null;
        }
        return parsed;
    } catch {
        clearUploadSession();
        return null;
    }
}

export function clearUploadSession(): void {
    if (typeof window === 'undefined') return;
    const w = window as UploadWindow;
    delete w[WINDOW_KEY];
    try {
        sessionStorage.removeItem(STORAGE_KEY);
    } catch {
        // Ignore storage access failures.
    }
}
