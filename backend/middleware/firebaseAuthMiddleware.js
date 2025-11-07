// backend/middleware/firebaseAuthMiddleware.js
// Verifies Firebase ID token sent in Authorization: Bearer <token>
// Attaches user info and checks admin status from Firestore

const admin = require("../config/firebase-admin");
const db = admin.firestore();

async function firebaseAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }

  const idToken = authHeader.replace("Bearer ", "").trim();

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);

    // ===== Basic user object =====
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email || null,
      name: decodedToken.name || decodedToken.displayName || null,
      admin: false,
      isAdmin: false,
      adminRole: null,
      adminPermissions: {},
      adminStatus: null,
    };

    // ===== Check if user is admin in Firestore =====
    try {
      const adminDoc = await db
        .collection("admins")
        .doc(decodedToken.uid)
        .get();

      if (adminDoc.exists) {
        const adminData = adminDoc.data();
        req.user.admin = true;
        req.user.isAdmin = true;
        req.user.adminRole = adminData.role || "moderator";
        req.user.adminPermissions = adminData.permissions || {};
        req.user.adminStatus = adminData.status || "active";

        console.log(
          `[firebaseAuth] ✅ Admin verified: ${decodedToken.uid} (${adminData.role})`
        );

        // ===== Update admin lastActive =====
        await db
          .collection("admins")
          .doc(decodedToken.uid)
          .update({
            lastActive: new Date(),
            loginCount: (adminData.loginCount || 0) + 1,
          });
      } else {
        console.log(
          `[firebaseAuth] ✅ Regular user verified: ${decodedToken.uid}`
        );
      }
    } catch (adminCheckErr) {
      console.warn(
        `[firebaseAuth] ⚠️ Could not check admin status: ${adminCheckErr.message}`
      );
      req.user.isAdmin = false;
    }

    return next();
  } catch (error) {
    console.error(
      "[firebaseAuth] ❌ Token verification failed:",
      error && error.message ? error.message : error
    );
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = firebaseAuthMiddleware;
