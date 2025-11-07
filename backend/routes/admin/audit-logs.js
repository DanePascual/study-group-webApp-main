const express = require("express");
const router = express.Router();
const admin = require("../../config/firebase-admin");
const adminAuthMiddleware = require("../../middleware/adminAuthMiddleware");

const db = admin.firestore();

// ===== Helper: Fetch user name by UID =====
async function getUserName(uid) {
  if (!uid) return null;

  try {
    const userDoc = await db.collection("users").doc(uid).get();
    if (userDoc.exists) {
      const data = userDoc.data();
      return data.name || data.email || null;
    }
    return null;
  } catch (err) {
    console.warn(`[audit-logs] Could not fetch user ${uid}:`, err.message);
    return null;
  }
}

// ===== Helper: Fetch report creator name by report ID =====
async function getReportCreatorName(reportId) {
  if (!reportId) return null;

  try {
    const reportDoc = await db.collection("reports").doc(reportId).get();
    if (reportDoc.exists) {
      const data = reportDoc.data();
      // The field is "reporterId" NOT "createdBy"
      const reporterId = data.reporterId || data.createdBy || data.createdByUid;
      if (reporterId) {
        const creatorName = await getUserName(reporterId);
        return creatorName;
      }
    }
    return null;
  } catch (err) {
    console.warn(
      `[audit-logs] Could not fetch report ${reportId}:`,
      err.message
    );
    return null;
  }
}

// ===== Helper: Get affected user name based on action and data =====
async function getAffectedUserName(log) {
  // If it's a user action (ban, unban, promote, etc.)
  if (log.targetUid) {
    if (!log.targetName || log.targetName === "User") {
      const userName = await getUserName(log.targetUid);
      return userName || log.targetName;
    }
    return log.targetName;
  }

  // If it's a report action, get the person who made the report
  if (log.targetReportId) {
    const creatorName = await getReportCreatorName(log.targetReportId);
    return creatorName || log.targetName || "N/A";
  }

  return log.targetName || "N/A";
}

// ===== Helper: Enhance logs with user names =====
async function enhanceLogs(logs) {
  const enhancedLogs = await Promise.all(
    logs.map(async (log) => {
      // Get the actual affected user name
      const affectedUserName = await getAffectedUserName(log);
      if (affectedUserName) {
        log.affectedUserName = affectedUserName;
      }
      return log;
    })
  );
  return enhancedLogs;
}

// GET /api/admin/audit-logs
// List audit logs with filters
router.get("/", adminAuthMiddleware, async (req, res) => {
  try {
    console.log("[admin-audit-logs] Fetching audit logs...");

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const adminUid = req.query.adminUid;
    const action = req.query.action;
    const targetUid = req.query.targetUid;
    const days = parseInt(req.query.days) || 30;
    const search = req.query.search || "";

    // ===== Calculate date range =====
    const now = new Date();
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    let query = db
      .collection("auditLogs")
      .where("timestamp", ">=", startDate)
      .orderBy("timestamp", "desc");

    // ===== Apply filters =====
    // Note: Firestore has limitations with multiple where clauses
    // We'll filter some on the client side
    const snapshot = await query.get();

    let logs = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // ===== Client-side filters =====
    if (adminUid) {
      logs = logs.filter((log) => log.adminUid === adminUid);
    }

    if (action) {
      logs = logs.filter((log) => log.action === action);
    }

    if (targetUid) {
      logs = logs.filter((log) => log.targetUid === targetUid);
    }

    if (search) {
      logs = logs.filter(
        (log) =>
          log.adminName?.toLowerCase().includes(search.toLowerCase()) ||
          log.targetName?.toLowerCase().includes(search.toLowerCase()) ||
          log.reason?.toLowerCase().includes(search.toLowerCase()) ||
          log.action?.toLowerCase().includes(search.toLowerCase())
      );
    }

    // ===== Enhance logs with user names =====
    logs = await enhanceLogs(logs);

    // ===== Pagination =====
    const total = logs.length;
    const pages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const paginatedLogs = logs.slice(offset, offset + limit);

    console.log(
      `[admin-audit-logs] ✅ Fetched ${paginatedLogs.length} logs (page ${page}/${pages})`
    );

    res.json({
      logs: paginatedLogs,
      pagination: {
        page,
        limit,
        total,
        pages,
      },
      filters: {
        adminUid: adminUid || "all",
        action: action || "all",
        targetUid: targetUid || "all",
        days,
        search,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[admin-audit-logs] Error:", err.message);
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

// GET /api/admin/audit-logs/admin/:adminUid
// Get specific admin's logs
router.get("/admin/:adminUid", adminAuthMiddleware, async (req, res) => {
  try {
    const adminUid = req.params.adminUid;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const days = parseInt(req.query.days) || 30;

    console.log(`[admin-audit-logs] Fetching logs for admin ${adminUid}...`);

    // ===== Calculate date range =====
    const now = new Date();
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    // ===== Get admin's logs =====
    const snapshot = await db
      .collection("auditLogs")
      .where("adminUid", "==", adminUid)
      .where("timestamp", ">=", startDate)
      .orderBy("timestamp", "desc")
      .get();

    let logs = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // ===== Enhance logs with user names =====
    logs = await enhanceLogs(logs);

    // ===== Pagination =====
    const total = logs.length;
    const pages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const paginatedLogs = logs.slice(offset, offset + limit);

    console.log(
      `[admin-audit-logs] ✅ Fetched ${paginatedLogs.length} logs for admin ${adminUid}`
    );

    res.json({
      adminUid,
      logs: paginatedLogs,
      pagination: {
        page,
        limit,
        total,
        pages,
      },
      filters: {
        days,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[admin-audit-logs] Error:", err.message);
    res.status(500).json({ error: "Failed to fetch admin logs" });
  }
});

// GET /api/admin/audit-logs/:logId
// Get single audit log details
router.get("/:logId", adminAuthMiddleware, async (req, res) => {
  try {
    const logId = req.params.logId;
    console.log(`[admin-audit-logs] Fetching log ${logId}...`);

    const logDoc = await db.collection("auditLogs").doc(logId).get();

    if (!logDoc.exists) {
      return res.status(404).json({ error: "Log not found" });
    }

    let logData = {
      id: logDoc.id,
      ...logDoc.data(),
    };

    // ===== Enhance single log with affected user name =====
    const affectedUserName = await getAffectedUserName(logData);
    if (affectedUserName) {
      logData.affectedUserName = affectedUserName;
    }

    res.json(logData);
  } catch (err) {
    console.error("[admin-audit-logs] Error:", err.message);
    res.status(500).json({ error: "Failed to fetch log" });
  }
});

module.exports = router;
