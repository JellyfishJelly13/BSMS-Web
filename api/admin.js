/* api/admin.js */
import admin from 'firebase-admin';

if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            }),
            databaseURL: process.env.FIREBASE_DATABASE_URL
        });
    } catch (err) {
        console.error("Firebase Init Error:", err.message);
    }
}
const db = admin.apps.length ? admin.database() : null;

async function verifyAdmin(sessionId) {
    if (!sessionId || !db) return null;
    const snap = await db.ref('/accounts').once('value');
    const accounts = snap.val() || {};
    for (const [uid, acc] of Object.entries(accounts)) {
        if (acc.sessions && acc.sessions[sessionId]) {
            if (acc.role === 'admin') return { uid, account: acc };
            return null; // Valid session, but not admin
        }
    }
    return null;
}

export default async function handler(req, res) {
    if (!db) return res.status(500).json({ error: "Database not initialized." });
    
    const sessionId = req.headers['x-session-id'];
    const adminUser = await verifyAdmin(sessionId);
    if (!adminUser) return res.status(403).json({ error: 'Unauthorized: Admin access required.' });

    const action = req.query.action || req.body.action;

    try {
        switch (action) {
            case 'getUsers': {
                const snap = await db.ref('/accounts').once('value');
                return res.status(200).json(snap.val() || {});
            }
            case 'updateUser': {
                const { targetUid, updates } = req.body;
                await db.ref(`/accounts/${targetUid}`).update(updates);
                return res.status(200).json({ success: true });
            }
            case 'banDevice': {
                const { deviceId, reason, expires } = req.body;
                await db.ref(`/banned_devices/${deviceId}`).set({
                    reason: reason || "Banned by admin",
                    ban_expires: expires || null,
                    timestamp: Date.now()
                });
                return res.status(200).json({ success: true });
            }
            case 'getDB': {
                const snap = await db.ref('/').once('value');
                return res.status(200).json(snap.val() || {});
            }
            case 'updateDBNode': {
                const { path, value } = req.body;
                if (!path || path === '/') return res.status(400).json({ error: "Cannot overwrite root." });
                await db.ref(path).set(value);
                return res.status(200).json({ success: true });
            }
            default:
                return res.status(400).json({ error: 'Unknown action' });
        }
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
