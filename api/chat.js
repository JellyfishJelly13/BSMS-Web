/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */

import admin from 'firebase-admin';
import crypto from 'crypto';

// Safe Firebase Initialization with Vercel Environment Variables
if (!admin.apps.length) {
    try {
        if (!process.env.FIREBASE_PRIVATE_KEY) throw new Error("FIREBASE_PRIVATE_KEY is missing from environment variables.");
        
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            }),
            databaseURL: process.env.FIREBASE_DATABASE_URL
        });
    } catch (err) { 
        console.error("[BSMS Web :: API] Firebase Init Error:", err.message); 
    }
}
const db = admin.apps.length ? admin.database() : null;

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

// Extracted Glin Profanity Checker
async function checkProfanity(text) {
    if (!text) return false;
    let strippedText = text
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
        .replace(/\s+/g, "")
        .replace(/@/g, "a").replace(/\$/g, "s").replace(/0/g, "o")
        .replace(/1/g, "i").replace(/3/g, "e").replace(/4/g, "a")
        .replace(/5/g, "s").replace(/7/g, "t")
        .toLowerCase();

    try {
        const glinModule = await import('glin-profanity');
        const profanityCheck = glinModule.default || glinModule; 
        return profanityCheck(text) || profanityCheck(strippedText);
    } catch (err) {
        console.error("[BSMS Web :: API] Glin Profanity Failed to Load:", err);
        const blockList = ['fuck', 'shit', 'bitch', 'asshole', 'cunt', 'nigger', 'nigga', 'faggot'];
        return blockList.some(word => strippedText.includes(word));
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!db) return res.status(500).json({ error: "Database failed to initialize. Check environment variables." });

    const action = req.query.action;
    const sessionId = req.headers['x-session-id'];
    const payload = req.body || {};

    try {
        const userLookup = await getUserBySession(sessionId);
        if (!userLookup) return res.status(401).json({ error: 'Unauthorized session.' });

        const { uid, account } = userLookup;
        if (account.account_status === 'banned') return res.status(403).json({ error: 'Account banned.', account_status: 'banned' });

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
                        accountsCache[id] = { displayName: acc.displayName, username: acc.username, avatar: acc.avatar };
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
                                    let mKeys = Object.keys(channel.messages).filter(k => channel.messages[k] !== null);
                                    if (mKeys.length > 0) {
                                        const lastKey = mKeys[mKeys.length - 1];
                                        strippedMessages[lastKey] = channel.messages[lastKey];
                                    }
                                }
                                let chData = { ...channel, _type: type, _id: cid, messages: strippedMessages };
                                if (channel.members[uid].role !== 'owner' && chData.joinRequests) {
                                    delete chData.joinRequests; // Sanitize privacy data
                                }
                                myChannels[cid] = chData;
                            }
                        }
                    }
                }
                
                return res.status(200).json({ myUid: uid, users: usersCache, accounts: accountsCache, channels: myChannels });
            }

            case 'messages': {
                const { cid, type } = payload;
                if (!cid || !type) return res.status(400).json({ error: "Missing channel data" });
                
                const chSnap = await db.ref(`/chat/conversations/${type}/${cid}`).once('value');
                const channel = chSnap.val();
                
                if (!channel || !channel.members || !channel.members[uid]) return res.status(403).json({ error: "Not a member of this channel." });
                return res.status(200).json({ messages: channel.messages || {}, members: channel.members || {} });
            }

            case 'sendMessage': {
                const { cid, type, content, contentType = 'text', attachmentName, repliedTo } = payload;
                if (!cid || !type || !content) return res.status(400).json({ error: "Missing payload data" });

                const chSnap = await db.ref(`/chat/conversations/${type}/${cid}`).once('value');
                const channel = chSnap.val();
                if (!channel || !channel.members || !channel.members[uid]) return res.status(403).json({ error: "Not a member." });

                // Formatting and validation checks per type
                if (contentType === 'text') {
                    const validTextRegex = /^[\x20-\x7E\p{Emoji}\s]*$/u;
                    if (!validTextRegex.test(content)) return res.status(400).json({ error: 'Invalid characters or formatting detected.' });
                    if (await checkProfanity(content)) return res.status(400).json({ error: 'Profanity detected.' });
                } else if (contentType === 'poll') {
                    if (await checkProfanity(content.pollQuestion)) return res.status(400).json({ error: 'Profanity detected in poll question.' });
                }

                const lastMsgSnap = await db.ref(`/chat/users/${uid}/lastMessageTimestamp`).once('value');
                const now = Date.now();
                if (now - (lastMsgSnap.val() || 0) < 5000 && type === 'dms') return res.status(429).json({ error: "Please wait 5 seconds before sending another message." });

                const msgIdRef = db.ref(`/chat/conversations/${type}/${cid}/config/lastMessageId`);
                const transactionResult = await msgIdRef.transaction((current) => (current || 99999) + 1);
                const newId = transactionResult.snapshot.val();

                const rr = {};
                for (let mUid in channel.members) rr[mUid] = (mUid === uid);

                const msgObj = {
                    senderUid: uid,
                    timestamp: admin.database.ServerValue.TIMESTAMP,
                    content: content,
                    contentType: contentType,
                    readReceipts: rr,
                    status: { unsent: false, deletedByMod: false, pinned: false, repliedTo: repliedTo || false }
                };
                if (attachmentName) msgObj.attachmentName = attachmentName;

                await db.ref(`/chat/conversations/${type}/${cid}/messages/${newId}`).set(msgObj);
                await db.ref(`/chat/users/${uid}/lastMessageTimestamp`).set(now);

                // Optional NTFY Notification Delivery Utilizing Vercel Variables 
                if (process.env.NTFY_CHAT_TOPIC) {
                    try { 
                        fetch(`https://ntfy.sh/${process.env.NTFY_CHAT_TOPIC}`, { 
                            method: 'POST', 
                            body: `New message delivered in ${type}`, 
                            headers: { 'Title': 'BSMS Chat System Notification' }
                        }); 
                    } catch(e) { }
                }

                return res.status(200).json({ success: true, messageId: newId });
            }

            case 'action': {
                const { action: msgAction, cid, type, msgId, emoji, optKey, content } = payload;
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
                } else if (msgAction === 'edit' && isMine && msg.contentType === 'text') {
                    if (await checkProfanity(content)) return res.status(400).json({ error: "Profanity detected in edited message" });
                    await msgRef.update({ content: content, 'status/edited': true });
                } else if (msgAction === 'react' && emoji) {
                    const rxRef = db.ref(`/chat/conversations/${type}/${cid}/messages/${msgId}/reactions/${uid}`);
                    const rx = (await rxRef.once('value')).val();
                    if (rx === emoji) await rxRef.remove(); else await rxRef.set(emoji);
                } else if (msgAction === 'votePoll' && optKey && msg.contentType === 'poll') {
                    const voteRef = db.ref(`/chat/conversations/${type}/${cid}/messages/${msgId}/content/pollVotes/${uid}`);
                    const vote = (await voteRef.once('value')).val();
                    if (vote === optKey) await voteRef.remove(); else await voteRef.set(optKey);
                } else {
                    return res.status(403).json({ error: "Unauthorized message action." });
                }

                return res.status(200).json({ success: true });
            }

            case 'typing': {
                const { cid, type, isTyping } = payload;
                if (cid && type) await db.ref(`/chat/conversations/${type}/${cid}/members/${uid}/isTyping`).set(Boolean(isTyping));
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
                    if (c.members && c.members[uid] && c.members[targetUid]) return res.status(200).json({ cid: id }); 
                }

                const newCid = db.ref('/chat/conversations/dms').push().key;
                await db.ref(`/chat/conversations/dms/${newCid}`).set({
                    config: { createdAt: Date.now(), lastMessageId: 99999 },
                    members: { [uid]: { role: 'member', isTyping: false }, [targetUid]: { role: 'member', isTyping: false } }
                });

                return res.status(200).json({ cid: newCid });
            }

            case 'createGroup': {
                const { name, joinCode, requireApproval, icon } = payload;
                if (!name || name.length < 3 || name.length > 30) return res.status(400).json({ error: "Group name must be 3-30 characters." });
                if (await checkProfanity(name)) return res.status(400).json({ error: "Profanity detected in group name." });

                const finalCode = joinCode || crypto.randomBytes(3).toString('hex').toUpperCase();
                const newCid = db.ref('/chat/conversations/gcs').push().key;

                await db.ref(`/chat/conversations/gcs/${newCid}`).set({
                    name: name,
                    config: { 
                        createdAt: Date.now(), 
                        lastMessageId: 99999, 
                        joinCode: finalCode, 
                        ownerUid: uid, 
                        requireJoinApproval: !!requireApproval, 
                        allowCustomNicknames: true, 
                        icon: icon || null 
                    },
                    members: { [uid]: { role: 'owner', isTyping: false } }
                });
                return res.status(200).json({ success: true, cid: newCid, joinCode: finalCode });
            }

            case 'joinGroup': {
                const { code } = payload;
                if (!code) return res.status(400).json({ error: "Missing invite code." });
                
                const gcsSnap = await db.ref('/chat/conversations/gcs').orderByChild('config/joinCode').equalTo(code.toUpperCase()).once('value');
                const gcs = gcsSnap.val() || {};
                
                const targetCid = Object.keys(gcs)[0];
                if (!targetCid) return res.status(404).json({ error: "Invalid invite code." });
                
                const group = gcs[targetCid];
                if (group.config?.requireJoinApproval) {
                    await db.ref(`/chat/conversations/gcs/${targetCid}/joinRequests/${uid}`).set({ username: account.username, displayName: account.displayName, timestamp: Date.now() });
                    return res.status(200).json({ success: true, requested: true });
                } else {
                    await db.ref(`/chat/conversations/gcs/${targetCid}/members/${uid}`).set({ role: 'member', isTyping: false });
                    return res.status(200).json({ success: true, cid: targetCid });
                }
            }

            case 'leaveGroup': {
                const { cid } = payload;
                const gcsSnap = await db.ref(`/chat/conversations/gcs/${cid}`).once('value');
                const group = gcsSnap.val();
                
                if (!group || !group.members || !group.members[uid]) return res.status(404).json({ error: "Group not found or you are not a member." });
                
                await db.ref(`/chat/conversations/gcs/${cid}/members/${uid}`).remove();
                
                const updatedMembers = { ...group.members };
                delete updatedMembers[uid];
                if (Object.keys(updatedMembers).length === 0) await db.ref(`/chat/conversations/gcs/${cid}`).remove();
                
                return res.status(200).json({ success: true });
            }

            case 'getGroupInfo': {
                const { cid } = payload;
                if (!cid) return res.status(400).json({ error: "Missing group CID" });
                const snap = await db.ref(`/chat/conversations/gcs/${cid}`).once('value');
                const group = snap.val();
                if (!group) return res.status(404).json({ error: "Group not found" });
                
                return res.status(200).json({ 
                    name: group.name, 
                    icon: group.config?.icon, 
                    requireApproval: group.config?.requireJoinApproval, 
                    isMember: !!(group.members && group.members[uid]) 
                });
            }

            case 'groupAction': {
                const { cid, gAction, targetUid, value, configKey } = payload;
                if (!cid) return res.status(400).json({ error: "Missing CID" });

                const chSnap = await db.ref(`/chat/conversations/gcs/${cid}`).once('value');
                const group = chSnap.val();
                if (!group) return res.status(404).json({ error: "Group not found" });
                
                const myRole = group.members[uid]?.role || 'none';
                if (myRole === 'none' && gAction !== 'requestJoin' && gAction !== 'directJoin') return res.status(403).json({ error: "Not a member" });
                const isOwner = myRole === 'owner';
                const isMod = isOwner || myRole === 'moderator';

                switch (gAction) {
                    case 'rename':
                        if (!isOwner) return res.status(403).json({ error: "Unauthorized" });
                        if (await checkProfanity(value)) return res.status(400).json({ error: "Profanity detected" });
                        await db.ref(`/chat/conversations/gcs/${cid}/name`).set(value);
                        break;
                    case 'updateConfig':
                        if (!isOwner) return res.status(403).json({ error: "Unauthorized" });
                        await db.ref(`/chat/conversations/gcs/${cid}/config/${configKey}`).set(value);
                        break;
                    case 'updateIcon':
                        if (!isOwner) return res.status(403).json({ error: "Unauthorized" });
                        await db.ref(`/chat/conversations/gcs/${cid}/config/icon`).set(value);
                        break;
                    case 'updateCode':
                        if (!isOwner) return res.status(403).json({ error: "Unauthorized" });
                        const check = await db.ref(`/chat/conversations/gcs`).orderByChild('config/joinCode').equalTo(value).once('value');
                        if (check.exists()) return res.status(400).json({ error: "Code already in use" });
                        await db.ref(`/chat/conversations/gcs/${cid}/config/joinCode`).set(value);
                        break;
                    case 'saveTheme':
                        if (!isOwner) return res.status(403).json({ error: "Unauthorized" });
                        await db.ref(`/chat/conversations/gcs/${cid}/config/theme`).set(value);
                        break;
                    case 'kick':
                        if (!isMod) return res.status(403).json({ error: "Unauthorized" });
                        if (group.members[targetUid]?.role === 'owner') return res.status(403).json({ error: "Cannot kick owner" });
                        await db.ref(`/chat/conversations/gcs/${cid}/members/${targetUid}`).remove();
                        break;
                    case 'setRole':
                        if (!isOwner) return res.status(403).json({ error: "Unauthorized" });
                        if (value === 'transfer') {
                            await db.ref(`/chat/conversations/gcs/${cid}/members/${targetUid}/role`).set('owner');
                            await db.ref(`/chat/conversations/gcs/${cid}/members/${uid}/role`).set('moderator');
                        } else {
                            await db.ref(`/chat/conversations/gcs/${cid}/members/${targetUid}/role`).set(value);
                        }
                        break;
                    case 'saveNickname':
                        if (group.config?.allowCustomNicknames === false) return res.status(400).json({ error: "Nicknames disabled" });
                        if (value && await checkProfanity(value)) return res.status(400).json({ error: "Profanity detected" });
                        await db.ref(`/chat/conversations/gcs/${cid}/members/${uid}/nickname`).set(value || null);
                        break;
                    case 'requestJoin':
                        await db.ref(`/chat/conversations/gcs/${cid}/joinRequests/${uid}`).set({ username: account.username, displayName: account.displayName, timestamp: Date.now() });
                        break;
                    case 'directJoin':
                        await db.ref(`/chat/conversations/gcs/${cid}/members/${uid}`).set({ role: 'member', isTyping: false });
                        break;
                    case 'approveJoin':
                        if (!isOwner) return res.status(403).json({ error: "Unauthorized" });
                        if (value) await db.ref(`/chat/conversations/gcs/${cid}/members/${targetUid}`).set({ role: 'member', isTyping: false });
                        await db.ref(`/chat/conversations/gcs/${cid}/joinRequests/${targetUid}`).remove();
                        break;
                    default:
                        return res.status(400).json({ error: "Invalid group action" });
                }
                return res.status(200).json({ success: true });
            }

            case 'readReceipt': {
                const { cid, type, msgId } = payload;
                if (cid && type && msgId) {
                    await db.ref(`/chat/conversations/${type}/${cid}/messages/${msgId}/readReceipts/${uid}`).set(true);
                }
                return res.status(200).json({ success: true });
            }

            default:
                return res.status(400).json({ error: "Unknown action." });
        }
    } catch (err) {
        console.error(`[BSMS Web :: Chat] Internal Error:`, err);
        return res.status(500).json({ error: 'Internal server error.' });
    }
}
