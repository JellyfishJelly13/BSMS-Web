/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */

import profanity from 'glin-profanity';

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
        // Rejects Zalgo, math fonts, and abnormal unicode combinations.
        const validTextRegex = /^[\x20-\x7E\p{Emoji}\s]*$/u;
        if (!validTextRegex.test(normalized)) {
            console.warn(`[BSMS Web :: API] Validation blocked invalid characters.`);
            return res.status(400).json({ error: 'Invalid characters or formatting detected.' });
        }

        // 3. Profanity Check
        // The package glin-profanity provides a simple check function
        const isBad = profanity(normalized);

        if (isBad) {
            console.warn(`[BSMS Web :: API] Profanity filter flagged text.`);
            return res.status(400).json({ error: 'Profanity detected.' });
        }

        return res.status(200).json({ success: true, clean: true });

    } catch (err) {
        console.error(`[BSMS Web :: API] Profanity filter error:`, err);
        return res.status(500).json({ error: 'Internal server error during text validation.' });
    }
}
