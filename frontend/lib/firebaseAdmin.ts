import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

function initAdminApp() {
    if (getApps().length > 0) return getApps()[0];

    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_JSON;
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

    if (serviceAccountJson) {
        return initializeApp({
            credential: cert(JSON.parse(serviceAccountJson)),
            projectId,
            storageBucket,
        });
    }

    return initializeApp({
        credential: applicationDefault(),
        projectId,
        storageBucket,
    });
}

const adminApp = initAdminApp();
export const adminDb = getFirestore(adminApp);
export const adminStorage = getStorage(adminApp);

