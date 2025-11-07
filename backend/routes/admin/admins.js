// backend/routes/admin/admins.js
const express = require("express");
const router = express.Router();
const admin = require("../../config/firebase-admin");
const adminAuthMiddleware = require("../../middleware/adminAuthMiddleware");

const db = admin.firestore();
const auth = admin.auth();

// ===== Middleware: Check if user is superadmin =====
async function superadminOnly(req, res, next) {
  try {
    const adminUid = req.user.uid;
    console.log(`[admin-admins] Checking superadmin status for ${adminUid}...`);

    // Get admin's role from Firestore
    const adminDoc = await db.collection("admins").doc(adminUid).get();

    if (!adminDoc.exists) {
      console.warn(`[admin-admins] Admin document not found for ${adminUid}`);
      return res.status(403).json({ error: "Admin access required" });
    }

    const adminData = adminDoc.data();
    const userRole = adminData.role || "moderator";

    console.log(`[admin-admins] User role: ${userRole}`);

    if (userRole !== "superadmin") {
      console.warn(
        `[admin-admins] ❌ Access denied - user is ${userRole}, not superadmin`
      );
      return res.status(403).json({
        error: "Only superadmins can access this resource",
      });
    }

    console.log(`[admin-admins] ✅ Superadmin access granted for ${adminUid}`);
    next();
  } catch (err) {
    console.error("[admin-admins] Error in superadminOnly:", err.message);
    res.status(500).json({ error: "Failed to verify superadmin status" });
  }
}

// GET /api/admin/admins
// List all admins - SUPERADMIN ONLY
router.get("/", adminAuthMiddleware, superadminOnly, async (req, res) => {
  try {
    console.log("[admin-admins] Fetching all admins...");

    const adminsSnapshot = await db.collection("admins").get();

    const admins = adminsSnapshot.docs.map((doc) => ({
      uid: doc.id,
      ...doc.data(),
    }));

    console.log(`[admin-admins] ✅ Fetched ${admins.length} admins`);

    res.json({
      admins,
      total: admins.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[admin-admins] Error:", err.message);
    res.status(500).json({ error: "Failed to fetch admins" });
  }
});

// GET /api/admin/admins/:uid
// Get single admin info with stats - SUPERADMIN ONLY
router.get("/:uid", adminAuthMiddleware, superadminOnly, async (req, res) => {
  try {
    const adminId = req.params.uid;
    console.log(`[admin-admins] Fetching admin ${adminId}...`);

    const adminDoc = await db.collection("admins").doc(adminId).get();

    if (!adminDoc.exists) {
      console.warn(`[admin-admins] Admin not found: ${adminId}`);
      return res.status(404).json({ error: "Admin not found" });
    }

    const adminData = adminDoc.data();

    // ===== Resolve promotedBy UID to name =====
    let promotedByName = "N/A";
    if (adminData.promotedBy) {
      try {
        const promotedByDoc = await db
          .collection("admins")
          .doc(adminData.promotedBy)
          .get();
        if (promotedByDoc.exists) {
          promotedByName = promotedByDoc.data().name || "Unknown Admin";
          console.log(
            `[admin-admins] Resolved promotedBy: ${adminData.promotedBy} -> ${promotedByName}`
          );
        } else {
          // Try to get from users collection as fallback
          const userDoc = await db
            .collection("users")
            .doc(adminData.promotedBy)
            .get();
          if (userDoc.exists) {
            promotedByName = userDoc.data().name || "Unknown User";
            console.log(
              `[admin-admins] Resolved promotedBy from users: ${adminData.promotedBy} -> ${promotedByName}`
            );
          }
        }
      } catch (err) {
        console.warn(
          `[admin-admins] Could not resolve promotedBy: ${err.message}`
        );
        promotedByName = "Unknown Admin";
      }
    }

    // ===== Get admin's recent actions =====
    let recentActions = [];
    try {
      const logsSnapshot = await db
        .collection("auditLogs")
        .where("adminUid", "==", adminId)
        .orderBy("timestamp", "desc")
        .limit(10)
        .get();

      recentActions = logsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      console.log(
        `[admin-admins] Found ${recentActions.length} audit logs for admin`
      );
    } catch (logsErr) {
      console.warn(
        `[admin-admins] Could not fetch audit logs: ${logsErr.message}`
      );
      recentActions = [];
    }

    const responseData = {
      uid: adminDoc.id,
      name: adminData.name || "Unknown",
      email: adminData.email || "N/A",
      role: adminData.role || "moderator",
      status: adminData.status || "active",
      promotedAt: adminData.promotedAt || null,
      promotedBy: promotedByName,
      permissions: adminData.permissions || {},
      lastActive: adminData.lastActive || null,
      loginCount: adminData.loginCount || 0,
      actionsCount: adminData.actionsCount || 0,
      recentActions: recentActions,
      stats: {
        totalActions: adminData.actionsCount || 0,
        lastActive: adminData.lastActive || null,
      },
      timestamp: new Date().toISOString(),
    };

    console.log(`[admin-admins] ✅ Admin details retrieved for ${adminId}`);
    res.json(responseData);
  } catch (err) {
    console.error("[admin-admins] Error fetching admin:", err.message);
    console.error("[admin-admins] Stack:", err.stack);
    res.status(500).json({ error: "Failed to fetch admin" });
  }
});

// POST /api/admin/admins/promote-user
// Promote user to admin - SUPERADMIN ONLY
router.post(
  "/promote-user",
  adminAuthMiddleware,
  superadminOnly,
  async (req, res) => {
    try {
      let { uid, email, role, permissions, reason } = req.body;
      const adminUid = req.user.uid;
      const adminName = req.user.name || "Unknown";

      console.log(
        `[admin-admins] Promoting user ${uid || email} to ${role}...`
      );

      // ===== Validate input =====
      if (!uid && !email) {
        return res.status(400).json({ error: "uid or email is required" });
      }

      if (!role) {
        return res.status(400).json({ error: "role is required" });
      }

      if (!["moderator", "superadmin"].includes(role)) {
        return res.status(400).json({ error: "Invalid role" });
      }

      // ===== If email provided, get uid =====
      if (email && !uid) {
        try {
          const userRecord = await auth.getUserByEmail(email);
          uid = userRecord.uid;
          console.log(`[admin-admins] Resolved email ${email} to UID ${uid}`);
        } catch (err) {
          return res
            .status(404)
            .json({ error: "User with this email not found" });
        }
      }

      // ===== Check if user exists in Firestore =====
      const userDoc = await db.collection("users").doc(uid).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found in database" });
      }

      // ===== Check if already admin =====
      const existingAdmin = await db.collection("admins").doc(uid).get();
      if (existingAdmin.exists) {
        return res.status(400).json({ error: "User is already an admin" });
      }

      const userData = userDoc.data();
      const userName = userData.name || "Unknown";
      const userEmail = userData.email || email || "N/A";

      // ===== Create admin record =====
      const promotedAt = new Date();
      await db
        .collection("admins")
        .doc(uid)
        .set({
          uid,
          email: userEmail,
          name: userName,
          role,
          promotedBy: adminUid,
          promotedAt,
          permissions: permissions || {},
          status: "active",
          lastActive: null,
          loginCount: 0,
          actionsCount: 0,
        });

      // ===== Set Firebase custom claim =====
      await auth.setCustomUserClaims(uid, { admin: true });
      console.log(`[admin-admins] ✅ Firebase custom claim set for ${uid}`);

      // ===== Log to audit logs =====
      await db.collection("auditLogs").add({
        timestamp: promotedAt,
        adminUid,
        adminName,
        action: "promote_admin",
        targetUid: uid,
        targetEmail: userEmail,
        targetName: userName,
        changes: {
          field: "role",
          from: "user",
          to: role,
        },
        reason,
        status: "completed",
      });

      console.log(`[admin-admins] ✅ User ${uid} promoted to ${role}`);

      res.json({
        success: true,
        message: `User ${userName} has been promoted to ${role}`,
        admin: {
          uid,
          name: userName,
          email: userEmail,
          role,
          promotedAt,
        },
      });
    } catch (err) {
      console.error("[admin-admins] Error:", err.message);
      res.status(500).json({ error: "Failed to promote user" });
    }
  }
);

// PUT /api/admin/admins/:uid
// Update admin permissions/role - SUPERADMIN ONLY
router.put("/:uid", adminAuthMiddleware, superadminOnly, async (req, res) => {
  try {
    const adminId = req.params.uid;
    const { role, permissions } = req.body;
    const currentAdminUid = req.user.uid;
    const currentAdminName = req.user.name || "Unknown";

    console.log(`[admin-admins] Updating admin ${adminId}...`);

    // ===== Check if admin exists =====
    const adminDoc = await db.collection("admins").doc(adminId).get();
    if (!adminDoc.exists) {
      return res.status(404).json({ error: "Admin not found" });
    }

    const oldData = adminDoc.data();

    // ===== Update admin =====
    const updateData = {};
    if (role) updateData.role = role;
    if (permissions) updateData.permissions = permissions;

    await db.collection("admins").doc(adminId).update(updateData);

    // ===== Log to audit logs =====
    await db.collection("auditLogs").add({
      timestamp: new Date(),
      adminUid: currentAdminUid,
      adminName: currentAdminName,
      action: "update_admin",
      targetUid: adminId,
      targetName: oldData.name || "Unknown",
      changes: {
        from: { role: oldData.role, permissions: oldData.permissions },
        to: {
          role: role || oldData.role,
          permissions: permissions || oldData.permissions,
        },
      },
      reason: "Admin updated",
      status: "completed",
    });

    console.log(`[admin-admins] ✅ Admin ${adminId} updated`);

    res.json({
      success: true,
      message: "Admin updated successfully",
    });
  } catch (err) {
    console.error("[admin-admins] Error:", err.message);
    res.status(500).json({ error: "Failed to update admin" });
  }
});

// DELETE /api/admin/admins/:uid
// Remove admin status - SUPERADMIN ONLY
router.delete(
  "/:uid",
  adminAuthMiddleware,
  superadminOnly,
  async (req, res) => {
    try {
      const adminId = req.params.uid;
      const { reason } = req.body;
      const currentAdminUid = req.user.uid;
      const currentAdminName = req.user.name || "Unknown";

      console.log(`[admin-admins] Removing admin ${adminId}...`);

      // ===== Check if admin exists =====
      const adminDoc = await db.collection("admins").doc(adminId).get();
      if (!adminDoc.exists) {
        return res.status(404).json({ error: "Admin not found" });
      }

      const adminData = adminDoc.data();

      // ===== Update admin status =====
      await db.collection("admins").doc(adminId).update({
        status: "removed",
      });

      // ===== Remove Firebase custom claim =====
      await auth.setCustomUserClaims(adminId, { admin: false });
      console.log(
        `[admin-admins] ✅ Firebase custom claim removed for ${adminId}`
      );

      // ===== Log to audit logs =====
      await db.collection("auditLogs").add({
        timestamp: new Date(),
        adminUid: currentAdminUid,
        adminName: currentAdminName,
        action: "remove_admin",
        targetUid: adminId,
        targetName: adminData.name || "Unknown",
        targetEmail: adminData.email || "N/A",
        changes: {
          field: "status",
          from: "active",
          to: "removed",
        },
        reason: reason || "Admin removed",
        status: "completed",
      });

      console.log(`[admin-admins] ✅ Admin ${adminId} removed`);

      res.json({
        success: true,
        message: "Admin status removed successfully",
      });
    } catch (err) {
      console.error("[admin-admins] Error:", err.message);
      res.status(500).json({ error: "Failed to remove admin" });
    }
  }
);

// PUT /api/admin/admins/:uid/suspend
// Suspend admin temporarily - SUPERADMIN ONLY
router.put(
  "/:uid/suspend",
  adminAuthMiddleware,
  superadminOnly,
  async (req, res) => {
    try {
      const adminId = req.params.uid;
      const { duration, reason } = req.body;
      const currentAdminUid = req.user.uid;
      const currentAdminName = req.user.name || "Unknown";

      console.log(`[admin-admins] Suspending admin ${adminId}...`);

      // ===== Check if admin exists =====
      const adminDoc = await db.collection("admins").doc(adminId).get();
      if (!adminDoc.exists) {
        return res.status(404).json({ error: "Admin not found" });
      }

      const adminData = adminDoc.data();
      const suspendedAt = new Date();

      // ===== Update admin =====
      await db.collection("admins").doc(adminId).update({
        status: "suspended",
        suspendedAt,
        suspendedReason: reason,
        suspendedDuration: duration,
      });

      // ===== Log to audit logs =====
      await db.collection("auditLogs").add({
        timestamp: suspendedAt,
        adminUid: currentAdminUid,
        adminName: currentAdminName,
        action: "suspend_admin",
        targetUid: adminId,
        targetName: adminData.name || "Admin",
        targetEmail: adminData.email || "N/A",
        changes: {
          field: "status",
          from: "active",
          to: "suspended",
        },
        reason,
        duration,
        status: "completed",
      });

      console.log(
        `[admin-admins] ✅ Admin ${adminId} suspended for ${duration}`
      );

      res.json({
        success: true,
        message: `Admin suspended for ${duration}`,
        suspendedAt,
      });
    } catch (err) {
      console.error("[admin-admins] Error:", err.message);
      res.status(500).json({ error: "Failed to suspend admin" });
    }
  }
);

// PUT /api/admin/admins/:uid/unsuspend
// Unsuspend admin - SUPERADMIN ONLY
router.put(
  "/:uid/unsuspend",
  adminAuthMiddleware,
  superadminOnly,
  async (req, res) => {
    try {
      const adminId = req.params.uid;
      const currentAdminUid = req.user.uid;
      const currentAdminName = req.user.name || "Unknown";

      console.log(`[admin-admins] Unsuspending admin ${adminId}...`);

      // ===== Check if admin exists =====
      const adminDoc = await db.collection("admins").doc(adminId).get();
      if (!adminDoc.exists) {
        return res.status(404).json({ error: "Admin not found" });
      }

      const adminData = adminDoc.data();

      // ===== Update admin =====
      await db.collection("admins").doc(adminId).update({
        status: "active",
        suspendedAt: null,
        suspendedReason: null,
        suspendedDuration: null,
      });

      // ===== Log to audit logs =====
      await db.collection("auditLogs").add({
        timestamp: new Date(),
        adminUid: currentAdminUid,
        adminName: currentAdminName,
        action: "unsuspend_admin",
        targetUid: adminId,
        targetName: adminData.name || "Admin",
        targetEmail: adminData.email || "N/A",
        changes: {
          field: "status",
          from: "suspended",
          to: "active",
        },
        reason: "Admin unsuspended",
        status: "completed",
      });

      console.log(`[admin-admins] ✅ Admin ${adminId} unsuspended`);

      res.json({
        success: true,
        message: "Admin unsuspended successfully",
      });
    } catch (err) {
      console.error("[admin-admins] Error:", err.message);
      res.status(500).json({ error: "Failed to unsuspend admin" });
    }
  }
);

module.exports = router;
