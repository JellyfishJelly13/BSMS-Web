/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */

// glin-profanity import removed temporarily to fix Vercel 500 error

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { text } = req.body;
        if (!text || typeof text !== 'string') {
            return res.status(400).json({ error: 'Text payload is required.' });
        }

        // 1. Normalization Pipeline
        let normalized = text
            // Strip diacritics / accents
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            // Remove zero-width spaces and invisible characters
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            // Convert basic leetspeak
            .replace(/@/g, 'a')
            .replace(/\$/g, 's')
            .replace(/0/g, 'o');

        // 2. Strict Validation: Allow standard ASCII + Newlines + Standard Emojis.
        const validTextRegex = /^[\x20-\x7E\p{Emoji}\s]*$/u;
        if (!validTextRegex.test(normalized)) {
            console.warn(`[BSMS Web :: API] Validation blocked invalid characters.`);
            return res.status(400).json({ error: 'Invalid characters or formatting detected.' });
        }

        // 3. Profanity Check (Temporarily Disabled)
        // const isBad = profanity(normalized);
        // if (isBad) { ... }

        return res.status(200).json({ success: true, clean: true });

    } catch (err) {
        console.error(`[BSMS Web :: API] Text validation error:`, err);
        return res.status(500).json({ error: 'Internal server error during text validation.' });
    }
}
