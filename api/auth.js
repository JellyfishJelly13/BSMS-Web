/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */

import admin from 'firebase-admin';
import crypto from 'crypto';

// Safe Firebase Initialization
if (!admin.apps.length) {
    try {
        if (!process.env.FIREBASE_PRIVATE_KEY) {
            throw new Error("FIREBASE_PRIVATE_KEY is missing from environment variables.");
        }
        
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            }),
            databaseURL: process.env.FIREBASE_DATABASE_URL
        });
    } catch (err) {
        console.error("[BSMS Web :: Auth] Firebase Init Error:", err.message);
    }
}
const db = admin.apps.length ? admin.database() : null;

// Secure password hashing
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// Session validator
async function getUserBySession(sessionId) {
    if (!sessionId || !db) return null;
    const snap = await db.ref('/accounts').once('value');
    const accounts = snap.val() || {};
    
    for (const [uid, acc] of Object.entries(accounts)) {
        if (acc.sessions && acc.sessions[sessionId]) {
            return { uid, account: acc };
        }
    }
    return null;
}

// Dynamic Glin Profanity checker for usernames and display names
async function checkProfanity(text) {
    if (!text) return false;
    let strippedText = text
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
        .replace(/\s+/g, "")
        .replace(/@/g, "a")
        .replace(/\$/g, "s")
        .replace(/0/g, "o")
        .replace(/1/g, "i")
        .replace(/3/g, "e")
        .replace(/4/g, "a")
        .replace(/5/g, "s")
        .replace(/7/g, "t")
        .toLowerCase();

    try {
        const glinModule = await import('glin-profanity');
        const profanityCheck = glinModule.default || glinModule;
        return profanityCheck(text) || profanityCheck(strippedText);
    } catch (err) {
        console.error("[BSMS Web :: Auth] Glin Profanity Failed to Load:", err);
        const blockList = ['fuck', 'shit', 'bitch', 'asshole', 'cunt', 'nigger', 'nigga', 'faggot'];
        return blockList.some(word => strippedText.includes(word));
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!db) {
        return res.status(500).json({ error: "Database failed to initialize. Check environment variables." });
    }

    const payload = req.body || {};
    const action = req.query.action || payload.action;
    const sessionId = req.headers['x-session-id'];

    try {
        switch (action) {
            case 'register': {
                const { email = "", username, password } = payload;
if (!username || !password) {
    return res.status(400).json({ error: 'Missing required fields.' });
}

                // Validate Username Formatting
                const validUserRegex = /^[a-zA-Z0-9_.-]+$/;
                if (!validUserRegex.test(username)) {
                    return res.status(400).json({ error: 'Username contains invalid characters.' });
                }

                // Check Profanity
                const isProfane = await checkProfanity(username);
                if (isProfane) {
                    return res.status(400).json({ error: 'Username contains profane language.' });
                }

                // Check for existing user records
                const accountsSnap = await db.ref('/accounts').once('value');
                const accounts = accountsSnap.val() || {};
                
                const inputEmail = email ? email.toLowerCase() : "";
                const inputUser = username.toLowerCase();

                for (const [id, acc] of Object.entries(accounts)) {
                    if (acc.email && acc.email.toLowerCase() === inputEmail) {
                        return res.status(409).json({ error: 'Email already in use.' });
                    }
                    if (acc.username && acc.username.toLowerCase() === inputUser) {
                        return res.status(409).json({ error: 'Username already in use.' });
                    }
                }

                // Create Account
                const uid = db.ref('/accounts').push().key;
                const newSessionId = crypto.randomUUID();
                
                const newAccount = {
                    email,
                    username,
                    displayName: username,
                    password: hashPassword(password),
                    account_status: 'active',
                    createdAt: admin.database.ServerValue.TIMESTAMP,
                    avatar: '', 
                    sessions: {
                        [newSessionId]: {
                            createdAt: admin.database.ServerValue.TIMESTAMP,
                            lastActive: admin.database.ServerValue.TIMESTAMP
                        }
                    }
                };

                await db.ref(`/accounts/${uid}`).set(newAccount);
                
                // Initialize corresponding user presence node
                await db.ref(`/chat/users/${uid}`).set({
                    status: 'online',
                    lastSeen: admin.database.ServerValue.TIMESTAMP,
                    lastMessageTimestamp: 0
                });

                return res.status(200).json({ success: true, sessionId: newSessionId, uid });
            }

            case 'login': {
                const { username, password } = payload;
                if (!username || !password) return res.status(400).json({ error: 'Missing credentials.' });

                const hashedPw = hashPassword(password);
                const accountsSnap = await db.ref('/accounts').once('value');
                const accounts = accountsSnap.val() || {};
                
                let targetUid = null;
                let targetAcc = null;
                
                const inputLower = username.toLowerCase();
                for (const [id, acc] of Object.entries(accounts)) {
                    const accUserLower = acc.username ? acc.username.toLowerCase() : '';
                    const accEmailLower = acc.email ? acc.email.toLowerCase() : '';
                    if ((accUserLower === inputLower || accEmailLower === inputLower) && acc.password === hashedPw) {
                        targetUid = id;
                        targetAcc = acc;
                        break;
                    }
                }

                if (!targetUid) return res.status(401).json({ error: 'Invalid username/email or password.' });
                if (targetAcc.account_status === 'banned') return res.status(403).json({ error: 'Account is banned.' });

                const newSessionId = crypto.randomUUID();
                await db.ref(`/accounts/${targetUid}/sessions/${newSessionId}`).set({
                    createdAt: admin.database.ServerValue.TIMESTAMP,
                    lastActive: admin.database.ServerValue.TIMESTAMP
                });

                return res.status(200).json({ success: true, sessionId: newSessionId, uid: targetUid });
            }

            case 'logout': {
                const user = await getUserBySession(sessionId);
                if (!user) return res.status(401).json({ error: 'Unauthorized.' });
                
                await db.ref(`/accounts/${user.uid}/sessions/${sessionId}`).remove();
                return res.status(200).json({ success: true });
            }

            case 'updateProfile': {
                const user = await getUserBySession(sessionId);
                if (!user) return res.status(401).json({ error: 'Unauthorized.' });

                const { displayName, avatar } = payload;
                const updates = {};
                
                if (displayName !== undefined) {
                    const isProfane = await checkProfanity(displayName);
                    if (isProfane) {
                        return res.status(400).json({ error: 'Display name contains profane language.' });
                    }
                    updates['displayName'] = displayName;
                }
                if (avatar !== undefined) updates['avatar'] = avatar;

                if (Object.keys(updates).length > 0) {
                    await db.ref(`/accounts/${user.uid}`).update(updates);
                }
                return res.status(200).json({ success: true });
            }

            case 'changePassword': {
                const user = await getUserBySession(sessionId);
                if (!user) return res.status(401).json({ error: 'Unauthorized.' });

                const { oldPassword, newPassword } = payload;
                if (!oldPassword || !newPassword) {
                    return res.status(400).json({ error: 'Missing password fields.' });
                }
                if (user.account.password !== hashPassword(oldPassword)) {
                    return res.status(401).json({ error: 'Incorrect current password.' });
                }

                await db.ref(`/accounts/${user.uid}/password`).set(hashPassword(newPassword));
                return res.status(200).json({ success: true });
            }

            default:
                return res.status(400).json({ error: 'Unknown action.' });
        }
    } catch (err) {
        console.error('[BSMS Web :: Auth] Error:', err);
        return res.status(500).json({ error: 'Internal server error.' });
    }
}
