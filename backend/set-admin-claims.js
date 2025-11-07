// backend/set-admin-claims.js
const admin = require("firebase-admin");
const path = require("path");

// Load your Firebase Admin SDK key
// Make sure this path is correct!
const serviceAccountPath = path.join(
  __dirname,
  "./config/serviceAccountKey.json"
);

console.log("Loading Firebase Admin SDK from:", serviceAccountPath);

const serviceAccount = require(serviceAccountPath);

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// DanePascual's UID
const uid = "lxiTe9mYpIboDUzN4UubwP0ppkF2";

console.log("Setting custom claims for:", uid);

admin
  .auth()
  .setCustomUserClaims(uid, { admin: true, superadmin: true })
  .then(() => {
    console.log("✅ SUCCESS! Custom claims set for", uid);
    console.log('Claims: { "admin": true, "superadmin": true }');
    console.log("\n⏳ Claims will take effect on next login or token refresh");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ ERROR:", err.message);
    process.exit(1);
  });
