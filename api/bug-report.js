/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */

export default async function handler(req, res) {

  /*
   * Only POST requests are allowed.
   */

  if (req.method !== 'POST') {

    res.setHeader(
      'Allow',
      'POST'
    );

    return res.status(405).json({
      success: false,
      error: 'Method not allowed.'
    });

  }


  try {

    /*
     * ==========================================
     * ENVIRONMENT
     * ==========================================
     *
     * These values stay on Vercel's server.
     *
     * FIREBASE_DATABASE_URL:
     * https://bsms-web-default-rtdb.firebaseio.com
     *
     * FIREBASE_AUTH_TOKEN:
     * Firebase REST authentication credential
     *
     * Neither value is ever sent to the browser.
     */

    const databaseURL =
      process.env.FIREBASE_DATABASE_URL;

    const authToken =
      process.env.FIREBASE_AUTH_TOKEN;


    if (!databaseURL) {

      console.error(
        'Missing FIREBASE_DATABASE_URL environment variable.'
      );

      return res.status(500).json({
        success: false,
        error: 'Firebase database configuration is missing.'
      });

    }


    if (!authToken) {

      console.error(
        'Missing FIREBASE_AUTH_TOKEN environment variable.'
      );

      return res.status(500).json({
        success: false,
        error: 'Firebase authentication configuration is missing.'
      });

    }


    /*
     * ==========================================
     * REQUEST BODY
     * ==========================================
     */

    const body =
      typeof req.body === 'string'
        ? JSON.parse(req.body)
        : (req.body || {});


    const name =
      typeof body.name === 'string'
        ? body.name.trim()
        : '';


    const area =
      typeof body.area === 'string'
        ? body.area.trim()
        : '';


    const summary =
      typeof body.summary === 'string'
        ? body.summary.trim()
        : '';


    const details =
      typeof body.details === 'string'
        ? body.details.trim()
        : '';


    const sessionId =
      typeof body.sessionId === 'string'
        ? body.sessionId.trim()
        : '';


    const username =
      typeof body.username === 'string'
        ? body.username.trim()
        : '';


    /*
     * ==========================================
     * VALIDATION
     * ==========================================
     */

    const validAreas = [
      'Chat',
      'Countdown',
      'Accounts',
      'Games',
      'Other'
    ];


    if (!validAreas.includes(area)) {

      return res.status(400).json({
        success: false,
        error: 'Please select a valid area.'
      });

    }


    if (!summary) {

      return res.status(400).json({
        success: false,
        error: 'A bug description is required.'
      });

    }


    if (name.length > 100) {

      return res.status(400).json({
        success: false,
        error: 'Name is too long.'
      });

    }


    if (summary.length > 300) {

      return res.status(400).json({
        success: false,
        error: 'Bug description is too long.'
      });

    }


    if (details.length > 3000) {

      return res.status(400).json({
        success: false,
        error: 'Additional information is too long.'
      });

    }


    if (sessionId.length > 100) {

      return res.status(400).json({
        success: false,
        error: 'Invalid session ID.'
      });

    }


    if (username.length > 100) {

      return res.status(400).json({
        success: false,
        error: 'Invalid username.'
      });

    }


    /*
     * ==========================================
     * SANITIZE DATABASE URL
     * ==========================================
     */

    const cleanDatabaseURL =
      databaseURL.replace(/\/+$/, '');


    /*
     * ==========================================
     * CREATE REPORT
     * ==========================================
     *
     * Firebase POST automatically generates
     * a unique ID.
     */

    const report = {

      name:
        name || null,

      area,

      summary,

      details:
        details || null,

      username:
        username || null,

      sessionId:
        sessionId || null,

      createdAt:
        new Date().toISOString()

    };


    /*
     * ==========================================
     * WRITE TO FIREBASE
     * ==========================================
     */

    const firebaseURL =
      `${cleanDatabaseURL}/bug-reports.json?auth=${encodeURIComponent(authToken)}`;


    const firebaseResponse =
      await fetch(
        firebaseURL,
        {
          method:'POST',

          headers:{
            'Content-Type':
              'application/json'
          },

          body:
            JSON.stringify(report)
        }
      );


    const firebaseText =
      await firebaseResponse.text();


    let firebaseData = null;

    try {

      firebaseData =
        JSON.parse(firebaseText);

    } catch {

      firebaseData = null;

    }


    /*
     * ==========================================
     * FIREBASE ERROR
     * ==========================================
     */

    if (!firebaseResponse.ok) {

      console.error(
        'Firebase bug report error:',
        firebaseResponse.status,
        firebaseText
      );

      return res.status(500).json({
        success: false,
        error: 'Firebase could not save the bug report.'
      });

    }


    /*
     * ==========================================
     * SUCCESS
     * ==========================================
     */

    return res.status(200).json({

      success: true,

      id:
        firebaseData?.name || null

    });


  } catch (error) {

    console.error(
      'Bug report API error:',
      error
    );

    return res.status(500).json({
      success: false,
      error: 'An unexpected server error occurred.'
    });

  }

}
