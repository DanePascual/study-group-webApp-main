// Firebase compat exports for other modules (ES module).
// This file assumes the firebase compat SDKs are loaded globally via <script> tags in the HTML.
// It provides named exports for db and auth (Firestore / Auth).

let db;
let auth;

if (typeof firebase === "undefined") {
  // If firebase isn't loaded yet, provide placeholders that throw when used.
  const notLoaded = () => {
    throw new Error(
      "Firebase compat SDK not loaded. Make sure firebase-app-compat, firebase-auth-compat and firebase-firestore-compat are included in the page before loading modules."
    );
  };

  // Minimal stubs that throw on use (fail fast)
  db = {
    collection: notLoaded,
  };

  auth = {
    onAuthStateChanged: notLoaded,
    currentUser: null,
    // also provide getIdToken that will fail if called while not loaded
    currentUser_getIdToken: notLoaded,
  };
} else {
  // Use compat Firestore / Auth already loaded by HTML <script> tags
  db = firebase.firestore();
  auth = firebase.auth();
}

export { db, auth };
