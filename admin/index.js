/*
 * BSMS Web - Admin Logic
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */

const Admin = {
    usersCache: {},
    bannedDevicesCache: {},
    activeTargetUid: null,
    currentAvatarValue: "",

    switchTab: function(tabId, btnEl) {
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(`${tabId}-panel`).classList.add('active');
        if (btnEl) btnEl.classList.add('active');
        
        if (tabId === 'users' || tabId === 'devices') this.loadUsers();
        if (tabId === 'db') this.loadDB();
    },

    apiCall: async function(action, payload = {}) {
        const sid = localStorage.getItem('session_id') || "";
        const res = await fetch('/api/admin', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-ID': sid
            },
            body: JSON.stringify({ action, ...payload })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            alert("Admin API Error: " + (data.error || res.statusText));
            throw new Error(data.error);
        }
        return data;
    },

    // Helper: Convert MS timestamp to YYYY-MM-DDTHH:mm for <input type="datetime-local">
    tsToDateTimeLocal: function(ts) {
        if (!ts || isNaN(ts)) return "";
        const d = new Date(Number(ts));
        if (isNaN(d.getTime())) return "";
        const offset = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - offset).toISOString().slice(0, 16);
    },

    // Helper: Convert <input type="datetime-local"> value to MS timestamp
    dateTimeLocalToTs: function(val) {
        if (!val) return null;
        const ts = new Date(val).getTime();
        return isNaN(ts) ? null : ts;
    },

    // Helper: Decode Base64 if applicable, or display SHA-256 hash from auth.js
    formatPasswordDisplay: function(rawPass) {
        if (!rawPass) return "(None)";
        // auth.js uses 64-character hex SHA-256 hashes
        if (/^[a-f0-9]{64}$/i.test(rawPass)) {
            return `[SHA-256] ${rawPass}`;
        }
        try {
            return `${atob(rawPass)} (Base64)`;
        } catch (e) {
            return rawPass;
        }
    },

    // Helper: Render PFP or Initial
    buildPfpHTML: function(acc, large = false) {
        const initial = ((acc.displayName || acc.username || '?').charAt(0)).toUpperCase();
        if (acc.avatar && acc.avatar.trim() !== '') {
            return `<img src="${acc.avatar}" alt="PFP">`;
        }
        return initial;
    },

    loadUsers: async function() {
        const tbody = document.querySelector('#users-table tbody');
        tbody.innerHTML = '<tr><td colspan="7">Syncing with Firebase...</td></tr>';
        try {
            const data = await this.apiCall('getUsers');
            this.usersCache = data.accounts || {};
            this.bannedDevicesCache = data.banned_devices || {};
            this.renderUsers();
            this.renderBannedDevices();
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="7" style="color:var(--danger)">Failed to load accounts. Ensure your account has role: "admin" in Firebase.</td></tr>';
        }
    },

    renderUsers: function() {
        const tbody = document.querySelector('#users-table tbody');
        const query = (document.getElementById('user-search')?.value || '').toLowerCase();
        tbody.innerHTML = '';

        for (const [uid, acc] of Object.entries(this.usersCache)) {
            const matchStr = `${uid} ${acc.username || ''} ${acc.displayName || ''} ${acc.email || ''}`.toLowerCase();
            if (query && !matchStr.includes(query)) continue;

            const status = acc.account_status || 'active';
            let expiryText = '';
            if (status === 'banned') {
                expiryText = acc.ban_expires
                    ? `<div style="font-size:11px; color:var(--warn); margin-top:4px;">Until: ${new Date(acc.ban_expires).toLocaleString()}</div>`
                    : `<div style="font-size:11px; color:var(--danger); margin-top:4px;">Permanent</div>`;
            }

            const badges = [];
            if (acc.role === 'admin') badges.push(`<span class="badge admin">Admin</span>`);
            if (acc.verified) badges.push(`<span class="badge verified">✓ Verified</span>`);

            const sessionCount = acc.sessions ? Object.keys(acc.sessions).length : 0;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><div class="pfp-cell">${this.buildPfpHTML(acc)}</div></td>
                <td style="color:var(--fg2);">${uid}</td>
                <td>
                    <strong style="color:var(--fg);">${acc.username || 'N/A'}</strong>
                    <div style="color:var(--fg2); font-size:11px;">${acc.displayName || ''}</div>
                </td>
                <td>${badges.join(' ') || '<span style="color:var(--fg2)">User</span>'}</td>
                <td>
                    <span class="badge ${status}">${status}</span>
                    ${expiryText}
                </td>
                <td>${sessionCount} active</td>
                <td><button class="btn sm" onclick="Admin.openEditModal('${uid}')">Manage</button></td>
            `;
            tbody.appendChild(tr);
        }
    },

    renderBannedDevices: function() {
        const tbody = document.querySelector('#devices-table tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        const entries = Object.entries(this.bannedDevicesCache);
        if (entries.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="color:var(--fg2);">No banned devices recorded.</td></tr>';
            return;
        }

        for (const [devId, info] of entries) {
            const exp = info.ban_expires ? new Date(info.ban_expires).toLocaleString() : 'Permanent';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${devId}</strong></td>
                <td>${info.reason || '---'}</td>
                <td style="color:var(--warn);">${exp}</td>
                <td><button class="btn sec sm" onclick="Admin.unbanDevice('${devId}')">Unban Device</button></td>
            `;
            tbody.appendChild(tr);
        }
    },

    openEditModal: function(uid) {
        this.activeTargetUid = uid;
        const acc = this.usersCache[uid];
        this.currentAvatarValue = acc.avatar || "";

        document.getElementById('em-uid').innerText = uid;
        document.getElementById('em-pfp-preview').innerHTML = this.buildPfpHTML(acc, true);
        document.getElementById('em-header-name').innerText = `${acc.displayName || acc.username} (@${acc.username})`;
        document.getElementById('em-created').innerText = `Created: ${acc.createdAt ? new Date(acc.createdAt).toLocaleString() : 'Unknown'}`;

        document.getElementById('em-username').value = acc.username || '';
        document.getElementById('em-displayname').value = acc.displayName || '';
        document.getElementById('em-email').value = acc.email || '';
        document.getElementById('em-bio').value = acc.bio || '';
        document.getElementById('em-role').value = acc.role || '';
        document.getElementById('em-verified').checked = Boolean(acc.verified);

        document.getElementById('em-password-view').value = this.formatPasswordDisplay(acc.password);
        document.getElementById('em-new-password').value = '';

        document.getElementById('em-status').value = acc.account_status || 'active';
        document.getElementById('em-banreason').value = acc.ban_reason || '';
        document.getElementById('em-banexpires-dt').value = this.tsToDateTimeLocal(acc.ban_expires);

        // Render Sessions & Device IDs
        const sessBody = document.querySelector('#em-sessions-table tbody');
        sessBody.innerHTML = '';
        if (acc.sessions && Object.keys(acc.sessions).length > 0) {
            for (const [sid, sData] of Object.entries(acc.sessions)) {
                const devId = sData.deviceId || sid;
                const lastAct = sData.lastActive ? new Date(sData.lastActive).toLocaleString() : 'Unknown';
                const isDevBanned = Boolean(this.bannedDevicesCache[devId]);

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>
                        <div><strong>Device:</strong> ${devId}</div>
                        <div style="font-size:11px; color:var(--fg2);">Session: ${sid}</div>
                    </td>
                    <td>${lastAct}</td>
                    <td style="display:flex; gap:6px;">
                        <button class="btn warn sm" onclick="Admin.banDeviceFromModal('${devId}')">
                            ${isDevBanned ? 'Update Device Ban' : 'Ban Device'}
                        </button>
                        <button class="btn sec sm" onclick="Admin.revokeSession('${uid}', '${sid}')">Revoke</button>
                    </td>
                `;
                sessBody.appendChild(tr);
            }
        } else {
            sessBody.innerHTML = '<tr><td colspan="3" style="color:var(--fg2);">No active sessions linked to this account.</td></tr>';
        }

        document.getElementById('edit-modal').classList.add('show');
    },

    closeModal: function() {
        document.getElementById('edit-modal').classList.remove('show');
    },

    clearAvatar: function() {
        this.currentAvatarValue = "";
        const acc = { ...this.usersCache[this.activeTargetUid], avatar: "" };
        document.getElementById('em-pfp-preview').innerHTML = this.buildPfpHTML(acc, true);
    },

    saveUser: async function() {
        const uid = this.activeTargetUid;
        if (!uid) return;

        const status = document.getElementById('em-status').value;
        const dtVal = document.getElementById('em-banexpires-dt').value;
        const expiresTs = status === 'banned' ? this.dateTimeLocalToTs(dtVal) : null;
        const reasonVal = status === 'banned' ? (document.getElementById('em-banreason').value.trim() || 'This account has been banned.') : null;
        const roleVal = document.getElementById('em-role').value;

        const updates = {
            username: document.getElementById('em-username').value.trim(),
            displayName: document.getElementById('em-displayname').value.trim(),
            email: document.getElementById('em-email').value.trim(),
            bio: document.getElementById('em-bio').value.trim(),
            avatar: this.currentAvatarValue,
            role: roleVal ? roleVal : null,
            verified: document.getElementById('em-verified').checked,
            account_status: status,
            ban_reason: reasonVal,
            ban_expires: expiresTs
        };

        const newPassword = document.getElementById('em-new-password').value;

        await this.apiCall('updateUser', { targetUid: uid, updates, newPassword });
        this.closeModal();
        this.loadUsers();
    },

    banDeviceFromModal: async function(deviceId) {
        const defaultReason = document.getElementById('em-banreason').value.trim() || 'This device has been banned from the ecosystem.';
        const reason = prompt(`Ban Device ID: ${deviceId}\nEnter ban reason:`, defaultReason);
        if (reason === null) return;

        // Uses the modal's date/time picker if filled, or asks confirmation for permanent
        const dtVal = document.getElementById('em-banexpires-dt').value;
        const ban_expires = this.dateTimeLocalToTs(dtVal);

        await this.apiCall('banDevice', { deviceId, reason, ban_expires });
        alert(`Device ${deviceId} added to /banned_devices.`);
        this.loadUsers();
    },

    unbanDevice: async function(deviceId) {
        if (!confirm(`Remove ban for device ${deviceId}?`)) return;
        await this.apiCall('unbanDevice', { deviceId });
        this.loadUsers();
    },

    revokeSession: async function(uid, sid) {
        if (!confirm(`Revoke session ${sid}?`)) return;
        await this.apiCall('revokeSession', { targetUid: uid, targetSessionId: sid });
        await this.loadUsers();
        this.openEditModal(uid);
    },

    // --- RAW DATABASE INSPECTOR ---
    loadDB: async function() {
        const tree = document.getElementById('db-tree');
        tree.innerHTML = 'Loading full Firebase Realtime Database tree...';
        try {
            const data = await this.apiCall('getDB');
            tree.innerHTML = '';
            tree.appendChild(this.buildTree(data, ''));
        } catch (e) {
            tree.innerHTML = '<span style="color:var(--danger)">Failed to load database tree.</span>';
        }
    },

    buildTree: function(obj, currentPath) {
        const wrap = document.createElement('div');
        wrap.className = 'tree-node';

        if (typeof obj === 'object' && obj !== null) {
            for (const key of Object.keys(obj)) {
                const val = obj[key];
                const nextPath = `${currentPath}/${key}`;
                const row = document.createElement('div');

                if (typeof val === 'object' && val !== null) {
                    const keyEl = document.createElement('span');
                    keyEl.className = 'tree-key';
                    keyEl.innerText = `▶ ${key}`;

                    const childWrap = this.buildTree(val, nextPath);
                    childWrap.style.display = 'none';

                    keyEl.onclick = () => {
                        const open = childWrap.style.display === 'none';
                        childWrap.style.display = open ? 'block' : 'none';
                        keyEl.innerText = `${open ? '▼' : '▶'} ${key}`;
                    };

                    const delBtn = document.createElement('span');
                    delBtn.className = 'tree-act';
                    delBtn.innerText = 'Delete';
                    delBtn.onclick = () => this.deleteDBNode(nextPath);

                    row.appendChild(keyEl);
                    row.appendChild(delBtn);
                    wrap.appendChild(row);
                    wrap.appendChild(childWrap);
                } else {
                    const keyEl = document.createElement('span');
                    keyEl.style.color = 'var(--fg2)';
                    keyEl.innerText = `${key}: `;

                    const valEl = document.createElement('span');
                    valEl.className = `tree-val ${typeof val}`;
                    const displayStr = typeof val === 'string' && val.length > 80 ? val.slice(0, 80) + '...' : val;
                    valEl.innerText = JSON.stringify(displayStr);

                    const editBtn = document.createElement('span');
                    editBtn.className = 'tree-act';
                    editBtn.innerText = 'Edit';
                    editBtn.onclick = () => this.editDBNode(nextPath, val);

                    row.appendChild(keyEl);
                    row.appendChild(valEl);
                    row.appendChild(editBtn);
                    wrap.appendChild(row);
                }
            }
        }
        return wrap;
    },

    editDBNode: async function(path, currentVal) {
        const rawInput = prompt(`Edit Firebase Node: ${path}\nEnter valid JSON value (wrap strings in quotes):`, JSON.stringify(currentVal));
        if (rawInput === null) return;
        try {
            const parsed = JSON.parse(rawInput);
            await this.apiCall('updateDBNode', { path, value: parsed });
            this.loadDB();
        } catch (e) {
            alert("Invalid JSON syntax. Example string: \"hello\" | Example number: 123");
        }
    },

    deleteDBNode: async function(path) {
        if (!confirm(`Permanently delete node ${path} from Firebase?`)) return;
        await this.apiCall('updateDBNode', { path, value: null });
        this.loadDB();
    }
};

document.addEventListener('DOMContentLoaded', () => Admin.loadUsers());
