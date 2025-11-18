// backend/routes/admin/dashboard.js
const express = require("express");
const router = express.Router();
const admin = require("../../config/firebase-admin");
const adminAuthMiddleware = require("../../middleware/adminAuthMiddleware");

const db = admin.firestore();

// GET /api/admin/dashboard
router.get("/", adminAuthMiddleware, async (req, res) => {
  try {
    console.log("[admin-dashboard] Fetching dashboard stats...");
    const adminUid = req.user.uid;
    console.log("[admin-dashboard] Admin UID:", adminUid);

    // ===== Get admin's own data =====
    const adminDoc = await db.collection("admins").doc(adminUid).get();
    let adminRole = "moderator";
    let adminStatus = "active";
    let adminData = null;

    if (adminDoc.exists) {
      adminData = adminDoc.data();
      adminRole = adminData.role || "moderator";
      adminStatus = adminData.status || "active";
      console.log(`[admin-dashboard] Admin role: ${adminRole}`);
    } else {
      console.warn(
        `[admin-dashboard] Admin document not found for ${adminUid}`
      );
    }

    // ===== Get total users =====
    const usersSnapshot = await db.collection("users").get();
    const totalUsers = usersSnapshot.size;
    console.log(`[admin-dashboard] Total users: ${totalUsers}`);

    // ===== Get banned users count =====
    const bannedSnapshot = await db
      .collection("users")
      .where("isBanned", "==", true)
      .get();
    const totalBanned = bannedSnapshot.size;
    console.log(`[admin-dashboard] Total banned: ${totalBanned}`);

    // ===== Get total reports =====
    const reportsSnapshot = await db.collection("reports").get();
    const totalReports = reportsSnapshot.size;
    console.log(`[admin-dashboard] Total reports: ${totalReports}`);

    // ===== DEBUG: Log first 5 reports to see their structure =====
    console.log("[admin-dashboard] ===== DEBUGGING REPORTS =====");
    reportsSnapshot.docs.slice(0, 5).forEach((doc, i) => {
      const data = doc.data();
      console.log(`[admin-dashboard] Report ${i}:`, {
        id: doc.id,
        status: data.status,
        type: data.type,
        severity: data.severity,
        timestampISO: data.timestampISO,
        hasStatus: "status" in data,
      });
    });
    console.log("[admin-dashboard] ===== END DEBUG =====");

    // ===== Get pending reports =====
    const pendingReportsSnapshot = await db
      .collection("reports")
      .where("status", "==", "pending")
      .get();
    const pendingReports = pendingReportsSnapshot.size;
    console.log(`[admin-dashboard] Pending reports: ${pendingReports}`);

    // ===== Count reports by status =====
    const statusCounts = {};
    reportsSnapshot.docs.forEach((doc) => {
      const status = doc.data().status || "NO_STATUS";
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });
    console.log("[admin-dashboard] Reports by status:", statusCounts);

    // ===== Get total admins =====
    const adminsSnapshot = await db.collection("admins").get();
    const totalAdmins = adminsSnapshot.size;
    console.log(`[admin-dashboard] Total admins: ${totalAdmins}`);

    // ===== ✅ NEW: Get total study rooms =====
    const roomsSnapshot = await db.collection("study-groups").get();
    const totalRooms = roomsSnapshot.size;
    console.log(`[admin-dashboard] Total rooms: ${totalRooms}`);

    // ===== Get recent actions (from auditLogs) =====
    const auditLogsSnapshot = await db
      .collection("auditLogs")
      .orderBy("timestamp", "desc")
      .limit(10)
      .get();
    const recentActions = auditLogsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    console.log(`[admin-dashboard] Recent actions: ${recentActions.length}`);

    // ===== Build response =====
    const stats = {
      totalUsers,
      totalBanned,
      totalReports,
      pendingReports,
      totalAdmins,
      totalRooms, // ✅ UPDATED: Added totalRooms instead of activeUsers
    };

    console.log("[admin-dashboard] ✅ Dashboard stats fetched successfully");

    res.json({
      stats,
      recentActions,
      admin: {
        uid: adminUid,
        role: adminRole,
        status: adminStatus,
        name: adminData?.name || "Admin",
        email: adminData?.email || "N/A",
        promotedAt: adminData?.promotedAt || null,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[admin-dashboard] Error:", err.message);
    console.error("[admin-dashboard] Stack:", err.stack);
    res.status(500).json({ error: "Failed to fetch dashboard stats" });
  }
});

module.exports = router;
