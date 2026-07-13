/*
 * BSMS Web

 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */

const { db } = require("../_firebase");
const bcrypt = require("bcrypt");

export default async function handler(req, res) {
    const action = req.query.action;

    if (!action) {
        return res.status(400).json({ error: "Missing action parameter" });
    }

    try {
        switch (action) {
            
            // ==========================================
            // AUTHENTICATION & ACCOUNT MANAGEMENT
            // ==========================================

            case "login": {
                if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
                const { username, password } = req.body;
                if (!username || !password) return res.status(400).json({ error: "Username and password required" });

                const snapshot = await db.ref(`/accounts/${username}`).once("value");
                const userData = snapshot.val();
                if (!userData) return res.status(404).json({ error: "Account not found" });

                let isValid = false;
                if (userData.password.startsWith("$2b$")) {
                    isValid = await bcrypt.compare(password, userData.password);
                } else {
                    const decodedPassword = decodeURIComponent(atob(userData.password));
                    isValid = password === decodedPassword;
                }

                if (!isValid) return res.status(401).json({ error: "Incorrect password" });

                delete userData.password;
                return res.status(200).json({ success: true, user: username, accountData: userData });
            }

            case "register": {
                if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
                const { username, password } = req.body;
                if (!username || !password) return res.status(400).json({ error: "Username and password required" });

                const snapshot = await db.ref(`/accounts/${username}`).once("value");
                if (snapshot.exists()) return res.status(409).json({ error: "Username is already taken" });

                const hashedPassword = await bcrypt.hash(password, 10);
                const newAcc = {
                    password: hashedPassword,
                    displayName: username,
                    bio: "",
                    avatar: "",
                    email: "",
                    phone: "",
                    theme: "#BB001E",
                    createdAt: Date.now(),
                    lastUsernameChange: 0
                };

                await db.ref(`/accounts/${username}`).set(newAcc);
                delete newAcc.password;
                return res.status(200).json({ success: true, user: username, accountData: newAcc });
            }

            case "getAccount": {
                if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
                const { username } = req.query;
                if (!username) return res.status(400).json({ error: "Username required" });

                const snapshot = await db.ref(`/accounts/${username}`).once("value");
                const userData = snapshot.val();
                if (!userData) return res.status(404).json({ error: "Account not found" });

                delete userData.password;
                return res.status(200).json({ success: true, accountData: userData });
            }

            case "updateProfile": {
                if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
                const { username, displayName, bio, email, phone, avatar } = req.body;
                if (!username) return res.status(400).json({ error: "Username required" });

                const updates = {};
                if (displayName !== undefined) updates.displayName = displayName;
                if (bio !== undefined) updates.bio = bio;
                if (email !== undefined) updates.email = email;
                if (phone !== undefined) updates.phone = phone;
                if (avatar !== undefined) updates.avatar = avatar;

                await db.ref(`/accounts/${username}`).update(updates);
                return res.status(200).json({ success: true });
            }

            case "changeUsername": {
                if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
                const { oldUsername, newUsername } = req.body;
                if (!oldUsername || !newUsername) return res.status(400).json({ error: "Both usernames required" });

                const existSnap = await db.ref(`/accounts/${newUsername}`).once("value");
                if (existSnap.exists()) return res.status(409).json({ error: "That username is already taken." });

                const oldSnap = await db.ref(`/accounts/${oldUsername}`).once("value");
                const oldData = oldSnap.val();
                if (!oldData) return res.status(404).json({ error: "Original account not found" });

                oldData.lastUsernameChange = Date.now();
                await db.ref(`/accounts/${newUsername}`).set(oldData);
                await db.ref(`/accounts/${oldUsername}`).remove();
                
                delete oldData.password;
                return res.status(200).json({ success: true, user: newUsername, accountData: oldData });
            }

            case "changePassword": {
                if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
                const { username, currentPassword, newPassword } = req.body;
                if (!username || !currentPassword || !newPassword) return res.status(400).json({ error: "Missing parameters" });

                const snapshot = await db.ref(`/accounts/${username}`).once("value");
                const userData = snapshot.val();
                if (!userData) return res.status(404).json({ error: "Account not found" });

                let isValid = false;
                if (userData.password.startsWith("$2b$")) {
                    isValid = await bcrypt.compare(currentPassword, userData.password);
                } else {
                    const decodedPassword = decodeURIComponent(atob(userData.password));
                    isValid = currentPassword === decodedPassword;
                }

                if (!isValid) return res.status(401).json({ error: "Incorrect current password." });

                const hashedPassword = await bcrypt.hash(newPassword, 10);
                await db.ref(`/accounts/${username}`).update({ password: hashedPassword });
                return res.status(200).json({ success: true });
            }

            case "updateAccountSetting": {
                if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
                const { username, key, value } = req.body;
                if (!username || !key) return res.status(400).json({ error: "Username and key required" });

                await db.ref(`/accounts/${username}`).update({ [key]: value });
                return res.status(200).json({ success: true });
            }

            case "deleteAccount": {
                if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
                const { username, password } = req.body;
                if (!username || !password) return res.status(400).json({ error: "Missing parameters" });

                const snapshot = await db.ref(`/accounts/${username}`).once("value");
                const userData = snapshot.val();
                if (!userData) return res.status(404).json({ error: "Account not found" });

                let isValid = false;
                if (userData.password.startsWith("$2b$")) {
                    isValid = await bcrypt.compare(password, userData.password);
                } else {
                    const decodedPassword = decodeURIComponent(atob(userData.password));
                    isValid = password === decodedPassword;
                }

                if (!isValid) return res.status(401).json({ error: "Incorrect password." });

                await db.ref(`/accounts/${username}`).remove();
                return res.status(200).json({ success: true });
            }

            // ==========================================
            // ROOMS & CHAT (BSMS Rooms)
            // ==========================================

            case "createRoom": {
                if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
                const { username, theme } = req.body;
                if (!username) return res.status(400).json({ error: "Username required" });

                let code;
                for (let i = 0; i < 30; i++) {
                    code = String(Math.floor(1000 + Math.random() * 9000));
                    const ex = await db.ref(`/rooms/${code}`).once('value');
                    if (!ex.exists()) break;
                }

                await db.ref(`/rooms/${code}`).set({
                    members: { [username]: 'host' },
                    settings: { color: theme || '#BB001E' },
                    createdAt: Date.now()
                });

                return res.status(200).json({ success: true, code });
            }

            case "checkRoom": {
                if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
                const { code } = req.query;
                if (!code) return res.status(400).json({ error: "Code required" });

                const snapshot = await db.ref(`/rooms/${code}`).once("value");
                const roomData = snapshot.val();
                if (!roomData) return res.status(404).json({ error: "Room not found" });

                return res.status(200).json({ success: true, roomData });
            }

            case "joinRoom": {
                if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
                const { code, username, ts } = req.body;
                if (!code || !username) return res.status(400).json({ error: "Code and username required" });

                const roomRef = db.ref(`/rooms/${code}`);
                const roomSnap = await roomRef.once("value");
                if (!roomSnap.exists()) return res.status(404).json({ error: "Room not found" });

                const existingSnap = await db.ref(`/rooms/${code}/members/${encodeURIComponent(username)}`).once("value");
                let role = existingSnap.val();
                
                if (!existingSnap.exists()) {
                    await db.ref(`/rooms/${code}/members/${encodeURIComponent(username)}`).set('member');
                    await db.ref(`/rooms/${code}/messages`).push({
                        sys: true,
                        html: `<strong class="uid-name-${username.replace(/"/g, '&quot;')}">${username.replace(/</g, '&lt;')}</strong> joined the room.`,
                        ts: ts || new Date().toLocaleTimeString()
                    });
                    role = 'member';
                }

                return res.status(200).json({ success: true, role });
            }

            case "leaveRoom": {
                if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
                const { code, username, ts } = req.body;
                if (!code || !username) return res.status(400).json({ error: "Missing parameters" });

                await db.ref(`/rooms/${code}/members/${encodeURIComponent(username)}`).remove();
                await db.ref(`/rooms/${code}/voice/${encodeURIComponent(username)}`).remove();
                
                await db.ref(`/rooms/${code}/messages`).push({
                    sys: true,
                    html: `<strong class="uid-name-${username.replace(/"/g, '&quot;')}">${username.replace(/</g, '&lt;')}</strong> left the room.`,
                    ts: ts || new Date().toLocaleTimeString()
                });

                const check = await db.ref(`/rooms/${code}/members`).once('value');
                if (!check.exists()) {
                    await db.ref(`/rooms/${code}`).remove();
                }

                return res.status(200).json({ success: true });
            }

            case "getRoomData": {
                if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
                const { code, limit } = req.query;
                if (!code) return res.status(400).json({ error: "Code required" });

                const snapshot = await db.ref(`/rooms/${code}`).once("value");
                const roomData = snapshot.val();
                if (!roomData) return res.status(404).json({ error: "Room not found" });

                // If limiting messages for polling efficiency
                if (limit && roomData.messages) {
                    const messageKeys = Object.keys(roomData.messages);
                    const limitedKeys = messageKeys.slice(-Math.abs(parseInt(limit) || 100));
                    const limitedMessages = {};
                    limitedKeys.forEach(k => limitedMessages[k] = roomData.messages[k]);
                    roomData.messages = limitedMessages;
                }

                return res.status(200).json({ success: true, roomData });
            }

            case "sendMessage": {
                if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
                const { code, username, html, ts } = req.body;
                if (!code || !username || !html) return res.status(400).json({ error: "Missing parameters" });

                const msgRef = await db.ref(`/rooms/${code}/messages`).push({
                    uid: username,
                    html: html,
                    ts: ts || new Date().toLocaleTimeString()
                });

                return res.status(200).json({ success: true, messageId: msgRef.key });
            }

            case "updateRoomSettings": {
                if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
                const { code, key, val } = req.body;
                if (!code || !key) return res.status(400).json({ error: "Code and setting key required" });

                await db.ref(`/rooms/${code}/settings`).update({ [key]: val });
                return res.status(200).json({ success: true });
            }

            case "updateVoiceState": {
                if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
                const { code, username, isMuted } = req.body;
                if (!code || !username) return res.status(400).json({ error: "Code and username required" });

                await db.ref(`/rooms/${code}/voice/${encodeURIComponent(username)}`).set({ isMuted: !!isMuted });
                return res.status(200).json({ success: true });
            }

            case "leaveVoice": {
                if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
                const { code, username } = req.body;
                if (!code || !username) return res.status(400).json({ error: "Code and username required" });

                await db.ref(`/rooms/${code}/voice/${encodeURIComponent(username)}`).remove();
                return res.status(200).json({ success: true });
            }

            default:
                return res.status(400).json({ error: "Unknown action" });
        }
    } catch (error) {
        console.error("API Error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
}
