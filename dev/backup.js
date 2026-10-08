export default async function handler(req, res) {
  // Only allow Vercel Cron to call this endpoint.
  const authHeader = req.headers.authorization;

  if (process.env.CRON_SECRET) {
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({
        error: "Unauthorized"
      });
    }
  }

  const {
    FIREBASE_DATABASE_URL,
    FIREBASE_PROJECT_ID,
    FIREBASE_CLIENT_EMAIL,
    FIREBASE_PRIVATE_KEY
  } = process.env;

  if (
    !FIREBASE_DATABASE_URL ||
    !FIREBASE_PROJECT_ID ||
    !FIREBASE_CLIENT_EMAIL ||
    !FIREBASE_PRIVATE_KEY
  ) {
    return res.status(500).json({
      error: "Firebase environment variables are missing"
    });
  }

  try {
    // Firebase Realtime Database REST API
    const response = await fetch(
      `${FIREBASE_DATABASE_URL.replace(/\/$/, "")}/.json`
    );

    if (!response.ok) {
      throw new Error(
        `Firebase returned HTTP ${response.status}`
      );
    }

    const database = await response.json();

    const timestamp = new Date().toISOString();

    console.log("Database backup created:", timestamp);
    console.log("Firebase project:", FIREBASE_PROJECT_ID);

    /*
      At this point:

        database = complete Firebase RTDB contents

      You would send `database` to persistent storage here.

      Example structure:

      {
        timestamp,
        project: FIREBASE_PROJECT_ID,
        database
      }
    */

    return res.status(200).json({
      success: true,
      timestamp,
      project: FIREBASE_PROJECT_ID,
      message: "Firebase database backup retrieved successfully"
    });

  } catch (error) {
    console.error("Backup failed:", error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
