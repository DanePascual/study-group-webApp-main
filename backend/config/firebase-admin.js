// backend/config/firebase-admin.js
// Initialize Firebase Admin SDK safely: prefer FIREBASE_SERVICE_ACCOUNT_JSON env var.
// If not present, fall back to local serviceAccountKey.json (development only).
// IMPORTANT: Do not commit serviceAccountKey.json to source control in production.

const admin = require("firebase-admin");

let serviceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    console.log(
      "firebase-admin: loaded service account from FIREBASE_SERVICE_ACCOUNT_JSON"
    );
  } catch (err) {
    console.error(
      "firebase-admin: FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON:",
      err.message
    );
    process.exit(1);
  }
} else {
  // Development fallback - only if you have the file locally (DO NOT commit this file)
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    serviceAccount = require("./serviceAccountKey.json");
    console.warn(
      "firebase-admin: loaded service account from ./serviceAccountKey.json (ensure this file is NOT committed in production)"
    );
  } catch (err) {
    console.error(
      "firebase-admin: service account not provided. Set FIREBASE_SERVICE_ACCOUNT_JSON env var or place serviceAccountKey.json locally."
    );
    process.exit(1);
  }
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL || undefined,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || undefined,
});

module.exports = admin;
