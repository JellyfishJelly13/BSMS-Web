/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */

(function() {
    const SESSION_KEY = 'bsms_auth_session';

    // 1. Ensure a persistent Device ID exists
    let deviceId = localStorage.getItem('bsms_device_id');
    if (!deviceId) {
        deviceId = 'dev_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 10);
        localStorage.setItem('bsms_device_id', deviceId);
    }

    // Helper to lock the UI
    function applyBan(reason, expires) {
        try {
            localStorage.removeItem(SESSION_KEY);
            localStorage.setItem('bsms_banned_data', JSON.stringify({ reason, expires }));
        } catch(e) { } 
        
        // Trigger the ban screen on the frontend dynamically
        if (window.showBanScreen) {
            window.showBanScreen(reason, expires);
        } else {
            window.addEventListener('DOMContentLoaded', () => {
                if (window.showBanScreen) window.showBanScreen(reason, expires);
            });
        }
    }

    // 2. Local Expiration Check (Avoid unnecessary API hits if we know they are banned permanently/actively)
    try {
        const banDataStr = localStorage.getItem('bsms_banned_data');
        if (banDataStr) {
            const banData = JSON.parse(banDataStr);
            if (banData.expires && Date.now() > banData.expires) {
                // Ban locally expired
                localStorage.removeItem('bsms_banned_data'); 
            } else {
                applyBan(banData.reason, banData.expires);
            }
        }
    } catch (e) { }

    // 3. Global Interceptor for 403 API Ban Responses
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        try {
            const response = await originalFetch.apply(this, args);
            
            if (response.status === 403) {
                const clone = response.clone();
                clone.json().then(data => {
                    if (data && data.account_status === 'banned') {
                        applyBan(data.reason, data.ban_expires);
                    }
                }).catch(() => {});
            }
            
            return response;
        } catch (err) {
            throw err;
        }
    };

    // 4. Proactive Background Ping
    window.addEventListener('DOMContentLoaded', () => {
        const sessionId = localStorage.getItem('session_id') || "";
        
        originalFetch('/api/auth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-ID': sessionId,
                'X-Device-ID': deviceId
            },
            body: JSON.stringify({ action: 'checkBan' })
        }).then(res => {
            if (res.status === 403) {
                res.json().then(data => {
                    if (data && data.account_status === 'banned') {
                        applyBan(data.reason, data.ban_expires);
                    }
                }).catch(()=>{});
            } else if (res.ok) {
                // If they were manually unbanned early by an admin, clear lock and restore
                if (localStorage.getItem('bsms_banned_data')) {
                    localStorage.removeItem('bsms_banned_data');
                    window.location.reload(); 
                }
            }
        }).catch(()=>{});
    });

})();
