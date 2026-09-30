/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */

import admin from 'firebase-admin';

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
        databaseURL: process.env.FIREBASE_DATABASE_URL
    });
}
const db = admin.database();

async function getUserBySession(sessionId) {
    if (!sessionId) return null;
    const snap = await db.ref('/accounts').once('value');
    const accounts = snap.val() || {};
    
    for (const [uid, acc] of Object.entries(accounts)) {
        if (acc.sessions && acc.sessions[sessionId]) {
            return { uid, account: acc };
        }
    }
    return null;
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const sessionId = req.headers['x-session-id'];
    
    try {
        console.log(`[BSMS Web :: API] Export data requested by session: ${sessionId}`);
        
        const userLookup = await getUserBySession(sessionId);
        if (!userLookup) {
            return res.status(401).json({ error: 'Unauthorized session.' });
        }

        const { uid, account } = userLookup;

        if (account.account_status === 'banned') {
            return res.status(403).json({ error: 'Account banned.', account_status: 'banned' });
        }

        // Export strictly the data under /accounts/[uid]/
        const accountExport = { ...account };
        
        // Scrub sensitive identity data before handing it over
        delete accountExport.password; 
        delete accountExport.sessions;

        console.log(`[BSMS Web :: API] Successfully exported data for ${uid}.`);
        
        return res.status(200).json({
            uid: uid,
            account_data: accountExport
        });

    } catch (err) {
        console.error(`[BSMS Web :: API] Data export failed:`, err);
        return res.status(500).json({ error: 'Internal server error.' });
    }
}
