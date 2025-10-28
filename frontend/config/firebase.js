// frontend/config/firebase.js
// Single shared Firebase initializer (modular v9.x CDN).
// Exports: app, auth, db (Firestore), getIdToken, onAuthStateChanged
//
// Notes:
// - These Firebase client config values are public and safe to include in frontend code.
// - For production builds consider injecting the config via build-time env variables.
//
// Usage:
// import { auth, db, getIdToken, onAuthStateChanged } from '../config/firebase.js';

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged as _onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

// Public client config (safe to embed on client side)
const firebaseConfig = {
  apiKey: "AIzaSyAn1-kQypHeeoqZRGYKhJfE5AiICkTX_Hw",
  authDomain: "study-group-webapp-93fc2.firebaseapp.com",
  projectId: "study-group-webapp-93fc2",
  storageBucket: "study-group-webapp-93fc2.firebasestorage.app",
  messagingSenderId: "857690286168",
  appId: "1:857690286168:web:93e5f7bf374b62445a022d",
  measurementId: "G-MR51J9BKM0",
};

// Initialize app and auth (idempotent if this file is imported multiple times)
let app;
try {
  app = initializeApp(firebaseConfig);
} catch (e) {
  // initializeApp throws if already initialized; ignore that case.
  // eslint-disable-next-line no-console
  console.info(
    "firebase: initializeApp() - already initialized?:",
    e && e.message
  );
}

// Auth
const auth = getAuth();

// Firestore client (exported as db so other modules can import it)
let db;
try {
  db = getFirestore(app);
} catch (err) {
  // eslint-disable-next-line no-console
  console.warn(
    "firebase: getFirestore() failed:",
    err && err.message ? err.message : err
  );
  db = null;
}

// Helper: returns ID token for current user or null if not signed in.
// Use forceRefresh=true to force refresh when necessary.
async function getIdToken(forceRefresh = false) {
  try {
    const user = auth.currentUser;
    if (!user) return null;
    // user.getIdToken() returns a Promise<string>
    return await user.getIdToken(forceRefresh);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      "firebase: getIdToken error:",
      err && err.message ? err.message : err
    );
    return null;
  }
}

// Small wrapper for onAuthStateChanged
function onAuthStateChanged(cb) {
  return _onAuthStateChanged(auth, cb);
}

export { app, auth, db, getIdToken, onAuthStateChanged };
