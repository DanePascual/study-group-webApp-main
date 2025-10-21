const admin = require("../config/firebase-admin");

async function firebaseAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  console.log("Authorization header received:", authHeader); // <-- Add this

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log("No token provided or header malformed."); // <-- Add this
    return res.status(401).json({ error: "No token provided" });
  }

  const idToken = authHeader.replace("Bearer ", "").trim();
  console.log("ID token extracted:", idToken.substring(0, 20) + "..."); // <-- Just print first 20 chars

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    console.log("Decoded token:", decodedToken); // <-- Add this
    req.user = decodedToken; // Attach the decoded user info to the request
    next();
  } catch (error) {
    console.error("Token verification failed:", error); // <-- Add this
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = firebaseAuthMiddleware;
