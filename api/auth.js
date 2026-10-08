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

// Dynamic Ban Evaluator (Account + Device)
async function evaluateBanStatus(uid, deviceId, accountObj) {
    const now = Date.now();

    // 1. Check if the device is banned
    if (deviceId) {
        const deviceSnap = await db.ref(`/banned_devices/${deviceId}`).once('value');
        const deviceBan = deviceSnap.val();
        if (deviceBan) {
            if (deviceBan.ban_expires && now > deviceBan.ban_expires) {
                // Lazy clear expired device ban
                await db.ref(`/banned_devices/${deviceId}`).remove();
            } else {
                return {
                    isBanned: true,
                    banReason: deviceBan.reason || 'This device has been banned from the ecosystem.',
                    banExpires: deviceBan.ban_expires || null
                };
            }
        }
    }

    // 2. Check if the account is banned
    if (accountObj && accountObj.account_status === 'banned') {
        if (accountObj.ban_expires && now > accountObj.ban_expires) {
            // Lazy clear expired account ban
            await db.ref(`/accounts/${uid}`).update({
                account_status: 'active',
                ban_expires: null,
                ban_reason: null
            });
            accountObj.account_status = 'active'; // Local reference update just in case
        } else {
            return {
                isBanned: true,
                banReason: accountObj.ban_reason || 'This account has been banned.',
                banExpires: accountObj.ban_expires || null
            };
        }
    }

    return { isBanned: false };
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
    const clientDeviceId = req.headers['x-device-id'] || payload.deviceId;

    try {
        switch (action) {
            case 'register': {
                const { email = "", username, password, deviceId } = payload;
                if (!username || !password) return res.status(400).json({ error: 'Missing required fields.' });

                const validUserRegex = /^[a-zA-Z0-9_.-]+$/;
                if (!validUserRegex.test(username)) return res.status(400).json({ error: 'Username contains invalid characters.' });
                
                // Security Check: Enforce Device Ban completely blocking new creations
                const banCheck = await evaluateBanStatus(null, deviceId || clientDeviceId, null);
                if (banCheck.isBanned) {
                    return res.status(403).json({ error: 'Device is banned.', account_status: 'banned', reason: banCheck.banReason, ban_expires: banCheck.banExpires });
                }

                if (await checkProfanity(username)) return res.status(400).json({ error: 'Username contains profane language.' });

                const accountsSnap = await db.ref('/accounts').once('value');
                const accounts = accountsSnap.val() || {};
                
                const inputEmail = email ? email.toLowerCase() : "";
                const inputUser = username.toLowerCase();

                for (const [id, acc] of Object.entries(accounts)) {
                    if (acc.email && acc.email.toLowerCase() === inputEmail) return res.status(409).json({ error: 'Email already in use.' });
                    if (acc.username && acc.username.toLowerCase() === inputUser) return res.status(409).json({ error: 'Username already in use.' });
                }

                const uid = db.ref('/accounts').push().key;
                const newSessionId = crypto.randomUUID();
                const currentTimestamp = Date.now();
                
                const newAccount = {
                    email,
                    username,
                    displayName: username,
                    password: hashPassword(password),
                    account_status: 'active',
                    createdAt: currentTimestamp,
                    avatar: '', 
                    deviceId: deviceId || clientDeviceId || "",
                    sessions: {
                        [newSessionId]: {
                            createdAt: currentTimestamp,
                            lastActive: currentTimestamp
                        }
                    }
                };

                await db.ref(`/accounts/${uid}`).set(newAccount);
                await db.ref(`/chat/users/${uid}`).set({
                    status: 'online',
                    lastSeen: currentTimestamp,
                    lastMessageTimestamp: 0
                });

                const { password: _, ...safeProfile } = newAccount;
                return res.status(200).json({ success: true, sessionId: newSessionId, uid, profile: safeProfile });
            }

            case 'login': {
                const { username, password, deviceId } = payload;
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
                
                const incomingDeviceId = deviceId || clientDeviceId;
                
                // EXPLICIT CHECK: Ensure banned flag is caught for both devices and accounts
                const banCheck = await evaluateBanStatus(targetUid, incomingDeviceId, targetAcc);
                if (banCheck.isBanned) {
                    return res.status(403).json({ error: 'Banned.', account_status: 'banned', reason: banCheck.banReason, ban_expires: banCheck.banExpires });
                }

                // Update account deviceId node to ensure admins know what device logged in
                if (incomingDeviceId && targetAcc.deviceId !== incomingDeviceId) {
                    await db.ref(`/accounts/${targetUid}/deviceId`).set(incomingDeviceId);
                }

                const newSessionId = crypto.randomUUID();
                await db.ref(`/accounts/${targetUid}/sessions/${newSessionId}`).set({
                    createdAt: admin.database.ServerValue.TIMESTAMP,
                    lastActive: admin.database.ServerValue.TIMESTAMP
                });

                const { password: _, ...safeProfile } = targetAcc;
                return res.status(200).json({ success: true, sessionId: newSessionId, uid: targetUid, profile: safeProfile });
            }

            case 'logout': {
                const user = await getUserBySession(sessionId);
                if (!user) return res.status(401).json({ error: 'Unauthorized.' });
                
                await db.ref(`/accounts/${user.uid}/sessions/${sessionId}`).remove();
                return res.status(200).json({ success: true });
            }

            // --- PROACTIVE CHECK FOR GLOBALS ---
            case 'checkBan': {
                let uid = null; let account = null;
                const user = await getUserBySession(sessionId);
                
                if (user) {
                    uid = user.uid; account = user.account;
                } else if (!clientDeviceId) {
                    // No session and no device ID provided, can't verify
                    return res.status(401).json({ error: 'Unauthorized.' });
                }

                const banCheck = await evaluateBanStatus(uid, clientDeviceId, account);
                if (banCheck.isBanned) {
                    return res.status(403).json({ error: 'Banned.', account_status: 'banned', reason: banCheck.banReason, ban_expires: banCheck.banExpires });
                }
                
                return res.status(200).json({ success: true, account_status: 'active' });
            }

            case 'getProfile': {
                const user = await getUserBySession(sessionId);
                if (!user) return res.status(401).json({ error: 'Unauthorized.' });
                
                const banCheck = await evaluateBanStatus(user.uid, clientDeviceId, user.account);
                if (banCheck.isBanned) return res.status(403).json({ error: 'Banned.', account_status: 'banned', reason: banCheck.banReason, ban_expires: banCheck.banExpires });
                
                const { password: _, ...safeProfile } = user.account;
                return res.status(200).json({ profile: safeProfile });
            }

            case 'updateProfile': {
                const user = await getUserBySession(sessionId);
                if (!user) return res.status(401).json({ error: 'Unauthorized.' });
                
                const banCheck = await evaluateBanStatus(user.uid, clientDeviceId, user.account);
                if (banCheck.isBanned) return res.status(403).json({ error: 'Banned.', account_status: 'banned', reason: banCheck.banReason, ban_expires: banCheck.banExpires });

                const { displayName, bio, email, phone, avatar } = payload;
                const updates = {};
                
                if (displayName !== undefined) {
                    if (await checkProfanity(displayName)) return res.status(400).json({ error: 'Display name contains profane language.' });
                    updates['displayName'] = displayName;
                }
                if (bio !== undefined) {
                    if (await checkProfanity(bio)) return res.status(400).json({ error: 'Bio contains profane language.' });
                    updates['bio'] = bio;
                }
                if (email !== undefined) updates['email'] = email;
                if (phone !== undefined) updates['phone'] = phone;
                if (avatar !== undefined) updates['avatar'] = avatar;

                if (Object.keys(updates).length > 0) {
                    await db.ref(`/accounts/${user.uid}`).update(updates);
                }
                return res.status(200).json({ success: true });
            }

            case 'changeUsername': {
                const user = await getUserBySession(sessionId);
                if (!user) return res.status(401).json({ error: 'Unauthorized.' });
                
                const banCheck = await evaluateBanStatus(user.uid, clientDeviceId, user.account);
                if (banCheck.isBanned) return res.status(403).json({ error: 'Banned.', account_status: 'banned', reason: banCheck.banReason, ban_expires: banCheck.banExpires });
                
                const { newUsername } = payload;
                const lastChange = user.account.lastUsernameChange || 0;
                
                if (Date.now() - lastChange < 7 * 24 * 60 * 60 * 1000) {
                    return res.status(400).json({ error: 'Username change is on cooldown (7 days).' });
                }

                if (!/^[a-zA-Z0-9_-]{3,20}$/.test(newUsername)) return res.status(400).json({ error: 'Invalid username format.' });
                if (await checkProfanity(newUsername)) return res.status(400).json({ error: 'Username contains profane language.' });
                
                const snap = await db.ref('/accounts').once('value');
                const allAccs = snap.val() || {};
                for (const [id, acc] of Object.entries(allAccs)) {
                    if (acc.username && acc.username.toLowerCase() === newUsername.toLowerCase()) {
                        return res.status(409).json({ error: 'Username already in use.' });
                    }
                }

                await db.ref(`/accounts/${user.uid}`).update({
                    username: newUsername,
                    lastUsernameChange: admin.database.ServerValue.TIMESTAMP
                });
                
                return res.status(200).json({ success: true });
            }

            case 'changePassword': {
                const user = await getUserBySession(sessionId);
                if (!user) return res.status(401).json({ error: 'Unauthorized.' });
                
                const banCheck = await evaluateBanStatus(user.uid, clientDeviceId, user.account);
                if (banCheck.isBanned) return res.status(403).json({ error: 'Banned.', account_status: 'banned', reason: banCheck.banReason, ban_expires: banCheck.banExpires });

                const { currentPassword, newPassword } = payload;
                if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Missing password fields.' });
                
                if (user.account.password !== hashPassword(currentPassword)) {
                    return res.status(401).json({ error: 'Incorrect current password.' });
                }

                await db.ref(`/accounts/${user.uid}/password`).set(hashPassword(newPassword));
                return res.status(200).json({ success: true });
            }

            case 'getSessions': {
                const user = await getUserBySession(sessionId);
                if (!user) return res.status(401).json({ error: 'Unauthorized.' });
                
                const banCheck = await evaluateBanStatus(user.uid, clientDeviceId, user.account);
                if (banCheck.isBanned) return res.status(403).json({ error: 'Banned.', account_status: 'banned', reason: banCheck.banReason, ban_expires: banCheck.banExpires });

                return res.status(200).json({ sessions: user.account.sessions || {} });
            }

            case 'revokeSession': {
                const user = await getUserBySession(sessionId);
                if (!user) return res.status(401).json({ error: 'Unauthorized.' });
                
                const banCheck = await evaluateBanStatus(user.uid, clientDeviceId, user.account);
                if (banCheck.isBanned) return res.status(403).json({ error: 'Banned.', account_status: 'banned', reason: banCheck.banReason, ban_expires: banCheck.banExpires });
                
                if (payload.sessionId) {
                    await db.ref(`/accounts/${user.uid}/sessions/${payload.sessionId}`).remove();
                }
                return res.status(200).json({ success: true });
            }

            case 'deleteAccount': {
                const user = await getUserBySession(sessionId);
                if (!user) return res.status(401).json({ error: 'Unauthorized.' });
                
                const banCheck = await evaluateBanStatus(user.uid, clientDeviceId, user.account);
                if (banCheck.isBanned) return res.status(403).json({ error: 'Banned.', account_status: 'banned', reason: banCheck.banReason, ban_expires: banCheck.banExpires });
                
                if (user.account.password !== hashPassword(payload.password)) {
                    return res.status(401).json({ error: 'Incorrect password.' });
                }
                
                await db.ref(`/accounts/${user.uid}/account_status`).set('deleted');
                await db.ref(`/accounts/${user.uid}/sessions`).remove();
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
