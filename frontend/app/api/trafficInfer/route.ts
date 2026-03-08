import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, adminStorage } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';

function sanitizeFileName(name: string): string {
    return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const image = formData.get('image');
        const userId = String(formData.get('userId') || 'anonymous');

        if (!image || !(image instanceof File)) {
            return NextResponse.json({ error: 'image is required' }, { status: 400 });
        }

        const imageBuffer = Buffer.from(await image.arrayBuffer());
        if (imageBuffer.length === 0) {
            return NextResponse.json({ error: 'empty image' }, { status: 400 });
        }

        const inferUrl = process.env.TRAFFIC_INFER_SERVER_URL || 'http://127.0.0.1:8010/infer';
        const pyForm = new FormData();
        pyForm.append('file', new Blob([imageBuffer], { type: image.type || 'image/jpeg' }), image.name || 'upload.jpg');

        const inferRes = await fetch(inferUrl, { method: 'POST', body: pyForm });
        if (!inferRes.ok) {
            const msg = await inferRes.text();
            return NextResponse.json({ error: `inference failed: ${msg}` }, { status: 502 });
        }
        const inferJson = await inferRes.json() as { vehicles?: unknown[]; densityScore?: number };
        const detectedVehicles = Array.isArray(inferJson.vehicles) ? inferJson.vehicles : [];
        const densityScore = Number(inferJson.densityScore || 0);

        const bucket = adminStorage.bucket();
        const safeName = sanitizeFileName(image.name || `upload_${Date.now()}.jpg`);
        const objectPath = `uploads/${userId}/${Date.now()}_${safeName}`;
        const fileRef = bucket.file(objectPath);
        await fileRef.save(imageBuffer, {
            metadata: { contentType: image.type || 'image/jpeg' },
            resumable: false,
        });
        await fileRef.makePublic();
        const imageUrl = `https://storage.googleapis.com/${bucket.name}/${objectPath}`;

        const docRef = await adminDb.collection('uploads').add({
            userId,
            imageUrl,
            timestamp: FieldValue.serverTimestamp(),
            detectedVehicles,
            densityScore,
        });

        return NextResponse.json({
            ok: true,
            id: docRef.id,
            userId,
            imageUrl,
            detectedVehicles,
            densityScore,
        });
    } catch (error: any) {
        console.error('trafficInfer route error:', error);
        return NextResponse.json(
            { error: error?.message || 'internal error' },
            { status: 500 },
        );
    }
}

