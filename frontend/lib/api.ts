import axios, { InternalAxiosRequestConfig } from 'axios';
import { auth } from '@/lib/firebase';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8001';
const API_FALLBACKS = [
    API_BASE,
    'http://127.0.0.1:8002',
    'http://localhost:8002',
    'http://127.0.0.1:8001',
    'http://localhost:8001',
    'http://127.0.0.1:8000',
    'http://localhost:8000',
].filter((value, index, arr) => arr.indexOf(value) === index);

const api = axios.create({
    baseURL: API_BASE,
    timeout: 1800000, // 30 minutes — video analysis can legitimately take longer
});

api.interceptors.request.use(async (config) => {
    const token = await auth?.currentUser?.getIdToken();
    const localAdmin =
        typeof window !== 'undefined' && sessionStorage.getItem('localAdmin') === 'true';
    const headers = (config.headers ?? {}) as Record<string, string>;

    if (localAdmin) {
        headers['X-Local-Admin'] = 'true';
    }

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }
    config.headers = headers as typeof config.headers;
    return config;
});

api.interceptors.response.use(
    (response) => response,
    async (error: unknown) => {
        if (!axios.isAxiosError(error)) {
            return Promise.reject(error);
        }

        const cfg = error.config as (InternalAxiosRequestConfig & { _retriedWithFallback?: boolean }) | undefined;
        if (!cfg || cfg._retriedWithFallback || error.code !== 'ERR_NETWORK') {
            return Promise.reject(error);
        }

        cfg._retriedWithFallback = true;
        const currentBase = (cfg.baseURL || api.defaults.baseURL || '') as string;

        for (const candidate of API_FALLBACKS) {
            if (candidate === currentBase) continue;
            try {
                return await api.request({
                    ...cfg,
                    baseURL: candidate,
                });
            } catch (retryError: unknown) {
                if (!axios.isAxiosError(retryError) || retryError.code !== 'ERR_NETWORK') {
                    return Promise.reject(retryError);
                }
            }
        }

        return Promise.reject(error);
    }
);

export const uploadImage = async (formData: FormData) => {
    const res = await api.post('/upload-image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
};

export const uploadVideo = async (formData: FormData, onProgress?: (p: number) => void) => {
    const res = await api.post('/upload-video', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 1800000, // 30 minutes for large uploads + backend analysis
        onUploadProgress: (e) => {
            if (onProgress && e.total) {
                onProgress(Math.round((e.loaded * 100) / e.total));
            }
        },
    });
    return res.data;
};

export const getReports = async (params?: { limit?: number; status?: string }) => {
    try {
        const res = await api.get('/reports', { params });
        return res.data;
    } catch (error: unknown) {
        if (axios.isAxiosError(error) && (
            error.code === 'ERR_NETWORK' ||
            error.code === 'ECONNABORTED' ||
            error.response?.status === 503 ||
            `${error.message || ''}`.toLowerCase().includes('timeout')
        )) {
            return { reports: [], total: 0 };
        }
        throw error;
    }
};

export const getAnalysisResult = async (reportId: string) => {
    const res = await api.get(`/analysis-result/${reportId}`);
    return res.data;
};

export const deleteReport = async (reportId: string) => {
    const res = await api.delete(`/reports/${reportId}`);
    return res.data;
};

export const updateReportStatus = async (reportId: string, status: string) => {
    const res = await api.patch(`/reports/${reportId}`, { status });
    return res.data;
};

export const forwardReport = async (sourceReportId: string) => {
    const res = await api.post('/reports/forward', { sourceReportId, sentToAdmin: true });
    return res.data;
};

export const getAdminRequests = async (params?: { limit?: number; status?: string }) => {
    try {
        const res = await api.get('/admin/requests', { params });
        return res.data;
    } catch (error: unknown) {
        if (axios.isAxiosError(error) && (
            error.code === 'ERR_NETWORK' ||
            error.code === 'ECONNABORTED' ||
            error.response?.status === 503 ||
            `${error.message || ''}`.toLowerCase().includes('timeout')
        )) {
            return { requests: [], total: 0 };
        }
        throw error;
    }
};

export const updateAdminRequestStatus = async (requestId: string, status: string, reviewedBy?: string) => {
    const res = await api.patch(`/admin/requests/${requestId}`, { status, reviewedBy });
    return res.data;
};

export const getUsers = async () => {
    const res = await api.get('/users');
    return res.data;
};

export const predictRisk = async (data: {
    violations: number;
    accidents: number;
    vehicle_density: number;
}) => {
    const res = await api.post('/predict-risk', data);
    return res.data;
};

export const sendAlert = async (data: {
    incident_type: string;
    location: string;
    severity: string;
    contacts: string[];
    message: string;
}) => {
    const res = await api.post('/send-alert', data);
    return res.data;
};

export const sendAdminEmergency = async (data: {
    location: string;
    severity: string;
    reportId?: string;
}) => {
    const res = await api.post('/admin/send-emergency', data);
    return res.data;
};

export const getDashboardStats = async () => {
    const res = await api.get('/dashboard/stats');
    return res.data;
};

export const getUserDensityAnalytics = async () => {
    const res = await api.get('/analytics/user/density');
    return res.data;
};

export const getAdminOverviewAnalytics = async () => {
    const res = await api.get('/analytics/admin/overview');
    return res.data;
};

export const getRouteSafetyRecommendation = async (data: {
    origin: string;
    destination: string;
    mode: 'driving' | 'walking' | 'bicycling' | 'transit' | 'two_wheeler';
}) => {
    const mapsMode = data.mode === 'two_wheeler' ? 'driving' : data.mode;
    const mapsLink = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(data.origin)}&destination=${encodeURIComponent(data.destination)}&travelmode=${encodeURIComponent(mapsMode)}`;
    const modeLabelMap: Record<typeof data.mode, string> = {
        driving: 'Car / Taxi',
        two_wheeler: 'Two-Wheeler',
        walking: 'Walking',
        bicycling: 'Cycle',
        transit: 'Public Transit',
    };

    try {
        const res = await api.post('/route-safety-recommendation', data, { timeout: 20000 });
        return res.data;
    } catch (error: unknown) {
        if (axios.isAxiosError(error) && (
            error.code === 'ECONNABORTED' ||
            error.code === 'ERR_NETWORK' ||
            `${error.message || ''}`.toLowerCase().includes('timeout')
        )) {
            return {
                origin: data.origin,
                destination: data.destination,
                mode: data.mode,
                mode_label: modeLabelMap[data.mode],
                maps_link: mapsLink,
                route_summary: 'Live route risk analysis is temporarily unavailable. Please follow standard traffic safety precautions.',
                speed_advice: 'Follow posted speed limits and local traffic rules.',
                precautions: [
                    'Maintain safe distance and avoid sudden lane changes.',
                    'Follow traffic signals and pedestrian crossings.',
                    'Avoid phone usage while moving.',
                    'Choose well-lit and well-monitored roads when possible.',
                ],
                accident_check: {
                    has_accidents: false,
                    matched_count: 0,
                    matched_locations: [],
                },
                degraded: true,
            };
        }
        throw error;
    }
};

export const syncUserToBackend = async (data: { name: string; email?: string; role?: 'User' | 'Admin' | 'Authority' }) => {
    const res = await api.post('/auth/sync-user', data);
    return res.data;
};

export default api;
