'use client';

const ENV_API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || '';
const LOCAL_API_BASE = 'http://127.0.0.1:8001';

function getMediaBaseUrl() {
    if (ENV_API_BASE) return ENV_API_BASE;
    return LOCAL_API_BASE;
}

export function toAbsoluteMediaUrl(path?: string | null): string | null {
    if (!path) return null;
    if (
        path.startsWith('http://') ||
        path.startsWith('https://') ||
        path.startsWith('data:') ||
        path.startsWith('blob:')
    ) {
        return path;
    }

    const normalized = path.replace(/\\/g, '/');
    const base = getMediaBaseUrl();

    if (
        normalized.startsWith('/uploads/')
        || normalized.startsWith('/processed/')
        || normalized.startsWith('/processed-playable/')
    ) {
        return base ? `${base}${normalized}` : normalized;
    }

    const fileName = normalized.split('/').pop();
    if (!fileName) return null;

    const route = normalized.includes('/processed-playable/')
        ? '/processed-playable/'
        : normalized.includes('/processed/') || normalized.includes('processed_')
        ? '/processed/'
        : '/uploads/';

    return base ? `${base}${route}${encodeURIComponent(fileName)}` : `${route}${encodeURIComponent(fileName)}`;
}

export function toProcessedPlayableUrl(path?: string | null): string | null {
    if (!path) return null;
    if (path.startsWith('data:') || path.startsWith('blob:')) return path;

    const normalized = path.replace(/\\/g, '/');
    const base = getMediaBaseUrl();
    if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
        try {
            const url = new URL(normalized);
            const fileName = url.pathname.split('/').pop();
            return fileName ? `${url.origin}/processed-playable/${encodeURIComponent(fileName)}` : normalized;
        } catch {
            return normalized;
        }
    }

    const fileName = normalized.split('/').pop();
    if (!fileName) return null;
    const playablePath = `/processed-playable/${encodeURIComponent(fileName)}`;
    return base ? `${base}${playablePath}` : playablePath;
}

export function toDisplayImageSrc(image?: string | null): string | null {
    if (!image) return null;
    if (image.startsWith('data:') || image.startsWith('http://') || image.startsWith('https://')) {
        return image;
    }
    return `data:image/jpeg;base64,${image}`;
}
