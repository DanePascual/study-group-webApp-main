// backend/middleware/firebaseAuthMiddleware.js
// Verifies Firebase ID token sent in Authorization: Bearer <token>
// Attaches minimal req.user for safety, and keeps _raw for temporary compatibility.
// IMPORTANT: Do NOT log req.user._raw or tokens anywhere.

const admin = require("../config/firebase-admin");

async function firebaseAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }

  const idToken = authHeader.replace("Bearer ", "").trim();

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);

    // Minimal safe user object for downstream code
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email || null,
      name: decodedToken.name || decodedToken.displayName || null,
      admin:
        !!decodedToken.admin ||
        !!(decodedToken.firebase && decodedToken.firebase.admin) ||
        false,
      // Compatibility: keep raw decoded token available but DO NOT log it
      _raw: decodedToken,
    };

    return next();
  } catch (error) {
    // Log only the error message, never the token or decoded payload
    console.error(
      "Token verification failed:",
      error && error.message ? error.message : error
    );
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = firebaseAuthMiddleware;
