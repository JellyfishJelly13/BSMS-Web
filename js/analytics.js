/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */

(function() {
    console.log("[BSMS Web :: Analytics] Initializing Global Analytics System");

    window.BSMSAnalytics = {
        trackEvent: function(eventName, params = {}) {
            if (typeof gtag === 'function') {
                gtag('event', eventName, params);
                console.log('[BSMS Web :: Analytics] Tracked Event:', eventName, params);
            } else {
                console.warn('[BSMS Web :: Analytics] gtag not found. Event ignored:', eventName);
            }
        }
    };

    // Attach global click listeners to elements with 'data-ga' attribute
    document.addEventListener('click', function(e) {
        const target = e.target.closest('[data-ga]');
        if (target && target.dataset.ga) {
            window.BSMSAnalytics.trackEvent('click_' + target.dataset.ga);
        }
    });
})();
