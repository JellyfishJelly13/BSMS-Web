/* admin.js */
const Admin = {
    usersCache: {},
    activeTargetUid: null,

    switchTab: function(tabId) {
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(`${tabId}-panel`).classList.add('active');
        event.currentTarget.classList.add('active');
        if (tabId === 'users') this.loadUsers();
        if (tabId === 'db') this.loadDB();
    },

    apiCall: async function(action, payload = {}) {
        const sid = localStorage.getItem('session_id') || "";
        const res = await fetch('/api/admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Session-ID': sid },
            body: JSON.stringify({ action, ...payload })
        });
        const data = await res.json();
        if (!res.ok) { alert("API Error: " + data.error); throw new Error(data.error); }
        return data;
    },

    loadUsers: async function() {
        const tbody = document.querySelector('#users-table tbody');
        tbody.innerHTML = '<tr><td colspan="6">Loading...</td></tr>';
        try {
            const users = await this.apiCall('getUsers');
            this.usersCache = users;
            tbody.innerHTML = '';
            for (const [uid, acc] of Object.entries(users)) {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${uid.substring(0,8)}...</td>
                    <td>${acc.username || 'N/A'}</td>
                    <td>${acc.displayName || 'N/A'}</td>
                    <td style="color:${acc.role === 'admin' ? 'var(--accent)' : 'inherit'}">${acc.role || 'user'}</td>
                    <td style="color:${acc.account_status === 'banned' ? 'var(--danger)' : 'var(--success)'}">${acc.account_status || 'active'}</td>
                    <td><button onclick="Admin.openEditModal('${uid}')">Manage</button></td>
                `;
                tbody.appendChild(tr);
            }
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="6" style="color:var(--danger)">Failed to load users.</td></tr>';
        }
    },

    openEditModal: function(uid) {
        this.activeTargetUid = uid;
        const acc = this.usersCache[uid];
        document.getElementById('em-uid').innerText = uid;
        document.getElementById('em-username').value = acc.username || '';
        document.getElementById('em-displayname').value = acc.displayName || '';
        document.getElementById('em-bio').value = acc.bio || '';
        document.getElementById('em-avatar').value = acc.avatar ? '(Contains Data)' : 'None';
        
        document.getElementById('em-status').value = acc.account_status || 'active';
        document.getElementById('em-banreason').value = acc.ban_reason || '';
        document.getElementById('em-banexpires').value = acc.ban_expires || '';

        // Extract devices from sessions
        const devContainer = document.getElementById('em-devices');
        devContainer.innerHTML = '';
        if (acc.sessions) {
            const table = document.createElement('table');
            table.innerHTML = `<tr><th>Session / Device ID</th><th>Action</th></tr>`;
            for (const [sid, sData] of Object.entries(acc.sessions)) {
                if (sData.deviceId) {
                    table.innerHTML += `<tr>
                        <td>${sData.deviceId}</td>
                        <td><button class="danger" onclick="Admin.banDevice('${sData.deviceId}')">Ban Device</button></td>
                    </tr>`;
                }
            }
            devContainer.appendChild(table);
        } else {
            devContainer.innerText = "No active sessions/devices found.";
        }

        document.getElementById('edit-modal').classList.add('show');
    },

    clearAvatar: function() {
        if(!confirm("Clear this user's avatar?")) return;
        this.apiCall('updateUser', { targetUid: this.activeTargetUid, updates: { avatar: "" } })
            .then(() => { alert("Avatar cleared."); document.getElementById('em-avatar').value = 'None'; this.loadUsers(); });
    },

    saveUser: function() {
        const updates = {
            username: document.getElementById('em-username').value,
            displayName: document.getElementById('em-displayname').value,
            bio: document.getElementById('em-bio').value,
            account_status: document.getElementById('em-status').value,
            ban_reason: document.getElementById('em-banreason').value || null,
            ban_expires: parseInt(document.getElementById('em-banexpires').value) || null
        };

        this.apiCall('updateUser', { targetUid: this.activeTargetUid, updates })
            .then(() => {
                alert("Account updated.");
                document.getElementById('edit-modal').classList.remove('show');
                this.loadUsers();
            });
    },

    banDevice: function(deviceId) {
        const reason = prompt("Enter ban reason for this device:");
        if (reason === null) return;
        this.apiCall('banDevice', { deviceId, reason })
            .then(() => alert(`Device ${deviceId} banned successfully.`));
    },

    // --- RAW DB EDITOR LOGIC ---
    loadDB: async function() {
        const treeC = document.getElementById('db-tree');
        treeC.innerHTML = "Fetching DB Snapshot...";
        try {
            const data = await this.apiCall('getDB');
            treeC.innerHTML = '';
            treeC.appendChild(this.buildTree(data, ''));
        } catch (e) {
            treeC.innerHTML = `<span style="color:var(--danger)">Failed to load DB.</span>`;
        }
    },

    buildTree: function(data, path) {
        const container = document.createElement('div');
        container.className = 'tree-node';

        if (typeof data === 'object' && data !== null) {
            for (const key in data) {
                const nodePath = path === '' ? `/${key}` : `${path}/${key}`;
                const row = document.createElement('div');
                
                const keySpan = document.createElement('span');
                keySpan.className = 'tree-key';
                keySpan.innerText = `+ ${key}: `;
                
                const childContainer = this.buildTree(data[key], nodePath);
                childContainer.style.display = 'none'; // Collapsed by default

                keySpan.onclick = () => {
                    const isHidden = childContainer.style.display === 'none';
                    childContainer.style.display = isHidden ? 'block' : 'none';
                    keySpan.innerText = isHidden ? `- ${key}: ` : `+ ${key}: `;
                };

                row.appendChild(keySpan);
                if (typeof data[key] !== 'object' || data[key] === null) {
                    keySpan.innerText = `${key}: `;
                    keySpan.onclick = null; // Remove collapse toggle for primitives
                    
                    const valSpan = document.createElement('span');
                    valSpan.className = `tree-val ${typeof data[key]}`;
                    valSpan.innerText = JSON.stringify(data[key]);
                    
                    const editIcn = document.createElement('span');
                    editIcn.className = 'edit-icn';
                    editIcn.innerText = '[Edit]';
                    editIcn.onclick = () => this.editNode(nodePath, data[key], valSpan);

                    row.appendChild(valSpan);
                    row.appendChild(editIcn);
                } else {
                    row.appendChild(document.createTextNode('{...}'));
                }
                
                container.appendChild(row);
                container.appendChild(childContainer);
            }
        }
        return container;
    },

    editNode: function(path, oldVal, valSpan) {
        const inputStr = prompt(`Editing path: ${path}\nEnter new value (valid JSON required for numbers/booleans, wrap strings in quotes):`, JSON.stringify(oldVal));
        if (inputStr === null) return;
        
        let newVal;
        try {
            newVal = JSON.parse(inputStr);
        } catch(e) {
            alert("Invalid input format. Remember to wrap strings in double quotes.");
            return;
        }

        if (confirm(`Are you sure you want to write to ${path}?\nNew Value: ${newVal}`)) {
            this.apiCall('updateDBNode', { path, value: newVal })
                .then(() => {
                    valSpan.innerText = JSON.stringify(newVal);
                    valSpan.className = `tree-val ${typeof newVal}`;
                });
        }
    }
};

document.addEventListener('DOMContentLoaded', () => Admin.loadUsers());
