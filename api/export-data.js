/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */

import admin from 'firebase-admin';

// Initialize Firebase Admin globally for Serverless caching
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

        // 1. Gather Profile
        const profile = { ...account };
        delete profile.password; // Scrub sensitive data before export
        delete profile.sessions;

        // 2. Gather Game Saves
        const gameSavesSnap = await db.ref(`/accounts/${uid}/game_saves`).once('value');
        const game_saves = gameSavesSnap.val() || {};

        // 3. Gather Messages (Iterate all channels to find user's messages)
        const messages = [];
        const chatSnap = await db.ref(`/chat/conversations`).once('value');
        const conversations = chatSnap.val() || {};
        
        for (const [type, channels] of Object.entries(conversations)) {
            for (const [cid, channelData] of Object.entries(channels)) {
                if (channelData.messages) {
                    for (const [mid, msg] of Object.entries(channelData.messages)) {
                        if (msg.senderUid === uid) {
                            messages.push({
                                channelId: cid,
                                channelType: type,
                                messageId: mid,
                                timestamp: msg.timestamp,
                                content: msg.content,
                                status: msg.status
                            });
                        }
                    }
                }
            }
        }

        console.log(`[BSMS Web :: API] Successfully exported data for ${uid}.`);
        
        return res.status(200).json({
            profile,
            game_saves,
            messages
        });

    } catch (err) {
        console.error(`[BSMS Web :: API] Data export failed:`, err);
        return res.status(500).json({ error: 'Internal server error.' });
    }
}
