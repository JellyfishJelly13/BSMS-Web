/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */

(function() {
    const SESSION_KEY = 'bsms_auth_session';

    // Helper to lock them out completely
    function applyBan() {
        try {
            localStorage.removeItem(SESSION_KEY);
            localStorage.setItem('bsms_banned', 'true');
        } catch(e) { } // Graceful fail if cookies are fully blocked
        
        // Prevent redirect looping if they are already on the page
        if (window.location.pathname !== '/device-banned.html' && window.location.pathname !== '/device-banned') {
            window.location.href = '/device-banned.html';
        }
    }

    // Check 1: Is this specific browser already flagged as banned offline?
    try {
        if (localStorage.getItem('bsms_banned') === 'true') {
            applyBan();
            return;
        }
    } catch (e) { }

    // Check 2: Global interceptor on ALL Fetch APIs 
    // Catches *any* 403 request resulting from standard network calls returning `account_status: "banned"`
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        try {
            const response = await originalFetch.apply(this, args);
            
            if (response.status === 403) {
                // Clone response to read json without consuming it for the actual endpoint handler caller
                const clone = response.clone();
                clone.json().then(data => {
                    if (data && data.account_status === 'banned') {
                        applyBan();
                    }
                }).catch(() => {});
            }
            
            return response;
        } catch (err) {
            throw err;
        }
    };

    // Check 3: Active session background ping.
    // If the user's logged in, proactively check their status on DOM load so they get kicked
    // even if they don't explicitly fire an API call on the active page.
    window.addEventListener('DOMContentLoaded', () => {
        try {
            const session = localStorage.getItem(SESSION_KEY);
            const sessionId = localStorage.getItem('session_id');
            
            if (session && sessionId && window.location.pathname !== '/device-banned.html' && window.location.pathname !== '/device-banned') {
                
                originalFetch('/api/auth', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Session-ID': sessionId
                    },
                    body: JSON.stringify({ action: 'checkBan' })
                }).then(res => {
                    if (res.status === 403) {
                        res.json().then(data => {
                            if (data && data.account_status === 'banned') applyBan();
                        }).catch(()=>{});
                    }
                }).catch(()=>{});
                
            }
        } catch(e) {}
    });

})();
