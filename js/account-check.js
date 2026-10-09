/* account-check.js */
(function() {
    const SESSION_KEY = 'bsms_auth_session';

    async function verifyAccountSync() {
        const sessionStr = localStorage.getItem(SESSION_KEY);
        if (!sessionStr) return;

        let session;
        try {
            session = JSON.parse(sessionStr);
            if (!session.loggedIn) return;
        } catch(e) { return; }

        const sessionId = localStorage.getItem('session_id') || "";

        try {
            // Re-using the standard auth endpoint logic to get the latest profile
            const res = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Session-ID': sessionId },
                body: JSON.stringify({ action: 'getProfile' })
            });

            // Note: If 403 banned, ban-check.js (which should also be on the page) handles the redirection
            if (!res.ok) return;

            const data = await res.json();
            if (data && data.profile) {
                const remote = data.profile;
                let updated = false;

                // Sync Display Name
                const latestName = remote.displayName || remote.username;
                if (session.displayName !== latestName) {
                    session.displayName = latestName;
                    updated = true;
                    
                    // DOM Updates for Display Name
                    document.querySelectorAll('.profile-display-name, #sidebarUsername, #mobileSidebarUsername, .active-user-name').forEach(el => {
                        if (el.tagName === 'INPUT') el.value = latestName;
                        else el.textContent = latestName;
                    });
                }

                // Sync Avatar
                const latestAvatar = remote.avatar || "";
                if (session.pfp !== latestAvatar) {
                    session.pfp = latestAvatar;
                    updated = true;
                    
                    // DOM Updates for Avatar (Images and Container Fallbacks)
                    document.querySelectorAll('.profile-avatar-img, .avatar-preview img').forEach(img => {
                        img.src = latestAvatar;
                    });
                    
                    // If no avatar exists, fall back to initial letter dynamically
                    document.querySelectorAll('.avatar-container').forEach(container => {
                        if (latestAvatar) {
                            container.innerHTML = `<img src="${latestAvatar}" style="width:100%;height:100%;object-fit:cover;">`;
                            container.style.border = "none";
                        } else {
                            container.innerHTML = latestName.charAt(0).toUpperCase();
                            container.style.border = "3px solid var(--red)";
                        }
                    });
                }

                // Write to local cache if changed
                if (updated) {
                    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
                    console.log("[BSMS Web :: Sync] Local session cache updated to match database truth.");
                }
            }
        } catch (e) {
            console.error("[BSMS Web :: Sync] Background sync failed:", e);
        }
    }

    // Run sync slightly after initial DOM load to avoid blocking critical rendering path
    window.addEventListener('DOMContentLoaded', () => {
        setTimeout(verifyAccountSync, 1500);
    });
})();
