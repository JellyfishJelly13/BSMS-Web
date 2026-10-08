/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */

(function() {
    const SESSION_KEY = 'bsms_auth_session';

    // 1. Strict Requirement: Device ID must map to exact localStorage key "session_id"
    let deviceId = localStorage.getItem('session_id');
    if (!deviceId) {
        // Fallback generator matching UUID v4 format
        deviceId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
        localStorage.setItem('session_id', deviceId);
    }

    // Helper to lock the UI and enforce cross-page constraints
    function applyBan(reason, expires) {
        try {
            localStorage.removeItem(SESSION_KEY);
            localStorage.setItem('bsms_banned_data', JSON.stringify({ reason, expires }));
        } catch(e) { } 
        
        // Strict cross-page enforcement check
        if (typeof window.showBanScreen === 'function') {
            window.showBanScreen(reason, expires);
        } else {
            // Forcefully redirect to the accounts page to display the UI properly
            if (window.location.pathname !== '/accounts.html' && window.location.pathname !== '/accounts') {
                window.location.href = '/accounts.html';
            }
        }
    }

    // 2. Local Expiration Check (Lazy Frontend Enforcement)
    try {
        const banDataStr = localStorage.getItem('bsms_banned_data');
        if (banDataStr) {
            const banData = JSON.parse(banDataStr);
            if (banData.expires && Date.now() > banData.expires) {
                // Expired! Explicitly inform the backend to sync clearing process
                fetch('/api/auth', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Device-ID': deviceId,
                        'X-Session-ID': deviceId
                    },
                    body: JSON.stringify({ action: 'removeExpiredBan' })
                }).then(() => {
                    localStorage.removeItem('bsms_banned_data');
                }).catch(() => {});
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
        // Only run proactive fetch check if logged in (or relying on device ID presence)
        const session = localStorage.getItem(SESSION_KEY);
        if (!session && !localStorage.getItem('bsms_banned_data')) return;

        originalFetch('/api/auth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-ID': deviceId,
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
                // Ban cleared externally! Restore state automatically
                if (localStorage.getItem('bsms_banned_data')) {
                    localStorage.removeItem('bsms_banned_data');
                    window.location.reload(); 
                }
            }
        }).catch(()=>{});
    });

})();
