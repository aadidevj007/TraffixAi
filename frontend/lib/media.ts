'use client';

const ENV_API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || '';

function getMediaBaseUrl() {
    if (ENV_API_BASE) return ENV_API_BASE;
    if (typeof window !== 'undefined') return window.location.origin;
    return '';
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

    if (normalized.startsWith('/uploads/') || normalized.startsWith('/processed/')) {
        return base ? `${base}${normalized}` : normalized;
    }

    const fileName = normalized.split('/').pop();
    if (!fileName) return null;

    const route = normalized.includes('/processed/') || normalized.includes('processed_')
        ? '/processed/'
        : '/uploads/';

    return base ? `${base}${route}${encodeURIComponent(fileName)}` : `${route}${encodeURIComponent(fileName)}`;
}

export function toDisplayImageSrc(image?: string | null): string | null {
    if (!image) return null;
    if (image.startsWith('data:') || image.startsWith('http://') || image.startsWith('https://')) {
        return image;
    }
    return `data:image/jpeg;base64,${image}`;
}
