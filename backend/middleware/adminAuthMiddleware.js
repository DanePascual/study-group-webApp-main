// backend/middleware/adminAuthMiddleware.js
// Checks if user has admin access and proper status

const admin = require("../config/firebase-admin");

async function adminAuthMiddleware(req, res, next) {
  try {
    // ===== STEP 1: Extract Bearer token from Authorization header =====
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("[adminAuth] ❌ No Bearer token in Authorization header");
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix
    console.log("[adminAuth] Token received, length:", token.length);

    // ===== STEP 2: Verify token with Firebase =====
    const decodedToken = await admin.auth().verifyIdToken(token);
    console.log("[adminAuth] ✅ Token verified for:", decodedToken.email);

    // ===== STEP 3: Check if user has admin custom claims =====
    if (!decodedToken.admin && !decodedToken.superadmin) {
      console.log(
        "[adminAuth] ❌ User does not have admin custom claims:",
        decodedToken.email
      );
      return res.status(403).json({ error: "Admin access required" });
    }

    console.log(
      `[adminAuth] ✅ Custom claims verified - admin: ${decodedToken.admin}, superadmin: ${decodedToken.superadmin}`
    );

    // ===== STEP 4: Get admin data from Firestore =====
    const db = admin.firestore();
    const adminDoc = await db.collection("admins").doc(decodedToken.uid).get();

    let adminStatus = "active";
    let adminRole = "moderator";
    let adminName = decodedToken.name || decodedToken.email;

    if (adminDoc.exists) {
      const adminData = adminDoc.data();
      adminStatus = adminData.status || "active";
      adminRole = adminData.role || "moderator";
      adminName = adminData.name || adminData.email || decodedToken.email;
      console.log(
        `[adminAuth] Admin data found - role: ${adminRole}, status: ${adminStatus}`
      );
    } else {
      console.warn(
        `[adminAuth] ⚠️ Admin document not found in Firestore for ${decodedToken.uid}`
      );
    }

    // ===== STEP 5: Check if admin status is active =====
    if (adminStatus === "suspended") {
      console.log(
        `[adminAuth] ❌ Admin account is suspended: ${decodedToken.email}`
      );
      return res.status(403).json({ error: "Admin account is suspended" });
    }

    if (adminStatus === "removed") {
      console.log(
        `[adminAuth] ❌ Admin access has been revoked: ${decodedToken.email}`
      );
      return res.status(403).json({ error: "Admin access has been revoked" });
    }

    // ===== STEP 6: Attach user info to request =====
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      name: adminName,
      admin: decodedToken.admin,
      superadmin: decodedToken.superadmin,
      adminRole: adminRole,
      adminStatus: adminStatus,
    };

    console.log(
      `[adminAuth] ✅ Admin access granted: ${req.user.uid} (${req.user.adminRole})`
    );

    next();
  } catch (err) {
    console.error("[adminAuth] Authentication error:", err.message);

    if (err.code === "auth/id-token-expired") {
      return res.status(401).json({ error: "Token expired" });
    }

    if (err.code === "auth/invalid-id-token") {
      return res.status(401).json({ error: "Invalid token" });
    }

    if (err.code === "auth/argument-error") {
      return res.status(401).json({ error: "Invalid token format" });
    }

    res.status(500).json({ error: "Authentication failed" });
  }
}

module.exports = adminAuthMiddleware;
