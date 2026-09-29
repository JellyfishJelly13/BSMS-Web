/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */

import admin from 'firebase-admin';
import profanity from 'glin-profanity';

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
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const action = req.query.action;
    const sessionId = req.headers['x-session-id'];
    const payload = req.body || {};

    try {
        const userLookup = await getUserBySession(sessionId);
        if (!userLookup) return res.status(401).json({ error: 'Unauthorized session.' });

        const { uid, account } = userLookup;
        if (account.account_status === 'banned') {
            return res.status(403).json({ error: 'Account banned.', account_status: 'banned' });
        }

        await db.ref(`/accounts/${uid}/sessions/${sessionId}/lastActive`).set(Date.now());

        switch (action) {
            case 'sync': {
                const usersSnap = await db.ref('/chat/users').once('value');
                const acctSnap = await db.ref('/accounts').once('value');
                const convosSnap = await db.ref('/chat/conversations').once('value');
                
                const allAccounts = acctSnap.val() || {};
                const usersCache = usersSnap.val() || {};
                const accountsCache = {};
                
                for (const [id, acc] of Object.entries(allAccounts)) {
                    if (acc.account_status !== 'deleted') {
                        accountsCache[id] = { displayName: acc.displayName, avatar: acc.avatar };
                    }
                }

                const myChannels = {};
                const allConvos = convosSnap.val() || {};
                
                for (const type of ['dms', 'gcs']) {
                    if (allConvos[type]) {
                        for (const [cid, channel] of Object.entries(allConvos[type])) {
                            if (channel.members && channel.members[uid]) {
                                let strippedMessages = {};
                                if (channel.messages) {
                                    const mKeys = Object.keys(channel.messages);
                                    if (mKeys.length > 0) {
                                        const lastKey = mKeys[mKeys.length - 1];
                                        strippedMessages[lastKey] = channel.messages[lastKey];
                                    }
                                }
                                myChannels[cid] = {
                                    ...channel,
                                    _type: type,
                                    _id: cid,
                                    messages: strippedMessages
                                };
                            }
                        }
                    }
                }

                return res.status(200).json({ users: usersCache, accounts: accountsCache, channels: myChannels });
            }

            case 'messages': {
                const { cid, type } = payload;
                if (!cid || !type) return res.status(400).json({ error: "Missing channel data" });
                
                const chSnap = await db.ref(`/chat/conversations/${type}/${cid}`).once('value');
                const channel = chSnap.val();
                
                if (!channel || !channel.members || !channel.members[uid]) {
                    return res.status(403).json({ error: "Not a member of this channel." });
                }

                return res.status(200).json({ messages: channel.messages || {}, members: channel.members || {} });
            }

            case 'sendMessage': {
                const { cid, type, content, repliedTo } = payload;
                if (!cid || !type || !content) return res.status(400).json({ error: "Missing payload data" });

                const chSnap = await db.ref(`/chat/conversations/${type}/${cid}`).once('value');
                const channel = chSnap.val();
                if (!channel || !channel.members || !channel.members[uid]) {
                    return res.status(403).json({ error: "Not a member." });
                }

                // Direct Profanity Check (No internal API Fetch)
                let normalizedText = content.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/@/g, 'a').replace(/\$/g, 's').replace(/0/g, 'o');
                const validTextRegex = /^[\x20-\x7E\p{Emoji}\s]*$/u;

                if (!validTextRegex.test(normalizedText)) {
                    return res.status(400).json({ error: 'Invalid characters or formatting detected.' });
                }
                if (profanity(normalizedText)) {
                    return res.status(400).json({ error: 'Profanity detected.' });
                }

                const lastMsgSnap = await db.ref(`/chat/users/${uid}/lastMessageTimestamp`).once('value');
                const lastTs = lastMsgSnap.val() || 0;
                const now = Date.now();
                if (now - lastTs < 5000) return res.status(429).json({ error: "Please wait 5 seconds before sending another message." });

                // Transaction fix for high concurrency
                const msgIdRef = db.ref(`/chat/conversations/${type}/${cid}/config/lastMessageId`);
                const transactionResult = await msgIdRef.transaction((current) => {
                    return (current || 99999) + 1;
                });
                const newId = transactionResult.snapshot.val();

                const msgObj = {
                    senderUid: uid,
                    timestamp: admin.database.ServerValue.TIMESTAMP,
                    content: content,
                    contentType: 'text',
                    status: { unsent: false, deletedByMod: false, pinned: false, repliedTo: repliedTo || false }
                };

                await db.ref(`/chat/conversations/${type}/${cid}/messages/${newId}`).set(msgObj);
                await db.ref(`/chat/users/${uid}/lastMessageTimestamp`).set(now);
                
                return res.status(200).json({ success: true, messageId: newId });
            }

            case 'action': {
                const { action: msgAction, cid, type, msgId } = payload;
                if (!cid || !type || !msgId) return res.status(400).json({ error: "Missing data" });

                const msgRef = db.ref(`/chat/conversations/${type}/${cid}/messages/${msgId}`);
                const msgSnap = await msgRef.once('value');
                const msg = msgSnap.val();

                if (!msg) return res.status(404).json({ error: "Message not found" });

                const roleSnap = await db.ref(`/chat/conversations/${type}/${cid}/members/${uid}/role`).once('value');
                const role = roleSnap.val() || 'member';
                const isMod = type === 'gcs' && (role === 'owner' || role === 'moderator');
                const isMine = msg.senderUid === uid;

                if (msgAction === 'unsend' && isMine) {
                    await msgRef.update({ 'status/unsent': true, content: null });
                } else if (msgAction === 'moderate' && isMod && !isMine) {
                    await msgRef.update({ 'status/deletedByMod': true, content: null });
                } else if (msgAction === 'pin' && isMod) {
                    await msgRef.update({ 'status/pinned': !(msg.status?.pinned || false) });
                } else {
                    return res.status(403).json({ error: "Unauthorized message action." });
                }

                return res.status(200).json({ success: true });
            }

            case 'typing': {
                const { cid, type, isTyping } = payload;
                if (!cid || !type) return res.status(400).json({ error: "Missing data" });
                
                await db.ref(`/chat/conversations/${type}/${cid}/members/${uid}/isTyping`).set(Boolean(isTyping));
                return res.status(200).json({ success: true });
            }

            case 'status': {
                const { status } = payload;
                if (status === 'online') {
                    await db.ref(`/chat/users/${uid}/status`).set('online');
                    await db.ref(`/chat/users/${uid}/lastSeen`).set(admin.database.ServerValue.TIMESTAMP);
                }
                return res.status(200).json({ success: true });
            }

            case 'startDM': {
                const { targetUid } = payload;
                if (!targetUid || targetUid === uid) return res.status(400).json({ error: "Invalid target." });

                const targetSnap = await db.ref(`/accounts/${targetUid}`).once('value');
                if (!targetSnap.exists()) return res.status(404).json({ error: "User not found." });

                const convosSnap = await db.ref(`/chat/conversations/dms`).once('value');
                const dms = convosSnap.val() || {};
                
                for (const [id, c] of Object.entries(dms)) {
                    if (c.members && c.members[uid] && c.members[targetUid]) {
                        return res.status(200).json({ cid: id }); 
                    }
                }

                // ID Collision fix: Use Firebase built-in push key
                const newCid = db.ref('/chat/conversations/dms').push().key;
                await db.ref(`/chat/conversations/dms/${newCid}`).set({
                    config: { createdAt: Date.now(), lastMessageId: 99999 },
                    members: {
                        [uid]: { role: 'member', isTyping: false },
                        [targetUid]: { role: 'member', isTyping: false }
                    }
                });

                return res.status(200).json({ cid: newCid });
            }

            default:
                return res.status(400).json({ error: "Unknown action." });
        }
    } catch (err) {
        console.error(`[BSMS Web :: Chat] Internal Error:`, err);
        return res.status(500).json({ error: 'Internal server error.' });
    }
}
