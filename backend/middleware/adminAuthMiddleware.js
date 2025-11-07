// backend/middleware/adminAuthMiddleware.js
// Checks if user has admin access and proper status

async function adminAuthMiddleware(req, res, next) {
  const user = req.user;

  // ===== Check if authenticated =====
  if (!user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  // ===== Check if admin (supports both old and new format) =====
  if (user.isAdmin !== true && user.admin !== true) {
    return res.status(403).json({ error: "Admin access required" });
  }

  // ===== Check if admin status is active =====
  if (user.adminStatus === "suspended") {
    return res.status(403).json({ error: "Admin account is suspended" });
  }

  if (user.adminStatus === "removed") {
    return res.status(403).json({ error: "Admin access has been revoked" });
  }

  console.log(
    `[adminAuth] ✅ Admin access granted: ${user.uid} (${
      user.adminRole || "admin"
    })`
  );

  next();
}

module.exports = adminAuthMiddleware;
