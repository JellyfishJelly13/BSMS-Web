<div align="center">
  <img src="/img/icon.png" alt="BSMS Web Logo" width="120" height="120">
  <h1>BSMS Web</h1>
</div>

**Copyright © 2026 Jellyfish Jelly**  
BSMS Web is a full-stack, serverless web application designed to provide a centralized hub for real-time communication, account management, and interactive web utilities. The platform operates on a secure backend infrastructure utilizing Vercel Serverless Functions and Firebase.

## Architecture & Technology Stack

The application relies on a decoupled architecture, ensuring client-side code remains lightweight while sensitive operations are processed server-side.

* **Frontend:** Developed using vanilla HTML, CSS, and JavaScript. The frontend handles UI state mapping, client-side validation, and dynamic rendering without the overhead of heavy frameworks.
* **Backend:** Hosted entirely on [Vercel](https://vercel.com) using Node.js Serverless Functions located in the `/api/` directory.
* **Database:** [Firebase Realtime Database](https://firebase.google.com). Operations are executed securely via the `firebase-admin` SDK on the backend, preventing client-side exposure of database URLs and credentials.
* **Analytics:** Integrated [Google Analytics 4](https://analytics.google.com) (GA4) with custom event tracking.

## Core Pages and Navigation

The user interface is broken down into modular, purpose-built HTML pages:

* **index.html:** The central landing page and dashboard routing users to active modules based on their session status.
* **accounts.html:** The authentication and profile management hub. Handles user registration, login, avatar uploading with client-side canvas compression, active session management, and data export.
* **chat.html:** The real-time messaging interface. Features smart autoscroll, dynamic timestamping, a strict 5-second message cooldown, and integration with the backend profanity filter.
* **g.html:** An embedded iframe game hub designed with optimized touch targets for mobile accessibility.
* **countdown.html:** A utility tool featuring fixed-height settings tabs using CSS Flexbox for consistent cross-device rendering.
* **device-banned.html:** A strict blockade page for users flagged by the moderation system.
* **401.html & 404.html:** Standardized HTTP error pages with fallback navigation.
* **privacy.html:** The platform's privacy policy outlining data collection and session handling.

## Backend APIs and Serverless Functions

All direct database reads, writes, and validations are offloaded to Vercel Serverless Functions.

* **api/chat.js:** Manages message payload delivery, enforces rate limits, and validates session integrity before writing to the database.
* **api/profanity-filter.js:** A robust moderation pipeline that intercepts text, strips zero-width joiners and diacritics, normalizes basic leetspeak, blocks non-standard Unicode/Zalgo text, and flags prohibited words.
* **api/export-data.js:** Compiles a user's entire profile and chat history into a downloadable format upon request.
* **api/version-check.js:** Polled by the client every 30 seconds to ensure the frontend is running the most current build, prompting a refresh if a version mismatch occurs.

## Integrated Libraries

* **[JSZip](https://stuk.github.io/jszip/):** Utilized client-side on the accounts page to bundle the JSON data fetched from `api/export-data.js` into a downloadable `.zip` archive.
* **[glin-profanity](https://www.npmjs.com/package/glin-profanity):** Implemented within the backend API routing to evaluate user inputs against a standardized database of prohibited language.

## Analytics Implementation

Global event tracking is managed via a root-level `analytics.js` file. This script injects the GA4 measurement tag and exposes a `window.BSMSAnalytics` wrapper. It automatically scans the DOM for elements containing `data-ga` attributes, securely logging interactions, page views, and button clicks without cluttering the core frontend logic.

## Deployment Infrastructure

The platform utilizes Vercel for automated deployment and continuous integration. The connection to the Firebase Realtime Database instance is initialized using securely stored Environment Variables configured directly within the Vercel project settings:

* `FIREBASE_PROJECT_ID`
* `FIREBASE_CLIENT_EMAIL`
* `FIREBASE_PRIVATE_KEY` 
* `FIREBASE_DATABASE_URL`

Because the `firebase-admin` SDK securely handles database authorization on the server side using these variables, no configuration objects or private keys are exposed within the public repository.