import axios from 'axios';
import { auth } from '@/lib/firebase';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const api = axios.create({
    baseURL: API_BASE,
    timeout: 600000, // 10 minutes — needed for large video analysis
});

api.interceptors.request.use(async (config) => {
    const token = await auth.currentUser?.getIdToken();
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export const uploadImage = async (formData: FormData) => {
    const res = await api.post('/upload-image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
};

export const uploadVideo = async (formData: FormData, onProgress?: (p: number) => void) => {
    const res = await api.post('/upload-video', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 900000, // 15 minutes for very large videos
        onUploadProgress: (e) => {
            if (onProgress && e.total) {
                onProgress(Math.round((e.loaded * 100) / e.total));
            }
        },
    });
    return res.data;
};

export const getReports = async (params?: { limit?: number; status?: string }) => {
    const res = await api.get('/reports', { params });
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
    const res = await api.get('/admin/requests', { params });
    return res.data;
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
    const res = await api.post('/route-safety-recommendation', data);
    return res.data;
};

export const syncUserToBackend = async (data: { name: string; email?: string; role?: 'User' | 'Admin' | 'Authority' }) => {
    const res = await api.post('/auth/sync-user', data);
    return res.data;
};

export default api;
