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
